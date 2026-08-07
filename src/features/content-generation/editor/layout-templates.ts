// Motor de composição de criativos — gera layouts GENUINAMENTE distintos por
// post, mantendo a identidade da marca (paleta, fontes, logo) consistente.
//
// Princípio: identidade = cores/fontes/logo consistentes. Variedade = ESTRUTURA
// (onde o texto vive, o fundo, a composição, presença ou não de badge).
//
// Cada post sorteia um ARQUÉTIPO de layout via seed determinístico. Arquétipos
// diferem de verdade: rodapé editorial, painel lateral sólido, herói central,
// faixas topo+base, card inferior. Alguns têm badge, outros não.

import type { Layer, LayerComposition, CardLayer } from "./layer-types";
import { iconDataUri } from "./icons";

export interface CompositionInput {
  format: "single" | "carousel" | "story";
  hook: string;
  cta: string;
  signature: string;
  category?: string;
  occasion?: string;
  priceText?: string;
  offerLabel?: string;
  urgency?: string;
  subheadline?: string;
  bullets?: { icon: string; text: string }[];
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

function accentFontFor(style: CompositionInput["typographyStyle"]): string {
  switch (style) {
    case "sans-chunky":
    case "condensed-bold":
      return "Bebas Neue";
    default:
      return "Oswald";
  }
}

function resolveHighlight(hook: string, raw?: string): string | undefined {
  const h = (raw ?? "").trim();
  if (!h) return undefined;
  if (h.split(/\s+/).every((w) => STOPWORDS.has(w.toLowerCase()))) return undefined;
  if (!hook.toLowerCase().includes(h.toLowerCase())) return undefined;
  return h;
}

function hashSeed(seed: string): number {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) & 0xffffffff;
  return Math.abs(h);
}

function isUpper(style: CompositionInput["typographyStyle"]): boolean {
  return style === "condensed-bold" || style === "sans-chunky";
}

// Largura aproximada de caractere por fonte (fração do fontSize).
function charWidthFactor(font: string): number {
  if (font === "Bebas Neue") return 0.4;
  if (font === "Oswald") return 0.46;
  return 0.55;
}

function estimateLines(text: string, fontSize: number, width: number, font: string): number {
  const perLine = Math.max(6, Math.floor(width / (fontSize * charWidthFactor(font))));
  return Math.min(5, Math.max(1, Math.ceil(text.length / perLine)));
}

/** Maior fontSize que faz o texto (1 linha) caber na largura. */
function fitOneLine(text: string, width: number, font: string, max: number, min: number): number {
  if (!text) return min;
  const size = Math.floor(width / (Math.max(1, text.length) * charWidthFactor(font)));
  return Math.max(min, Math.min(max, size));
}

// ─── Pilha de conteúdo (headline → oferta → preço → urgência → CTA) ─────

interface Block {
  height: number;
  gapAfter: number;
  build: (y: number) => Layer[];
}

interface StackOpts {
  x: number;
  width: number;
  align: "left" | "center";
  displayFont: string;
  bodyFont: string;
  accentFont: string;
  headlineMax: number;
  textColor: string;
  highlightColor: string;
  supportColor: string;
  upper: boolean;
  highlightWord?: string;
}

