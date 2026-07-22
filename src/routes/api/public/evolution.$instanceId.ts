import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  extractQRCode,
  normalizeQRCodeImage,
  tryFetchProfilePicture,
  downloadInboundMedia,
} from "@/lib/evolution.server";
import type { MessageJobPayload } from "@/lib/message-processing.server";

type MediaKind = "image" | "audio" | "video" | "document";

const MIME_EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "audio/ogg": "ogg",
  "audio/ogg; codecs=opus": "ogg",
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
function detectMediaNode(message: any, depth = 0): { kind: MediaKind; node: any } | null {
  if (!message || depth > 5) return null;
  if (message.imageMessage) return { kind: "image", node: message.imageMessage };
  if (message.videoMessage) return { kind: "video", node: message.videoMessage };
  if (message.audioMessage) return { kind: "audio", node: message.audioMessage };
  if (message.pttMessage) return { kind: "audio", node: message.pttMessage };
  if (message.documentMessage) return { kind: "document", node: message.documentMessage };
  if (message.documentWithCaptionMessage?.message?.documentMessage)
    return { kind: "document", node: message.documentWithCaptionMessage.message.documentMessage };
  if (message.stickerMessage) return { kind: "image", node: message.stickerMessage };
  // Unwrap envelopes (ephemeral, viewOnce, edited, etc.)
  const wrappers = [
    message.ephemeralMessage?.message,
    message.viewOnceMessage?.message,
    message.viewOnceMessageV2?.message,
    message.viewOnceMessageV2Extension?.message,
    message.editedMessage?.message,
    message.protocolMessage?.editedMessage?.message,
    message.deviceSentMessage?.message,
  ];
  for (const w of wrappers) {
    if (w) {
      const found = detectMediaNode(w, depth + 1);
      if (found) return found;
    }
  }
  return null;
}

function detectFromMessageType(
  messageType: string | null | undefined,
  message: any,
): { kind: MediaKind; node: any } | null {
  if (!messageType) return null;
  const t = String(messageType).toLowerCase();
  if (t.includes("audio") || t.includes("ptt")) {
    return { kind: "audio", node: message?.audioMessage ?? message?.pttMessage ?? message ?? {} };
  }
  if (t.includes("image") || t.includes("sticker")) {
    return {
      kind: "image",
      node: message?.imageMessage ?? message?.stickerMessage ?? message ?? {},
    };
  }
  if (t.includes("video")) {
    return { kind: "video", node: message?.videoMessage ?? message ?? {} };
  }
  if (t.includes("document")) {
    return { kind: "document", node: message?.documentMessage ?? message ?? {} };
  }
  return null;
}
const KIND_LABEL: Record<MediaKind, string> = {
  image: "📷 Imagem",
  audio: "🎵 Áudio",
  video: "🎬 Vídeo",
  document: "📎 Documento",
};

const STATUS_RANK: Record<string, number> = { sent: 1, delivered: 2, read: 3 };

function normalizeOutboundStatus(raw: unknown): "sent" | "delivered" | "read" | null {
  if (typeof raw === "number") {
    if (raw >= 4) return "read";
    if (raw >= 2) return "delivered";
    if (raw === 1) return "sent";
    return null;
  }

  const status = String(raw ?? "")
    .trim()
    .toUpperCase()
    .replace(/[\s-]+/g, "_");

  if (["READ", "READ_RECEIPT", "PLAYED", "MESSAGE_READ", "ACK_READ"].includes(status))
    return "read";
  if (
    ["DELIVERY_ACK", "DELIVERED", "SERVER_ACK", "MESSAGE_DELIVERED", "ACK_DELIVERED"].includes(
      status,
    )
  )
    return "delivered";
  if (["PENDING", "SENT", "MESSAGE_SENT", "ACK_SERVER"].includes(status)) return "sent";
  return null;
}

