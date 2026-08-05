// Webhook dedicado do módulo de publicação em redes sociais.
// 100% isolado do webhook de mensageria (api/public/zernio.ts).
// Trata eventos: post.published, post.failed, account.connected,
// account.disconnected, account.token_expired.

import { createFileRoute } from "@tanstack/react-router";
import { createHmac, timingSafeEqual } from "node:crypto";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

function verifySignature(rawBody: string, signature: string | null, secret: string): boolean {
  if (!signature) return false;
  const computed = createHmac("sha256", secret).update(rawBody).digest("hex");
  const a = Buffer.from(computed, "utf8");
  const b = Buffer.from(signature.trim().toLowerCase(), "utf8");
  if (a.length !== b.length) return false;
  try {
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

/**
 * Aplica o resultado de um post da Zernio no banco local.
 * Idempotente por zernio_target_id + status atual — pode ser chamado tanto
 * pelo webhook quanto pela reconciliação sem duplicar dados.
 */
export async function applyZernioPostResult(params: {
  zernioPostId: string;
  zernioTargetId: string;
  status: "published" | "failed";
  platformPostId?: string | null;
  platformPostUrl?: string | null;
  publishedAt?: string | null;
  errorMessage?: string | null;
}) {
  const { data: target } = await supabaseAdmin
    .from("social_post_targets")
    .select("id,status,post_id,owner_user_id")
    .eq("zernio_post_id", params.zernioPostId)
    .eq("zernio_target_id", params.zernioTargetId)
    .maybeSingle();

  if (!target) {
    console.warn("[zernio-social webhook] target não encontrado:", params.zernioPostId, params.zernioTargetId);
    return;
  }

  // Idempotência: se já está no estado final, não sobrescreve.
  const currentStatus = (target as any).status;
  if (currentStatus === "published" || (currentStatus === "failed" && params.status === "failed")) {
    return;
  }

  // Atualiza target
  const update: Record<string, unknown> = {
    status: params.status,
    updated_at: new Date().toISOString(),
  };
  if (params.status === "published") {
    update.platform_post_id = params.platformPostId ?? null;
    update.published_at = params.publishedAt ?? new Date().toISOString();
    update.error_message = null;
  } else {
    update.error_message = params.errorMessage ?? "Falha reportada pela rede social.";
  }
  await supabaseAdmin
    .from("social_post_targets")
    .update(update)
    .eq("id", (target as any).id);

  // Atualiza attempt mais recente
  const { data: latestAttempt } = await supabaseAdmin
    .from("social_publish_attempts")
    .select("id")
    .eq("post_target_id", (target as any).id)
    .order("attempt_number", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (latestAttempt) {
    await supabaseAdmin
      .from("social_publish_attempts")
      .update({
        result: params.status === "published" ? "success" : "failure",
        error_message: params.status === "failed" ? params.errorMessage : null,
        finished_at: new Date().toISOString(),
      })
      .eq("id", (latestAttempt as any).id);
  }

  // Atualiza status agregado do post
  const postId = (target as any).post_id;
  const { data: allTargets } = await supabaseAdmin
    .from("social_post_targets")
    .select("status")
    .eq("post_id", postId);
  const statuses = (allTargets ?? []).map((t: any) => t.status as string);
  let postStatus = "draft";
  if (statuses.every((s) => s === "published")) postStatus = "published";
  else if (statuses.every((s) => s === "failed")) postStatus = "failed";
  else if (statuses.some((s) => s === "published") && statuses.some((s) => s === "failed"))
    postStatus = "partially_published";
  else if (statuses.some((s) => s === "scheduled")) postStatus = "scheduled";
  else if (statuses.some((s) => s === "publishing")) postStatus = "publishing";

  await supabaseAdmin
    .from("social_posts")
    .update({ status: postStatus, updated_at: new Date().toISOString() })
    .eq("id", postId);
}

export const Route = createFileRoute("/api/public/zernio-social" as any)({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const secret = process.env.ZERNIO_SOCIAL_WEBHOOK_SECRET ?? "";
        const rawBody = await request.text();

        if (secret) {
          const sig = request.headers.get("x-zernio-signature");
          if (!verifySignature(rawBody, sig, secret)) {
            console.warn("[zernio-social webhook] assinatura inválida");
            return new Response("invalid signature", { status: 401 });
          }
        }

        let payload: any = null;
        try {
          payload = rawBody ? JSON.parse(rawBody) : null;
        } catch {
          return new Response("bad json", { status: 400 });
        }

        const event = String(payload?.event ?? "");

        console.log("[zernio-social]", { event, id: payload?.id });

        try {
          if (event === "post.published" || event === "post.failed") {
            const post = payload?.post ?? payload?.data?.post ?? {};
            const platforms: any[] = Array.isArray(post?.platforms) ? post.platforms : [];

            for (const p of platforms) {
              const status = event === "post.published"
                ? (p.status === "published" ? "published" : "failed")
                : "failed";

              await applyZernioPostResult({
                zernioPostId: post._id ?? post.id ?? "",
                zernioTargetId: p._id ?? p.id ?? "",
                status: status as "published" | "failed",
                platformPostId: p.platformPostId ?? p.platformPostUrl ?? null,
                platformPostUrl: p.platformPostUrl ?? null,
                publishedAt: p.publishedAt ?? null,
                errorMessage: p.error ?? p.errorMessage ?? null,
              });
            }
          } else if (
            event === "account.connected" ||
            event === "account.disconnected" ||
            event === "account.token_expired"
          ) {
            const account = payload?.account ?? payload?.data?.account ?? {};
            const accountId = account?.accountId ?? account?._id ?? account?.id;
            if (!accountId) return new Response("ok", { status: 200 });

            const newStatus =
              event === "account.connected"
                ? "connected"
                : event === "account.token_expired"
                  ? "expired"
                  : "disconnected";

            await supabaseAdmin
              .from("social_account_connections")
              .update({
                status: newStatus,
                ...(event === "account.connected" ? { connected_at: new Date().toISOString() } : {}),
                updated_at: new Date().toISOString(),
              })
              .eq("account_id", accountId);
          } else {
            console.log("[zernio-social] evento ignorado:", event);
          }
        } catch (e: any) {
          console.error("[zernio-social webhook] erro:", e?.message ?? e);
        }

        return new Response("ok", { status: 200 });
      },
    },
  },
});