function contentStack(input: CompositionInput, o: StackOpts): Block[] {
  const hook = (input.hook ?? "").trim() || "Seu título aqui";
  const hasPrice = !!input.priceText?.trim();
  const blocks: Block[] = [];

  // Headline
  const hlMax = hasPrice ? Math.round(o.headlineMax * 0.72) : o.headlineMax;
  const hlSize =
    hook.length <= 24 ? hlMax : hook.length <= 44 ? Math.round(hlMax * 0.8) : Math.round(hlMax * 0.64);
  const hlLh = 1.08;
  const hlLines = estimateLines(hook, hlSize, o.width, o.displayFont);
  blocks.push({
    height: Math.round(hlLines * hlSize * hlLh),
    gapAfter: hasPrice ? 18 : 22,
    build: (y) => [
      {
        id: "headline",
        type: "text",
        x: o.x,
        y,
        maxWidth: o.width,
        text: hook,
        fontFamily: o.displayFont,
        fontSize: hlSize,
        fontWeight: 700,
        color: o.textColor,
        align: o.align,
        lineHeight: hlLh,
        letterSpacing: -0.5,
        highlight: resolveHighlight(hook, o.highlightWord),
        highlightColor: o.highlightColor,
      },
    ],
  });

  // offerLabel
  const offer = (input.offerLabel ?? "").trim();
  if (offer) {
    const size = 32;
    blocks.push({
      height: Math.round(size * 1.2),
      gapAfter: hasPrice ? 0 : 10,
      build: (y) => [
        {
          id: "offer",
          type: "text",
          x: o.x,
          y,
          maxWidth: o.width,
          text: offer,
          fontFamily: o.bodyFont,
          fontSize: size,
          fontWeight: 700,
          color: o.textColor,
          align: o.align,
          lineHeight: 1.15,
        },
      ],
    });
  }

  // priceText (gigante, cabe na largura)
  if (hasPrice) {
    const price = input.priceText!.trim();
    const size = fitOneLine(price, o.width, o.accentFont, 130, 60);
    blocks.push({
      height: Math.round(size * 0.92),
      gapAfter: 12,
      build: (y) => [
        {
          id: "price",
          type: "text",
          x: o.x,
          y: y - Math.round(size * 0.1),
          maxWidth: o.width,
          text: price,
          fontFamily: o.accentFont,
          fontSize: size,
          fontWeight: 700,
          color: o.highlightColor,
          align: o.align,
          lineHeight: 1,
          letterSpacing: 1,
        },
      ],
    });
  }

  // urgency OU linha de acento
  const urgency = (input.urgency ?? "").trim();
  if (urgency) {
    const size = 22;
    blocks.push({
      height: Math.round(size * 1.3),
      gapAfter: 22,
      build: (y) => [
        {
          id: "urgency",
          type: "text",
          x: o.x,
          y,
          maxWidth: o.width,
          text: urgency.toUpperCase(),
          fontFamily: o.bodyFont,
          fontSize: size,
          fontWeight: 700,
          color: o.textColor,
          align: o.align,
          lineHeight: 1.2,
          letterSpacing: 2,
          textTransform: "uppercase",
        },
      ],
    });
  } else {
    blocks.push({
      height: 4,
      gapAfter: 22,
      build: (y) => [
        {
          id: "accent-line",
          type: "line",
          x: o.align === "center" ? Math.round(o.x + o.width / 2 - 50) : o.x,
          y,
          width: 100,
          height: 4,
          color: o.supportColor,
        },
      ],
    });
  }

  // CTA botão
  const cta = (input.cta ?? "").trim() || "Saiba mais";
  const ctaFs = 24;
  blocks.push({
    height: ctaFs + 26,
    gapAfter: 0,
    build: (y) => {
      const btn: Layer = {
        id: "cta",
        type: "button",
        x: o.align === "center" ? Math.round(o.x + o.width / 2 - (cta.length * ctaFs * 0.34)) : o.x,
        y,
        text: cta,
        bg: o.supportColor,
        color: "#0A0A0A",
        fontFamily: o.bodyFont,
        fontSize: ctaFs,
        paddingX: 28,
        paddingY: 13,
        radius: 999,
      };
      return [btn];
    },
  });

  return blocks;
}

function stackHeight(blocks: Block[]): number {
  return blocks.reduce((s, b, i, a) => s + b.height + (i < a.length - 1 ? b.gapAfter : 0), 0);
}

function placeStack(blocks: Block[], topY: number): Layer[] {
  const out: Layer[] = [];
  let cursor = topY;
  for (const b of blocks) {
    out.push(...b.build(cursor));
    cursor += b.height + b.gapAfter;
  }
  return out;
}

// ─── Elementos de marca (badge opcional, logo) ──────────────────────

function tag(input: CompositionInput, x: number, y: number, bg: string): Layer | null {
  const text = (input.occasion?.trim() || input.category?.trim() || "").toUpperCase();
  if (!text) return null;
  return {
    id: "badge",
    type: "pill",
    x,
    y,
    text,
    bg,
    color: "#FFFFFF",
    fontFamily: input.bodyFont,
    fontSize: 17,
    paddingX: 18,
    paddingY: 9,
    radius: 6,
    letterSpacing: 3,
  };
}

