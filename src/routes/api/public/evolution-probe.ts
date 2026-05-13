import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/evolution-probe")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const name = url.searchParams.get("name") || "zapflow_main";
        const base = (process.env.EVOLUTION_API_URL ?? "").replace(/\/$/, "");
        const key = process.env.EVOLUTION_API_KEY ?? "";
        const headers = { apikey: key, "Content-Type": "application/json" };

        async function hit(path: string, init?: RequestInit) {
          try {
            const r = await fetch(`${base}${path}`, { ...init, headers });
            const text = await r.text();
            let json: any = null;
            try { json = JSON.parse(text); } catch { json = text; }
            return { status: r.status, body: json };
          } catch (e: any) {
            return { error: String(e?.message ?? e) };
          }
        }

        const fetchInst = await hit(`/instance/fetchInstances?instanceName=${encodeURIComponent(name)}`);
        const connect = await hit(`/instance/connect/${encodeURIComponent(name)}`);
        const state = await hit(`/instance/connectionState/${encodeURIComponent(name)}`);

        return Response.json({
          base,
          hasKey: Boolean(key),
          name,
          fetchInstances: fetchInst,
          connect,
          connectionState: state,
        });
      },
    },
  },
});
