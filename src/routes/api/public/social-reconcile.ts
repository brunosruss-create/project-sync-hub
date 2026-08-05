// Rota de reconciliação periódica do módulo de publicação.
// Chamada por cron externo (Vercel cron) a cada 5 minutos.
// Protegida por secret (SOCIAL_RECONCILE_SECRET) — não requer auth de usuário.

import { createFileRoute } from "@tanstack/react-router";
import { reconcileStalePostTargets } from "@/lib/social-reconciliation.server";

export const Route = createFileRoute("/api/public/social-reconcile" as any)({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const secret = process.env.SOCIAL_RECONCILE_SECRET ?? "";
        if (secret) {
          const auth = request.headers.get("authorization") ?? "";
          if (auth !== `Bearer ${secret}`) {
            return new Response("unauthorized", { status: 401 });
          }
        }

        try {
          const result = await reconcileStalePostTargets();
          return new Response(JSON.stringify(result), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        } catch (e: any) {
          console.error("[social-reconcile] erro:", e?.message ?? e);
          return new Response("error", { status: 500 });
        }
      },
    },
  },
});
