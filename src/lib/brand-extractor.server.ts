// Extração automática de identidade visual a partir de handle IG ou URL de site.
// - Nunca lança pra fora: em erro, devolve objeto parcial.
// - Usa cheerio pra parsing DOM e node-vibrant pra paleta.
// - Timeout curto por operação de rede.

import { Vibrant } from "node-vibrant/node";
import * as cheerio from "cheerio";

interface ExtractionResult {
  primaryColor?: string;
  secondaryColor?: string;
  supportColor?: string;
  logoUrl?: string;
  confidence: "high" | "medium" | "low";
  notes?: string;
}

const FETCH_TIMEOUT_MS = 5000;

async function fetchWithTimeout(url: string): Promise<Response> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    return await fetch(url, {
      signal: ctrl.signal,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (compatible; ZapFlowBot/1.0; +https://zapflow.com)",
      },
    });
  } finally {
    clearTimeout(timer);
  }
}

async function paletteFromImageUrl(url: string): Promise<Partial<ExtractionResult>> {
  try {
    // node-vibrant carrega da URL direto
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const palette = await (Vibrant as any).from(url).getPalette();
    const primary = palette.Vibrant?.hex ?? palette.DarkVibrant?.hex;
    const secondary = palette.DarkMuted?.hex ?? palette.DarkVibrant?.hex;
    const support = palette.LightVibrant?.hex ?? palette.Muted?.hex;
    return {
      primaryColor: primary,
      secondaryColor: secondary,
      supportColor: support,
    };
  } catch {
    return {};
  }
}

/**
 * Tenta extrair paleta e logo de uma página pública do Instagram.
 * Instagram bloqueia scrapers em geral — funciona parcialmente e depende de
 * a página não estar atrás de login. Se falhar, devolve o que conseguiu.
 */
export async function extractFromInstagram(handle: string): Promise<ExtractionResult> {
  const clean = handle.replace(/^@/, "").trim();
  const url = `https://www.instagram.com/${encodeURIComponent(clean)}/`;
  try {
    const res = await fetchWithTimeout(url);
    if (!res.ok) {
      return {
        confidence: "low",
        notes: `HTTP ${res.status} ao acessar Instagram. Considere entrada manual.`,
      };
    }
    const html = await res.text();
    const $ = cheerio.load(html);
    const profilePic =
      $('meta[property="og:image"]').attr("content") ??
      $('link[rel="apple-touch-icon"]').attr("href") ??
      undefined;
    if (!profilePic) {
      return {
        confidence: "low",
        notes: "Não foi possível localizar imagem de perfil. Instagram pode ter bloqueado o acesso.",
      };
    }
    const palette = await paletteFromImageUrl(profilePic);
    return {
      logoUrl: profilePic,
      ...palette,
      confidence: palette.primaryColor ? "medium" : "low",
      notes: palette.primaryColor
        ? undefined
        : "Paleta não extraída da imagem; revisar cores manualmente.",
    };
  } catch (err) {
    return {
      confidence: "low",
      notes: `Falha ao acessar Instagram: ${(err as Error).message}`,
    };
  }
}

/**
 * Extrai identidade a partir de uma URL de site público.
 * Prioridade: <meta name="theme-color"> → favicon → og:image.
 */
export async function extractFromWebsite(rawUrl: string): Promise<ExtractionResult> {
  let normalized = rawUrl.trim();
  if (!/^https?:\/\//i.test(normalized)) normalized = `https://${normalized}`;
  try {
    const res = await fetchWithTimeout(normalized);
    if (!res.ok) {
      return {
        confidence: "low",
        notes: `HTTP ${res.status} ao acessar ${normalized}.`,
      };
    }
    const html = await res.text();
    const $ = cheerio.load(html);
    const themeColor = $('meta[name="theme-color"]').attr("content");
    const ogImage = $('meta[property="og:image"]').attr("content");
    const favicon =
      $('link[rel="icon"]').attr("href") ??
      $('link[rel="shortcut icon"]').attr("href") ??
      undefined;

    // Resolve href relativo
    const resolve = (href: string | undefined): string | undefined => {
      if (!href) return undefined;
      try {
        return new URL(href, normalized).toString();
      } catch {
        return undefined;
      }
    };

    const logoUrl = resolve(ogImage) ?? resolve(favicon);
    const paletteSource = logoUrl;
    const palette = paletteSource ? await paletteFromImageUrl(paletteSource) : {};

    const result: ExtractionResult = {
      primaryColor: themeColor ?? palette.primaryColor,
      secondaryColor: palette.secondaryColor,
      supportColor: palette.supportColor,
      logoUrl,
      confidence: themeColor && logoUrl ? "high" : logoUrl ? "medium" : "low",
    };
    return result;
  } catch (err) {
    return {
      confidence: "low",
      notes: `Falha ao acessar site: ${(err as Error).message}`,
    };
  }
}