function logo(input: CompositionInput, x: number, y: number, size = 84): Layer | null {
  if (!input.logoUrl) return null;
  return {
    id: "logo",
    type: "image",
    url: input.logoUrl,
    x,
    y,
    width: size,
    height: size,
    fit: "contain",
    radius: 10,
  };
}

function signature(input: CompositionInput, x: number, y: number, align: "left" | "center", w: number): Layer | null {
  if (!input.signature || input.signature === "Sua Marca") return null;
  return {
    id: "signature",
    type: "text",
    x,
    y,
    maxWidth: w,
    text: input.signature.toUpperCase(),
    fontFamily: input.bodyFont,
    fontSize: 22,
    fontWeight: 700,
    color: "#FFFFFF",
    align,
    lineHeight: 1.2,
    letterSpacing: 5,
    textTransform: "uppercase",
  };
}

function brandMark(input: CompositionInput, x: number, y: number, align: "left" | "center", w: number): Layer[] {
  const l = logo(input, x, y);
  if (l) return [l];
  const s = signature(input, x, y + 20, align, w);
  return s ? [s] : [];
}

// ─── Arquétipos de layout (genuinamente diferentes) ─────────────────

type Archetype = (input: CompositionInput, W: number, H: number) => Layer[];

const PAD = 72;

// 1) Rodapé editorial — foto cheia, gradiente na base, texto embaixo à esquerda. SEM badge.
const editorialBottom: Archetype = (input, W, H) => {
  const width = W - PAD * 2;
  const blocks = contentStack(input, {
    x: PAD, width, align: "left",
    displayFont: input.displayFont, bodyFont: input.bodyFont, accentFont: accentFontFor(input.typographyStyle),
    headlineMax: H > W ? 92 : 76, textColor: "#FFFFFF", highlightColor: input.palette.highlight,
    supportColor: input.palette.support, upper: isUpper(input.typographyStyle), highlightWord: input.highlightWord,
  });
  const sh = stackHeight(blocks);
  const bottomReserve = 60;
  const topY = H - bottomReserve - sh;
  const gradTop = Math.max(0, topY - 200);
  const layers: Layer[] = [
    { id: "grad", type: "rect", x: 0, y: gradTop, width: W, height: H - gradTop, bg: input.palette.accent, opacity: 0.9, gradient: true, gradientDirection: "to bottom" },
    ...placeStack(blocks, topY),
  ];
  const bm = brandMark(input, PAD, gradTop - 90, "left", width);
  return [...layers, ...bm];
};

// 2) Painel lateral sólido — bloco de cor à esquerda com todo o texto, foto à direita. COM badge.
const solidSidePanel: Archetype = (input, W, H) => {
  const panelW = Math.round(W * (H > W ? 1 : 0.52));
  const innerX = 56;
  const width = panelW - innerX * 2;
  const blocks = contentStack(input, {
    x: innerX, width, align: "left",
    displayFont: input.displayFont, bodyFont: input.bodyFont, accentFont: accentFontFor(input.typographyStyle),
    headlineMax: H > W ? 88 : 64, textColor: "#FFFFFF", highlightColor: input.palette.highlight,
    supportColor: input.palette.support, upper: isUpper(input.typographyStyle), highlightWord: input.highlightWord,
  });
  const sh = stackHeight(blocks);
  const layers: Layer[] = [
    { id: "panel", type: "rect", x: 0, y: 0, width: panelW, height: H, bg: input.palette.accent, opacity: 0.94 },
    // leve gradiente na borda do painel pra fundir com a foto
    { id: "panel-fade", type: "rect", x: panelW - 60, y: 0, width: 120, height: H, bg: input.palette.accent, opacity: 0.94, gradient: true, gradientDirection: "to right" },
  ];
  const badge = tag(input, innerX, 70, input.palette.support);
  const topY = Math.round((H - sh) / 2) + 20;
  if (badge) layers.push(badge);
  layers.push(...placeStack(blocks, topY));
  layers.push(...brandMark(input, innerX, H - 120, "left", width));
  return layers;
};

