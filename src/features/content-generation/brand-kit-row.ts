// Mapeamento tipado de brand_kits.
// Convenção do projeto: sem tipos gerados do Supabase, o shape vive aqui.

import type { BrandKit, ExtractionSource } from "./types";

export function mapBrandKitRow(r: any): BrandKit {
  return {
    id: r.id,
    ownerUserId: r.owner_user_id,
    primaryColor: r.primary_color,
    secondaryColor: r.secondary_color,
    supportColor: r.support_color,
    logoUrl: r.logo_url ?? null,
    displayFont: r.display_font,
    bodyFont: r.body_font,
    toneOfVoice: r.tone_of_voice,
    defaultSignature: r.default_signature ?? "",
    extractionSource: (r.extraction_source as ExtractionSource | null) ?? null,
    extractionMetadata: r.extraction_metadata ?? null,
    createdAt: new Date(r.created_at),
    updatedAt: new Date(r.updated_at),
  };
}
