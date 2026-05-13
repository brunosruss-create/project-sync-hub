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

async function configureEvolutionInstance(name: string, webhookUrl: string, webhookSecret: string) {
  try {
    await evo.createInstance({
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
    const exists = /exist|already/i.test(msg);
    if (!exists) console.warn("[evolution] createInstance:", msg);
  }

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
    console.warn("[evolution] setWebhook:", e?.message);
  }
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

    await configureEvolutionInstance(name, webhookUrl, row.webhook_secret as string);

    // 3) conecta — retorna { base64, code, ... }
    let qr: string | null = null;
    try {
      const r: any = await evo.connect(name);
      qr = await normalizeQRCodeImage(extractQRCode(r));
      if (!qr) {
        await evo.deleteInstance(name).catch((e: any) => console.warn("[evolution] delete stale instance:", e?.message));
        await configureEvolutionInstance(name, webhookUrl, row.webhook_secret as string);
        const retry: any = await evo.connect(name);
        qr = await normalizeQRCodeImage(extractQRCode(retry));
      }
    } catch (e: any) {
      throw new Error(`Falha ao conectar: ${e?.message ?? e}`);
    }

    if (!qr) {
      await supabaseAdmin
        .from("whatsapp_instances")
        .update({ status: "error", qr_code: null })
        .eq("id", row.id);
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
    } else if (status === "pending" && !row.qr_code) {
      try {
        const r: any = await evo.connect(name);
        const qr = await normalizeQRCodeImage(extractQRCode(r));
        if (qr) {
          update.qr_code = qr;
          update.qr_expires_at = new Date(Date.now() + 60_000).toISOString();
        } else {
          update.status = "error";
          update.qr_code = null;
        }
      } catch (e: any) {
        console.warn("[evolution] refresh qrcode:", e?.message);
        update.status = "error";
        update.qr_code = null;
      }
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
