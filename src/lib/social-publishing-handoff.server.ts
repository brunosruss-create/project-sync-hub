// Interface interna de handoff pro Social_Publishing_Module.
// Chamada apenas pelo AI_Content_Generation_Module ao aprovar um Generated_Asset.
//
// Reusa toda a lógica de validação e envio à Zernio já implementada em
// social-publishing.functions.ts, mas exposto como função server-to-server
// (não como TanStack server function, portanto sem middleware/HTTP).
//
// Isso satisfaz Requirement 1.4 do AI_Content_Generation_Module: o módulo
// de geração não escreve diretamente nas tabelas do social-publishing —
// entrega o payload via interface pública do módulo, que se encarrega
// de criar social_posts + social_post_targets + chamar a Zernio.

import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  validatePostTarget,
  type PostTargetInput,
  type PostType,
} from "@/lib/social-post-validation";
import {
  zernioPublishing,
  type SocialPlatform,
  type ZernioCreatePostBody,
} from "@/lib/zernio-publishing.server";

export type HandoffMode = "now" | "scheduled";

export interface HandoffCopyBundle {
  fullText: string;
  postType: string;
}

export interface HandoffTarget {
  network: SocialPlatform;
  connectionId: string;
  postType: PostType;
  fullText: string;
}

export interface HandoffInput {
  ownerUserId: string;
  mediaUrl: string;       // URL pública do bucket ai-content
  mediaType: "image" | "video";
  targets: HandoffTarget[];
  mode: HandoffMode;
  scheduledFor?: string;  // ISO 8601 se mode=scheduled
  timezone?: string;      // obrigatório se mode=scheduled
  baseText?: string;      // texto base opcional para social_posts.base_text
}

export interface HandoffResult {
  socialPostId: string;
  targetResults: Array<{
    network: SocialPlatform;
    targetId: string;
    ok: boolean;
    error?: string;
  }>;
}

/**
 * Cria social_post + social_post_targets + submete pra Zernio.
 * Idempotência: não é feita aqui — quem chama deve garantir que não chama duas vezes
 * (o AI_Content_Generation_Module verifica `generated_assets.social_post_id is null`
 * antes de invocar; Property 7).
 */
