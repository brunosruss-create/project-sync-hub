// Server functions do Brand_Kit.
// Todas as escritas passam pelo Zod strict; extração automática não bloqueia
// criação (retorna parcial).

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  DISPLAY_FONTS,
  BODY_FONTS,
  SCRIPT_FONTS,
  type AnyFont,
} from "@/features/content-generation/fonts/whitelist";
import { mapBrandKitRow } from "@/features/content-generation/brand-kit-row";
import { extractFromInstagram, extractFromWebsite } from "@/lib/brand-extractor.server";
import {
  assertContentCan,
  resolveWorkspaceOwner,
} from "@/lib/content-permissions.server";

const HEX = /^#[0-9A-Fa-f]{6}$/;

const UpsertSchema = z.object({
  primaryColor: z.string().regex(HEX),
  secondaryColor: z.string().regex(HEX),
  supportColor: z.string().regex(HEX),
  logoUrl: z.string().url().nullable().optional(),
  displayFont: z.enum(DISPLAY_FONTS as unknown as [AnyFont, ...AnyFont[]]),
  bodyFont: z.enum([...BODY_FONTS, ...SCRIPT_FONTS] as unknown as [AnyFont, ...AnyFont[]]),
  toneOfVoice: z.string().min(1).max(100),
  defaultSignature: z.string().max(80).optional(),
  extractionSource: z.enum(["instagram_handle", "website_url", "manual"]).optional(),
  extractionMetadata: z
    .record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()]))
    .optional(),
});

const ExtractIgSchema = z.object({ handle: z.string().min(1).max(100) });
const ExtractSiteSchema = z.object({ url: z.string().min(4).max(500) });

/** Retorna o BrandKit atual do workspace (ou null se não existe). */
export const getBrandKit = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const workspaceOwnerId = await resolveWorkspaceOwner(context.userId);
    const { data, error } = await supabaseAdmin
      .from("brand_kits")
      .select("*")
      .eq("owner_user_id", workspaceOwnerId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return { brandKit: data ? mapBrandKitRow(data) : null };
  });

/**
 * Cria ou atualiza (upsert) o BrandKit do workspace.
 * Valida fontes contra a whitelist.
 */
export const upsertBrandKit = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => UpsertSchema.parse(input))
  .handler(async ({ data, context }) => {
    const workspaceOwnerId = await resolveWorkspaceOwner(context.userId);
    await assertContentCan(workspaceOwnerId, context.userId, "brand_edit");
    const now = new Date().toISOString();
    const payload = {
      owner_user_id: workspaceOwnerId,
      primary_color: data.primaryColor,
      secondary_color: data.secondaryColor,
      support_color: data.supportColor,
      logo_url: data.logoUrl ?? null,
      display_font: data.displayFont,
      body_font: data.bodyFont,
      tone_of_voice: data.toneOfVoice,
      default_signature: data.defaultSignature ?? "",
      extraction_source: data.extractionSource ?? "manual",
      extraction_metadata: data.extractionMetadata ?? null,
      updated_at: now,
    };
    const { data: row, error } = await supabaseAdmin
      .from("brand_kits")
      .upsert(payload, { onConflict: "owner_user_id" })
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return { brandKit: mapBrandKitRow(row) };
  });

/**
 * Tenta extrair paleta e logo a partir de um handle do Instagram.
 * Nunca lança: em erro, devolve objeto parcial com confidence='low'.
 */
export const extractBrandFromInstagram = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => ExtractIgSchema.parse(input))
  .handler(async ({ data }) => {
    const result = await extractFromInstagram(data.handle);
    return { extraction: result };
  });

/**
 * Extrai identidade a partir de URL pública de site.
 * Nunca lança: em erro, devolve objeto parcial com confidence='low'.
 */
export const extractBrandFromWebsite = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => ExtractSiteSchema.parse(input))
  .handler(async ({ data }) => {
    const result = await extractFromWebsite(data.url);
    return { extraction: result };
  });
