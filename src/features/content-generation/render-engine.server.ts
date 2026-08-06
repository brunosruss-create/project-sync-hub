// Render engine: combina Design_Template + BrandKit + slots + Satori + resvg
// pra produzir um Buffer PNG determinístico.
//
// Fontes são carregadas server-side de arquivos TTF em node_modules/@expo-google-fonts.
// Não há dependência de rede em runtime.

import satori from "satori";
import { Resvg } from "@resvg/resvg-js";
import type { BrandKit } from "./types";
import { loadFonts } from "./fonts/font-loader.server";
import {
  getTemplate,
  type TemplateSlots,
} from "./templates/registry";
// Garante que os templates estejam registrados antes de qualquer render.
import "./templates";

export interface RenderInput {
  templateId: string;
  brandKit: BrandKit;
  slots: TemplateSlots;
  slideIndex?: number;
  slideTotal?: number;
}

export interface RenderOutput {
  buffer: Buffer;
  width: number;
  height: number;
  templateId: string;
}

/**
 * Renderiza um template pra PNG (buffer). Determinístico: mesmo input +
 * mesmas fontes em disco → mesmos bytes de saída.
 */
export async function renderTemplate(input: RenderInput): Promise<RenderOutput> {
  const template = getTemplate(input.templateId);
  if (!template) {
    throw new Error(`Template desconhecido: ${input.templateId}`);
  }
  if (template.retired) {
    throw new Error(`Template retirado não pode ser usado em novos jobs: ${input.templateId}`);
  }

  const fonts = await loadFonts([input.brandKit.displayFont, input.brandKit.bodyFont]);
  if (fonts.length === 0) {
    throw new Error(
      `Nenhuma fonte pôde ser carregada. Verifique whitelist e pacotes @expo-google-fonts.`,
    );
  }

  const element = template.component({
    brandKit: input.brandKit,
    slots: input.slots,
    slideIndex: input.slideIndex,
    slideTotal: input.slideTotal,
  });

  const svg = await satori(element, {
    width: template.width,
    height: template.height,
    fonts: fonts.map((f) => ({
      name: f.name,
      data: f.data,
      weight: f.weight,
      style: f.style,
    })),
    embedFont: true,
  });

  const resvg = new Resvg(svg, {
    fitTo: { mode: "width", value: template.width },
    font: { loadSystemFonts: false },
  });
  const pngData = resvg.render();
  const buffer = pngData.asPng();

  return {
    buffer,
    width: template.width,
    height: template.height,
    templateId: template.id,
  };
}