// 3) Herói central — escurece a foto toda, tudo centralizado, tipografia grande. SEM badge.
const centeredHero: Archetype = (input, W, H) => {
  const width = W - PAD * 2;
  const blocks = contentStack(input, {
    x: PAD, width, align: "center",
    displayFont: input.displayFont, bodyFont: input.bodyFont, accentFont: accentFontFor(input.typographyStyle),
    headlineMax: H > W ? 100 : 82, textColor: "#FFFFFF", highlightColor: input.palette.highlight,
    supportColor: input.palette.support, upper: isUpper(input.typographyStyle), highlightWord: input.highlightWord,
  });
  const sh = stackHeight(blocks);
  const topY = Math.round((H - sh) / 2);
  const layers: Layer[] = [
    { id: "scrim", type: "rect", x: 0, y: 0, width: W, height: H, bg: input.palette.accent, opacity: 0.55 },
    ...placeStack(blocks, topY),
  ];
  layers.push(...brandMark(input, Math.round(W / 2 - 42), H - 130, "center", width));
  return layers;
};

// 4) Faixas topo + base — faixa de marca no topo (com badge), foto no meio, texto na base sólida.
const bandedFrame: Archetype = (input, W, H) => {
  const width = W - PAD * 2;
  const accent = accentFontFor(input.typographyStyle);
  const blocks = contentStack(input, {
    x: PAD, width, align: "left",
    displayFont: input.displayFont, bodyFont: input.bodyFont, accentFont: accent,
    headlineMax: H > W ? 80 : 66, textColor: "#FFFFFF", highlightColor: input.palette.highlight,
    supportColor: input.palette.support, upper: isUpper(input.typographyStyle), highlightWord: input.highlightWord,
  });
  const sh = stackHeight(blocks);
  const topStripH = 120;
  const bottomBandH = sh + 90;
  const layers: Layer[] = [
    { id: "top-strip", type: "rect", x: 0, y: 0, width: W, height: topStripH, bg: input.palette.accent, opacity: 1 },
    { id: "bottom-band", type: "rect", x: 0, y: H - bottomBandH, width: W, height: bottomBandH, bg: input.palette.accent, opacity: 0.96 },
  ];
  // topo: marca à esquerda + badge à direita
  const bm = brandMark(input, PAD, 26, "left", 400);
  layers.push(...bm);
  const badge = tag(input, W - PAD - 220, 42, input.palette.support);
  if (badge) layers.push(badge);
  layers.push(...placeStack(blocks, H - bottomBandH + 45));
  return layers;
};

// 5) Card inferior — foto cheia em cima, card arredondado de cor na base com o conteúdo. COM badge pequeno.
const bottomCard: Archetype = (input, W, H) => {
  const cardMargin = 48;
  const innerX = cardMargin + 40;
  const width = W - innerX * 2;
  const blocks = contentStack(input, {
    x: innerX, width, align: "left",
    displayFont: input.displayFont, bodyFont: input.bodyFont, accentFont: accentFontFor(input.typographyStyle),
    headlineMax: H > W ? 78 : 62, textColor: "#FFFFFF", highlightColor: input.palette.highlight,
    supportColor: input.palette.support, upper: isUpper(input.typographyStyle), highlightWord: input.highlightWord,
  });
  const sh = stackHeight(blocks);
  const cardPad = 44;
  const cardH = sh + cardPad * 2;
  const cardY = H - cardMargin - cardH;
  const layers: Layer[] = [
    { id: "card", type: "rect", x: cardMargin, y: cardY, width: W - cardMargin * 2, height: cardH, bg: input.palette.accent, opacity: 0.95, radius: 28 },
  ];
  const badge = tag(input, innerX, cardY - 52, input.palette.support);
  if (badge) layers.push(badge);
  layers.push(...placeStack(blocks, cardY + cardPad));
  const l = logo(input, W - cardMargin - 110, cardY + 24, 64);
  if (l) layers.push(l);
  return layers;
};

