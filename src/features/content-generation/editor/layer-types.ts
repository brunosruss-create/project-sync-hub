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
 * Gera composição inicial de camadas usando os dados do CopyBundle + BrandKit.
 * Emula o layout dos templates atuais, mas cada elemento agora é uma camada
 * editável no editor.
 */
export function buildInitialComposition(input: {
  format: "single" | "carousel" | "story";
  hook: string;
  cta: string;
  signature: string;
  primaryColor: string;
  secondaryColor: string;
  supportColor: string;
  displayFont: string;
  bodyFont: string;
  category?: string;
}): LayerComposition {
  const isStory = input.format === "story";
  const W = 1080;
  const H = isStory ? 1920 : 1080;

  const layers: Layer[] = [];

  // Assinatura no topo
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

  // Badge de categoria (canto superior direito)
  if (input.category) {
    layers.push({
      id: "badge",
      type: "pill",
      x: W - 220,
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

  // Overlay escuro na base (pra legibilidade)
  layers.push({
    id: "overlay",
    type: "rect",
    x: 0,
    y: isStory ? 1200 : 640,
    width: W,
    height: isStory ? 720 : 440,
    bg: input.secondaryColor,
    opacity: 0.75,
  });

  // Headline gigante
  layers.push({
    id: "headline",
    type: "text",
    x: 60,
    y: isStory ? 1360 : 730,
    maxWidth: W - 120,
    text: input.hook,
    fontFamily: input.displayFont,
    fontSize: isStory ? 92 : 78,
    fontWeight: 700,
    color: "#FFFFFF",
    align: "left",
    lineHeight: 1.05,
    letterSpacing: -1,
  });

  // Linha decorativa
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
