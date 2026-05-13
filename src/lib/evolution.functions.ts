import { createServerFn } from "@tanstack/react-start";
import { getRequest, getRequestHost } from "@tanstack/react-start/server";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { evo, extractQRCode, instanceNameForOwner, normalizeQRCodeImage, tryFetchProfilePicture } from "@/lib/evolution.server";

const WEBHOOK_EVENTS = ["MESSAGES_UPSERT", "MESSAGES_UPDATE", "SEND_MESSAGE_UPDATE", "CONNECTION_UPDATE", "QRCODE_UPDATED"];

function isPublicHost(host: string | null | undefined): host is string {
  if (!host) return false;
  return !/^(localhost|127\.|0\.0\.0\.0|::1|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/i.test(host);
}

function publicBaseUrl(): string {
  const fromEnv =
    process.env.PUBLIC_APP_URL ||
    process.env.APP_PUBLIC_URL ||
    process.env.VITE_PUBLIC_APP_URL;
  if (fromEnv) return fromEnv.replace(/\/$/, "");
  try {
    const req = getRequest();
    const fwdHost = req.headers.get("x-forwarded-host");
    const fwdProto = req.headers.get("x-forwarded-proto") ?? "https";
    if (isPublicHost(fwdHost)) return `${fwdProto}://${fwdHost}`;
    const host = getRequestHost();
    if (isPublicHost(host)) return `https://${host}`;
  } catch {}
  return "";
}

async function getOrCreateRow(userId: string) {
  const name = instanceNameForOwner(userId);
  const { data: existing } = await supabaseAdmin
    .from("whatsapp_instances")
    .select("*")
    .eq("instance_name", name)
    .maybeSingle();
  if (existing) return existing;
  const { data, error } = await supabaseAdmin
    .from("whatsapp_instances")
    .insert({ instance_name: name, owner_user_id: userId, status: "disconnected" })
    .select("*")
    .single();
  if (error) throw new Error(`DB: ${error.message}`);
  return data;
}

function isAuthError(msg: string): boolean {
  return !/already|exist|in use/i.test(msg) && /forbidden|unauthorized|missing global api key|invalid api key|api key/i.test(msg);
}

function payloadKeys(payload: any): string[] {
  if (!payload || typeof payload !== "object") return [];
  return Object.keys(payload);
}

function firstFetchedInstance(payload: any): any | null {
  if (Array.isArray(payload)) return payload[0] ?? null;
  if (Array.isArray(payload?.instances)) return payload.instances[0] ?? null;
  if (Array.isArray(payload?.data)) return payload.data[0] ?? null;
  return payload?.instance ?? payload ?? null;
}

async function ensureWebhook(name: string, webhookUrl: string, webhookSecret: string) {
  try {
    await evo.setWebhook(name, {
      webhook: {
        enabled: true,
        url: webhookUrl,
        headers: { "x-webhook-secret": webhookSecret },
        byEvents: false,
        base64: false,
        events: WEBHOOK_EVENTS,
      },
    });
  } catch (e: any) {
    const msg = String(e?.message ?? "");
    if (isAuthError(msg)) {
      console.error("[evolution] setWebhook auth error:", msg);
      throw new Error(
        "Evolution API recusou a autenticação ao registrar o webhook. Verifique EVOLUTION_API_KEY (Lovable) vs AUTHENTICATION_API_KEY (Railway).",
      );
    }
    console.warn("[evolution] setWebhook:", msg);
  }
}

async function configureEvolutionInstance(name: string, webhookUrl: string, webhookSecret: string) {
  let created: any = null;
  try {
    created = await evo.createInstance({
      instanceName: name,
      integration: "WHATSAPP-BAILEYS",
      qrcode: true,
      webhook: {
        url: webhookUrl,
        headers: { "x-webhook-secret": webhookSecret },
        events: WEBHOOK_EVENTS,
        webhookByEvents: false,
        webhookBase64: false,
      },
    });
  } catch (e: any) {
    const msg = String(e?.message ?? "");
    const exists = /already|exist|in use/i.test(msg);
    if (exists) {
      console.log("[evolution] createInstance: instância já existe, seguindo");
    } else if (isAuthError(msg)) {
      console.error("[evolution] createInstance auth error:", msg);
      throw new Error(
        "Evolution API recusou a autenticação (Forbidden). Verifique se o secret EVOLUTION_API_KEY no Lovable é EXATAMENTE igual ao AUTHENTICATION_API_KEY no Railway, e se EVOLUTION_API_URL aponta para o SERVER_URL correto da Evolution.",
      );
    } else {
      console.warn("[evolution] createInstance:", msg);
      throw new Error(`Falha em /instance/create: ${msg}`);
    }
  }

  await ensureWebhook(name, webhookUrl, webhookSecret);

  return normalizeQRCodeImage(extractQRCode(created));
}

export const getInstance = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const name = instanceNameForOwner(context.userId);
    const { data } = await supabaseAdmin
      .from("whatsapp_instances")
      .select("id,instance_name,status,phone_number,profile_name,qr_code,qr_expires_at,last_connected_at,updated_at")
      .eq("instance_name", name)
      .maybeSingle();
    const baseUrl = publicBaseUrl();
    const webhookUrl = data && baseUrl ? `${baseUrl}/api/public/evolution/${data.id}` : null;
    return { instance: data ? { ...data, webhook_url: webhookUrl } : null, serverTime: Date.now() };
  });

