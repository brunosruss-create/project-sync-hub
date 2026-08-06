// Mapeamento tipado de content_briefs.

import type {
  ContentBrief,
  PostFormat,
  TargetNetwork,
  TemplateCategory,
} from "./types";

export function mapBriefRow(r: any): ContentBrief {
  return {
    id: r.id,
    ownerUserId: r.owner_user_id,
    createdBy: r.created_by,
    templateCategory: r.template_category as TemplateCategory,
    postFormat: r.post_format as PostFormat,
    carouselSlideCount: r.carousel_slide_count ?? null,
    targetNetworks: (r.target_networks ?? []) as TargetNetwork[],
    serviceId: r.service_id ?? null,
    freeTextObjective: r.free_text_objective ?? null,
    toneOverride: r.tone_override ?? null,
    aiImageOptin: Boolean(r.ai_image_optin),
    createdAt: new Date(r.created_at),
  };
}
