// Handler do job type "content_generation" — orquestra o pipeline completo
// de geração de um Generated_Asset a partir de um Content_Brief.
//
// Pipeline: resolver imagem → gerar copy → renderizar → gravar assets.
// Aplica Property 3 (fallback controlado do AI_Image_Provider): só chama
// generateImage() quando imageBank == null OU brief.ai_image_optin === true,
// e sempre passa pelo checkQuota antes.

import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { captureException } from "@/lib/sentry.server";
import { renderTemplate } from "@/features/content-generation/render-engine.server";
import { pickTemplate } from "@/features/content-generation/templates";
import { mapBriefRow } from "@/features/content-generation/brief-row";
import { mapJobRow } from "@/features/content-generation/job-row";
import { mapBrandKitRow } from "@/features/content-generation/brand-kit-row";
import type {
  BrandKit,
  ContentBrief,
  CarouselSlide,
  CopyBundle,
  GeneratedAsset,
  ImageProvider,
  ImageSourceMetadata,
  PostFormat,
  TargetNetwork,
  UsageMetric,
} from "@/features/content-generation/types";
import { searchImage, cacheImageBankImage } from "@/lib/image-bank.server";
import { generateCopyBundle } from "@/lib/ai-text.server";
import { generateImage } from "@/lib/ai-image.server";
import { enforceQuota } from "@/lib/plan-quota-hook.server";
import { incrementMeter } from "@/lib/content-meters.server";
import { randomUUID } from "node:crypto";

const BUCKET = "ai-content";

// Custos estimados (centavos). Podem ser ajustados via env.
const COST_GEMINI_FLASH_CENTS = Number(process.env.COST_GEMINI_FLASH_CENTS ?? "1"); // ~0,05c
const COST_NANO_BANANA_CENTS = Number(process.env.COST_NANO_BANANA_CENTS ?? "36"); // ~R$ 0,36

export interface ContentGenerationJobPayload {
  content_job_id: string;
}

interface ResolvedImage {
  url: string;
  provider: ImageProvider;
  sourceMetadata: ImageSourceMetadata;
  aiImagePrompt?: string;
}

class ContentJobError extends Error {
  stage: string;
  constructor(stage: string, message: string) {
    super(message);
    this.stage = stage;
  }
}

function aspectRatioFor(format: PostFormat): "1:1" | "9:16" | "16:9" {
  if (format === "story") return "9:16";
  return "1:1";
}

function buildImageQuery(
  brief: ContentBrief,
  service: { name?: string; description?: string | null } | null,
  brandKit: BrandKit,
): string {
  const parts: string[] = [];
  if (service?.name) parts.push(service.name);
  if (brief.freeTextObjective) parts.push(brief.freeTextObjective);
  if (parts.length === 0) parts.push(brief.templateCategory);
  parts.push(brandKit.toneOfVoice);
  return parts.join(" ").slice(0, 200);
}

function buildAiImagePrompt(
  brief: ContentBrief,
  service: { name?: string; description?: string | null } | null,
  brandKit: BrandKit,
): string {
  const query = buildImageQuery(brief, service, brandKit);
  return `${query}. Fotografia profissional, estilo editorial, iluminação suave.`;
}

async function loadJob(id: string) {
  const { data, error } = await supabaseAdmin
    .from("content_jobs")
    .select("*")
    .eq("id", id)
    .single();
  if (error || !data) throw new Error(`Content_Job não encontrado: ${id}`);
  return mapJobRow(data);
}

async function loadBrief(id: string, workspaceOwnerId: string) {
  const { data, error } = await supabaseAdmin
    .from("content_briefs")
    .select("*")
    .eq("id", id)
    .eq("owner_user_id", workspaceOwnerId)
    .single();
  if (error || !data) throw new Error(`Content_Brief não encontrado: ${id}`);
  return mapBriefRow(data);
}

