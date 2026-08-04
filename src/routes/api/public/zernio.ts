import { createFileRoute } from "@tanstack/react-router";
import { createHmac, timingSafeEqual } from "node:crypto";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { captureException } from "@/lib/sentry.server";
import { downloadZernioMedia } from "@/lib/zernio.server";

// Mídia recebida via WhatsApp Zernio expira em ~7 dias e exige auth para baixar
// (ver downloadZernioMedia). Baixamos no recebimento e persistimos no Storage,
// como o webhook da Evolution já faz — assim o inbox e a IA leem uma URL pública
// e estável. Extensão inferida do mime para nomear o arquivo.
const MIME_EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "audio/ogg": "ogg",
  "audio/mpeg": "mp3",
  "audio/mp4": "m4a",
  "audio/webm": "webm",
  "audio/wav": "wav",
  "video/mp4": "mp4",
  "video/webm": "webm",
  "video/quicktime": "mov",
  "video/3gpp": "3gp",
  "application/pdf": "pdf",
  "application/zip": "zip",
};
function extFromMime(mime: string, fallback: string): string {
  return MIME_EXT[mime.toLowerCase()] ?? (mime.split("/")[1] ?? fallback).split(";")[0].slice(0, 5);
}

/**
 * Baixa a mídia da Zernio e sobe pro bucket chat-media, devolvendo a URL
 * pública estável. Best-effort: se falhar, devolve a URL crua como fallback
 * (melhor exibir algo que pode expirar do que perder a mídia por completo).
 */
async function persistZernioMedia(
  ownerUserId: string,
  rawUrl: string,
  declaredMime: string | null,
): Promise<{ url: string; mime: string | null }> {
  const dl = await downloadZernioMedia(rawUrl);
  if (!dl) return { url: rawUrl, mime: declaredMime };
  const mime = declaredMime || dl.mime;
  const kind = mime.startsWith("audio/")
    ? "audio"
    : mime.startsWith("image/")
      ? "image"
      : mime.startsWith("video/")
        ? "video"
        : "file";
  const ext = extFromMime(mime, kind === "audio" ? "ogg" : "bin");
  const path = `${ownerUserId}/zernio-${Date.now()}-${crypto.randomUUID()}.${ext}`;
  const { error: upErr } = await supabaseAdmin.storage
    .from("chat-media")
    .upload(path, dl.buffer, { contentType: mime, upsert: false });
  if (upErr) {
    console.error("[zernio webhook] storage upload falhou:", upErr.message);
    return { url: rawUrl, mime };
  }
  const { data: pub } = supabaseAdmin.storage.from("chat-media").getPublicUrl(path);
  return { url: pub.publicUrl, mime };
}

// ============================================================
// Webhook único (nível plataforma) da Zernio.
//   - 1 API key = 1 conta Zernio = 1 webhook. Recebe eventos de TODOS os
//     workspaces; mapeamos account.accountId -> zernio_accounts -> owner_user_id.
//   - Assinatura: X-Zernio-Signature = hex(HMAC-SHA256(rawBody, ZERNIO_WEBHOOK_SECRET)).
//     ZERNIO_WEBHOOK_SECRET é secret de PLATAFORMA (super admin), nunca do workspace.
//   - Precisa responder 2xx em <5s → só valida, persiste e (futuramente) enfileira.
//
// Escopo atual: grava mensagens/eventos inbound dos canais Zernio (whatsapp_cloud,
// instagram) nas MESMAS tabelas contacts/messages que o inbox já lê. A resposta
// da IA para estes canais será ligada quando o job-worker virar channel-aware.
// ============================================================

type Channel = "whatsapp_cloud" | "instagram";

function channelForPlatform(platform: unknown): Channel | null {
  const p = String(platform ?? "").toLowerCase();
  if (p === "whatsapp") return "whatsapp_cloud";
  if (p === "instagram") return "instagram";
  return null; // outras plataformas Zernio ignoradas por ora
}