export const connectInstance = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const row = await getOrCreateRow(context.userId);
    const name = row.instance_name as string;
    const baseUrl = publicBaseUrl();
    const webhookUrl = baseUrl ? `${baseUrl}/api/public/evolution/${row.id}` : null;
    const webhookSecret = (row.webhook_secret as string | null) ?? "";

    let qr: string | null = null;

    // 0) Deleta a instância existente para garantir pairing fresco
    // (corrige "não é possível conectar novos dispositivos" do WhatsApp)
    try {
      await evo.logout(name);
    } catch {}
    try {
      await evo.deleteInstance(name);
    } catch (e: any) {
      const msg = String(e?.message ?? e);
      if (isAuthError(msg)) {
        throw new Error(
          "Evolution API recusou a autenticação (Forbidden). Verifique EVOLUTION_API_KEY (Lovable) vs AUTHENTICATION_API_KEY (Railway).",
        );
      }
      // 404 / not found é esperado quando ainda não existe
    }

    // 1) Cria instância nova (já retorna QR na maioria das versões)
    try {
      const created = await evo.createInstance({
        instanceName: name,
        integration: "WHATSAPP-BAILEYS",
        qrcode: true,
      });
      qr = await normalizeQRCodeImage(extractQRCode(created));
    } catch (e: any) {
      const msg = String(e?.message ?? e);
      if (isAuthError(msg)) {
        throw new Error(
          "Evolution API recusou a autenticação (Forbidden) ao criar a instância. Verifique EVOLUTION_API_KEY.",
        );
      }
      if (!/already|exist|in use/i.test(msg)) {
        console.warn("[evolution] createInstance:", msg);
      }
    }

    // 2) Sempre chama connect para garantir QR atual.
    // Em uma instância recém-criada, a Evolution leva ~500-1500ms até o socket
    // Baileys subir; tentamos algumas vezes antes de declarar erro.
    if (!qr) {
      for (let attempt = 0; attempt < 4 && !qr; attempt++) {
        if (attempt > 0) await new Promise((r) => setTimeout(r, 600));
        try {
          const r = await evo.connect(name);
          qr = await normalizeQRCodeImage(extractQRCode(r));
        } catch (e: any) {
          console.warn(`[evolution] connect attempt ${attempt + 1}:`, e?.message ?? e);
        }
      }
    }

    if (!qr) {
      await supabaseAdmin
        .from("whatsapp_instances")
        .update({ status: "error", qr_code: null })
        .eq("id", row.id);
      throw new Error("Evolution conectou mas não devolveu QR Code. Verifique QRCODE_LIMIT no Railway.");
    }

    // 3) Salva QR no DB ANTES do webhook (que pode falhar sem afetar o QR)
    const { data: updated } = await supabaseAdmin
      .from("whatsapp_instances")
      .update({
        status: "pending",
        qr_code: qr,
        qr_expires_at: new Date(Date.now() + 30_000).toISOString(),
      })
      .eq("id", row.id)
      .select("*")
      .single();

    // 4) Webhook é best-effort, nunca derruba o QR
    if (webhookUrl) {
      try {
        await ensureWebhook(name, webhookUrl, webhookSecret);
      } catch (e: any) {
        console.warn("[evolution] webhook (não bloqueia QR):", e?.message ?? e);
      }
    }

    return { instance: updated ? { ...updated, webhook_url: webhookUrl } : null, qr, serverTime: Date.now() };
  });

export const registerWebhook = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const row = await getOrCreateRow(context.userId);
    const name = row.instance_name as string;
    const baseUrl = publicBaseUrl();
    if (!baseUrl) {
      throw new Error(
        "URL pública do app não detectada. Defina o secret PUBLIC_APP_URL (ex.: https://github-vercel-bridge.lovable.app) e tente novamente.",
      );
    }
    const webhookUrl = `${baseUrl}/api/public/evolution/${row.id}`;
    await evo.setWebhook(name, {
      webhook: {
        enabled: true,
        url: webhookUrl,
        headers: { "x-webhook-secret": row.webhook_secret as string },
        byEvents: false,
        base64: false,
        events: WEBHOOK_EVENTS,
      },
    });
    return { instance: { ...row, webhook_url: webhookUrl }, webhookUrl, serverTime: Date.now() };
  });

