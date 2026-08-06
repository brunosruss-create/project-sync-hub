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

// ─── Submeter Brief ─────────────────────────────────────────────

export const submitBrief = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => ContentBriefInputSchema.parse(input))
  .handler(async ({ data, context }) => {
    // Property 4 (quota hook): checa antes de qualquer escrita.
    await enforceQuota(context.userId, "content_brief_submit");

    // 1. Cria Content_Brief
    const { data: briefRow, error: briefErr } = await supabaseAdmin
      .from("content_briefs")
      .insert({
        owner_user_id: context.userId,
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
        owner_user_id: context.userId,
        brief_id: brief.id,
        status: "pending",
      })
      .select("*")
      .single();
    if (jobErr || !jobRow) {
      throw new Error(`Falha ao criar Content_Job: ${jobErr?.message}`);
    }
    const job = mapJobRow(jobRow);

    // 3. Enfileira em message_jobs (job_type=content_generation)
    const { error: enqErr } = await supabaseAdmin.from("message_jobs").insert({
      workspace_owner_id: context.userId,
      contact_id: brief.id, // reusa o campo pra rastreio; não é FK
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
    await incrementMeter(context.userId, "content_jobs_started");

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
      contact_id: (oldJob as { brief_id: string }).brief_id,
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