export async function handoffSocialPost(input: HandoffInput): Promise<HandoffResult> {
  if (input.mode === "scheduled") {
    if (!input.scheduledFor) throw new Error("scheduledFor obrigatório em modo agendado");
    if (!input.timezone) throw new Error("timezone obrigatório em modo agendado");
    if (new Date(input.scheduledFor).getTime() <= Date.now()) {
      throw new Error("scheduledFor precisa estar no futuro");
    }
  }

  // 1. Cria social_posts (draft)
  const { data: postRow, error: postErr } = await supabaseAdmin
    .from("social_posts")
    .insert({
      owner_user_id: input.ownerUserId,
      created_by: input.ownerUserId,
      base_text: input.baseText ?? "",
      status: "draft",
    })
    .select("id")
    .single();
  if (postErr || !postRow) {
    throw new Error(`Falha ao criar social_post: ${postErr?.message}`);
  }
  const socialPostId = (postRow as { id: string }).id;

  // 2. Cria social_post_targets pra cada rede
  const targetIds: Array<{ targetId: string; target: HandoffTarget }> = [];
  for (const target of input.targets) {
    // Validação por rede antes de gravar (evita target inválido salvo)
    const validationInput: PostTargetInput = {
      platform: target.network,
      postType: target.postType,
      text: target.fullText,
      mediaItems: [{ type: input.mediaType }],
    };
    const validation = validatePostTarget(validationInput);
    if (!validation.valid) {
      // Rollback do post e joga erro descritivo
      await supabaseAdmin.from("social_posts").delete().eq("id", socialPostId);
      throw new Error(
        `Validação falhou para ${target.network}/${target.postType}: ${validation.violations[0].message}`,
      );
    }

    const { data: targetRow, error: tErr } = await supabaseAdmin
      .from("social_post_targets")
      .insert({
        post_id: socialPostId,
        owner_user_id: input.ownerUserId,
        social_account_connection_id: target.connectionId,
        platform: target.network,
        post_type: target.postType,
        text: target.fullText,
        media_urls: [input.mediaUrl],
        status: "draft",
      })
      .select("id")
      .single();
    if (tErr || !targetRow) {
      await supabaseAdmin.from("social_posts").delete().eq("id", socialPostId);
      throw new Error(`Falha ao criar social_post_target: ${tErr?.message}`);
    }
    targetIds.push({ targetId: (targetRow as { id: string }).id, target });
  }

  // 3. Verifica conexões
  const connIds = [...new Set(input.targets.map((t) => t.connectionId))];
  const { data: conns } = await supabaseAdmin
    .from("social_account_connections")
    .select("id,account_id,status,platform")
    .in("id", connIds);
  const connMap = new Map(
    (conns ?? []).map((c) => [
      (c as { id: string }).id,
      c as { id: string; account_id: string; status: string; platform: SocialPlatform },
    ]),
  );

  const targetResults: HandoffResult["targetResults"] = [];

  // 4. Envia pra Zernio (1 chamada por target pra suportar modos mistos)
  for (const { targetId, target } of targetIds) {
    const conn = connMap.get(target.connectionId);
    if (!conn || conn.status !== "connected") {
      await supabaseAdmin
        .from("social_post_targets")
        .update({
          status: "failed",
          error_message: `Conta ${target.network} não está conectada`,
          updated_at: new Date().toISOString(),
        })
        .eq("id", targetId);
      targetResults.push({
        network: target.network,
        targetId,
        ok: false,
        error: `Conta ${target.network} não está conectada`,
      });
      continue;
    }

    const body: ZernioCreatePostBody = {
      content: target.fullText,
      mediaItems: [{ url: input.mediaUrl, type: input.mediaType }],
      platforms: [{ platform: target.network, accountId: conn.account_id }],
      ...(input.mode === "now" ? { publishNow: true } : {}),
      ...(input.mode === "scheduled"
        ? { scheduledFor: input.scheduledFor!, timezone: input.timezone! }
        : {}),
    };

    try {
      const resp = await zernioPublishing.createPost(body);
      const zPost = resp.post;
      const zTarget = zPost.platforms[0];

      await supabaseAdmin
        .from("social_post_targets")
        .update({
          status: input.mode === "now" ? "publishing" : "scheduled",
          scheduled_for: input.scheduledFor ?? null,
          timezone: input.timezone ?? null,
          zernio_post_id: zPost._id,
          zernio_target_id: zTarget._id,
          updated_at: new Date().toISOString(),
        })
        .eq("id", targetId);

      await supabaseAdmin.from("social_publish_attempts").insert({
        post_target_id: targetId,
        owner_user_id: input.ownerUserId,
        attempt_number: 1,
        result: "pending",
        started_at: new Date().toISOString(),
      });

      targetResults.push({ network: target.network, targetId, ok: true });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      await supabaseAdmin
        .from("social_post_targets")
        .update({
          status: "failed",
          error_message: msg,
          updated_at: new Date().toISOString(),
        })
        .eq("id", targetId);
      targetResults.push({ network: target.network, targetId, ok: false, error: msg });
    }
  }

  // 5. Atualiza status agregado do social_post
  const statuses = targetResults.map((r) => (r.ok ? "publishing" : "failed"));
  let postStatus = "draft";
  if (statuses.every((s) => s === "publishing")) {
    postStatus = input.mode === "now" ? "publishing" : "scheduled";
  } else if (statuses.every((s) => s === "failed")) {
    postStatus = "failed";
  } else {
    postStatus = "partially_published";
  }
  await supabaseAdmin
    .from("social_posts")
    .update({ status: postStatus, updated_at: new Date().toISOString() })
    .eq("id", socialPostId);

  return { socialPostId, targetResults };
}