const refreshInput = z.object({ forceQrRefresh: z.boolean().optional() }).optional();

export const refreshInstanceStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => refreshInput.parse(d))
  .handler(async ({ data, context }) => {
    const name = instanceNameForOwner(context.userId);
    const { data: row } = await supabaseAdmin
      .from("whatsapp_instances")
      .select("*")
      .eq("instance_name", name)
      .maybeSingle();
    if (!row) return { instance: null, serverTime: Date.now() };

    let state: string | null = null;
    let phone: string | null = null;
    let profile: string | null = null;
    try {
      const r: any = await evo.connectionState(name);
      state = r?.instance?.state ?? r?.state ?? null;
    } catch (e: any) {
      console.warn("[evolution] connectionState:", e?.message);
    }
    try {
      const list: any = await evo.fetchInstances(name);
      const inst = Array.isArray(list) ? list[0] : list?.[0] ?? list;
      const data = inst?.instance ?? inst;
      phone = data?.owner?.split?.("@")?.[0] ?? data?.number ?? data?.profileName?.number ?? null;
      profile = data?.profileName ?? data?.profilename ?? null;
    } catch {}

    const qrExpiresAt = row.qr_expires_at ? new Date(row.qr_expires_at).getTime() : 0;
    const qrExpired = !qrExpiresAt || qrExpiresAt <= Date.now();
    const hasUsableQr = Boolean(row.qr_code) && !qrExpired;
    const shouldRefreshQr = Boolean(data?.forceQrRefresh) || !row.qr_code || qrExpired;

    const status =
      state === "open"
        ? "connected"
        : state === "connecting" || row.status === "pending" || hasUsableQr
          ? "pending"
          : state === "close"
            ? "disconnected"
            : row.status;

    const update: Record<string, any> = { status };
    if (status === "connected") {
      update.last_connected_at = new Date().toISOString();
      update.qr_code = null;
      if (phone) update.phone_number = phone;
      if (profile) update.profile_name = profile;
    } else if (status === "pending" && shouldRefreshQr) {
      try {
        const r: any = await evo.connect(name);
        const qr = await normalizeQRCodeImage(extractQRCode(r));
        if (qr) {
          update.qr_code = qr;
          update.qr_expires_at = new Date(Date.now() + 30_000).toISOString();
        } else {
          update.status = row.qr_code ? "pending" : "error";
          if (!row.qr_code) update.qr_code = null;
        }
      } catch (e: any) {
        console.warn("[evolution] refresh qrcode:", e?.message);
        update.status = row.qr_code ? "pending" : "error";
        if (!row.qr_code) update.qr_code = null;
      }
    }

    const { data: updated } = await supabaseAdmin
      .from("whatsapp_instances")
      .update(update)
      .eq("id", row.id)
      .select("*")
      .single();

    return { instance: updated, serverTime: Date.now() };
  });

export const disconnectInstance = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const name = instanceNameForOwner(context.userId);
    try {
      await evo.logout(name);
    } catch (e: any) {
      console.warn("[evolution] logout:", e?.message);
    }
    const { data } = await supabaseAdmin
      .from("whatsapp_instances")
      .update({ status: "disconnected", qr_code: null, phone_number: null, profile_name: null })
      .eq("instance_name", name)
      .select("*")
      .maybeSingle();
    return { instance: data ?? null, serverTime: Date.now() };
  });

const quotedInput = z
  .object({
    messageId: z.string().min(1).max(255),
    fromMe: z.boolean(),
    remoteJid: z.string().min(1).max(255),
    preview: z
      .object({
        content: z.string().max(2000).optional(),
        author: z.string().max(255).optional(),
        message_type: z.string().max(32).optional(),
      })
      .optional(),
  })
  .optional();

function buildQuotedPayload(q?: z.infer<typeof quotedInput>): any | undefined {
  if (!q) return undefined;
  return {
    key: { id: q.messageId, fromMe: q.fromMe, remoteJid: q.remoteJid },
    message: { conversation: q.preview?.content ?? "" },
  };
}

const sendInput = z.object({
  contactId: z.string().uuid(),
  text: z.string().min(1).max(4096),
  quoted: quotedInput,
});

