import { createFileRoute } from "@tanstack/react-router";
import { createHmac, timingSafeEqual } from "node:crypto";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { MESSAGE_DEFAULTS } from "@/lib/message-defaults";
import { renderTemplate } from "@/lib/message-templates";
import { captureException } from "@/lib/sentry.server";
import { downloadZernioMedia, sendZernioToContact } from "@/lib/zernio.server";

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
type SharedLinkPreview = { url: string; title: string | null; thumbnail: string | null };

/** Extrai um atributo de uma meta tag OpenGraph do HTML (property og:xxx). */
function ogTag(html: string, prop: string): string | null {
  // Aceita as duas ordens de atributo (property antes ou depois de content).
  const re1 = new RegExp(
    `<meta[^>]+property=["']og:${prop}["'][^>]+content=["']([^"']+)["']`,
    "i",
  );
  const re2 = new RegExp(
    `<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:${prop}["']`,
    "i",
  );
  const m = html.match(re1) ?? html.match(re2);
  if (!m) return null;
  // Decodifica entidades HTML básicas do content.
  return m[1]
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

async function persistZernioMedia(
  ownerUserId: string,
  rawUrl: string,
  declaredMime: string | null,
): Promise<{
  url: string;
  mime: string | null;
  isSharedLink?: boolean;
  sharedPreview?: SharedLinkPreview;
}> {
  const dl = await downloadZernioMedia(rawUrl);
  if (!dl) return { url: rawUrl, mime: declaredMime };

  // Compartilhamento de reel/post/story do Instagram: o attachment vem com uma
  // URL de PÁGINA (instagram.com/reel/...), não de mídia. Baixar essa URL
  // devolve o HTML da página — que salvávamos como se fosse vídeo, deixando o
  // player preto. Detectamos pelo content-type real dos bytes baixados: se é
  // HTML, não é mídia. Sinaliza pro chamador tratar como link, não como anexo.
  const declaredIsMedia =
    !!declaredMime &&
    (declaredMime.startsWith("audio/") ||
      declaredMime.startsWith("image/") ||
      declaredMime.startsWith("video/"));
  const downloadedHtml = dl.mime.startsWith("text/html");
  if (downloadedHtml && !declaredIsMedia) {
    // Extrai capa (og:image) e título pra montar um card de preview. A og:image
    // é CDN da Meta (hotlink-bloqueada), então re-hospedamos no nosso Storage.
    const html = dl.buffer.toString("utf8");
    const ogImage = ogTag(html, "image");
    const title = ogTag(html, "title");
    let thumbnail: string | null = null;
    if (ogImage) {
      const rehosted = await persistZernioMedia(ownerUserId, ogImage, "image/jpeg");
      // rehosted.url é a URL do nosso Storage; se o download da capa falhar,
      // persistZernioMedia devolve a URL crua (hotlink-bloqueada) — descartamos.
      thumbnail = isRehostedAvatar(rehosted.url) ? rehosted.url : null;
    }
    return {
      url: rawUrl,
      mime: dl.mime,
      isSharedLink: true,
      sharedPreview: { url: rawUrl, title, thumbnail },
    };
  }

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
/** URL já re-hospedada no nosso Storage? (evita re-baixar a cada mensagem) */
function isRehostedAvatar(url: string | null | undefined): boolean {
  return !!url && /\/storage\/v1\/object\/public\/chat-media\//.test(url);
}

/**
 * Re-hospeda a foto de perfil no Storage. As URLs de avatar da Meta (Instagram/
 * WhatsApp) têm proteção anti-hotlink: carregar direto no <img> do browser dá
 * 403 e cai na inicial. Baixando no servidor e servindo do nosso domínio, a
 * foto aparece — mesmo motivo do re-host de mídia.
 */
async function persistZernioAvatar(
  ownerUserId: string,
  rawUrl: string,
): Promise<string | null> {
  const persisted = await persistZernioMedia(ownerUserId, rawUrl, null);
  // persistZernioMedia devolve a URL crua como fallback se o download falhar;
  // nesse caso não adianta (crua é hotlink-bloqueada), então descartamos.
  return isRehostedAvatar(persisted.url) ? persisted.url : null;
}

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
    .select("id,assigned_agent_id,avatar_url")
    .eq("owner_user_id", params.ownerUserId)
    .eq("external_conversation_id", params.conversationId)
    .maybeSingle();

  if (existing?.id) {
    // Só re-hospeda se ainda não temos um avatar nosso (não a cada mensagem).
    let avatarPatch: Record<string, unknown> = {};
    if (params.picture && !isRehostedAvatar(existing.avatar_url as string | null)) {
      const rehosted = await persistZernioAvatar(params.ownerUserId, params.picture);
      if (rehosted) avatarPatch = { avatar_url: rehosted };
    }
    await supabaseAdmin
      .from("contacts")
      .update({
        is_unread: true,
        last_message: params.preview,
        last_message_at: new Date().toISOString(),
        ...avatarPatch,
      })
      .eq("id", existing.id);
    return { id: existing.id as string, assignedAgentId: existing.assigned_agent_id as string | null };
  }

  const rehosted = params.picture
    ? await persistZernioAvatar(params.ownerUserId, params.picture)
    : null;

  const { data: created, error } = await supabaseAdmin
    .from("contacts")
    .insert({
      owner_user_id: params.ownerUserId,
      channel: params.channel,
      external_conversation_id: params.conversationId,
      external_participant_id: params.participantId,
      phone: params.phone,
      name: params.name ?? params.participantId ?? "Contato",
      avatar_url: rehosted,
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
            // finalType/finalContent podem mudar se o "anexo" for na verdade um
            // link compartilhado (reel/post do Instagram) — ver isSharedLink.
            let finalType: "text" | "image" | "audio" | "video" | "document" = messageType;
            let finalContent = text;
            let linkPreview: SharedLinkPreview | null = null;
            if (rawMediaUrl) {
              const persisted = await persistZernioMedia(ownerUserId, rawMediaUrl, declaredMime);
              if (persisted.isSharedLink) {
                // Compartilhamento (reel/post/story): não é mídia baixável.
                // Guarda como texto com o link + preview (miniatura/título) pra
                // UI montar um card. Nada de player preto.
                finalType = "text";
                finalContent = text ? `${text}\n${rawMediaUrl}` : rawMediaUrl;
                mediaUrl = null;
                mediaMime = null;
                linkPreview = persisted.sharedPreview ?? { url: rawMediaUrl, title: null, thumbnail: null };
              } else {
                mediaUrl = persisted.url;
                mediaMime = persisted.mime;
              }
            }

            const insert: Record<string, unknown> = {
              owner_user_id: ownerUserId,
              contact_id: contact.id,
              direction: "inbound",
              content: finalContent,
              message_type: finalType,
              status: "delivered",
              channel,
              external_conversation_id: conversationId,
              whatsapp_message_id: externalMessageId,
            };
            if (mediaUrl) {
              insert.media_url = mediaUrl;
              insert.media_mime = mediaMime;
            }
            if (linkPreview) insert.link_preview = linkPreview;
            // Degradação aberta: se a coluna link_preview ainda não existe,
            // remove e reinsere — a mensagem (com o link no content) é mais
            // importante que o card.
            {
              const { error: mErr0 } = await supabaseAdmin.from("messages").insert(insert);
              if (mErr0 && /link_preview/i.test(mErr0.message)) {
                delete insert.link_preview;
                const retry = await supabaseAdmin.from("messages").insert(insert);
                if (retry.error) console.error("[zernio webhook] insert message", retry.error.message);
              } else if (mErr0) {
                console.error("[zernio webhook] insert message", mErr0.message);
              }
            }

            const humanInControl = !!contact.assignedAgentId;

            // ───── Auto-reply de ausência (IA desligada) ─────
            // Preenche o gap dos canais oficiais: se a IA está off e o dono
            // habilitou a mensagem de ausência, dispara UMA resposta automática
            // por conversa a cada 6h. Só roda quando não há humano atribuído
            // (senão o próprio atendente responde). Se sai daqui com sucesso,
            // pulamos o enqueue de IA (job seria no-op, mesmo motivo).
            let awayReplied = false;
            if (!humanInControl) {
              // Degradação aberta: colunas msg_away_* podem não existir ainda.
              let prof: any = null;
              const { data: prof1, error: prof1Err } = await supabaseAdmin
                .from("profiles")
                .select("ai_enabled,msg_away_enabled,msg_away_text,business_name")
                .eq("id", ownerUserId)
                .maybeSingle();
              if (
                prof1Err &&
                /Could not find the '(\w+)' column|column .* does not exist/i.test(
                  prof1Err.message,
                )
              ) {
                const { data: prof2 } = await supabaseAdmin
                  .from("profiles")
                  .select("ai_enabled,business_name")
                  .eq("id", ownerUserId)
                  .maybeSingle();
                prof = prof2;
              } else {
                prof = prof1;
              }
              const aiEnabled = prof?.ai_enabled === true;
              const awayEnabled = prof?.msg_away_enabled === true;
              if (!aiEnabled && awayEnabled) {
                const sixHoursAgo = new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString();
                const { data: recent } = await supabaseAdmin
                  .from("messages")
                  .select("id")
                  .eq("owner_user_id", ownerUserId)
                  .eq("contact_id", contact.id)
                  .eq("direction", "outbound")
                  .gte("created_at", sixHoursAgo)
                  .limit(1);
                if (!recent || recent.length === 0) {
                  const tpl =
                    (typeof prof?.msg_away_text === "string" && prof.msg_away_text.trim()) ||
                    MESSAGE_DEFAULTS.away.default;
                  const rendered = renderTemplate(tpl, {
                    cliente: participantName ?? "",
                    negocio: prof?.business_name ?? "",
                  });
                  try {
                    await sendZernioToContact({
                      ownerUserId,
                      contactId: contact.id,
                      channel,
                      text: rendered,
                      sentBy: null,
                    });
                    awayReplied = true;
                  } catch (e: any) {
                    console.error("[zernio webhook] away reply falhou:", e?.message ?? e);
                  }
                }
              }
            }

            // ───── Enfileira resposta de IA (worker channel-aware) ─────
            // Mesmo contrato do webhook Evolution: só enfileira se NÃO houver
            // humano atribuído e a mídia for processável pela IA (text/audio/
            // image). O gate de ai_enabled fica no runAiResponse (retorna skip).
            // instance_name = "zernio:<channel>" sinaliza ao worker para enviar
            // a resposta via Zernio em vez da Evolution.
            // Pula também se acabamos de mandar auto-reply de ausência — a IA
            // está off nesse caso, o job seria no-op.
            const aiMediaType =
              messageType === "text" || messageType === "audio" || messageType === "image"
                ? messageType
                : null;
            const hasProcessableContent =
              (aiMediaType === "text" && text.trim().length > 0) ||
              ((aiMediaType === "audio" || aiMediaType === "image") && !!mediaUrl);

            if (!humanInControl && !awayReplied && aiMediaType && hasProcessableContent) {
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