export const Route = createFileRoute("/api/public/evolution/$instanceId")({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        const instanceId = params.instanceId;
        const secret = request.headers.get("x-webhook-secret") ?? "";

        const { data: row } = await supabaseAdmin
          .from("whatsapp_instances")
          .select("id,instance_name,webhook_secret,owner_user_id")
          .eq("id", instanceId)
          .maybeSingle();

        if (!row) {
          console.warn("[evolution webhook] forbidden: instance row not found", { instanceId });
          return new Response("forbidden", { status: 403 });
        }
        if (!row.owner_user_id) {
          console.warn("[evolution webhook] forbidden: row missing owner_user_id", { instanceId });
          return new Response("forbidden", { status: 403 });
        }
        if (!secret) {
          console.warn("[evolution webhook] forbidden: missing x-webhook-secret header", {
            instanceId,
          });
          return new Response("forbidden", { status: 403 });
        }
        if (!row.webhook_secret) {
          console.warn("[evolution webhook] forbidden: row has no webhook_secret in DB", {
            instanceId,
          });
          return new Response("forbidden", { status: 403 });
        }
        if (secret !== row.webhook_secret) {
          console.warn("[evolution webhook] forbidden: secret mismatch", { instanceId });
          return new Response("forbidden", { status: 403 });
        }

        let payload: any = null;
        try {
          payload = await request.json();
        } catch {
          return new Response("bad json", { status: 400 });
        }

        // Evolution pode mandar "messages.upsert" ou "MESSAGES_UPSERT"
        const rawEvent = String(payload?.event ?? "").toLowerCase();
        const event = rawEvent.replace(/_/g, ".");
        const data = payload?.data ?? payload;

        console.log("[evolution]", {
          instanceId: row.id,
          rawEvent,
          event,
          payloadKeys: Object.keys(payload ?? {}),
          dataKeys: data && typeof data === "object" ? Object.keys(data) : null,
        });

        try {
          if (event === "qrcode.updated") {
            const qr = await normalizeQRCodeImage(extractQRCode(payload));
            await supabaseAdmin
              .from("whatsapp_instances")
              .update({
                status: "pending",
                qr_code: qr,
                qr_expires_at: new Date(Date.now() + 60_000).toISOString(),
              })
              .eq("id", row.id);
          } else if (event === "connection.update") {
            const state = data?.state ?? data?.connection ?? null;
            if (state === "open") {
              const ownPhone = data?.owner?.split?.("@")?.[0] ?? data?.number ?? null;
              await supabaseAdmin
                .from("whatsapp_instances")
                .update({
                  status: "connected",
                  qr_code: null,
                  last_connected_at: new Date().toISOString(),
                  phone_number: ownPhone ?? undefined,
                  profile_name: data?.profileName ?? undefined,
                })
                .eq("id", row.id);
              // Sincroniza foto de perfil do WhatsApp do próprio usuário
              if (ownPhone) {
                try {
                  const ownAvatar = await tryFetchProfilePicture(
                    row.instance_name as string,
                    String(ownPhone).replace(/\D/g, ""),
                  );
                  if (ownAvatar) {
                    await supabaseAdmin
                      .from("profiles")
                      .update({ avatar_url: ownAvatar })
                      .eq("id", row.owner_user_id);
                  }
                } catch (e: any) {
                  console.warn("[evolution] sync own avatar falhou:", e?.message ?? e);
                }
              }
            } else if (state === "close") {
              const { data: current } = await supabaseAdmin
                .from("whatsapp_instances")
                .select("status,qr_code,qr_expires_at")
                .eq("id", row.id)
                .maybeSingle();
              const qrExpiresAt = current?.qr_expires_at
                ? new Date(current.qr_expires_at).getTime()
                : 0;
              const keepPendingQr =
                current?.status === "pending" && current?.qr_code && qrExpiresAt > Date.now();
              if (keepPendingQr) return new Response("ok", { status: 200 });
              await supabaseAdmin
                .from("whatsapp_instances")
                .update({ status: "disconnected", qr_code: null })
                .eq("id", row.id);
            }
          } else if (event === "messages.upsert") {
            const msgs = Array.isArray(data?.messages)
              ? data.messages
              : Array.isArray(data)
                ? data
                : [data];

            for (const m of msgs) {
              if (!m) continue;
              const fromMe = !!m?.key?.fromMe;
              if (fromMe) continue; // só inbound aqui
              const remote = m?.key?.remoteJid ?? "";
              if (!remote || remote.endsWith("@g.us")) continue; // ignora grupos
              const phone = remote.split("@")[0];
              const pushName = m?.pushName ?? null;

              // ---- detectar mídia
              const detected =
                detectMediaNode(m?.message) ?? detectFromMessageType(m?.messageType, m?.message);
              console.log("[evolution upsert] msg type", {
                messageType: m?.messageType ?? null,
                detected: detected?.kind ?? null,
                msgKeys:
                  m?.message && typeof m.message === "object" ? Object.keys(m.message) : null,
                topKeys: Object.keys(m ?? {}),
              });
              let mediaType: "text" | MediaKind = "text";
              let mediaUrl: string | null = null;
              let mediaMime: string | null = null;
              let mediaName: string | null = null;
              let caption: string =
                m?.message?.conversation ?? m?.message?.extendedTextMessage?.text ?? "";

              if (detected) {
                caption = detected.node?.caption ?? caption ?? "";
                const declaredMime: string | null = detected.node?.mimetype ?? null;
                const declaredName: string | null = detected.node?.fileName ?? null;
                mediaType = detected.kind;
                mediaMime = declaredMime;
                mediaName = declaredName;

                // 1) Tenta base64 inline do webhook (Evolution com base64:true)
                const inlineBase64: string | null =
                  m?.message?.base64 ??
                  detected.node?.base64 ??
                  m?.base64 ??
                  m?.media?.base64 ??
                  null;

                let buffer: Buffer | null = null;
                let mime: string = declaredMime || "application/octet-stream";
                let fileName: string | null = declaredName;

                if (typeof inlineBase64 === "string" && inlineBase64.length > 0) {
                  const clean = inlineBase64.includes(",")
                    ? inlineBase64.split(",").pop()!
                    : inlineBase64;
                  buffer = Buffer.from(clean, "base64");
                  console.log("[evolution upsert] base64 inline ok", {
                    kind: detected.kind,
                    bytes: buffer.length,
                  });
                } else {
                  // 2) Fallback: chama API getBase64FromMediaMessage
                  try {
                    const dl = await downloadInboundMedia(row.instance_name as string, m);
                    if (dl) {
                      buffer = dl.buffer;
                      mime = dl.mimetype || mime;
                      fileName = fileName || dl.fileName;
                    } else {
                      console.warn("[evolution upsert] downloadInboundMedia retornou null", {
                        kind: detected.kind,
                      });
                    }
                  } catch (e: any) {
                    console.error("[evolution upsert] download mídia falhou:", e?.message ?? e);
                  }
                }

                if (buffer) {
                  try {
                    const ext = extFromMime(mime, detected.kind === "audio" ? "ogg" : "bin");
                    const fname = fileName || `${detected.kind}-${Date.now()}.${ext}`;
                    const path = `${row.owner_user_id}/inbound-${Date.now()}-${crypto.randomUUID()}.${ext}`;
                    const { error: upErr } = await supabaseAdmin.storage
                      .from("chat-media")
                      .upload(path, buffer, { contentType: mime, upsert: false });
                    if (upErr) {
                      console.error("[evolution upsert] storage upload", {
                        path,
                        error: upErr.message,
                      });
                    } else {
                      const { data: pub } = supabaseAdmin.storage
                        .from("chat-media")
                        .getPublicUrl(path);
                      mediaUrl = pub.publicUrl;
                      mediaMime = mime;
                      mediaName = fname;
                    }
                  } catch (e: any) {
                    console.error("[evolution upsert] storage exception:", e?.message ?? e);
                  }
                }
              }

              const previewText =
                mediaType === "text"
                  ? caption || "[mídia]"
                  : caption || KIND_LABEL[mediaType as MediaKind];

              // upsert contato
              const { data: existing, error: selErr } = await supabaseAdmin
                .from("contacts")
                .select("id,assigned_agent_id,kanban_column")
                .eq("phone", phone)
                .eq("owner_user_id", row.owner_user_id)
                .maybeSingle();
              if (selErr) {
                console.error("[evolution upsert] select contact", {
                  phone,
                  error: selErr.message,
                });
              }

              let contactId = existing?.id as string | undefined;
              const assignedAgentId = existing?.assigned_agent_id as string | null | undefined;
              const kanbanColumn = existing?.kanban_column as string | null | undefined;
              if (!contactId) {
                const avatarUrl = await tryFetchProfilePicture(row.instance_name as string, phone);
                const { data: created, error: insErr } = await supabaseAdmin
                  .from("contacts")
                  .insert({
                    owner_user_id: row.owner_user_id,
                    phone,
                    name: pushName ?? phone,
                    avatar_url: avatarUrl,
                    kanban_column: "waiting",
                    is_unread: true,
                    last_message: previewText,
                    last_message_at: new Date().toISOString(),
                  })
                  .select("id")
                  .single();
                if (insErr) {
                  console.error("[evolution upsert] insert contact", {
                    phone,
                    owner_user_id: row.owner_user_id,
                    error: insErr.message,
                    details: (insErr as any).details,
                    hint: (insErr as any).hint,
                    code: (insErr as any).code,
                  });
                }
                contactId = created?.id;
              } else {
                const { error: updErr } = await supabaseAdmin
                  .from("contacts")
                  .update({
                    owner_user_id: row.owner_user_id,
                    is_unread: true,
                    last_message: previewText,
                    last_message_at: new Date().toISOString(),
                  })
                  .eq("id", contactId);
                if (updErr) {
                  console.error("[evolution upsert] update contact", {
                    contactId,
                    error: updErr.message,
                  });
                }
              }

              if (contactId) {
                const insertPayload: Record<string, unknown> = {
                  owner_user_id: row.owner_user_id,
                  contact_id: contactId,
                  direction: "inbound",
                  content: caption ?? "",
                  message_type: mediaType,
                  status: "delivered",
                  whatsapp_message_id: m?.key?.id ?? null,
                };
                if (mediaUrl) {
                  insertPayload.media_url = mediaUrl;
                  insertPayload.media_mime = mediaMime;
                  insertPayload.media_name = mediaName;
                }
                const { error: msgErr } = await supabaseAdmin
                  .from("messages")
                  .insert(insertPayload);
                if (msgErr) {
                  console.error("[evolution upsert] insert message", {
                    contactId,
                    error: msgErr.message,
                    details: (msgErr as any).details,
                    hint: (msgErr as any).hint,
                    code: (msgErr as any).code,
                  });
                }

                // ───── Disparo da IA (texto, sem humano atribuído) ─────
                // Humano "no controle" = atendente humano explicitamente atribuído.
                // Não usamos kanban_column como gate (abrir um chat move pra in_progress
                // e isso desligaria a IA pra sempre).
                const humanInControl = !!assignedAgentId;
                console.log("[evolution ai] gate", {
                  contactId,
                  mediaType,
                  hasCaption: !!caption.trim(),
                  assignedAgentId: assignedAgentId ?? null,
                  kanbanColumn: kanbanColumn ?? null,
                  humanInControl,
                });
                // ───── Enfileira resposta de IA (processada assíncronamente pelo worker) ─────
                // O webhook só valida, persiste e enfileira — não chama Gemini nem
                // Evolution aqui, pra responder rápido e não travar sob carga
                // (ver src/lib/job-worker.ts + src/lib/message-processing.server.ts).
                const shouldEnqueue =
                  (mediaType === "text" && caption.trim().length > 0 && !humanInControl) ||
                  (mediaType === "audio" && !!mediaUrl && !humanInControl);
                if (shouldEnqueue) {
                  const jobPayload: MessageJobPayload = {
                    phone,
                    pushName: pushName ?? null,
                    mediaType: mediaType as "text" | "audio",
                    caption,
                    mediaUrl,
                    mediaMime,
                    waMessageId: m?.key?.id ?? null,
                  };
                  const { error: jobErr } = await supabaseAdmin.from("message_jobs").insert({
                    workspace_owner_id: row.owner_user_id,
                    contact_id: contactId,
                    instance_name: row.instance_name,
                    payload: jobPayload,
                  });
                  if (jobErr) {
                    console.error("[evolution] falha ao enfileirar job de IA:", jobErr.message);
                  }
                }
              } else {
                console.error("[evolution upsert] no contactId after upsert", { phone });
              }
            }
          } else if (
            event.includes("messages.update") ||
            event.includes("send.message.update") ||
            event === "messages.set"
          ) {
            const updates = Array.isArray(data?.messages)
              ? data.messages
              : Array.isArray(data)
                ? data
                : [data];
            for (const u of updates) {
              if (!u) continue;
              const externalId: string | null =
                u?.key?.id ?? u?.keyId ?? u?.messageId ?? u?.id ?? u?.message?.key?.id ?? null;
              const rawStatusRaw =
                u?.status ?? u?.update?.status ?? u?.ack ?? u?.message?.status ?? u?.message?.ack;
              const next = normalizeOutboundStatus(rawStatusRaw);
              console.log("[evolution messages.update item]", { externalId, rawStatusRaw, next });
              if (!externalId || !next) continue;

              const { data: existing } = await supabaseAdmin
                .from("messages")
                .select("id,status")
                .eq("whatsapp_message_id", externalId)
                .eq("owner_user_id", row.owner_user_id)
                .maybeSingle();
              if (!existing) continue;
              const curRank = STATUS_RANK[String(existing.status)] ?? 0;
              const nextRank = STATUS_RANK[next];
              if (nextRank <= curRank) continue;
              const { error: upErr } = await supabaseAdmin
                .from("messages")
                .update({ status: next })
                .eq("id", existing.id);
              if (upErr) console.error("[evolution messages.update]", upErr.message);
            }
          } else {
            console.log("[evolution] evento ignorado:", event);
          }
        } catch (e: any) {
          console.error("[evolution webhook]", e?.message ?? e);
        }

        return new Response("ok", { status: 200 });
      },
    },
  },
});
