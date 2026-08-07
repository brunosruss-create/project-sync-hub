// Handler do job type "content_generation" — orquestra o pipeline completo
// de geração de um Generated_Asset a partir de um Content_Brief.
//
// Pipeline: resolver imagem → gerar copy → renderizar → gravar assets.
// Aplica Property 3 (fallback controlado do AI_Image_Provider): só chama
// generateImage() quando imageBank == null OU brief.ai_image_optin === true,
// e sempre passa pelo checkQuota antes.

import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { captureException } from "@/lib/sentry.server";
import { mapBriefRow } from "@/features/content-generation/brief-row";
import { mapJobRow } from "@/features/content-generation/job-row";
import { mapBrandKitRow } from "@/features/content-generation/brand-kit-row";
import { getDesignDNA } from "@/features/content-generation/design-dna";
import { buildComposition } from "@/features/content-generation/editor/layout-templates";
import type { LayerComposition } from "@/features/content-generation/editor/layer-types";
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
import { generateImage, generateFullCreative } from "@/lib/ai-image.server";
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

// Palavras-chave universais (EN) por categoria — o Pexels tem muito mais fotos
// indexadas em inglês, então mesmo pra clientes BR a busca é feita em EN pra
// maximizar recall. A cor/temática do post vem do template renderizado por cima.
const CATEGORY_KEYWORDS_EN: Record<string, string[]> = {
  promo: ["shopping", "sale", "store"],
  novidade: ["new product", "launch", "showcase"],
  depoimento: ["happy customer", "smile", "portrait"],
  agenda: ["calendar", "meeting", "planning"],
  dica: ["learning", "workspace", "notebook"],
  institucional: ["team", "office", "business"],
  antes_depois: ["transformation", "makeover"],
  catalogo: ["product photography", "showcase"],
};

function buildImageQuery(
  brief: ContentBrief,
  service: { name?: string; description?: string | null } | null,
  brandKit: BrandKit,
): string {
  // Prioridade 1: nome do serviço (o cliente sabe qual palavra funciona pro seu ramo)
  if (service?.name) {
    return service.name.slice(0, 60);
  }
  // Prioridade 2: keyword universal da categoria
  const keywords = CATEGORY_KEYWORDS_EN[brief.templateCategory] ?? ["business"];
  return keywords[0];
}

function buildAiImagePrompt(
  brief: ContentBrief,
  service: { name?: string; description?: string | null } | null,
  brandKit: BrandKit,
  imageDescription: string | undefined,
): string {
  // Prioridade máxima: descrição rica gerada pelo Gemini (imageDescription).
  // Se o Gemini gerou algo detalhado com sujeito/ambiente/mood, usa direto —
  // é infinitamente melhor que qualquer prompt hardcoded aqui.
  if (imageDescription && imageDescription.length > 20) {
    return imageDescription;
  }
  // Fallback quando o Gemini não retornou imageDescription: monta um prompt
  // razoável a partir do serviço + categoria.
  const query = buildImageQuery(brief, service, brandKit);
  return `Professional photograph of ${query}, editorial style, cinematic lighting.`;
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

  // Busca dados do workspace (profile) pra enriquecer o Brand Kit.
  // Usa business_name, segment, ai_tone, logo — dados já cadastrados
  // em Configurações → Negócio (zero atrito pro cliente).
  const { data: profile } = await supabaseAdmin
    .from("profiles")
    .select("business_name,segment,ai_tone,logo_url")
    .eq("id", workspaceOwnerId)
    .maybeSingle();
  const biz = (profile as any)?.business_name ?? "";
  const segment = (profile as any)?.segment ?? "";
  const aiTone = (profile as any)?.ai_tone ?? "profissional";
  const logoUrl = (profile as any)?.logo_url ?? null;

  // DNA do nicho — usado como fallback pra paleta e fonte quando o cliente
  // não configurou Brand Kit próprio. Isso faz cada nicho ter aparência
  // distinta desde o primeiro post (estilo BestContent).
  const dna = getDesignDNA(segment);

  if (data) {
    const kit = mapBrandKitRow(data);
    // Preenche campos que o Brand Kit não tem mas o profile sim.
    if (!kit.defaultSignature || kit.defaultSignature === "Sua Marca") {
      kit.defaultSignature = biz || "Sua Marca";
    }
    if (!kit.logoUrl && logoUrl) {
      kit.logoUrl = logoUrl;
    }
    if (kit.toneOfVoice === "profissional" && aiTone && aiTone !== "profissional") {
      kit.toneOfVoice = aiTone;
    }
    return kit;
  }

  // Sem Brand Kit salvo — usa DNA do segmento como base.
  const now = new Date();
  return {
    id: "default",
    ownerUserId: workspaceOwnerId,
    primaryColor: dna.palette.primary,
    secondaryColor: dna.palette.secondary,
    supportColor: dna.palette.support,
    logoUrl,
    displayFont: dna.displayFont,
    bodyFont: dna.bodyFont,
    toneOfVoice: aiTone || "profissional",
    defaultSignature: biz || "Sua Marca",
    extractionSource: null,
    extractionMetadata: null,
    createdAt: now,
    updatedAt: now,
  };
}

