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

  // Overlay escuro na base (pra legibilidade do texto sobre a foto)
  layers.push({
    id: "overlay",
    type: "rect",
    x: 0,
    y: isStory ? 1200 : 640,
    width: W,
    height: isStory ? 720 : 440,
    bg: input.secondaryColor,
    opacity: 0.7,
  });

  // Headline: se tem highlightWord, quebra em 2 camadas (texto + palavra colorida).
  // Se não tem, uma camada só.
  const headlineY = isStory ? 1360 : 730;
  const headlineFontSize = isStory ? 92 : 78;
  if (input.highlightWord && input.hook.toLowerCase().includes(input.highlightWord.toLowerCase())) {
    const idx = input.hook.toLowerCase().indexOf(input.highlightWord.toLowerCase());
    const before = input.hook.slice(0, idx).trim();
    const highlight = input.hook.slice(idx, idx + input.highlightWord.length);
    const after = input.hook.slice(idx + input.highlightWord.length).trim();

    if (before) {
      layers.push({
        id: "headline-before",
        type: "text",
        x: 60,
        y: headlineY,
        maxWidth: W - 120,
        text: before,
        fontFamily: input.displayFont,
        fontSize: headlineFontSize,
        fontWeight: 700,
        color: "#FFFFFF",
        align: "left",
        lineHeight: 1.05,
        letterSpacing: -1,
      });
    }
    layers.push({
      id: "headline-highlight",
      type: "text",
      x: 60,
      y: before ? headlineY + Math.round(headlineFontSize * 1.1) : headlineY,
      maxWidth: W - 120,
      text: highlight,
      fontFamily: input.displayFont,
      fontSize: headlineFontSize,
      fontWeight: 700,
      color: input.highlightColor ?? input.supportColor,
      align: "left",
      lineHeight: 1.05,
      letterSpacing: -1,
    });
    if (after) {
      layers.push({
        id: "headline-after",
        type: "text",
        x: 60,
        y: headlineY + Math.round(headlineFontSize * 2.2),
        maxWidth: W - 120,
        text: after,
        fontFamily: input.displayFont,
        fontSize: headlineFontSize,
        fontWeight: 700,
        color: "#FFFFFF",
        align: "left",
        lineHeight: 1.05,
        letterSpacing: -1,
      });
    }
  } else {
    layers.push({
      id: "headline",
      type: "text",
      x: 60,
      y: headlineY,
      maxWidth: W - 120,
      text: input.hook,
      fontFamily: input.displayFont,
      fontSize: headlineFontSize,
      fontWeight: 700,
      color: "#FFFFFF",
      align: "left",
      lineHeight: 1.05,
      letterSpacing: -1,
    });
  }

  // Linha decorativa (acento)
  layers.push({
    id: "accent-line",
    type: "line",
    x: 60,
    y: isStory ? 1640 : 890,
    width: 90,
    height: 4,
    color: input.supportColor,
  });

  // CTA na base
  layers.push({
    id: "cta",
    type: "text",
    x: 60,
    y: isStory ? 1700 : 950,
    text: `${input.cta} →`,
    fontFamily: input.displayFont,
    fontSize: 30,
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
