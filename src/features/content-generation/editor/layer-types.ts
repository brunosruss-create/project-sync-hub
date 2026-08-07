// Camadas editáveis sobrepostas à foto base gerada.
// O canvas do editor renderiza em coordenadas 1080x1080 (feed) ou 1080x1920 (story).
// Ao publicar, o backend re-renderiza tudo via Satori e exporta como PNG final.

export type LayerId = string;

export interface BaseLayer {
  id: LayerId;
  x: number; // px, canto superior-esquerdo
  y: number;
  rotation?: number;
  locked?: boolean;
}

export interface TextLayer extends BaseLayer {
  type: "text";
  text: string;
  fontFamily: string;
  fontSize: number;
  fontWeight: 400 | 700;
  color: string;
  align: "left" | "center" | "right";
  lineHeight: number;
  letterSpacing?: number;
  textTransform?: "none" | "uppercase";
  maxWidth?: number;
  /** Trecho do texto a destacar em cor de acento (inline, no fluxo natural). */
  highlight?: string;
  /** Cor do trecho destacado. */
  highlightColor?: string;
}

export interface PillLayer extends BaseLayer {
  type: "pill";
  text: string;
  bg: string;
  color: string;
  fontFamily: string;
  fontSize: number;
  paddingX: number;
  paddingY: number;
}

export interface RectLayer extends BaseLayer {
  type: "rect";
  width: number;
  height: number;
  bg: string;
  radius?: number;
  opacity?: number;
  /** Se definido, aplica gradiente de transparente → bg. */
  gradient?: boolean;
  /** Direção do gradiente (default: to bottom). */
  gradientDirection?: "to bottom" | "to top" | "to right" | "to left";
  /** Segunda cor do gradiente (default: transparent). Permite gradiente de cor→cor. */
  gradientFrom?: string;
}

export interface LineLayer extends BaseLayer {
  type: "line";
  width: number;
  height: number; // espessura
  color: string;
}

export type Layer = TextLayer | PillLayer | RectLayer | LineLayer;

/** Composição do canvas: dimensões + camadas por cima da foto base. */
export interface LayerComposition {
  canvasWidth: number;
  canvasHeight: number;
  layers: Layer[];
}

// ─── Presets pra inicializar o editor com a copy da IA ─────────────

/**
 * Composição inicial rica — cliente vê o post já montado (estilo BestContent),
 * com hook grande, palavra destacada em cor de acento, badge da categoria,
 * overlay escuro pra legibilidade e assinatura.
 * Todas as camadas são editáveis ou removíveis no editor.
 */
export function buildInitialComposition(input: {
  format: "single" | "carousel" | "story";
  hook: string;
  cta: string;
  signature: string;
  primaryColor: string;
  secondaryColor: string;
  supportColor: string;
  /** Cor pra destacar UMA palavra no hook. */
  highlightColor?: string;
  /** Palavra ou expressão do hook que deve receber cor de destaque. */
  highlightWord?: string;
  displayFont: string;
  bodyFont: string;
  category?: string;
}): LayerComposition {
  const isStory = input.format === "story";
  const W = 1080;
  const H = isStory ? 1920 : 1080;

  const layers: Layer[] = [];

  // Assinatura no topo — só se cliente definiu (não usa placeholder "Sua Marca")
  if (input.signature && input.signature !== "Sua Marca") {
    layers.push({
      id: "signature",
      type: "text",
      x: 60,
      y: 60,
      text: input.signature.toUpperCase(),
      fontFamily: input.displayFont,
      fontSize: 22,
      fontWeight: 700,
      color: "#FFFFFF",
      align: "left",
      lineHeight: 1.2,
      letterSpacing: 5,
      textTransform: "uppercase",
    });
  }

  // Badge de categoria (canto superior direito)
  if (input.category) {
    layers.push({
      id: "badge",
      type: "pill",
      x: W - 240,
      y: 52,
      text: input.category,
      bg: input.primaryColor,
      color: "#FFFFFF",
      fontFamily: input.displayFont,
      fontSize: 16,
      paddingX: 20,
      paddingY: 8,
    });
  }

  // ── Layout ancorado no RODAPÉ (evita colisão de texto) ──
  const PAD = 64;
  const hook = input.hook.trim();

  // Fonte adaptativa: quanto mais longo o hook, menor a fonte.
  const len = hook.length;
  const headlineFontSize = len <= 22 ? 84 : len <= 36 ? 70 : len <= 52 ? 58 : 48;
  const headlineLineHeight = 1.08;

  // Estima quantas linhas o headline vai ocupar (pra reservar altura e não colidir).
  const usableWidth = W - PAD * 2;
  const charsPerLine = Math.max(8, Math.floor(usableWidth / (headlineFontSize * 0.54)));
  const estimatedLines = Math.min(4, Math.max(1, Math.ceil(len / charsPerLine)));
  const headlineHeightPx = Math.round(estimatedLines * headlineFontSize * headlineLineHeight);

  // Alturas dos outros elementos
  const ctaFontSize = 30;
  const ctaHeightPx = Math.round(ctaFontSize * 1.2);
  const accentGap = 26;
  const accentHeight = 5;
  const ctaGap = 30;

  // Bloco inferior (headline + linha + cta) ancorado no rodapé.
  const blockHeight =
    headlineHeightPx + accentGap + accentHeight + ctaGap + ctaHeightPx;
  const blockBottom = H - PAD;
  const blockTop = blockBottom - blockHeight;

  const headlineY = blockTop;
  const accentY = headlineY + headlineHeightPx + accentGap;
  const ctaY = accentY + accentHeight + ctaGap;

  // Overlay em gradiente (transparente no topo → escuro na base) pra
  // legibilidade sem "caixa" retangular dura. Começa acima do bloco.
  const overlayTop = Math.max(0, blockTop - 160);
  layers.push({
    id: "overlay",
    type: "rect",
    x: 0,
    y: overlayTop,
    width: W,
    height: H - overlayTop,
    bg: input.secondaryColor,
    opacity: 0.85,
    gradient: true,
  });

  // Filtra highlightWord se for stopword (não faz sentido destacar "não", "de"...)
  const STOPWORDS = new Set([
    "não", "nao", "de", "da", "do", "a", "o", "e", "ou", "que", "com", "para",
    "por", "em", "no", "na", "os", "as", "um", "uma", "se", "sua", "seu",
  ]);
  const rawHighlight = (input.highlightWord ?? "").trim();
  const highlightIsStopword =
    rawHighlight.length > 0 &&
    rawHighlight.split(/\s+/).every((w) => STOPWORDS.has(w.toLowerCase()));
  const effectiveHighlight =
    rawHighlight && !highlightIsStopword && hook.toLowerCase().includes(rawHighlight.toLowerCase())
      ? rawHighlight
      : undefined;

  // Headline — UMA camada só, com destaque inline (não quebra o fluxo).
  layers.push({
    id: "headline",
    type: "text",
    x: PAD,
    y: headlineY,
    maxWidth: usableWidth,
    text: hook,
    fontFamily: input.displayFont,
    fontSize: headlineFontSize,
    fontWeight: 700,
    color: "#FFFFFF",
    align: "left",
    lineHeight: headlineLineHeight,
    letterSpacing: -1,
    highlight: effectiveHighlight,
    highlightColor: input.highlightColor ?? input.supportColor,
  });

  // Linha decorativa (acento)
  layers.push({
    id: "accent-line",
    type: "line",
    x: PAD,
    y: accentY,
    width: 90,
    height: accentHeight,
    color: input.supportColor,
  });

  // CTA na base
  layers.push({
    id: "cta",
    type: "text",
    x: PAD,
    y: ctaY,
    text: `${input.cta} →`,
    fontFamily: input.displayFont,
    fontSize: ctaFontSize,
    fontWeight: 700,
    color: "#FFFFFF",
    align: "left",
    lineHeight: 1.1,
  });

  return {
    canvasWidth: W,
    canvasHeight: H,
    layers,
  };
}

