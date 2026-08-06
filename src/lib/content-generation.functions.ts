// Server functions do módulo AI_Content_Generation.
// - submitBrief: valida, cria brief + job (pending), enfileira em message_jobs
// - listJobs / listAssets / getAsset: leitura
// - regenerateAsset: refaz copy ou imagem, cria nova versão
// - rejectAsset: marca como rejected
// (approveAsset vive em conjunto com o handoff — task 15)

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { ContentBriefInputSchema } from "@/features/content-generation/types";
import { mapBriefRow } from "@/features/content-generation/brief-row";
import { mapJobRow } from "@/features/content-generation/job-row";
import { mapAssetRow } from "@/features/content-generation/asset-row";
import { enforceQuota } from "@/lib/plan-quota-hook.server";
import { incrementMeter } from "@/lib/content-meters.server";
import {
  assertContentCan,
  resolveWorkspaceOwner,
} from "@/lib/content-permissions.server";
import { checkFormatCompatibility } from "@/features/content-generation/format-compatibility";

// ─── Submeter Brief ─────────────────────────────────────────────

export const submitBrief = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => ContentBriefInputSchema.parse(input))
  .handler(async ({ data, context }) => {
    // Permissão + Quota hook (Property 4)
    const workspaceOwnerId = await resolveWorkspaceOwner(context.userId);
    await assertContentCan(workspaceOwnerId, context.userId, "brief_create");
    if (data.aiImageOptin) {
      await assertContentCan(workspaceOwnerId, context.userId, "ai_image_optin");
    }
    await enforceQuota(workspaceOwnerId, "content_brief_submit");

    // 0. Valida compatibilidade formato × redes (Requirement 9.5)
    const incompat = checkFormatCompatibility(data.postFormat, data.targetNetworks);
    if (incompat.length > 0) {
      throw new Error(
        `Formato "${data.postFormat}" incompatível com: ${incompat.map((i) => i.network).join(", ")}. Remova essas redes ou escolha outro formato.`,
      );
    }

    // 1. Cria Content_Brief
    const { data: briefRow, error: briefErr } = await supabaseAdmin
      .from("content_briefs")
      .insert({
        owner_user_id: workspaceOwnerId,
        created_by: context.userId,
        template_category: data.templateCategory,
        post_format: data.postFormat,
        carousel_slide_count: data.carouselSlideCount ?? null,
        target_networks: data.targetNetworks,
        service_id: data.serviceId ?? null,
        free_text_objective: data.freeTextObjective ?? null,
        tone_override: data.toneOverride ?? null,
        ai_image_optin: data.aiImageOptin,
      })
      .select("*")
      .single();
    if (briefErr || !briefRow) {
      throw new Error(`Falha ao criar Content_Brief: ${briefErr?.message}`);
    }
    const brief = mapBriefRow(briefRow);

    // 2. Cria Content_Job em status=pending
    const { data: jobRow, error: jobErr } = await supabaseAdmin
      .from("content_jobs")
      .insert({
        owner_user_id: workspaceOwnerId,
        brief_id: brief.id,
        status: "pending",
      })
      .select("*")
      .single();
    if (jobErr || !jobRow) {
      throw new Error(`Falha ao criar Content_Job: ${jobErr?.message}`);
    }
    const job = mapJobRow(jobRow);

    // 3. Enfileira em message_jobs (job_type=content_generation).
    // contact_id fica NULL — jobs de conteúdo não estão atrelados a um contato.
    const { error: enqErr } = await supabaseAdmin.from("message_jobs").insert({
      workspace_owner_id: workspaceOwnerId,
      contact_id: null,
      instance_name: "ai-content",
      payload: { content_job_id: job.id },
      job_type: "content_generation",
      scheduled_at: new Date().toISOString(),
    });
    if (enqErr) {
      // Rollback: apaga job/brief pra não deixar órfãos
      await supabaseAdmin.from("content_jobs").delete().eq("id", job.id);
      await supabaseAdmin.from("content_briefs").delete().eq("id", brief.id);
      throw new Error(`Falha ao enfileirar job: ${enqErr.message}`);
    }

    // 4. Incrementa meter de jobs iniciados
    await incrementMeter(workspaceOwnerId, "content_jobs_started");

    return { briefId: brief.id, jobId: job.id };
  });