/** Segmento do workspace — usado pra enriquecer keywords de imagem. */
async function loadSegment(workspaceOwnerId: string): Promise<string> {
  const { data } = await supabaseAdmin
    .from("profiles")
    .select("segment")
    .eq("id", workspaceOwnerId)
    .maybeSingle();
  return (data as any)?.segment ?? "";
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
  imageKeywords: string[] | undefined,
  imageDescription: string | undefined,
): Promise<ResolvedImage> {
  // Prioridade 1: foto do serviço (Requirement 7.2).
  // Se o cliente cadastrou fotos reais do seu próprio serviço, usa elas.
  if (service && service.photos.length > 0) {
    return {
      url: service.photos[0].url,
      provider: "service_photo",
      sourceMetadata: {
        provider: "service_photo",
      },
    };
  }

  // Query pra busca (usada tanto pelo Flux quanto pelo Pexels fallback).
  const query =
    imageKeywords && imageKeywords.length > 0
      ? imageKeywords.slice(0, 3).join(" ")
      : buildImageQuery(brief, service, brandKit);

  // Prioridade 2: Geração por IA (Flux Schnell via Together.ai).
  // Escolhido como default porque banco de imagem gratuito (Pexels) tem
  // pouca variedade e devolve fotos genéricas/repetidas. Flux gera imagem
  // profissional contextualizada por ~R$ 0,015/post.
  try {
    await enforceQuota(workspaceOwnerId, "ai_images_generated");
    const aiPrompt = buildAiImagePrompt(brief, service, brandKit, imageDescription);
    console.info(`[content-worker] Flux prompt: ${aiPrompt.slice(0, 200)}`);
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
  } catch (aiErr) {
    // IA falhou (quota, credencial faltando, API caiu). Cai pro Pexels como
    // rede de segurança em vez de deixar o job morrer.
    console.warn(
      `[content-worker] IA de imagem falhou, tentando banco de imagem: ${(aiErr as Error).message}`,
    );
  }

  // Prioridade 3 (fallback): Image_Bank (Pexels/Unsplash/Pixabay).
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

  // Nada funcionou.
  {
    console.error("[content-worker] image resolution failed:", {
      workspaceOwnerId,
      query,
      note: "Ambos AI e banco de imagem falharam",
    });
    throw new ContentJobError(
      "image_bank",
      `Não foi possível gerar imagem para este post no momento. Tente novamente em instantes.`,
    );
  }
}

const CATEGORY_LABELS: Record<string, string> = {
  promo: "Promoção",
  novidade: "Novidade",
  depoimento: "Depoimento",
  agenda: "Agenda",
  dica: "Dica",
  institucional: "Institucional",
  antes_depois: "Antes e Depois",
  catalogo: "Catálogo",
};

