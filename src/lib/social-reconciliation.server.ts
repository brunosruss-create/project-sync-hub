// Reconciliação periódica do módulo de publicação.
// Rede de segurança para webhooks perdidos: busca targets "presos" em
// scheduled/publishing e consulta o status real na Zernio.
//
// NÃO é um scheduler — não decide "quando publicar". Só corrige status.
// Isolado do job-worker de mensageria: roda como rota HTTP independente.

import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { zernioPublishing } from "@/lib/zernio-publishing.server";
import { applyZernioPostResult } from "@/routes/api/public/zernio-social";

const STALE_THRESHOLD_MS = 5 * 60 * 1000; // 5 minutos

/**
 * Busca Post_Targets presos em scheduled/publishing e reconcilia com a Zernio.
 * Chamada por rota cron (não pelo job-worker).
 */
export async function reconcileStalePostTargets(): Promise<{ checked: number; updated: number }> {
  const cutoff = new Date(Date.now() - STALE_THRESHOLD_MS).toISOString();

  // Targets agendados cujo horário já passou há 5+ minutos e ainda não viraram published/failed
  const { data: staleTargets, error } = await supabaseAdmin
    .from("social_post_targets")
    .select("id,zernio_post_id,zernio_target_id,scheduled_for,status")
    .in("status", ["scheduled", "publishing"])
    .not("zernio_post_id", "is", null)
    .lt("updated_at", cutoff)
    .limit(50);

  if (error || !staleTargets || staleTargets.length === 0) {
    return { checked: 0, updated: 0 };
  }

  let updated = 0;

  // Agrupa por zernio_post_id pra fazer uma chamada de API por post (pode ter múltiplos targets)
  const byPost = new Map<string, Array<any>>();
  for (const t of staleTargets) {
    const pid = (t as any).zernio_post_id as string;
    if (!pid) continue;
    const arr = byPost.get(pid) ?? [];
    arr.push(t);
    byPost.set(pid, arr);
  }

  for (const [zernioPostId, targets] of byPost) {
    try {
      const resp = await zernioPublishing.getPost(zernioPostId);
      const post = resp?.post;
      if (!post?.platforms) continue;

      for (const target of targets) {
        const zernioTargetId = (target as any).zernio_target_id as string;
        const match = (post.platforms as any[]).find(
          (p: any) => (p._id ?? p.id) === zernioTargetId,
        );
        if (!match) continue;

        const remoteStatus = String(match.status ?? "").toLowerCase();
        if (remoteStatus === "published" || remoteStatus === "failed") {
          await applyZernioPostResult({
            zernioPostId,
            zernioTargetId,
            status: remoteStatus as "published" | "failed",
            platformPostId: match.platformPostId ?? null,
            platformPostUrl: match.platformPostUrl ?? null,
            publishedAt: match.publishedAt ?? null,
            errorMessage: match.error ?? match.errorMessage ?? null,
          });
          updated++;
        }
      }
    } catch (e: any) {
      console.warn("[social-reconciliation] falha ao consultar post:", zernioPostId, e?.message ?? e);
    }
  }

  return { checked: staleTargets.length, updated };
}