// ─── Listagem ───────────────────────────────────────────────────

const ListJobsSchema = z.object({
  limit: z.number().int().min(1).max(100).default(20),
  status: z.enum(["pending", "running", "completed", "failed"]).optional(),
});

export const listJobs = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => ListJobsSchema.parse(input))
  .handler(async ({ data, context }) => {
    let query = supabaseAdmin
      .from("content_jobs")
      .select("*")
      .eq("owner_user_id", context.userId)
      .order("created_at", { ascending: false })
      .limit(data.limit);
    if (data.status) query = query.eq("status", data.status);
    const { data: rows, error } = await query;
    if (error) throw new Error(error.message);
    return { jobs: (rows ?? []).map(mapJobRow) };
  });

const ListAssetsSchema = z.object({
  approvalStatus: z.enum(["pending", "approved", "rejected"]).optional(),
  jobId: z.string().uuid().optional(),
  limit: z.number().int().min(1).max(200).default(50),
});

export const listAssets = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => ListAssetsSchema.parse(input))
  .handler(async ({ data, context }) => {
    let query = supabaseAdmin
      .from("generated_assets")
      .select("*")
      .eq("owner_user_id", context.userId)
      .order("created_at", { ascending: false })
      .limit(data.limit);
    if (data.approvalStatus) query = query.eq("approval_status", data.approvalStatus);
    if (data.jobId) query = query.eq("job_id", data.jobId);
    const { data: rows, error } = await query;
    if (error) throw new Error(error.message);
    return { assets: (rows ?? []).map(mapAssetRow) };
  });

const GetAssetSchema = z.object({ assetId: z.string().uuid() });

export const getAsset = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => GetAssetSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { data: row, error } = await supabaseAdmin
      .from("generated_assets")
      .select("*")
      .eq("id", data.assetId)
      .eq("owner_user_id", context.userId)
      .single();
    if (error || !row) throw new Error("Asset não encontrado");
    return { asset: mapAssetRow(row) };
  });

// ─── Regenerar ──────────────────────────────────────────────────

const RegenerateSchema = z.object({
  assetId: z.string().uuid(),
  mode: z.enum(["copy_only", "image_only", "both"]),
});

export const regenerateAsset = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => RegenerateSchema.parse(input))
  .handler(async ({ data, context }) => {
    // Carrega asset original
    const { data: assetRow, error } = await supabaseAdmin
      .from("generated_assets")
      .select("*")
      .eq("id", data.assetId)
      .eq("owner_user_id", context.userId)
      .single();
    if (error || !assetRow) throw new Error("Asset não encontrado");

    // Cria novo Content_Job apontando pro mesmo brief; worker vai processar
    // como um novo job. Nota: nesta fase, o worker atual sempre refaz tudo.
    // A distinção entre modos vira ativa quando o worker consultar o brief
    // com hint `regenerate_mode` (fase futura). Por ora, todos os modos
    // simplesmente disparam nova geração.
    const briefId = (assetRow as { brief_id?: string; job_id: string }).job_id;
    // Precisa achar brief a partir do job antigo
    const { data: oldJob } = await supabaseAdmin
      .from("content_jobs")
      .select("brief_id")
      .eq("id", briefId)
      .single();
    if (!oldJob) throw new Error("Job original não encontrado");

    const { data: newJob, error: jobErr } = await supabaseAdmin
      .from("content_jobs")
      .insert({
        owner_user_id: context.userId,
        brief_id: (oldJob as { brief_id: string }).brief_id,
        status: "pending",
      })
      .select("*")
      .single();
    if (jobErr || !newJob) throw new Error(`Falha ao criar job: ${jobErr?.message}`);

    await supabaseAdmin.from("message_jobs").insert({
      workspace_owner_id: context.userId,
      contact_id: null,
      instance_name: "ai-content",
      payload: {
        content_job_id: (newJob as { id: string }).id,
        parent_asset_id: data.assetId,
        regenerate_mode: data.mode,
      },
      job_type: "content_generation",
      scheduled_at: new Date().toISOString(),
    });

    await incrementMeter(context.userId, "content_jobs_started");
    return { jobId: (newJob as { id: string }).id };
  });