// Título dramático (tamanhos misturados, top-heavy) — o que dá cara de design.
// Divide o hook em "antes / PALAVRA-CHAVE gigante / depois" empilhados.
function dramaticHeadline(
  input: CompositionInput,
  x: number,
  topY: number,
  width: number,
  heroMax: number,
  medSize: number,
): { layers: Layer[]; endY: number } {
  const hook = (input.hook ?? "").trim() || "Seu título aqui";
  const df = input.displayFont;
  const out: Layer[] = [];
  let y = topY;
  const hi = resolveHighlight(hook, input.highlightWord);

  const pushLine = (id: string, text: string, size: number, color: string, upper: boolean) => {
    const lines = estimateLines(text, size, width, df);
    out.push({
      id, type: "text", x, y, maxWidth: width, text,
      fontFamily: df, fontSize: size, fontWeight: 700, color,
      align: "left", lineHeight: 1.02, letterSpacing: upper ? 1 : -1,
      textTransform: upper ? "uppercase" : "none",
    });
    y += Math.round(lines * size * 1.02) + Math.round(size * 0.06);
  };

  if (hi) {
    const idx = hook.toLowerCase().indexOf(hi.toLowerCase());
    const before = hook.slice(0, idx).trim();
    const after = hook.slice(idx + hi.length).trim();
    if (before) pushLine("hl-before", before, medSize, "#FFFFFF", true);
    const heroSize = fitOneLine(hi, width, df, heroMax, Math.round(heroMax * 0.5));
    pushLine("hl-hero", hi, heroSize, input.palette.highlight, false);
    if (after) pushLine("hl-after", after, medSize, "#FFFFFF", true);
  } else {
    // Sem palavra-chave: primeira palavra pequena, resto grande.
    const words = hook.split(/\s+/);
    if (words.length >= 3) {
      pushLine("hl-a", words.slice(0, 1).join(" "), medSize, "#FFFFFF", true);
      pushLine("hl-b", words.slice(1).join(" "), Math.round(heroMax * 0.62), input.palette.highlight, false);
    } else {
      pushLine("hl-b", hook, Math.round(heroMax * 0.62), "#FFFFFF", false);
    }
  }

  // Divisória decorativa sob o título.
  out.push({ id: "hl-divider", type: "line", x, y: y + 6, width: 120, height: 5, color: input.palette.support });
  y += 24;
  return { layers: out, endY: y };
}

