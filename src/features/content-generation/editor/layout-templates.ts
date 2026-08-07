// Múltiplos templates de layout — cada um produz uma composição VISUALMENTE
// distinta. Isso evita o "molde único" (faixa preta embaixo em tudo).
//
// Cada template recebe os mesmos dados (copy + DNA + paleta) e distribui as
// camadas de forma diferente: gradiente inferior, painel lateral, faixa no
// topo, composição centralizada, etc.
//
// A escolha do template é determinística por `seed` (id do asset) combinada
// com o estilo tipográfico do nicho — assim posts do mesmo nicho variam, mas
// reabrir o mesmo post mostra sempre o mesmo design.

import type { Layer, LayerComposition, TextLayer } from "./layer-types";

export interface CompositionInput {
  format: "single" | "carousel" | "story";
  hook: string;
  cta: string;
  signature: string;
  category?: string;
  palette: {
    primary: string;
    secondary: string;
    support: string;
    accent: string;
    highlight: string;
  };
  displayFont: string;
  typographyStyle:
    | "serif-elegant"
    | "sans-chunky"
    | "sans-modern"
    | "sans-tech"
    | "condensed-bold"
    | "italic-refined";
  highlightWord?: string;
  /** Seed determinístico (ex: assetId) pra escolher variação de layout. */
  seed?: string;
}

const STOPWORDS = new Set([
  "não", "nao", "de", "da", "do", "a", "o", "e", "ou", "que", "com", "para",
  "por", "em", "no", "na", "os", "as", "um", "uma", "se", "sua", "seu", "the",
]);

function resolveHighlight(hook: string, raw?: string): string | undefined {
  const h = (raw ?? "").trim();
  if (!h) return undefined;
  const allStop = h.split(/\s+/).every((w) => STOPWORDS.has(w.toLowerCase()));
  if (allStop) return undefined;
  if (!hook.toLowerCase().includes(h.toLowerCase())) return undefined;
  return h;
}

/** Hash simples e estável de string → inteiro. */
function hashSeed(seed: string): number {
  let h = 0;
  for (let i = 0; i < seed.length; i++) {
    h = (h * 31 + seed.charCodeAt(i)) & 0xffffffff;
  }
  return Math.abs(h);
}

/** Fonte adaptativa pelo comprimento do hook. */
function adaptiveHeadlineSize(len: number, base: number): number {
  if (len <= 22) return base;
  if (len <= 36) return Math.round(base * 0.82);
  if (len <= 52) return Math.round(base * 0.68);
  return Math.round(base * 0.56);
}

function estimateLines(len: number, fontSize: number, usableWidth: number): number {
  const charsPerLine = Math.max(8, Math.floor(usableWidth / (fontSize * 0.54)));
  return Math.min(4, Math.max(1, Math.ceil(len / charsPerLine)));
}

// ─── Template 1: Editorial (gradiente inferior suave) ───────────────
// Elegante. Bom pra beleza, estética, advocacia, nutrição, psicologia.
function editorialBottom(input: CompositionInput, W: number, H: number): Layer[] {
  const PAD = 64;
  const layers: Layer[] = [];
  const hook = (input.hook ?? "").trim();
  const usableWidth = W - PAD * 2;
  const fs = adaptiveHeadlineSize(hook.length, H > W ? 96 : 80);
  const lh = 1.08;
  const lines = estimateLines(hook.length, fs, usableWidth);
  const hHeight = Math.round(lines * fs * lh);

  const ctaFs = 30;
  const ctaH = Math.round(ctaFs * 1.2);
  const accentGap = 26;
  const accentH = 5;
  const ctaGap = 32;
  const blockH = hHeight + accentGap + accentH + ctaGap + ctaH;
  const blockTop = H - PAD - blockH;

  const overlayTop = Math.max(0, blockTop - 180);
  layers.push({
    id: "overlay",
    type: "rect",
    x: 0,
    y: overlayTop,
    width: W,
    height: H - overlayTop,
    bg: input.palette.accent,
    opacity: 0.88,
    gradient: true,
    gradientDirection: "to bottom",
  });

  pushSignature(layers, input, PAD, 60);
  pushBadge(layers, input, W);

  layers.push(headline(input, PAD, blockTop, usableWidth, fs, lh, "left"));
  layers.push({
    id: "accent-line",
    type: "line",
    x: PAD,
    y: blockTop + hHeight + accentGap,
    width: 90,
    height: accentH,
    color: input.palette.support,
  });
  layers.push(ctaLayer(input, PAD, blockTop + hHeight + accentGap + accentH + ctaGap, ctaFs));
  return layers;
}

