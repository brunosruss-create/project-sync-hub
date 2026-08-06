// Server functions do catálogo de templates.
// Listagem: retorna metadados do registry. Preview renderizado sob demanda
// contra o Brand_Kit atual do workspace, com cache no bucket ai-content.

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  listAllTemplates,
  listTemplatesByCategory,
  getTemplate,
} from "@/features/content-generation/templates";
import { renderTemplate } from "@/features/content-generation/render-engine.server";
import { mapBrandKitRow } from "@/features/content-generation/brand-kit-row";
import { TEMPLATE_CATEGORIES } from "@/features/content-generation/types";
import type { BrandKit } from "@/features/content-generation/types";

const ListSchema = z.object({
  category: z.enum(TEMPLATE_CATEGORIES).optional(),
});

const PreviewSchema = z.object({
  templateId: z.string().min(1),
});

const BUCKET = "ai-content";

function defaultBrandKit(ownerUserId: string): BrandKit {
  return {
    id: "default",
    ownerUserId,
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
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

async function loadBrandKitOrDefault(ownerUserId: string): Promise<BrandKit> {
  const { data } = await supabaseAdmin
    .from("brand_kits")
    .select("*")
    .eq("owner_user_id", ownerUserId)
    .maybeSingle();
  if (data) return mapBrandKitRow(data);
  return defaultBrandKit(ownerUserId);
}

/**
 * Lista templates. Se `category` for informado, filtra por categoria.
 * Retorna apenas metadados (sem previews); use `getTemplatePreview` pra
 * obter uma URL de imagem renderizada sob o Brand_Kit atual.
 */
export const listTemplates = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => ListSchema.parse(input))
  .handler(async ({ data }) => {
    const templates = data.category
      ? listTemplatesByCategory(data.category)
      : listAllTemplates();
    return {
      templates: templates.map((t) => ({
        id: t.id,
        category: t.category,
        ratio: t.ratio,
        width: t.width,
        height: t.height,
        slots: t.slots,
      })),
    };
  });

/**
 * Gera (ou reusa) o preview de um template renderizado contra o Brand_Kit
 * atual do workspace. Preview é cacheado em ai-content/{owner}/template-previews/.
 * Invalidação: quando o Brand_Kit muda, chamar `invalidateTemplatePreviews`.
 */
export const getTemplatePreview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => PreviewSchema.parse(input))
  .handler(async ({ data, context }) => {
    const template = getTemplate(data.templateId);
    if (!template) throw new Error(`Template não encontrado: ${data.templateId}`);

    const brandKit = await loadBrandKitOrDefault(context.userId);
    const key = `${context.userId}/template-previews/${template.id}-${brandKit.id}.png`;

    // Verifica cache
    const { data: existing } = await supabaseAdmin.storage.from(BUCKET).list(
      `${context.userId}/template-previews`,
      { search: `${template.id}-${brandKit.id}.png` },
    );
    if (existing && existing.length > 0) {
      const pub = supabaseAdmin.storage.from(BUCKET).getPublicUrl(key);
      return { url: pub.data.publicUrl, cached: true };
    }

    // Renderiza dummy slots pra preview
    const output = await renderTemplate({
      templateId: template.id,
      brandKit,
      slots: {
        headline: "Exemplo de título",
        subheadline: "Legenda de apoio",
        ctaLabel: "Chamada",
        price: "R$ 99",
        duration: "60 min",
        description: "Descrição breve do serviço.",
        authorName: "Nome",
        eventDate: "SEX 8",
      },
    });

    const { error: upErr } = await supabaseAdmin.storage.from(BUCKET).upload(
      key,
      output.buffer,
      { contentType: "image/png", upsert: true },
    );
    if (upErr) throw new Error(`Falha ao salvar preview: ${upErr.message}`);

    const pub = supabaseAdmin.storage.from(BUCKET).getPublicUrl(key);
    return { url: pub.data.publicUrl, cached: false };
  });

/**
 * Invalida cache de previews do workspace (chamado quando o Brand_Kit muda).
 * Apaga todos os arquivos em ai-content/{owner}/template-previews/.
 */
export const invalidateTemplatePreviews = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const prefix = `${context.userId}/template-previews`;
    const { data } = await supabaseAdmin.storage.from(BUCKET).list(prefix);
    if (!data || data.length === 0) return { removed: 0 };
    const keys = data.map((f) => `${prefix}/${f.name}`);
    await supabaseAdmin.storage.from(BUCKET).remove(keys);
    return { removed: keys.length };
  });