// 6) Editorial dramático — título grande no topo, FOTO respira no meio,
// features + preço + CTA embaixo sobre gradiente. Moldura + selo. Distribuição
// no estilo das peças de agência (náutico/GERU), não painel chapado.
const premiumInfo: Archetype = (input, W, H) => {
  const isStory = H > W;
  const accent = accentFontFor(input.typographyStyle);
  const fm = 26; // margem da moldura
  const PADX = 62;
  const width = W - PADX * 2;
  const layers: Layer[] = [];

  // Gradiente no topo (escuro em cima → transparente) pra legibilidade do título.
  const topH = Math.round(H * (isStory ? 0.44 : 0.5));
  layers.push({
    id: "top-grad", type: "rect", x: 0, y: 0, width: W, height: topH,
    bg: input.palette.accent, opacity: 0.92, gradient: true, gradientDirection: "to top",
  });
  // Gradiente na base (transparente → escuro) pras features/CTA.
  const botH = isStory ? 860 : 620;
  layers.push({
    id: "bot-grad", type: "rect", x: 0, y: H - botH, width: W, height: botH,
    bg: input.palette.accent, opacity: 0.94, gradient: true, gradientDirection: "to bottom",
  });

  // Badge de ocasião/categoria (topo).
  const badge = tag(input, PADX, fm + 22, input.palette.support);
  let headTop = fm + 26;
  if (badge) {
    layers.push(badge);
    headTop = fm + 92;
  }

  // Título dramático (top-heavy).
  const heroMax = isStory ? 132 : 108;
  const medSize = isStory ? 50 : 42;
  const dh = dramaticHeadline(input, PADX, headTop, width, heroMax, medSize);
  layers.push(...dh.layers);

  // Subtítulo logo abaixo do título (se houver e couber no topo).
  const sub = (input.subheadline ?? "").trim();
  if (sub && dh.endY < topH - 40) {
    const subSize = isStory ? 26 : 22;
    layers.push({
      id: "subheadline", type: "text", x: PADX, y: dh.endY, maxWidth: width, text: sub,
      fontFamily: input.bodyFont, fontSize: subSize, fontWeight: 400, color: "rgba(255,255,255,0.85)",
      align: "left", lineHeight: 1.3,
    });
  }

  // ── Base: features (ícone + texto, sem caixa) + preço + CTA ──
  const ctaH = 56;
  const ctaY = H - fm - 34 - ctaH;
  const featureH = isStory ? 66 : 58;
  const fgap = 14;
  const maxF = isStory ? 4 : 3;
  const bullets = (input.bullets ?? []).slice(0, maxF);
  const price = (input.priceText ?? "").trim();

  const featuresTotal = bullets.length * (featureH + fgap);
  let fy = ctaY - 30 - featuresTotal;

  // Features como card de fundo transparente (só ícone + texto, estilo agência).
  for (const b of bullets) {
    layers.push({
      id: `feat-${layers.length}`, type: "card", x: PADX, y: fy, width, height: featureH,
      bg: "rgba(255,255,255,0)", radius: 0, iconBg: input.palette.support,
      iconDataUri: iconDataUri(b.icon, "#0A0A0A", 24),
      title: b.text, text: undefined, titleColor: "#FFFFFF", textColor: "rgba(255,255,255,0.75)",
      fontFamily: input.bodyFont,
    } as CardLayer);
    fy += featureH + fgap;
  }

  // CTA botão (base, esquerda).
  const cta = (input.cta ?? "").trim() || "Saiba mais";
  layers.push({
    id: "cta", type: "button", x: PADX, y: ctaY, text: cta, bg: input.palette.support, color: "#0A0A0A",
    fontFamily: input.bodyFont, fontSize: 24, paddingX: 30, paddingY: 14, radius: 999,
  });

  // Preço grande na MESMA linha do CTA, alinhado à direita (não colide).
  if (price) {
    const pW = Math.round(width * 0.46);
    const pSize = fitOneLine(price, pW, accent, isStory ? 92 : 78, 48);
    layers.push({
      id: "price", type: "text", x: W - PADX - pW, y: ctaY + Math.round((ctaH - pSize) / 2) - 6,
      maxWidth: pW, text: price, fontFamily: accent, fontSize: pSize, fontWeight: 700,
      color: input.palette.highlight, align: "right", lineHeight: 1, letterSpacing: 1,
    });
  }

  // Logo/selo no topo direito (sobre a foto).
  const l = logo(input, W - PADX - 70, fm + 20, 70);
  if (l) layers.push(l);

  // Moldura fina por cima de tudo.
  layers.push({
    id: "frame", type: "rect", x: fm, y: fm, width: W - fm * 2, height: H - fm * 2,
    bg: "rgba(0,0,0,0)", borderColor: input.palette.support, borderWidth: 3, radius: 10,
  });

  return layers;
};

const ARCHETYPES: Archetype[] = [
  editorialBottom,
  solidSidePanel,
  centeredHero,
  bandedFrame,
  bottomCard,
];

export function buildComposition(input: CompositionInput): LayerComposition {
  const isStory = input.format === "story";
  const W = 1080;
  const H = isStory ? 1920 : 1080;

  // Se a IA gerou bullets concretos, o layout premium (cards com ícone) é o
  // que mais se aproxima do nível agência — priorizamos ele, alternando com
  // um arquétipo de variedade pelo seed.
  const hasBullets = (input.bullets?.length ?? 0) >= 2;
  // Com bullets → painel dividido premium (nunca cobre o rosto).
  // Sem bullets → arquétipos que mantêm o texto embaixo/no card, longe do rosto.
  const pool: Archetype[] = hasBullets
    ? [premiumInfo]
    : [editorialBottom, bandedFrame, bottomCard];

  const idx = input.seed ? hashSeed(input.seed) % pool.length : 0;
  const archetype = pool[idx] ?? ARCHETYPES[0];
  return { canvasWidth: W, canvasHeight: H, layers: archetype(input, W, H) };
}