// ─── Template 2: Painel lateral (gradiente lateral forte) ───────────
// Impactante. Bom pra academia, barbearia, automotivo, oficina.
function sidePanel(input: CompositionInput, W: number, H: number): Layer[] {
  const PAD = 60;
  const layers: Layer[] = [];
  const hook = (input.hook ?? "").trim();
  const panelW = Math.round(W * 0.62);
  const usableWidth = panelW - PAD * 2;
  const fs = adaptiveHeadlineSize(hook.length, 78);
  const lh = 1.06;
  const lines = estimateLines(hook.length, fs, usableWidth);
  const hHeight = Math.round(lines * fs * lh);

  // Gradiente da esquerda (cor sólida) → transparente na direita
  layers.push({
    id: "overlay",
    type: "rect",
    x: 0,
    y: 0,
    width: Math.round(W * 0.85),
    height: H,
    bg: input.palette.accent,
    opacity: 0.9,
    gradient: true,
    gradientDirection: "to left",
  });

  pushSignature(layers, input, PAD, 60);
  pushBadge(layers, input, W);

  const blockTop = Math.round(H * 0.42);
  layers.push(headline(input, PAD, blockTop, usableWidth, fs, lh, "left"));
  layers.push({
    id: "accent-line",
    type: "line",
    x: PAD,
    y: blockTop + hHeight + 24,
    width: 110,
    height: 6,
    color: input.palette.support,
  });
  layers.push(ctaLayer(input, PAD, blockTop + hHeight + 24 + 6 + 30, 30));
  return layers;
}

// ─── Template 3: Faixa no topo (clean, corporativo) ─────────────────
// Limpo. Bom pra medicina, odontologia, laboratório, tech, assistência.
function topStrip(input: CompositionInput, W: number, H: number): Layer[] {
  const PAD = 64;
  const layers: Layer[] = [];
  const hook = (input.hook ?? "").trim();
  const usableWidth = W - PAD * 2;
  const fs = adaptiveHeadlineSize(hook.length, 74);
  const lh = 1.08;
  const lines = estimateLines(hook.length, fs, usableWidth);
  const hHeight = Math.round(lines * fs * lh);

  // Faixa sólida no topo com a marca
  const stripH = 130;
  layers.push({
    id: "top-strip",
    type: "rect",
    x: 0,
    y: 0,
    width: W,
    height: stripH,
    bg: input.palette.primary,
    opacity: 1,
  });
  if (input.signature && input.signature !== "Sua Marca") {
    layers.push({
      id: "signature",
      type: "text",
      x: PAD,
      y: Math.round(stripH / 2 - 16),
      text: input.signature.toUpperCase(),
      fontFamily: input.displayFont,
      fontSize: 26,
      fontWeight: 700,
      color: "#FFFFFF",
      align: "left",
      lineHeight: 1.2,
      letterSpacing: 4,
      textTransform: "uppercase",
    });
  }

  // Gradiente inferior pra legibilidade do headline
  const ctaFs = 30;
  const ctaH = Math.round(ctaFs * 1.2);
  const accentGap = 24;
  const ctaGap = 30;
  const blockH = hHeight + accentGap + 5 + ctaGap + ctaH;
  const blockTop = H - PAD - blockH;
  const overlayTop = Math.max(stripH, blockTop - 160);
  layers.push({
    id: "overlay",
    type: "rect",
    x: 0,
    y: overlayTop,
    width: W,
    height: H - overlayTop,
    bg: input.palette.accent,
    opacity: 0.85,
    gradient: true,
    gradientDirection: "to bottom",
  });
  layers.push(headline(input, PAD, blockTop, usableWidth, fs, lh, "left"));
  layers.push({
    id: "accent-line",
    type: "line",
    x: PAD,
    y: blockTop + hHeight + accentGap,
    width: 90,
    height: 5,
    color: input.palette.support,
  });
  layers.push(ctaLayer(input, PAD, blockTop + hHeight + accentGap + 5 + ctaGap, ctaFs));
  return layers;
}