// ─── Factories pra adicionar novas camadas via botões da toolbar ────

let layerCounter = 0;
function nextId(prefix: string): string {
  layerCounter += 1;
  return `${prefix}-${Date.now()}-${layerCounter}`;
}

export function createTextLayer(input: {
  text: string;
  isStory?: boolean;
  displayFont?: string;
  color?: string;
  size?: "hero" | "large" | "medium" | "small";
}): TextLayer {
  const size = input.size ?? "large";
  const fontSize =
    size === "hero" ? 96 : size === "large" ? 68 : size === "medium" ? 42 : 26;
  const y = input.isStory ? 1350 : 720;
  return {
    id: nextId("text"),
    type: "text",
    x: 60,
    y,
    text: input.text,
    fontFamily: input.displayFont ?? "Montserrat",
    fontSize,
    fontWeight: 700,
    color: input.color ?? "#FFFFFF",
    align: "left",
    lineHeight: 1.1,
    letterSpacing: -1,
    maxWidth: 960,
  };
}

export function createSignatureLayer(input: {
  text: string;
  displayFont?: string;
}): TextLayer {
  return {
    id: nextId("signature"),
    type: "text",
    x: 60,
    y: 60,
    text: input.text.toUpperCase(),
    fontFamily: input.displayFont ?? "Montserrat",
    fontSize: 24,
    fontWeight: 700,
    color: "#FFFFFF",
    align: "left",
    lineHeight: 1.2,
    letterSpacing: 5,
    textTransform: "uppercase",
  };
}

export function createOverlayLayer(input: {
  color: string;
  isStory?: boolean;
}): RectLayer {
  return {
    id: nextId("overlay"),
    type: "rect",
    x: 0,
    y: input.isStory ? 1200 : 640,
    width: 1080,
    height: input.isStory ? 720 : 440,
    bg: input.color,
    opacity: 0.7,
  };
}

export function createAccentLineLayer(input: {
  color: string;
  isStory?: boolean;
}): LineLayer {
  return {
    id: nextId("line"),
    type: "line",
    x: 60,
    y: input.isStory ? 1620 : 880,
    width: 90,
    height: 4,
    color: input.color,
  };
}

export function createBadgeLayer(input: {
  text: string;
  bgColor: string;
  displayFont?: string;
}): PillLayer {
  return {
    id: nextId("badge"),
    type: "pill",
    x: 800,
    y: 52,
    text: input.text,
    bg: input.bgColor,
    color: "#FFFFFF",
    fontFamily: input.displayFont ?? "Montserrat",
    fontSize: 16,
    paddingX: 20,
    paddingY: 8,
  };
}
