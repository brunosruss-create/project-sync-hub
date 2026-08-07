// Motor de composição rica — gera criativos em camadas no estilo agência
// (BestContent/Canva): pareamento de fontes automático, preço em destaque,
// badges de ocasião/categoria, botão de CTA, logo e overlay com a cor da marca.
//
// O cliente NUNCA escolhe fonte. O sistema aplica um TRIO de fontes por nicho:
//   - displayFont: título (impactante)
//   - accentFont:  preço/números (condensada, alta)
//   - bodyFont:    detalhes, badges, urgência (limpa)
//
// A escolha do arranjo (overlay bottom / side / vinheta) é determinística por
// seed, então posts do mesmo nicho variam mas reabrir é estável.

import type { Layer, LayerComposition, TextLayer } from "./layer-types";

export interface CompositionInput {
  format: "single" | "carousel" | "story";
  hook: string;
  cta: string;
  signature: string;
  category?: string;
  /** Campos estruturados da oferta (extraídos pela IA). */
  occasion?: string;
  priceText?: string;
  offerLabel?: string;
  urgency?: string;
  logoUrl?: string | null;
  palette: {
    primary: string;
    secondary: string;
    support: string;
    accent: string;
    highlight: string;
  };
  displayFont: string;
  bodyFont: string;
  typographyStyle:
    | "serif-elegant"
    | "sans-chunky"
    | "sans-modern"
    | "sans-tech"
    | "condensed-bold"
    | "italic-refined";
  highlightWord?: string;
  seed?: string;
}

const STOPWORDS = new Set([
  "não", "nao", "de", "da", "do", "a", "o", "e", "ou", "que", "com", "para",
  "por", "em", "no", "na", "os", "as", "um", "uma", "se", "sua", "seu", "the",
]);

/** Fonte condensada/impactante pra preços e números, por estilo do nicho. */
function accentFontFor(style: CompositionInput["typographyStyle"]): string {
  switch (style) {
    case "serif-elegant":
    case "italic-refined":
      return "Oswald";
    case "sans-tech":
      return "Oswald";
    case "sans-chunky":
    case "condensed-bold":
      return "Bebas Neue";
    default:
      return "Bebas Neue";
  }
}

function resolveHighlight(hook: string, raw?: string): string | undefined {
  const h = (raw ?? "").trim();
  if (!h) return undefined;
  const allStop = h.split(/\s+/).every((w) => STOPWORDS.has(w.toLowerCase()));
  if (allStop) return undefined;
  if (!hook.toLowerCase().includes(h.toLowerCase())) return undefined;
  return h;
}

function hashSeed(seed: string): number {
  let h = 0;
  for (let i = 0; i < seed.length; i++) {
    h = (h * 31 + seed.charCodeAt(i)) & 0xffffffff;
  }
  return Math.abs(h);
}

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

// ─── Bloco vertical empilhado (headline + oferta + preço + urgência + CTA) ──

interface StackBlock {
  height: number;
  gapAfter: number;
  build: (y: number) => Layer[];
}

/**
 * Constrói o bloco de conteúdo empilhado, ancorado numa região. Retorna as
 * camadas + a altura total ocupada (pra dimensionar o overlay).
 */