// ─── Rejeitar ───────────────────────────────────────────────────

const RejectSchema = z.object({ assetId: z.string().uuid() });

export const rejectAsset = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => RejectSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { error } = await supabaseAdmin
      .from("generated_assets")
      .update({
        approval_status: "rejected",
        rejected_at: new Date().toISOString(),
      })
      .eq("id", data.assetId)
      .eq("owner_user_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });


// ─── Aprovar + Handoff ──────────────────────────────────────────

import { handoffSocialPost, type HandoffTarget } from "@/lib/social-publishing-handoff.server";
import type { SocialPlatform } from "@/lib/zernio-publishing.server";
import { validatePostTarget } from "@/lib/social-post-validation";
import type { CopyBundle } from "@/features/content-generation/types";

const POST_TYPE_ENUM = z.enum([
  "feed",
  "reels",
  "stories",
  "carousel",
  "story",
  "reel",
  "video",
  "short",
  "photo_carousel",
]);

const ApproveSchema = z.object({
  assetId: z.string().uuid(),
  scheduledFor: z.string().datetime().optional(),
  timezone: z.string().optional(),
  // Mapeamento explícito de rede → conta conectada
  connections: z.record(
    z.enum(["facebook", "instagram", "tiktok", "youtube"]),
    z.string().uuid(),
  ),
  // Mapeamento explícito de rede → postType (feed/reels/story/etc)
  postTypes: z.record(
    z.enum(["facebook", "instagram", "tiktok", "youtube"]),
    POST_TYPE_ENUM,
  ),
});

function fullTextFor(
  network: SocialPlatform,
  copy: CopyBundle,
): string {
  const per = copy.perNetwork;
  if (network === "facebook") return per.facebook?.fullText ?? copy.body;
  if (network === "instagram") return per.instagram?.fullText ?? copy.body;
  if (network === "tiktok") return per.tiktok?.fullText ?? copy.body;
  if (network === "youtube") {
    const yt = per.youtube;
    return yt ? `${yt.title}\n\n${yt.description}` : copy.body;
  }
  return copy.body;
}

/**
 * Aprova um Generated_Asset e faz handoff para o Social_Publishing_Module.
 * Property 7 (idempotência): se o asset já tem social_post_id, retorna o
 * existente sem chamar handoff de novo.
 */
export const approveAsset = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => ApproveSchema.parse(input))
  .handler(async ({ data, context }) => {
    const workspaceOwnerId = await resolveWorkspaceOwner(context.userId);
    // 1. Permissões (Requirement 13.5: publish exige AND com social publishing)
    await assertContentCan(workspaceOwnerId, context.userId, "asset_approve");
    if (!data.scheduledFor) {
      await assertContentCan(workspaceOwnerId, context.userId, "publish_immediate");
    }

    // 2. Carrega asset
    const { data: assetRow, error } = await supabaseAdmin
      .from("generated_assets")
      .select("*")
      .eq("id", data.assetId)
      .eq("owner_user_id", workspaceOwnerId)
      .single();
    if (error || !assetRow) throw new Error("Asset não encontrado");
    const asset = mapAssetRow(assetRow);

    // Property 7: idempotência
    if (asset.socialPostId) {
      return { socialPostId: asset.socialPostId, targetResults: [], reused: true };
    }
    if (asset.approvalStatus === "rejected") {
      throw new Error("Não é possível aprovar um asset rejeitado");
    }

    // 3. Quota hook (Property 4)
    await enforceQuota(workspaceOwnerId, "asset_approve");

    // 3. Valida character limits por rede antes do handoff (Requirement 11.2)
    const targetNetworks = Object.keys(data.connections) as SocialPlatform[];
    if (targetNetworks.length === 0) {
      throw new Error("Nenhuma rede alvo informada");
    }
    for (const network of targetNetworks) {
      const postType = data.postTypes[network];
      if (!postType) {
        throw new Error(`postType obrigatório para ${network}`);
      }
      const fullText = fullTextFor(network, asset.copyBundle);
      const validation = validatePostTarget({
        platform: network,
        postType,
        text: fullText,
        mediaItems: [{ type: "image" }],
      });
      if (!validation.valid) {
        throw new Error(
          `${network}/${postType}: ${validation.violations[0].message}`,
        );
      }
    }

    // 4. Monta targets do handoff
    const targets: HandoffTarget[] = targetNetworks.map((network) => ({
      network,
      connectionId: data.connections[network]!,
      postType: data.postTypes[network]!,
      fullText: fullTextFor(network, asset.copyBundle),
    }));

    // 5. Handoff
    const mode: "now" | "scheduled" = data.scheduledFor ? "scheduled" : "now";
    const handoff = await handoffSocialPost({
      ownerUserId: workspaceOwnerId,
      mediaUrl: asset.renderedImageUrl,
      mediaType: "image",
      targets,
      mode,
      scheduledFor: data.scheduledFor,
      timezone: data.timezone,
      baseText: asset.copyBundle.shortCaption,
    });

    // 6. Marca asset como approved
    await supabaseAdmin
      .from("generated_assets")
      .update({
        approval_status: "approved",
        social_post_id: handoff.socialPostId,
        approved_at: new Date().toISOString(),
        approved_by: context.userId,
      })
      .eq("id", data.assetId);

    // 7. Incrementa meter
    await incrementMeter(workspaceOwnerId, "posts_generated");

    return {
      socialPostId: handoff.socialPostId,
      targetResults: handoff.targetResults,
      reused: false,
    };
  });