// ─── Template 4: Centralizado com vinheta ───────────────────────────
// Dramático. Bom pra promoções, novidades, datas comemorativas.
function centeredVignette(input: CompositionInput, W: number, H: number): Layer[] {
  const PAD = 80;
  const layers: Layer[] = [];
  const hook = (input.hook ?? "").trim();
  const usableWidth = W - PAD * 2;
  const fs = adaptiveHeadlineSize(hook.length, 88);
  const lh = 1.05;
  const lines = estimateLines(hook.length, fs, usableWidth);
  const hHeight = Math.round(lines * fs * lh);

  // Escurece a imagem inteira pra dar foco no texto central
  layers.push({
    id: "vignette",
    type: "rect",
    x: 0,
    y: 0,
    width: W,
    height: H,
    bg: input.palette.accent,
    opacity: 0.55,
  });

  pushBadge(layers, input, W);

  const centerBlockH = hHeight + 26 + 5 + 32 + 36;
  const blockTop = Math.round(H / 2 - centerBlockH / 2);
  layers.push(headline(input, PAD, blockTop, usableWidth, fs, lh, "center"));
  // linha centralizada
  layers.push({
    id: "accent-line",
    type: "line",
    x: Math.round(W / 2 - 55),
    y: blockTop + hHeight + 26,
    width: 110,
    height: 5,
    color: input.palette.support,
  });
  const cta = ctaLayer(input, 0, blockTop + hHeight + 26 + 5 + 32, 32);
  cta.x = PAD;
  cta.align = "center";
  cta.maxWidth = usableWidth;
  layers.push(cta);

  if (input.signature && input.signature !== "Sua Marca") {
    layers.push({
      id: "signature",
      type: "text",
      x: PAD,
      y: H - 90,
      maxWidth: usableWidth,
      text: input.signature.toUpperCase(),
      fontFamily: input.displayFont,
      fontSize: 24,
      fontWeight: 700,
      color: "#FFFFFF",
      align: "center",
      lineHeight: 1.2,
      letterSpacing: 5,
      textTransform: "uppercase",
    });
  }
  return layers;
}

// ─── Helpers de camadas comuns ──────────────────────────────────────

function headline(
  input: CompositionInput,
  x: number,
  y: number,
  maxWidth: number,
  fontSize: number,
  lineHeight: number,
  align: "left" | "center" | "right",
): TextLayer {
  return {
    id: "headline",
    type: "text",
    x,
    y,
    maxWidth,
    text: (input.hook ?? "").trim() || "Seu título aqui",
    fontFamily: input.displayFont,
    fontSize,
    fontWeight: 700,
    color: "#FFFFFF",
    align,
    lineHeight,
    letterSpacing: input.typographyStyle === "condensed-bold" ? 0 : -1,
    textTransform:
      input.typographyStyle === "condensed-bold" || input.typographyStyle === "sans-chunky"
        ? "uppercase"
        : "none",
    highlight: resolveHighlight(input.hook, input.highlightWord),
    highlightColor: input.palette.highlight,
  };
}

function ctaLayer(
  input: CompositionInput,
  x: number,
  y: number,
  fontSize: number,
): TextLayer {
  const cta = (input.cta ?? "").trim();
  return {
    id: "cta",
    type: "text",
    x,
    y,
    text: cta ? `${cta} →` : "Saiba mais →",
    fontFamily: input.displayFont,
    fontSize,
    fontWeight: 700,
    color: input.palette.support,
    align: "left",
    lineHeight: 1.1,
  };
}

function pushSignature(
  layers: Layer[],
  input: CompositionInput,
  x: number,
  y: number,
): void {
  if (input.signature && input.signature !== "Sua Marca") {
    layers.push({
      id: "signature",
      type: "text",
      x,
      y,
      text: input.signature.toUpperCase(),
      fontFamily: input.displayFont,
      fontSize: 24,
      fontWeight: 700,
      color: "#FFFFFF",
      align: "left",
      lineHeight: 1.2,
      letterSpacing: 5,
      textTransform: "uppercase",
    });
  }
}

function pushBadge(layers: Layer[], input: CompositionInput, W: number): void {
  if (input.category) {
    layers.push({
      id: "badge",
      type: "pill",
      x: W - 260,
      y: 52,
      text: input.category,
      bg: input.palette.primary,
      color: "#FFFFFF",
      fontFamily: input.displayFont,
      fontSize: 16,
      paddingX: 22,
      paddingY: 9,
    });
  }
}

// ─── Seletor de template ────────────────────────────────────────────

type TemplateFn = (input: CompositionInput, W: number, H: number) => Layer[];

// Cada estilo tipográfico prefere um conjunto de templates compatíveis.
const TEMPLATES_BY_STYLE: Record<CompositionInput["typographyStyle"], TemplateFn[]> = {
  "serif-elegant": [editorialBottom, centeredVignette, topStrip],
  "italic-refined": [editorialBottom, centeredVignette],
  "sans-modern": [topStrip, editorialBottom, centeredVignette],
  "sans-tech": [topStrip, sidePanel],
  "sans-chunky": [sidePanel, centeredVignette],
  "condensed-bold": [sidePanel, centeredVignette, editorialBottom],
};

/**
 * Constrói a composição escolhendo um template determinístico pelo seed.
 * Posts do mesmo nicho variam de layout; reabrir o mesmo post é estável.
 */
export function buildComposition(input: CompositionInput): LayerComposition {
  const isStory = input.format === "story";
  const W = 1080;
  const H = isStory ? 1920 : 1080;

  const candidates = TEMPLATES_BY_STYLE[input.typographyStyle] ?? [editorialBottom];
  const idx = input.seed ? hashSeed(input.seed) % candidates.length : 0;
  const template = candidates[idx];

  return {
    canvasWidth: W,
    canvasHeight: H,
    layers: template(input, W, H),
  };
}
