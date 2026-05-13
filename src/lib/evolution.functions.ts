import { createServerFn } from "@tanstack/react-start";
import { getRequestHost } from "@tanstack/react-start/server";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { evo, extractQRCode, instanceNameForOwner, normalizeQRCodeImage } from "@/lib/evolution.server";

const WEBHOOK_EVENTS = ["MESSAGES_UPSERT", "CONNECTION_UPDATE", "QRCODE_UPDATED"];

function publicBaseUrl(): string {
  const fromEnv =
    process.env.PUBLIC_APP_URL ||
    process.env.APP_PUBLIC_URL ||
    process.env.VITE_PUBLIC_APP_URL;
  if (fromEnv) return fromEnv.replace(/\/$/, "");
  try {
    const host = getRequestHost();
    if (host) return `https://${host}`;
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

export const getInstance = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const name = instanceNameForOwner(context.userId);
    const { data } = await supabaseAdmin
      .from("whatsapp_instances")
      .select("id,instance_name,status,phone_number,profile_name,qr_code,qr_expires_at,last_connected_at,updated_at")
      .eq("instance_name", name)
      .maybeSingle();
    return { instance: data ?? null };
  });

export const connectInstance = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const row = await getOrCreateRow(context.userId);
    const name = row.instance_name as string;
    const baseUrl = publicBaseUrl();
    const webhookUrl = `${baseUrl}/api/public/evolution/${row.id}`;

    // 1) tenta criar instância (idempotente: se existir, ignora)
    try {
      await evo.createInstance({
        instanceName: name,
        integration: "WHATSAPP-BAILEYS",
        qrcode: true,
        webhook: {
          url: webhookUrl,
          headers: { "x-webhook-secret": row.webhook_secret as string },
          events: WEBHOOK_EVENTS,
          webhookByEvents: false,
          webhookBase64: false,
        },
      });
    } catch (e: any) {
      const msg = String(e?.message ?? "");
      const exists = /exist|already/i.test(msg);
      if (!exists) {
        // se erro real, registra e segue tentando o connect
        console.warn("[evolution] createInstance:", msg);
      }
    }

    // 2) garante webhook atualizado (caso instância já existisse)
    try {
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
    } catch (e: any) {
      console.warn("[evolution] setWebhook:", e?.message);
    }

    // 3) conecta — retorna { base64, code, ... }
    let qr: string | null = null;
    try {
      const r: any = await evo.connect(name);
      qr = await normalizeQRCodeImage(extractQRCode(r));
    } catch (e: any) {
      throw new Error(`Falha ao conectar: ${e?.message ?? e}`);
    }

    if (!qr) {
      throw new Error("A Evolution API não retornou um QR Code. Clique em Reconectar para tentar novamente.");
    }

    const { data: updated } = await supabaseAdmin
      .from("whatsapp_instances")
      .update({
        status: "pending",
        qr_code: qr,
        qr_expires_at: new Date(Date.now() + 60_000).toISOString(),
      })
      .eq("id", row.id)
      .select("*")
      .single();

    return { instance: updated, qr };
  });

export const refreshInstanceStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const name = instanceNameForOwner(context.userId);
    const { data: row } = await supabaseAdmin
      .from("whatsapp_instances")
      .select("*")
      .eq("instance_name", name)
      .maybeSingle();
    if (!row) return { instance: null };

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

    const status =
      state === "open"
        ? "connected"
        : state === "connecting"
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
    }

    const { data: updated } = await supabaseAdmin
      .from("whatsapp_instances")
      .update(update)
      .eq("id", row.id)
      .select("*")
      .single();

    return { instance: updated };
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
    return { instance: data ?? null };
  });

const sendInput = z.object({
  contactId: z.string().uuid(),
  text: z.string().min(1).max(4096),
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
      .maybeSingle();
    if (ce || !contact?.phone) throw new Error("Contato sem telefone.");

    const number = String(contact.phone).replace(/\D/g, "");
    let externalId: string | null = null;
    try {
      const r: any = await evo.sendText(name, { number, text: data.text });
      externalId = r?.key?.id ?? r?.id ?? null;
    } catch (e: any) {
      throw new Error(`Falha no envio: ${e?.message ?? e}`);
    }

    await supabaseAdmin.from("messages").insert({
      contact_id: contact.id,
      direction: "outbound",
      content: data.text,
      message_type: "text",
      status: "sent",
      sent_by: context.userId,
    });

    return { ok: true, externalId };
  });