async function loadBrandKit(workspaceOwnerId: string): Promise<BrandKit> {
  const { data } = await supabaseAdmin
    .from("brand_kits")
    .select("*")
    .eq("owner_user_id", workspaceOwnerId)
    .maybeSingle();
  if (data) return mapBrandKitRow(data);
  // Retorna BrandKit default. Requirement 2.2 fallback.
  const now = new Date();
  return {
    id: "default",
    ownerUserId: workspaceOwnerId,
    primaryColor: "#0EA5E9",
    secondaryColor: "#1E293B",
    supportColor: "#F59E0B",
    logoUrl: null,
    displayFont: "Playfair Display",
    bodyFont: "Inter",
    toneOfVoice: "profissional",
    defaultSignature: "SUA MARCA",
    extractionSource: null,
    extractionMetadata: null,
    createdAt: now,
    updatedAt: now,
  };
}

async function loadService(id: string, workspaceOwnerId: string) {
  // Leitura ISOLADA: read-only, filtrada por owner_user_id (Property 5).
  const { data, error } = await supabaseAdmin
    .from("services")
    .select("id,name,price,duration,description")
    .eq("id", id)
    .eq("owner_user_id", workspaceOwnerId)
    .maybeSingle();
  if (error || !data) return null;
  // Fotos separadas
  const { data: photos } = await supabaseAdmin
    .from("service_photos")
    .select("photo_url")
    .eq("service_id", id)
    .eq("owner_user_id", workspaceOwnerId)
    .order("created_at", { ascending: true });
  return {
    ...(data as {
      id: string;
      name: string;
      price: number | null;
      duration: string | null;
      description: string | null;
    }),
    photos: (photos ?? []).map((p) => ({ url: (p as { photo_url: string }).photo_url })),
  };
}

async function updateJob(
  id: string,
  fields: {
    status?: string;
    stage?: string | null;
    error_message?: string | null;
    image_provider_used?: ImageProvider;
    ai_text_model?: string;
    cost_estimate_cents?: number;
    duration_ms?: number;
    started_at?: string;
    completed_at?: string;
  },
) {
  const { error } = await supabaseAdmin.from("content_jobs").update(fields).eq("id", id);
  if (error) console.error("[content-worker] updateJob falhou:", error.message);
}

async function resolveImage(
  brief: ContentBrief,
  brandKit: BrandKit,
  service: Awaited<ReturnType<typeof loadService>>,
  workspaceOwnerId: string,
): Promise<ResolvedImage> {
  // Prioridade 1: foto do serviço (Requirement 7.2).
  if (service && service.photos.length > 0) {
    return {
      url: service.photos[0].url,
      provider: "service_photo",
      sourceMetadata: {
        provider: "service_photo",
      },
    };
  }

  // Prioridade 2: Image_Bank
  const query = buildImageQuery(brief, service, brandKit);
  const bankResult = await searchImage(query, {
    aspectRatio: aspectRatioFor(brief.postFormat),
    colorHint: brandKit.primaryColor,
  });
  if (bankResult) {
    const cachedUrl = await cacheImageBankImage(bankResult, workspaceOwnerId);
    return {
      url: cachedUrl,
      provider: bankResult.provider,
      sourceMetadata: {
        provider: bankResult.provider,
        author: bankResult.author,
        attributionUrl: bankResult.attributionUrl,
        providerUrl: bankResult.providerUrl,
        query,
      },
    };
  }

  // Prioridade 3: AI_Image_Provider (Property 3 — só se aiImageOptin ou fallback duro)
  if (!brief.aiImageOptin) {
    // Sem opt-in e sem match no bank: falha explícita.
    throw new ContentJobError(
      "image_bank",
      "Nenhuma imagem encontrada no banco. Ative geração por IA no brief se quiser fallback.",
    );
  }
  // Quota hook (Property 4)
  await enforceQuota(workspaceOwnerId, "ai_images_generated");
  const aiPrompt = buildAiImagePrompt(brief, service, brandKit);
  const aiImg = await generateImage({
    prompt: aiPrompt,
    aspectRatio: aspectRatioFor(brief.postFormat),
    brandColorHint: brandKit.primaryColor,
    workspaceOwnerId,
  });
  await incrementMeter(workspaceOwnerId, "ai_images_generated");
  return {
    url: aiImg.url,
    provider: "nano_banana",
    sourceMetadata: { provider: "nano_banana" },
    aiImagePrompt: aiImg.promptUsed,
  };
}

