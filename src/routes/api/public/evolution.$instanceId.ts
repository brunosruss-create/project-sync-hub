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
          .select("id,instance_name,webhook_secret,owner_user_id")
          .eq("id", instanceId)
          .maybeSingle();

        if (!row || !secret || secret !== row.webhook_secret || !row.owner_user_id) {
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
              const { data: current } = await supabaseAdmin
                .from("whatsapp_instances")
                .select("status,qr_code,qr_expires_at")
                .eq("id", row.id)
                .maybeSingle();
              const qrExpiresAt = current?.qr_expires_at ? new Date(current.qr_expires_at).getTime() : 0;
              const keepPendingQr = current?.status === "pending" && current?.qr_code && qrExpiresAt > Date.now();
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
              const text =
                m?.message?.conversation ??
                m?.message?.extendedTextMessage?.text ??
                m?.message?.imageMessage?.caption ??
                m?.message?.videoMessage?.caption ??
                "[mídia]";
              const pushName = m?.pushName ?? null;

              // upsert contato
              const { data: existing, error: selErr } = await supabaseAdmin
                .from("contacts")
                .select("id")
                .eq("phone", phone)
                .eq("owner_user_id", row.owner_user_id)
                .maybeSingle();
              if (selErr) {
                console.error("[evolution upsert] select contact", { phone, error: selErr.message });
              }

              let contactId = existing?.id as string | undefined;
              if (!contactId) {
                const { data: created, error: insErr } = await supabaseAdmin
                  .from("contacts")
                  .insert({
                    owner_user_id: row.owner_user_id,
                    phone,
                    name: pushName ?? phone,
                    kanban_column: "waiting",
                    is_unread: true,
                    last_message: text,
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
                    last_message: text,
                    last_message_at: new Date().toISOString(),
                  })
                  .eq("id", contactId);
                if (updErr) {
                  console.error("[evolution upsert] update contact", { contactId, error: updErr.message });
                }
              }

              if (contactId) {
                const { error: msgErr } = await supabaseAdmin.from("messages").insert({
                  owner_user_id: row.owner_user_id,
                  contact_id: contactId,
                  direction: "inbound",
                  content: text,
                  message_type: "text",
                  status: "delivered",
                });
                if (msgErr) {
                  console.error("[evolution upsert] insert message", {
                    contactId,
                    error: msgErr.message,
                    details: (msgErr as any).details,
                    hint: (msgErr as any).hint,
                    code: (msgErr as any).code,
                  });
                }
              } else {
                console.error("[evolution upsert] no contactId after upsert", { phone });
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
