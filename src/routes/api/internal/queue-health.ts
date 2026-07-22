import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

// Endpoint de saúde da fila message_jobs — usado por um monitor externo
// (UptimeRobot/BetterStack) e por um alerta de fila acumulando (pg_cron),
// pra detectar o worker degradando ANTES do cliente perceber.
// Protegido por secret estático (mesmo padrão do webhook da Evolution),
// não por sessão Supabase, porque é chamado por serviços externos sem login.

const STALE_PENDING_MS = 2 * 60_000;

export const Route = createFileRoute("/api/internal/queue-health")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const secret = request.headers.get("x-internal-secret") ?? "";
        const expected = process.env.INTERNAL_API_SECRET ?? "";
        if (!expected || secret !== expected) {
          return new Response("forbidden", { status: 403 });
        }

        const staleCutoff = new Date(Date.now() - STALE_PENDING_MS).toISOString();

        const [
          { count: pending },
          { count: stalePending },
          { count: processing },
          { count: erroredLastHour },
        ] = await Promise.all([
          supabaseAdmin
            .from("message_jobs")
            .select("id", { count: "exact", head: true })
            .eq("status", "pending"),
          supabaseAdmin
            .from("message_jobs")
            .select("id", { count: "exact", head: true })
            .eq("status", "pending")
            .lt("created_at", staleCutoff),
          supabaseAdmin
            .from("message_jobs")
            .select("id", { count: "exact", head: true })
            .eq("status", "processing"),
          supabaseAdmin
            .from("message_jobs")
            .select("id", { count: "exact", head: true })
            .eq("status", "error")
            .gte("updated_at", new Date(Date.now() - 60 * 60_000).toISOString()),
        ]);

        const healthy = (stalePending ?? 0) === 0;

        return new Response(
          JSON.stringify({
            healthy,
            pending: pending ?? 0,
            stalePending: stalePending ?? 0,
            processing: processing ?? 0,
            erroredLastHour: erroredLastHour ?? 0,
            checkedAt: new Date().toISOString(),
          }),
          {
            status: healthy ? 200 : 503,
            headers: { "content-type": "application/json" },
          },
        );
      },
    },
  },
});
