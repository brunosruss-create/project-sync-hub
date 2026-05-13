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

        const target = `${url}/instance/fetchInstances`;
        const started = Date.now();
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
          diag.request = {
            target,
            status: res.status,
            ok: res.ok,
            latency_ms: Date.now() - started,
            body_preview: body.slice(0, 400),
          };
        } catch (e: any) {
          diag.request = {
            target,
            error: e?.name === "AbortError" ? "timeout (10s)" : (e?.message ?? String(e)),
            cause: e?.cause?.code ?? e?.cause?.message ?? null,
            latency_ms: Date.now() - started,
          };
        }

        return Response.json(diag);
      },
    },
  },
});