function buildContentStack(
  input: CompositionInput,
  opts: {
    x: number;
    usableWidth: number;
    align: "left" | "center";
    headlineBase: number;
    accentFont: string;
  },
): StackBlock[] {
  const { x, usableWidth, align, headlineBase, accentFont } = opts;
  const hook = (input.hook ?? "").trim() || "Seu título aqui";
  const hasPrice = !!(input.priceText && input.priceText.trim());

  // Headline menor quando há preço (pra dar espaço ao número gigante).
  const hlBase = hasPrice ? Math.round(headlineBase * 0.72) : headlineBase;
  const hlSize = adaptiveHeadlineSize(hook.length, hlBase);
  const hlLh = 1.08;
  const hlLines = estimateLines(hook.length, hlSize, usableWidth);
  const hlHeight = Math.round(hlLines * hlSize * hlLh);

  const blocks: StackBlock[] = [];

  // 1. Headline (displayFont)
  blocks.push({
    height: hlHeight,
    gapAfter: hasPrice ? 20 : 24,
    build: (y) => [
      {
        id: "headline",
        type: "text",
        x,
        y,
        maxWidth: usableWidth,
        text: hook,
        fontFamily: input.displayFont,
        fontSize: hlSize,
        fontWeight: 700,
        color: "#FFFFFF",
        align,
        lineHeight: hlLh,
        letterSpacing: input.typographyStyle === "condensed-bold" ? 0 : -1,
        textTransform:
          input.typographyStyle === "condensed-bold" ||
          input.typographyStyle === "sans-chunky"
            ? "uppercase"
            : "none",
        highlight: resolveHighlight(hook, input.highlightWord),
        highlightColor: input.palette.highlight,
      },
    ],
  });

  // 2. offerLabel (bodyFont, médio) — ex: "Corte + Escova"
  const offer = (input.offerLabel ?? "").trim();
  if (offer) {
    const size = 34;
    blocks.push({
      height: Math.round(size * 1.2),
      gapAfter: 2,
      build: (y) => [
        {
          id: "offer-label",
          type: "text",
          x,
          y,
          maxWidth: usableWidth,
          text: offer,
          fontFamily: input.bodyFont,
          fontSize: size,
          fontWeight: 700,
          color: "#FFFFFF",
          align,
          lineHeight: 1.15,
        },
      ],
    });
  }

  // 3. priceText (accentFont, GIGANTE, cor de destaque) — ex: "R$ 49,90"
  if (hasPrice) {
    const size = 120;
    blocks.push({
      height: Math.round(size * 0.92),
      gapAfter: 14,
      build: (y) => [
        {
          id: "price",
          type: "text",
          x,
          // accentFont (Bebas/Oswald) tem muito espaço superior; sobe um pouco
          y: y - Math.round(size * 0.12),
          maxWidth: usableWidth,
          text: input.priceText!.trim(),
          fontFamily: accentFont,
          fontSize: size,
          fontWeight: 700,
          color: input.palette.highlight,
          align,
          lineHeight: 1,
          letterSpacing: 1,
        },
      ],
    });
  }

  // 4. urgency (bodyFont, pequeno) — ex: "Somente nesta quinta-feira"
  const urgency = (input.urgency ?? "").trim();
  if (urgency) {
    const size = 24;
    blocks.push({
      height: Math.round(size * 1.3),
      gapAfter: 24,
      build: (y) => [
        {
          id: "urgency",
          type: "text",
          x,
          y,
          maxWidth: usableWidth,
          text: urgency.toUpperCase(),
          fontFamily: input.bodyFont,
          fontSize: size,
          fontWeight: 700,
          color: "#FFFFFF",
          align,
          lineHeight: 1.2,
          letterSpacing: 2,
          textTransform: "uppercase",
        },
      ],
    });
  } else {
    // Linha de acento decorativa se não houver urgência
    blocks.push({
      height: 5,
      gapAfter: 26,
      build: (y) => [
        {
          id: "accent-line",
          type: "line",
          x: align === "center" ? Math.round(x + usableWidth / 2 - 55) : x,
          y,
          width: 110,
          height: 5,
          color: input.palette.support,
        },
      ],
    });
  }

  // 5. CTA como BOTÃO de verdade
  const cta = (input.cta ?? "").trim() || "Saiba mais";
  const ctaFs = 26;
  const ctaH = ctaFs + 28;
  blocks.push({
    height: ctaH,
    gapAfter: 0,
    build: (y) => [
      {
        id: "cta",
        type: "button",
        x,
        y,
        text: cta,
        bg: input.palette.support,
        color: "#0A0A0A",
        fontFamily: input.bodyFont,
        fontSize: ctaFs,
        paddingX: 30,
        paddingY: 14,
        radius: 999,
      },
    ],
  });

  return blocks;
}

/** Posiciona os blocos a partir de um topo (cursor descendente). */
function layoutStack(blocks: StackBlock[], topY: number): Layer[] {
  const out: Layer[] = [];
  let cursor = topY;
  for (const b of blocks) {
    out.push(...b.build(cursor));
    cursor += b.height + b.gapAfter;
  }
  return out;
}

// ─── Badges e logo (elementos comuns) ───────────────────────────────

function badge(
  id: string,
  text: string,
  x: number,
  y: number,
  bg: string,
  font: string,
): Layer {
  return {
    id,
    type: "pill",
    x,
    y,
    text,
    bg,
    color: "#FFFFFF",
    fontFamily: font,
    fontSize: 18,
    paddingX: 22,
    paddingY: 10,
  };
}

function logoOrSignature(
  input: CompositionInput,
  W: number,
  H: number,
  align: "left" | "center",
): Layer[] {
  if (input.logoUrl) {
    const size = 96;
    return [
      {
        id: "logo",
        type: "image",
        url: input.logoUrl,
        x: align === "center" ? Math.round(W / 2 - size / 2) : 64,
        y: H - size - 48,
        width: size,
        height: size,
        fit: "contain",
        radius: 12,
      },
    ];
  }
  if (input.signature && input.signature !== "Sua Marca") {
    return [
      {
        id: "signature",
        type: "text",
        x: align === "center" ? 80 : 64,
        y: H - 84,
        maxWidth: W - 160,
        text: input.signature.toUpperCase(),
        fontFamily: input.bodyFont,
        fontSize: 24,
        fontWeight: 700,
        color: "#FFFFFF",
        align,
        lineHeight: 1.2,
        letterSpacing: 5,
        textTransform: "uppercase",
      },
    ];
  }
  return [];
}

