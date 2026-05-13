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

        diag.checks = checks;
        diag.public_app_url = process.env.PUBLIC_APP_URL ?? null;

        return Response.json(diag);
      },
    },
  },
});
