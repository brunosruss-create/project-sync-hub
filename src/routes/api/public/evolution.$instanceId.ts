import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { extractQRCode, normalizeQRCodeImage } from "@/lib/evolution.server";

export const Route = createFileRoute("/api/public/evolution/$instanceId")({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        const instanceId = params.instanceId;
        const secret = request.headers.get("x-webhook-secret") ?? "";

        const { data: row } = await supabaseAdmin
          .from("whatsapp_instances")
          .select("id,instance_name,webhook_secret")
          .eq("id", instanceId)
          .maybeSingle();

        if (!row || !secret || secret !== row.webhook_secret) {
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
              await supabaseAdmin
                .from("whatsapp_instances")
                .update({
                  status: "connected",
                  qr_code: null,
                  last_connected_at: new Date().toISOString(),
                  phone_number:
                    data?.owner?.split?.("@")?.[0] ?? data?.number ?? undefined,
                  profile_name: data?.profileName ?? undefined,
                })
                .eq("id", row.id);
            } else if (state === "close") {
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
              const text =
                m?.message?.conversation ??
                m?.message?.extendedTextMessage?.text ??
                m?.message?.imageMessage?.caption ??
                m?.message?.videoMessage?.caption ??
                "[mídia]";
              const pushName = m?.pushName ?? null;

              // upsert contato
              const { data: existing } = await supabaseAdmin
                .from("contacts")
                .select("id")
                .eq("phone", phone)
                .maybeSingle();

              let contactId = existing?.id as string | undefined;
              if (!contactId) {
                const { data: created } = await supabaseAdmin
                  .from("contacts")
                  .insert({
                    phone,
                    name: pushName ?? phone,
                    kanban_column: "waiting",
                    is_unread: true,
                    last_message: text,
                    last_message_at: new Date().toISOString(),
                  })
                  .select("id")
                  .single();
                contactId = created?.id;
              } else {
                await supabaseAdmin
                  .from("contacts")
                  .update({
                    is_unread: true,
                    last_message: text,
                    last_message_at: new Date().toISOString(),
                  })
                  .eq("id", contactId);
              }

              if (contactId) {
                await supabaseAdmin.from("messages").insert({
                  contact_id: contactId,
                  direction: "inbound",
                  content: text,
                  message_type: "text",
                  status: "delivered",
                });
              }
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