async function renderAndUpload(
  workspaceOwnerId: string,
  templateId: string,
  brandKit: BrandKit,
  slots: Record<string, string>,
  slideIndex: number | undefined,
  slideTotal: number | undefined,
): Promise<string> {
  const output = await renderTemplate({
    templateId,
    brandKit,
    slots,
    slideIndex,
    slideTotal,
  });
  const assetId = randomUUID();
  const version = 1;
  const suffix =
    typeof slideIndex === "number" ? `-slide-${slideIndex}` : "";
  const key = `${workspaceOwnerId}/renders/${assetId}/${version}${suffix}.png`;
  const { error } = await supabaseAdmin.storage.from(BUCKET).upload(
    key,
    output.buffer,
    { contentType: "image/png", upsert: false },
  );
  if (error) throw new ContentJobError("render", `Falha ao subir imagem: ${error.message}`);
  return supabaseAdmin.storage.from(BUCKET).getPublicUrl(key).data.publicUrl;
}

function slotsFor(
  brief: ContentBrief,
  brandKit: BrandKit,
  imageUrl: string,
  copy: CopyBundle,
  service: Awaited<ReturnType<typeof loadService>>,
): Record<string, string> {
  return {
    headline: copy.hook,
    subheadline: copy.body.split(".")[0] ?? copy.body,
    description: copy.body,
    price: service?.price != null ? `R$ ${service.price}` : "",
    duration: service?.duration ?? "",
    ctaLabel: copy.cta,
    imageUrl,
    authorName: brandKit.defaultSignature || "Cliente",
    eventDate: "",
  };
}

async function insertAsset(input: {
  ownerUserId: string;
  jobId: string;
  targetNetwork: TargetNetwork;
  renderedImageUrl: string;
  slides: CarouselSlide[] | null;
  copyBundle: CopyBundle;
  imageSourceMetadata: ImageSourceMetadata;
  aiImagePrompt: string | null;
}): Promise<GeneratedAsset> {
  const { data, error } = await supabaseAdmin
    .from("generated_assets")
    .insert({
      owner_user_id: input.ownerUserId,
      job_id: input.jobId,
      target_network: input.targetNetwork,
      version: 1,
      approval_status: "pending",
      rendered_image_url: input.renderedImageUrl,
      slides_json: input.slides,
      copy_bundle: input.copyBundle,
      image_source_metadata: input.imageSourceMetadata,
      ai_image_prompt: input.aiImagePrompt,
    })
    .select("*")
    .single();
  if (error || !data) {
    throw new ContentJobError("render", `Falha ao gravar asset: ${error?.message}`);
  }
  // Retorna projeção (não é caminho crítico o mapeamento; worker não usa).
  return data as unknown as GeneratedAsset;
}

/**
 * Ponto de entrada do worker: processa um Content_Job.
 * Idempotência: se o job já está `running`/`completed`, seguimos assim mesmo
 * (o claim do message_jobs previne execução dupla concorrente).
 */