/**
 * Monta a composição de camadas (design do post) usando o DNA do nicho +
 * copy gerada pela IA. Cada post ganha um layout escolhido deterministicamente
 * pelo seed — evita o "molde único".
 */
function buildAssetComposition(
  brief: ContentBrief,
  brandKit: BrandKit,
  segment: string,
  copy: CopyBundle,
  seed: string,
): LayerComposition {
  const dna = getDesignDNA(segment);
  return buildComposition({
    format: brief.postFormat === "story" ? "story" : "single",
    hook: copy.hook,
    cta: copy.cta,
    signature: brandKit.defaultSignature || "Sua Marca",
    category: CATEGORY_LABELS[brief.templateCategory],
    occasion: copy.occasion,
    priceText: copy.priceText,
    offerLabel: copy.offerLabel,
    urgency: copy.urgency,
    subheadline: copy.subheadline,
    bullets: copy.bullets,
    logoUrl: brandKit.logoUrl,
    palette: {
      // Brand Kit customizado tem prioridade; senão usa DNA.
      primary: brandKit.primaryColor || dna.palette.primary,
      secondary: brandKit.secondaryColor || dna.palette.secondary,
      support: brandKit.supportColor || dna.palette.support,
      accent: dna.palette.accent,
      highlight: brandKit.supportColor || dna.palette.highlight,
    },
    displayFont: brandKit.displayFont || dna.displayFont,
    bodyFont: brandKit.bodyFont || dna.bodyFont,
    typographyStyle: dna.typographyStyle,
    highlightWord: copy.highlightWord,
    seed,
  });
}

/**
 * Monta a composição de forma DEFENSIVA — se algo falhar (dados incompletos),
 * devolve uma composição vazia (só a foto) em vez de derrubar o job inteiro.
 */
function safeBuildComposition(
  brief: ContentBrief,
  brandKit: BrandKit,
  segment: string,
  copy: CopyBundle,
  seed: string,
): LayerComposition {
  try {
    return buildAssetComposition(brief, brandKit, segment, copy, seed);
  } catch (err) {
    console.error(
      `[content-worker] buildComposition falhou (${(err as Error).message}) — usando composição vazia`,
    );
    return {
      canvasWidth: 1080,
      canvasHeight: brief.postFormat === "story" ? 1920 : 1080,
      layers: [],
    };
  }
}

