// Mapeamento tipado de generated_assets.

import type {
  ApprovalStatus,
  CarouselSlide,
  CopyBundle,
  GeneratedAsset,
  ImageSourceMetadata,
  TargetNetwork,
} from "./types";
import { CopyBundleSchema } from "./types";

function safeParseSlides(v: unknown): CarouselSlide[] | null {
  if (!Array.isArray(v)) return null;
  return v
    .map((slide) => {
      if (typeof slide !== "object" || slide === null) return null;
      const s = slide as Record<string, unknown>;
      if (typeof s.url !== "string" || typeof s.index !== "number") return null;
      return { url: s.url, index: s.index };
    })
    .filter((s): s is CarouselSlide => s !== null);
}

function safeParseCopy(v: unknown): CopyBundle {
  // Se a linha veio corrompida por qualquer motivo, produz um bundle mínimo
  // válido pra evitar crash na UI. Escrita sempre passa pelo schema estrito.
  const parsed = CopyBundleSchema.safeParse(v);
  if (parsed.success) return parsed.data;
  return {
    hook: "",
    body: "",
    cta: "",
    hashtags: [],
    shortCaption: "",
    perNetwork: {},
  };
}

function safeParseSourceMetadata(v: unknown): ImageSourceMetadata | null {
  if (typeof v !== "object" || v === null) return null;
  const m = v as Record<string, unknown>;
  if (typeof m.provider !== "string") return null;
  return {
    provider: m.provider as ImageSourceMetadata["provider"],
    author: typeof m.author === "string" ? m.author : undefined,
    attributionUrl: typeof m.attributionUrl === "string" ? m.attributionUrl : undefined,
    providerUrl: typeof m.providerUrl === "string" ? m.providerUrl : undefined,
    query: typeof m.query === "string" ? m.query : undefined,
  };
}

export function mapAssetRow(r: any): GeneratedAsset {
  return {
    id: r.id,
    ownerUserId: r.owner_user_id,
    jobId: r.job_id,
    targetNetwork: r.target_network as TargetNetwork,
    version: r.version ?? 1,
    parentAssetId: r.parent_asset_id ?? null,
    approvalStatus: (r.approval_status ?? "pending") as ApprovalStatus,
    renderedImageUrl: r.rendered_image_url,
    baseImageUrl: r.base_image_url ?? null,
    layersJson: r.layers_json ?? null,
    slides: safeParseSlides(r.slides_json),
    copyBundle: safeParseCopy(r.copy_bundle),
    imageSourceMetadata: safeParseSourceMetadata(r.image_source_metadata),
    aiImagePrompt: r.ai_image_prompt ?? null,
    socialPostId: r.social_post_id ?? null,
    approvedAt: r.approved_at ? new Date(r.approved_at) : null,
    approvedBy: r.approved_by ?? null,
    rejectedAt: r.rejected_at ? new Date(r.rejected_at) : null,
    createdAt: new Date(r.created_at),
  };
}