function topBadges(input: CompositionInput, W: number): Layer[] {
  const out: Layer[] = [];
  // Ocasião tem prioridade de destaque (cor de suporte, canto esquerdo).
  if (input.occasion && input.occasion.trim()) {
    out.push(
      badge(
        "occasion-badge",
        input.occasion.trim().toUpperCase(),
        64,
        56,
        input.palette.support,
        input.bodyFont,
      ),
    );
  }
  if (input.category) {
    out.push(
      badge(
        "category-badge",
        input.category.toUpperCase(),
        W - 60 - input.category.length * 13 - 44,
        56,
        input.palette.primary,
        input.bodyFont,
      ),
    );
  }
  return out;
}

// ─── Templates (variam o OVERLAY, mantêm o stack rico) ──────────────

type TemplateFn = (input: CompositionInput, W: number, H: number) => Layer[];

function withStack(
  input: CompositionInput,
  W: number,
  H: number,
  overlay: Layer,
  overlayTopFn: (blockTop: number) => Layer[],
  align: "left" | "center",
): Layer[] {
  const accentFont = accentFontFor(input.typographyStyle);
  const PAD = 64;
  const usableWidth = W - PAD * 2;
  const headlineBase = H > W ? 84 : 74;
  const blocks = buildContentStack(input, {
    x: PAD,
    usableWidth,
    align,
    headlineBase,
    accentFont,
  });

  const totalHeight = blocks.reduce(
    (s, b, i, arr) => s + b.height + (i < arr.length - 1 ? b.gapAfter : 0),
    0,
  );
  const bottomReserve = input.logoUrl ? 168 : input.signature !== "Sua Marca" ? 120 : 56;
  const blockTop = H - bottomReserve - totalHeight;

  const layers: Layer[] = [];
  layers.push(overlay);
  layers.push(...overlayTopFn(blockTop));
  layers.push(...topBadges(input, W));
  layers.push(...layoutStack(blocks, blockTop));
  layers.push(...logoOrSignature(input, W, H, align));
  return layers;
}

// Editorial: gradiente inferior com a cor accent da marca.
function editorialBottom(input: CompositionInput, W: number, H: number): Layer[] {
  return withStack(
    input,
    W,
    H,
    // overlay placeholder (recalculado abaixo via overlayTopFn); usamos um full
    // darken sutil pra coesão + gradiente é adicionado no topFn.
    {
      id: "tint",
      type: "rect",
      x: 0,
      y: 0,
      width: W,
      height: H,
      bg: input.palette.accent,
      opacity: 0.18,
    },
    (blockTop) => {
      const top = Math.max(0, blockTop - 200);
      return [
        {
          id: "overlay",
          type: "rect",
          x: 0,
          y: top,
          width: W,
          height: H - top,
          bg: input.palette.accent,
          opacity: 0.92,
          gradient: true,
          gradientDirection: "to bottom",
        },
      ];
    },
    "left",
  );
}

// Painel lateral: gradiente da esquerda com cor sólida.
function sidePanel(input: CompositionInput, W: number, H: number): Layer[] {
  return withStack(
    input,
    W,
    H,
    {
      id: "overlay",
      type: "rect",
      x: 0,
      y: 0,
      width: Math.round(W * 0.9),
      height: H,
      bg: input.palette.accent,
      opacity: 0.92,
      gradient: true,
      gradientDirection: "to left",
    },
    () => [],
    "left",
  );
}

// Vinheta central: escurece a imagem toda, texto centralizado.
function centeredVignette(input: CompositionInput, W: number, H: number): Layer[] {
  return withStack(
    input,
    W,
    H,
    {
      id: "overlay",
      type: "rect",
      x: 0,
      y: 0,
      width: W,
      height: H,
      bg: input.palette.accent,
      opacity: 0.6,
    },
    () => [],
    "center",
  );
}

const TEMPLATES_BY_STYLE: Record<CompositionInput["typographyStyle"], TemplateFn[]> = {
  "serif-elegant": [editorialBottom, centeredVignette],
  "italic-refined": [editorialBottom, centeredVignette],
  "sans-modern": [editorialBottom, sidePanel],
  "sans-tech": [sidePanel, editorialBottom],
  "sans-chunky": [sidePanel, centeredVignette],
  "condensed-bold": [sidePanel, editorialBottom],
};

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