export const sendWhatsAppMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => sendInput.parse(d))
  .handler(async ({ data, context }) => {
    const name = instanceNameForOwner(context.userId);
    const { data: contact, error: ce } = await supabaseAdmin
      .from("contacts")
      .select("id,phone")
      .eq("id", data.contactId)
      .eq("owner_user_id", context.userId)
      .maybeSingle();
    if (ce || !contact?.phone) throw new Error("Contato sem telefone.");

    const number = String(contact.phone).replace(/\D/g, "");
    let externalId: string | null = null;
    try {
      const r: any = await evo.sendText(name, {
        number,
        text: data.text,
        quoted: buildQuotedPayload(data.quoted),
      });
      externalId = r?.key?.id ?? r?.id ?? null;
    } catch (e: any) {
      throw new Error(`Falha no envio: ${e?.message ?? e}`);
    }

    await supabaseAdmin.from("messages").insert({
      owner_user_id: context.userId,
      contact_id: contact.id,
      direction: "outbound",
      content: data.text,
      message_type: "text",
      status: "sent",
      sent_by: context.userId,
      whatsapp_message_id: externalId,
      quoted_message_id: data.quoted?.messageId ?? null,
      quoted_preview: data.quoted?.preview ?? null,
    });

    return { ok: true, externalId };
  });

const refreshAvatarInput = z.object({ contactId: z.string().uuid() });

export const refreshContactAvatar = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => refreshAvatarInput.parse(d))
  .handler(async ({ data, context }) => {
    const name = instanceNameForOwner(context.userId);
    const { data: contact } = await supabaseAdmin
      .from("contacts")
      .select("id,phone,avatar_url")
      .eq("id", data.contactId)
      .eq("owner_user_id", context.userId)
      .maybeSingle();
    if (!contact?.phone) return { url: null as string | null, changed: false };
    const number = String(contact.phone).replace(/\D/g, "");
    const url = await tryFetchProfilePicture(name, number);
    if (url && url !== contact.avatar_url) {
      await supabaseAdmin
        .from("contacts")
        .update({ avatar_url: url })
        .eq("id", contact.id);
      return { url, changed: true };
    }
    return { url: contact.avatar_url ?? null, changed: false };
  });

// ===================== MEDIA =====================

const sendMediaInput = z.object({
  contactId: z.string().uuid(),
  url: z.string().url(),
  mime: z.string().min(1).max(255),
  name: z.string().min(1).max(500),
  caption: z.string().max(1024).optional(),
});

export const sendWhatsAppMedia = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => sendMediaInput.parse(d))
  .handler(async ({ data, context }) => {
    const instance = instanceNameForOwner(context.userId);
    const { data: contact, error: ce } = await supabaseAdmin
      .from("contacts")
      .select("id,phone")
      .eq("id", data.contactId)
      .eq("owner_user_id", context.userId)
      .maybeSingle();
    if (ce || !contact?.phone) throw new Error("Contato sem telefone.");

    const number = String(contact.phone).replace(/\D/g, "");
    const isImage = data.mime.startsWith("image/");
    const isVideo = data.mime.startsWith("video/");
    const mediatype: "image" | "video" | "document" = isImage ? "image" : isVideo ? "video" : "document";

    let externalId: string | null = null;
    try {
      const r: any = await evo.sendMedia(instance, {
        number,
        mediatype,
        mimetype: data.mime,
        media: data.url,
        fileName: data.name,
        caption: data.caption,
      });
      externalId = r?.key?.id ?? r?.id ?? null;
    } catch (e: any) {
      throw new Error(`Falha no envio de mídia: ${e?.message ?? e}`);
    }

    await supabaseAdmin.from("messages").insert({
      owner_user_id: context.userId,
      contact_id: contact.id,
      direction: "outbound",
      content: data.caption ?? "",
      message_type: mediatype === "image" ? "image" : mediatype === "video" ? "video" : "document",
      status: "sent",
      sent_by: context.userId,
      media_url: data.url,
      media_mime: data.mime,
      media_name: data.name,
      whatsapp_message_id: externalId,
    });

    return { ok: true, externalId };
  });

const sendAudioInput = z.object({
  contactId: z.string().uuid(),
  url: z.string().url(),
});

export const sendWhatsAppAudio = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => sendAudioInput.parse(d))
  .handler(async ({ data, context }) => {
    const instance = instanceNameForOwner(context.userId);
    const { data: contact, error: ce } = await supabaseAdmin
      .from("contacts")
      .select("id,phone")
      .eq("id", data.contactId)
      .eq("owner_user_id", context.userId)
      .maybeSingle();
    if (ce || !contact?.phone) throw new Error("Contato sem telefone.");

    const number = String(contact.phone).replace(/\D/g, "");
    let externalId: string | null = null;
    try {
      const r: any = await evo.sendWhatsAppAudio(instance, { number, audio: data.url });
      externalId = r?.key?.id ?? r?.id ?? null;
    } catch (e: any) {
      throw new Error(`Falha no envio de áudio: ${e?.message ?? e}`);
    }

    await supabaseAdmin.from("messages").insert({
      owner_user_id: context.userId,
      contact_id: contact.id,
      direction: "outbound",
      content: "",
      message_type: "audio",
      status: "sent",
      sent_by: context.userId,
      media_url: data.url,
      media_mime: "audio/webm",
      whatsapp_message_id: externalId,
    });

    return { ok: true, externalId };
  });

