// Tipos e schemas Zod do módulo AI_Content_Generation.
// Convenção do projeto: sem tipos gerados do Supabase; shape vive aqui.

import { z } from "zod";

// ─── Enums do domínio ────────────────────────────────────────────

export const TEMPLATE_CATEGORIES = [
  "promo",
  "novidade",
  "depoimento",
  "agenda",
  "dica",
  "institucional",
  "antes_depois",
  "catalogo",
] as const;
export type TemplateCategory = (typeof TEMPLATE_CATEGORIES)[number];

export const POST_FORMATS = ["single", "carousel", "story"] as const;
export type PostFormat = (typeof POST_FORMATS)[number];

export const TARGET_NETWORKS = ["facebook", "instagram", "tiktok", "youtube"] as const;
export type TargetNetwork = (typeof TARGET_NETWORKS)[number];

export const JOB_STATUSES = ["pending", "running", "completed", "failed"] as const;
export type JobStatus = (typeof JOB_STATUSES)[number];

export const JOB_STAGES = [
  "image_bank",
  "ai_image",
  "ai_text",
  "render",
  "service_lookup",
  "unknown",
] as const;
export type JobStage = (typeof JOB_STAGES)[number];

export const IMAGE_PROVIDERS = [
  "pexels",
  "unsplash",
  "pixabay",
  "nano_banana",
  "service_photo",
] as const;
export type ImageProvider = (typeof IMAGE_PROVIDERS)[number];

export const APPROVAL_STATUSES = ["pending", "approved", "rejected"] as const;
export type ApprovalStatus = (typeof APPROVAL_STATUSES)[number];

export const USAGE_METRICS = [
  "posts_generated",
  "ai_images_generated",
  "content_jobs_started",
] as const;
export type UsageMetric = (typeof USAGE_METRICS)[number];

export const EXTRACTION_SOURCES = ["instagram_handle", "website_url", "manual"] as const;
export type ExtractionSource = (typeof EXTRACTION_SOURCES)[number];

// ─── BrandKit ────────────────────────────────────────────────────

export interface BrandKit {
  id: string;
  ownerUserId: string;
  primaryColor: string;
  secondaryColor: string;
  supportColor: string;
  logoUrl: string | null;
  displayFont: string;
  bodyFont: string;
  toneOfVoice: string;
  defaultSignature: string;
  extractionSource: ExtractionSource | null;
  extractionMetadata: Record<string, string | number | boolean | null> | null;
  createdAt: Date;
  updatedAt: Date;
}

// ─── ContentBrief ────────────────────────────────────────────────

export interface ContentBrief {
  id: string;
  ownerUserId: string;
  createdBy: string;
  templateCategory: TemplateCategory;
  postFormat: PostFormat;
  carouselSlideCount: number | null;
  targetNetworks: TargetNetwork[];
  serviceId: string | null;
  freeTextObjective: string | null;
  toneOverride: string | null;
  aiImageOptin: boolean;
  createdAt: Date;
}

export const ContentBriefInputSchema = z
  .object({
    templateCategory: z.enum(TEMPLATE_CATEGORIES),
    postFormat: z.enum(POST_FORMATS),
    carouselSlideCount: z.number().int().min(2).max(10).optional(),
    targetNetworks: z.array(z.enum(TARGET_NETWORKS)).min(1),
    serviceId: z.string().uuid().optional(),
    freeTextObjective: z.string().max(2000).optional(),
    toneOverride: z.string().max(200).optional(),
    aiImageOptin: z.boolean().default(false),
  })
  .refine(
    (v) => v.postFormat !== "carousel" || typeof v.carouselSlideCount === "number",
    { message: "carouselSlideCount é obrigatório quando postFormat=carousel" },
  );
export type ContentBriefInput = z.infer<typeof ContentBriefInputSchema>;

// ─── ContentJob ──────────────────────────────────────────────────

export interface ContentJob {
  id: string;
  ownerUserId: string;
  briefId: string;
  status: JobStatus;
  stage: JobStage | null;
  errorMessage: string | null;
  imageProviderUsed: ImageProvider | null;
  aiTextModel: string | null;
  costEstimateCents: number;
  durationMs: number | null;
  startedAt: Date | null;
  completedAt: Date | null;
  createdAt: Date;
}