export async function processContentGenerationJob(
  payload: ContentGenerationJobPayload,
): Promise<void> {
  const started = Date.now();
  const job = await loadJob(payload.content_job_id);
  const brief = await loadBrief(job.briefId, job.ownerUserId);
  const brandKit = await loadBrandKit(job.ownerUserId);
  const service = brief.serviceId ? await loadService(brief.serviceId, job.ownerUserId) : null;
  if (brief.serviceId && !service) {
    await updateJob(job.id, {
      status: "failed",
      stage: "service_lookup",
      error_message: "Serviço referenciado não existe ou não pertence ao workspace.",
      completed_at: new Date().toISOString(),
      duration_ms: Date.now() - started,
    });
    throw new ContentJobError(
      "service_lookup",
      "Serviço referenciado não existe ou não pertence ao workspace.",
    );
  }

  await updateJob(job.id, {
    status: "running",
    stage: "image_bank",
    started_at: new Date().toISOString(),
  });

  try {
    // Stage 1: imagem
    const image = await resolveImage(brief, brandKit, service, job.ownerUserId);
    await updateJob(job.id, {
      stage: "ai_text",
      image_provider_used: image.provider,
    });

    // Stage 2: copy
    const copyResult = await generateCopyBundle({
      brief,
      brandKit,
      service: service
        ? {
            name: service.name,
            price: service.price,
            duration: service.duration,
            description: service.description,
          }
        : null,
      targetNetworks: brief.targetNetworks,
    });
    const copyBundle = copyResult.bundle;

    // Stage 3: render
    await updateJob(job.id, { stage: "render", ai_text_model: copyResult.model });
    const template =
      pickTemplate(brief.templateCategory, brief.postFormat === "story" ? "9:16" : "1:1") ??
      null;
    if (!template) {
      throw new ContentJobError(
        "render",
        `Nenhum template disponível para categoria=${brief.templateCategory} ratio=${brief.postFormat}`,
      );
    }
    const slots = slotsFor(brief, brandKit, image.url, copyBundle, service);

    // Carousel: renderiza N slides no mesmo asset
    if (brief.postFormat === "carousel") {
      const count = brief.carouselSlideCount ?? 3;
      const slideUrls: CarouselSlide[] = [];
      for (let i = 0; i < count; i++) {
        const url = await renderAndUpload(
          job.ownerUserId,
          template.id,
          brandKit,
          slots,
          i,
          count,
        );
        slideUrls.push({ url, index: i });
      }
      const primaryNetwork = brief.targetNetworks[0];
      await insertAsset({
        ownerUserId: job.ownerUserId,
        jobId: job.id,
        targetNetwork: primaryNetwork,
        renderedImageUrl: slideUrls[0].url,
        slides: slideUrls,
        copyBundle,
        imageSourceMetadata: image.sourceMetadata,
        aiImagePrompt: image.aiImagePrompt ?? null,
      });
    } else {
      // Single / Story: 1 asset por rede alvo
      for (const network of brief.targetNetworks) {
        const url = await renderAndUpload(
          job.ownerUserId,
          template.id,
          brandKit,
          slots,
          undefined,
          undefined,
        );
        await insertAsset({
          ownerUserId: job.ownerUserId,
          jobId: job.id,
          targetNetwork: network,
          renderedImageUrl: url,
          slides: null,
          copyBundle,
          imageSourceMetadata: image.sourceMetadata,
          aiImagePrompt: image.aiImagePrompt ?? null,
        });
      }
    }

    const durationMs = Date.now() - started;
    const costCents =
      COST_GEMINI_FLASH_CENTS +
      (image.provider === "nano_banana" ? COST_NANO_BANANA_CENTS : 0);
    await updateJob(job.id, {
      status: "completed",
      stage: null,
      error_message: null,
      duration_ms: durationMs,
      completed_at: new Date().toISOString(),
      cost_estimate_cents: costCents,
    });
  } catch (err) {
    const stage = err instanceof ContentJobError ? err.stage : "unknown";
    const message = err instanceof Error ? err.message : String(err);
    const durationMs = Date.now() - started;
    await updateJob(job.id, {
      status: "failed",
      stage,
      error_message: message.slice(0, 500),
      duration_ms: durationMs,
      completed_at: new Date().toISOString(),
    });
    // Log no Sentry sem incluir dados sensíveis (Brand_Kit, credenciais).
    // Requirement 16.4.
    console.error(
      `[ai-content] job ${job.id} falhou no stage=${stage} owner=${job.ownerUserId}: ${message}`,
    );
    captureException(err);
    throw err;
  }
}

// Metric usada pra rate limit / observabilidade
export const CONTENT_JOB_METRIC: UsageMetric = "content_jobs_started";