// ─── Editor de camadas ─────────────────────────────────────────

import { renderComposition } from "@/features/content-generation/editor/layer-renderer.server";

const SaveLayersSchema = z.object({
  assetId: z.string().uuid(),
  composition: z.object({
    canvasWidth: z.number(),
    canvasHeight: z.number(),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    layers: z.array(z.any()),
  }),
});

/**
 * Salva a composição editada no asset e re-renderiza o PNG final.
 * Substitui rendered_image_url pelo novo render (com camadas editadas).
 */
export const saveAssetLayers = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => SaveLayersSchema.parse(input))
  .handler(async ({ data, context }) => {
    const workspaceOwnerId = await resolveWorkspaceOwner(context.userId);
    // Carrega asset
    const { data: assetRow, error } = await supabaseAdmin
      .from("generated_assets")
      .select("*")
      .eq("id", data.assetId)
      .eq("owner_user_id", workspaceOwnerId)
      .single();
    if (error || !assetRow) throw new Error("Asset não encontrado");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const asset = assetRow as any;

    // Localiza a imagem BASE (a foto original, sem camadas — se já teve edição
    // antes, precisa pegar base_image_url; senão a própria rendered_image_url
    // ainda é a base).
    const baseImageUrl = asset.base_image_url ?? asset.rendered_image_url;

    // Re-renderiza a composição em PNG.
    const pngBuffer = await renderComposition({
      imageUrl: baseImageUrl,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      composition: data.composition as any,
    });

    // Sobe o novo PNG e atualiza rendered_image_url.
    const { randomUUID } = await import("node:crypto");
    const key = `${workspaceOwnerId}/renders-edited/${data.assetId}/${randomUUID()}.png`;
    const { error: upErr } = await supabaseAdmin.storage
      .from("ai-content")
      .upload(key, pngBuffer, { contentType: "image/png", upsert: false });
    if (upErr) throw new Error(`Falha ao subir PNG editado: ${upErr.message}`);
    const newUrl = supabaseAdmin.storage.from("ai-content").getPublicUrl(key).data.publicUrl;

    // Salva base_image_url uma vez (na primeira edição) pra não perder a foto original.
    const updatePayload: Record<string, unknown> = {
      layers_json: data.composition,
      rendered_image_url: newUrl,
    };
    if (!asset.base_image_url) {
      updatePayload.base_image_url = asset.rendered_image_url;
    }

    const { error: updErr } = await supabaseAdmin
      .from("generated_assets")
      .update(updatePayload)
      .eq("id", data.assetId);
    if (updErr) throw new Error(`Falha ao salvar: ${updErr.message}`);

    return { renderedImageUrl: newUrl };
  });