// ─── CopyBundle (retorno estruturado do Gemini) ──────────────────

// Campos internos são todos opcionais — o Gemini pode omitir uma variante
// quando aquela rede não é foco do post. O caminho de "publish" faz fallback
// para copy.body quando fullText não veio.
export const CopyBundlePerNetworkSchema = z.object({
  facebook: z
    .object({ fullText: z.string().max(5000).optional() })
    .optional(),
  instagram: z
    .object({ fullText: z.string().max(2200).optional() })
    .optional(),
  tiktok: z
    .object({ fullText: z.string().max(2200).optional() })
    .optional(),
  youtube: z
    .object({
      title: z.string().max(100).optional(),
      description: z.string().max(5000).optional(),
    })
    .optional(),
});

export const CopyBundleSchema = z.object({
  hook: z.string().min(1).max(120),
  body: z.string().min(1).max(800),
  cliffhanger: z.string().max(160).optional(),
  cta: z.string().min(1).max(80),
  hashtags: z.array(z.string().max(50)).max(15),
  shortCaption: z.string().min(1).max(200),
  perNetwork: CopyBundlePerNetworkSchema,
  /** 2 a 4 palavras-chave EM INGLÊS pra buscar imagem no banco de fotos.
   *  Ex: post sobre corte de cabelo → ["hair salon", "haircut"]. */
  imageKeywords: z.array(z.string().min(2).max(60)).min(1).max(4).optional(),
});
export type CopyBundle = z.infer<typeof CopyBundleSchema>;

// ─── ImageBankResult ─────────────────────────────────────────────

export interface ImageBankResult {
  url: string;
  cachedUrl?: string;
  provider: "pexels" | "unsplash" | "pixabay";
  author: string;
  providerUrl: string;
  attributionUrl: string;
  width: number;
  height: number;
}

// ─── GeneratedAsset ──────────────────────────────────────────────

export interface CarouselSlide {
  url: string;
  index: number;
}

export interface ImageSourceMetadata {
  provider: ImageProvider;
  author?: string;
  attributionUrl?: string;
  providerUrl?: string;
  query?: string;
}

export interface GeneratedAsset {
  id: string;
  ownerUserId: string;
  jobId: string;
  targetNetwork: TargetNetwork;
  version: number;
  parentAssetId: string | null;
  approvalStatus: ApprovalStatus;
  renderedImageUrl: string;
  /** Foto crua sem texto/template — usada como fundo no editor de camadas. */
  baseImageUrl: string | null;
  /** Composição de camadas (JSON) — quando o cliente edita no LayerEditor. */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  layersJson: any | null;
  slides: CarouselSlide[] | null;
  copyBundle: CopyBundle;
  imageSourceMetadata: ImageSourceMetadata | null;
  aiImagePrompt: string | null;
  socialPostId: string | null;
  approvedAt: Date | null;
  approvedBy: string | null;
  rejectedAt: Date | null;
  createdAt: Date;
}

// ─── ContentUsageMeter ───────────────────────────────────────────

export interface ContentUsageMeter {
  id: string;
  ownerUserId: string;
  periodYearMonth: string;
  metric: UsageMetric;
  count: number;
  updatedAt: Date;
}

// ─── ContentPublishingPermission ─────────────────────────────────

export interface ContentPublishingPermission {
  id: string;
  ownerUserId: string;
  scope: "member" | "role";
  memberUserId: string | null;
  role: "manager" | "agent" | null;
  canBrandEdit: boolean;
  canBriefCreate: boolean;
  canAssetApprove: boolean;
  canPublishImmediate: boolean;
  canAiImageOptin: boolean;
  updatedAt: Date;
}

// ─── Effective permissions (resultado da resolução por membro) ───

export interface EffectiveContentPermissions {
  canBrandEdit: boolean;
  canBriefCreate: boolean;
  canAssetApprove: boolean;
  canPublishImmediate: boolean;
  canAiImageOptin: boolean;
}