async function insertAsset(input: {
  ownerUserId: string;
  jobId: string;
  targetNetwork: TargetNetwork;
  renderedImageUrl: string;
  /** Foto crua (sem template desenhado) — usada como fundo no editor de camadas. */
  rawImageUrl: string;
  /** Composição de camadas (design do post) — o editor carrega isto direto. */
  layersJson: LayerComposition;
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
      base_image_url: input.rawImageUrl,
      layers_json: input.layersJson,
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
  const segment = await loadSegment(job.ownerUserId);
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
    stage: "ai_text",
    started_at: new Date().toISOString(),
  });

  try {
    // Stage 1: copy (gera texto + imageKeywords que descrevem a imagem ideal)
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
      segment, // nicho do workspace — enriquece contexto pra keywords melhores
    });
    const copyBundle = copyResult.bundle;

    // ── Modo CRIATIVO 100% IA (opt-in via aiImageOptin) ──
    // Gera o post inteiro (foto + texto + design) numa imagem só via Gemini
    // Image. Sem compositor: a imagem É o criativo final. Editor abre por cima
    // (cliente pode adicionar camadas se quiser).
    if (brief.aiImageOptin) {
      await updateJob(job.id, { stage: "ai_image", ai_text_model: copyResult.model });
      try {
        await enforceQuota(job.ownerUserId, "ai_images_generated");
        const creative = await generateFullCreative({
          headline: copyBundle.hook,
          subheadline: copyBundle.subheadline,
          priceText: copyBundle.priceText,
          occasion: copyBundle.occasion,
          ctaText: copyBundle.cta,
          bullets: (copyBundle.bullets ?? []).map((b) => b.text),
          segment,
          brandName:
            brandKit.defaultSignature && brandKit.defaultSignature !== "Sua Marca"
              ? brandKit.defaultSignature
              : undefined,
          brandColors: {
            primary: brandKit.primaryColor,
            support: brandKit.supportColor,
            accent: getDesignDNA(segment).palette.accent,
          },
          aspectRatio: aspectRatioFor(brief.postFormat),
          workspaceOwnerId: job.ownerUserId,
        });
        await incrementMeter(job.ownerUserId, "ai_images_generated");
        const emptyComp: LayerComposition = {
          canvasWidth: 1080,
          canvasHeight: brief.postFormat === "story" ? 1920 : 1080,
          layers: [],
        };
        for (const network of brief.targetNetworks) {
          await insertAsset({
            ownerUserId: job.ownerUserId,
            jobId: job.id,
            targetNetwork: network,
            renderedImageUrl: creative.url,
            rawImageUrl: creative.url,
            layersJson: emptyComp,
            slides: null,
            copyBundle,
            imageSourceMetadata: { provider: "nano_banana" },
            aiImagePrompt: creative.promptUsed,
          });
        }
        await updateJob(job.id, {
          status: "completed",
          stage: null,
          error_message: null,
          image_provider_used: "nano_banana",
          duration_ms: Date.now() - started,
          completed_at: new Date().toISOString(),
          cost_estimate_cents: COST_GEMINI_FLASH_CENTS + COST_NANO_BANANA_CENTS,
        });
        return;
      } catch (aiErr) {
        // Se o full-IA falhar, cai pro pipeline normal (compositor) em vez de
        // deixar o cliente sem post.
        console.error(
          `[content-worker] full-IA falhou, usando compositor: ${(aiErr as Error).message}`,
        );
      }
    }

    // Stage 2: imagem — usa as keywords do Gemini (que entende o contexto real)
    await updateJob(job.id, { stage: "image_bank", ai_text_model: copyResult.model });
    const image = await resolveImage(
      brief,
      brandKit,
      service,
      job.ownerUserId,
      copyBundle.imageKeywords,
      copyBundle.imageDescription,
    );
    await updateJob(job.id, {
      stage: "render",
      image_provider_used: image.provider,
    });

    // IMPORTANTE: a geração NÃO renderiza PNG (não depende de satori aqui).
    // Salvamos a foto crua + a composição JSON. O editor mostra o design ao
    // vivo no navegador; o PNG final só é renderizado no PUBLISH (job
    // render_composition, que roda no worker). Isso torna a geração rápida e
    // robusta — nunca falha por causa de fontes/satori.
    if (brief.postFormat === "carousel") {
      const count = brief.carouselSlideCount ?? 3;
      const primaryNetwork = brief.targetNetworks[0];
      const composition = safeBuildComposition(
        brief,
        brandKit,
        segment,
        copyBundle,
        `${job.id}-${primaryNetwork}`,
      );
      // Slides apontam pra mesma foto crua por enquanto (design aplicado no editor).
      const slideUrls: CarouselSlide[] = Array.from({ length: count }, (_, i) => ({
        url: image.url,
        index: i,
      }));
      await insertAsset({
        ownerUserId: job.ownerUserId,
        jobId: job.id,
        targetNetwork: primaryNetwork,
        renderedImageUrl: image.url,
        rawImageUrl: image.url,
        layersJson: composition,
        slides: slideUrls,
        copyBundle,
        imageSourceMetadata: image.sourceMetadata,
        aiImagePrompt: image.aiImagePrompt ?? null,
      });
    } else {
      // Single / Story: 1 asset por rede alvo
      for (const network of brief.targetNetworks) {
        const composition = safeBuildComposition(
          brief,
          brandKit,
          segment,
          copyBundle,
          `${job.id}-${network}`,
        );
        await insertAsset({
          ownerUserId: job.ownerUserId,
          jobId: job.id,
          targetNetwork: network,
          renderedImageUrl: image.url,
          rawImageUrl: image.url,
          layersJson: composition,
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
