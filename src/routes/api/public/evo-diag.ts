import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/evo-diag")({
  server: {
    handlers: {
      GET: async () => {
        const rawUrl = process.env.EVOLUTION_API_URL ?? "";
        const rawKey = process.env.EVOLUTION_API_KEY ?? "";

        let url = rawUrl.trim().replace(/^['"]|['"]$/g, "").replace(/\/$/, "");
        if (url && !/^https?:\/\//i.test(url)) url = `https://${url}`;

        const diag: Record<string, unknown> = {
          env: {
            url_set: Boolean(rawUrl),
            url_normalized: url || null,
            url_has_https: /^https:\/\//i.test(url),
            url_had_trailing_slash: rawUrl.trim().endsWith("/"),
            url_had_quotes: /^['"]|['"]$/.test(rawUrl.trim()),
            key_set: Boolean(rawKey),
            key_length: rawKey.length,
            key_has_whitespace: /\s/.test(rawKey),
          },
        };

        if (!url || !rawKey) {
          diag.error = "EVOLUTION_API_URL ou EVOLUTION_API_KEY ausente";
          return Response.json(diag, { status: 500 });
        }

        const checks: Array<{ name: string; target: string; status?: number; body?: string; error?: string }> = [];
        const hit = async (name: string, path: string) => {
          const target = `${url}${path}`;
          try {
            const ctrl = new AbortController();
            const t = setTimeout(() => ctrl.abort(), 10000);
            const res = await fetch(target, {
              method: "GET",
              headers: { apikey: rawKey, "Content-Type": "application/json" },
              signal: ctrl.signal,
            });
            clearTimeout(t);
            const body = await res.text();
            checks.push({ name, target, status: res.status, body: body.slice(0, 800) });
          } catch (e: any) {
            checks.push({ name, target, error: e?.message ?? String(e) });
          }
        };

        await hit("fetchInstances", "/instance/fetchInstances");
        await hit("findWebhook", "/webhook/find/zapflow_main");
        await hit("connectionState", "/instance/connectionState/zapflow_main");

        const publicAppUrl = (process.env.PUBLIC_APP_URL ?? "").trim().replace(/\/$/, "");
        const normalizedAppUrl = publicAppUrl && !/^https?:\/\//i.test(publicAppUrl)
          ? `https://${publicAppUrl}`
          : publicAppUrl;

        if (normalizedAppUrl) {
          try {
            const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
            const { data: row } = await supabaseAdmin
              .from("whatsapp_instances")
              .select("id, webhook_secret")
              .eq("instance_name", "zapflow_main")
              .maybeSingle();

            if (row) {
              const webhookUrl = `${normalizedAppUrl}/api/public/evolution/${row.id}`;
              const setRes = await fetch(`${url}/webhook/set/zapflow_main`, {
                method: "POST",
                headers: { apikey: rawKey, "Content-Type": "application/json" },
                body: JSON.stringify({
                  webhook: {
                    enabled: true,
                    url: webhookUrl,
                    headers: { "x-webhook-secret": row.webhook_secret ?? "" },
                    byEvents: false,
                    base64: false,
                    events: ["MESSAGES_UPSERT", "CONNECTION_UPDATE", "QRCODE_UPDATED"],
                  },
                }),
              });
              checks.push({
                name: "rewriteWebhook",
                target: webhookUrl,
                status: setRes.status,
                body: (await setRes.text()).slice(0, 400),
              });
            } else {
              checks.push({ name: "rewriteWebhook", target: "n/a", error: "instância zapflow_main não encontrada no Supabase" });
            }
          } catch (e: any) {
            checks.push({ name: "rewriteWebhook", target: "n/a", error: e?.message ?? String(e) });
          }
        }

        diag.checks = checks;
        diag.public_app_url = normalizedAppUrl || null;

        return Response.json(diag);
      },
    },
  },
});