function verifySignature(rawBody: string, signature: string | null, secret: string): boolean {
  if (!signature) return false;
  const computed = createHmac("sha256", secret).update(rawBody).digest("hex");
  const a = Buffer.from(computed, "utf8");
  const b = Buffer.from(signature.trim().toLowerCase(), "utf8");
  if (a.length !== b.length) return false;
  try {
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

function firstString(...vals: unknown[]): string | null {
  for (const v of vals) if (typeof v === "string" && v.trim()) return v.trim();
  return null;
}

const STATUS_RANK: Record<string, number> = { sent: 1, delivered: 2, read: 3 };

function attachmentType(a: any): "image" | "audio" | "video" | "document" {
  const t = String(a?.type ?? a?.mediaType ?? "").toLowerCase();
  const mime = String(a?.mime ?? a?.mimetype ?? a?.contentType ?? "").toLowerCase();
  if (t.includes("image") || mime.startsWith("image/")) return "image";
  if (t.includes("audio") || t.includes("voice") || mime.startsWith("audio/")) return "audio";
  if (t.includes("video") || mime.startsWith("video/")) return "video";
  return "document";
}

async function resolveAccount(accountId: string | null) {
  if (!accountId) return null;
  const { data } = await supabaseAdmin
    .from("zernio_accounts")
    .select("owner_user_id,platform,account_id")
    .eq("account_id", accountId)
    .maybeSingle();
  return data ?? null;
}

/** Upsert de contato por (owner, external_conversation_id). Retorna { id, assignedAgentId }. */
async function upsertContact(params: {
  ownerUserId: string;
  channel: Channel;
  conversationId: string;
  participantId: string | null;
  name: string | null;
  picture: string | null;
  phone: string | null;
  preview: string;
}) {
  const { data: existing } = await supabaseAdmin
    .from("contacts")
    .select("id,assigned_agent_id")
    .eq("owner_user_id", params.ownerUserId)
    .eq("external_conversation_id", params.conversationId)
    .maybeSingle();

  if (existing?.id) {
    await supabaseAdmin
      .from("contacts")
      .update({
        is_unread: true,
        last_message: params.preview,
        last_message_at: new Date().toISOString(),
        ...(params.picture ? { avatar_url: params.picture } : {}),
      })
      .eq("id", existing.id);
    return { id: existing.id as string, assignedAgentId: existing.assigned_agent_id as string | null };
  }

  const { data: created, error } = await supabaseAdmin
    .from("contacts")
    .insert({
      owner_user_id: params.ownerUserId,
      channel: params.channel,
      external_conversation_id: params.conversationId,
      external_participant_id: params.participantId,
      phone: params.phone,
      name: params.name ?? params.participantId ?? "Contato",
      avatar_url: params.picture,
      kanban_column: "waiting",
      is_unread: true,
      last_message: params.preview,
      last_message_at: new Date().toISOString(),
    })
    .select("id,assigned_agent_id")
    .single();
  if (error) {
    console.error("[zernio webhook] insert contact", error.message);
    return null;
  }
  return { id: created.id as string, assignedAgentId: created.assigned_agent_id as string | null };
}

export const Route = createFileRoute("/api/public/zernio")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const secret = process.env.ZERNIO_WEBHOOK_SECRET ?? "";
        const rawBody = await request.text();

        // Assinatura só é exigida se o secret estiver configurado (defesa em profundidade).
        if (secret) {
          const sig = request.headers.get("x-zernio-signature");
          if (!verifySignature(rawBody, sig, secret)) {
            console.warn("[zernio webhook] assinatura inválida");
            return new Response("invalid signature", { status: 401 });
          }
        }

        let payload: any = null;
        try {
          payload = rawBody ? JSON.parse(rawBody) : null;
        } catch {
          return new Response("bad json", { status: 400 });
        }

        const event = String(payload?.event ?? "");
        const msg = payload?.message ?? {};
        const conv = payload?.conversation ?? {};
        const acct = payload?.account ?? {};
        const reaction = payload?.reaction ?? {};

        const accountId = firstString(acct?.accountId, acct?.id, conv?.accountId);
        const platform = acct?.platform ?? conv?.platform;
        const channel = channelForPlatform(platform);
        const conversationId = firstString(conv?.id, msg?.conversationId, reaction?.conversationId);

        console.log("[zernio]", {
          event,
          eventId: payload?.id,
          platform,
          channel,
          accountId,
          conversationId,
        });

        // Só tratamos os canais que nos interessam. 200 para não gerar retry.
        if (!channel || !accountId) return new Response("ok", { status: 200 });

        try {
          const account = await resolveAccount(accountId);
          if (!account?.owner_user_id) {
            console.warn("[zernio webhook] conta não mapeada", { accountId });
            return new Response("ok", { status: 200 });
          }
          const ownerUserId = account.owner_user_id as string;

          if (event === "message.received") {
            if (!conversationId) return new Response("ok", { status: 200 });

            const externalMessageId = firstString(msg?.platformMessageId, msg?.id, msg?.messageId);
            const text = typeof msg?.text === "string" ? msg.text : "";
            const attachments: any[] = Array.isArray(msg?.attachments) ? msg.attachments : [];
            const first = attachments[0];

            const messageType: "text" | "image" | "audio" | "video" | "document" = first
              ? attachmentType(first)
              : "text";
            const rawMediaUrl = first ? firstString(first?.url, first?.link, first?.mediaUrl) : null;
            const declaredMime = first
              ? firstString(first?.mime, first?.mimetype, first?.contentType)
              : null;
            // Preenchidas após baixar+persistir (mais abaixo, pós dedup).
            let mediaUrl: string | null = null;
            let mediaMime: string | null = declaredMime;

            const participantId = firstString(conv?.participantId, msg?.sender?.id, msg?.from?.id);
            const participantName = firstString(
              conv?.participantName,
              msg?.sender?.name,
              msg?.sender?.username,
            );
            const participantPicture = firstString(conv?.participantPicture, msg?.sender?.picture);
            // WhatsApp: participantId costuma ser o telefone. Instagram: não tem telefone.
            const phone =
              channel === "whatsapp_cloud"
                ? firstString(conv?.participantPhone, participantId)?.replace(/\D/g, "") ?? null
                : null;

            const preview = text || (first ? `[${messageType}]` : "");

            const contact = await upsertContact({
              ownerUserId,
              channel,
              conversationId,
              participantId,
              name: participantName,
              picture: participantPicture,
              phone,
              preview,
            });
            if (!contact) return new Response("ok", { status: 200 });

            // Idempotência: não insere a mesma mensagem externa duas vezes.
            if (externalMessageId) {
              const { data: dup } = await supabaseAdmin
                .from("messages")
                .select("id")
                .eq("owner_user_id", ownerUserId)
                .eq("whatsapp_message_id", externalMessageId)
                .maybeSingle();
              if (dup) return new Response("ok", { status: 200 });
            }

            // Baixa+persiste a mídia só depois do dedup (evita download à toa em
            // reentregas do webhook). WhatsApp exige auth e expira em 7 dias.
            if (rawMediaUrl) {
              const persisted = await persistZernioMedia(ownerUserId, rawMediaUrl, declaredMime);
              mediaUrl = persisted.url;
              mediaMime = persisted.mime;
            }

            const insert: Record<string, unknown> = {
              owner_user_id: ownerUserId,
              contact_id: contact.id,
              direction: "inbound",
              content: text,
              message_type: messageType,
              status: "delivered",
              channel,
              external_conversation_id: conversationId,
              whatsapp_message_id: externalMessageId,
            };
            if (mediaUrl) {
              insert.media_url = mediaUrl;
              insert.media_mime = mediaMime;
            }
            const { error: mErr } = await supabaseAdmin.from("messages").insert(insert);
            if (mErr) console.error("[zernio webhook] insert message", mErr.message);

            // ───── Enfileira resposta de IA (worker channel-aware) ─────
            // Mesmo contrato do webhook Evolution: só enfileira se NÃO houver
            // humano atribuído e a mídia for processável pela IA (text/audio/
            // image). O gate de ai_enabled fica no runAiResponse (retorna skip).
            // instance_name = "zernio:<channel>" sinaliza ao worker para enviar
            // a resposta via Zernio em vez da Evolution.
            const humanInControl = !!contact.assignedAgentId;
            const aiMediaType =
              messageType === "text" || messageType === "audio" || messageType === "image"
                ? messageType
                : null;
            const hasProcessableContent =
              (aiMediaType === "text" && text.trim().length > 0) ||
              ((aiMediaType === "audio" || aiMediaType === "image") && !!mediaUrl);

            if (!humanInControl && aiMediaType && hasProcessableContent) {
              const jobPayload = {
                phone: phone ?? "",
                pushName: participantName ?? null,
                mediaType: aiMediaType,
                caption: text,
                mediaUrl: mediaUrl ?? null,
                mediaMime: mediaMime ?? null,
                waMessageId: externalMessageId ?? null,
              };
              const { error: jobErr } = await supabaseAdmin.from("message_jobs").insert({
                workspace_owner_id: ownerUserId,
                contact_id: contact.id,
                instance_name: `zernio:${channel}`,
                payload: jobPayload,
              });
              if (jobErr) {
                console.error("[zernio webhook] falha ao enfileirar job de IA:", jobErr.message);
              }
            }
          } else if (
            event === "message.delivered" ||
            event === "message.read" ||
            event === "message.failed"
          ) {
            const externalMessageId = firstString(msg?.platformMessageId, msg?.id, msg?.messageId);
            if (!externalMessageId) return new Response("ok", { status: 200 });
            const next =
              event === "message.read" ? "read" : event === "message.delivered" ? "delivered" : "failed";

            const { data: existing } = await supabaseAdmin
              .from("messages")
              .select("id,status")
              .eq("owner_user_id", ownerUserId)
              .eq("whatsapp_message_id", externalMessageId)
              .maybeSingle();
            if (existing) {
              if (next === "failed") {
                await supabaseAdmin.from("messages").update({ status: "failed" }).eq("id", existing.id);
              } else {
                const cur = STATUS_RANK[String(existing.status)] ?? 0;
                if ((STATUS_RANK[next] ?? 0) > cur) {
                  await supabaseAdmin.from("messages").update({ status: next }).eq("id", existing.id);
                }
              }
            }
          } else if (event === "reaction.received") {
            const externalMessageId = firstString(reaction?.platformMessageId, reaction?.messageId);
            const emoji = typeof reaction?.emoji === "string" ? reaction.emoji : "";
            const action = String(reaction?.action ?? "added");
            if (externalMessageId) {
              const { data: m } = await supabaseAdmin
                .from("messages")
                .select("id,reactions")
                .eq("owner_user_id", ownerUserId)
                .eq("whatsapp_message_id", externalMessageId)
                .maybeSingle();
              if (m) {
                const cur: any[] = Array.isArray(m.reactions) ? (m.reactions as any[]) : [];
                const filtered = cur.filter((r) => r?.from !== "them");
                const next =
                  action === "removed" || !emoji
                    ? filtered
                    : [...filtered, { from: "them", emoji, at: new Date().toISOString() }];
                await supabaseAdmin.from("messages").update({ reactions: next }).eq("id", m.id);
              }
            }
          } else {
            console.log("[zernio] evento ignorado:", event);
          }
        } catch (e: any) {
          console.error("[zernio webhook]", e?.message ?? e);
          captureException(e);
        }

        return new Response("ok", { status: 200 });
      },
    },
  },
});
