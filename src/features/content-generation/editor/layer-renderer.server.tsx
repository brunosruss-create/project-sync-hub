// Renderiza a composição do editor (foto base + camadas) em PNG final via Satori.
// Usado quando o cliente aprova o post editado, antes de enviar pro Social_Publishing_Module.

import satori from "satori";
import { Resvg } from "@resvg/resvg-js";
import type { ReactElement } from "react";
import { loadFonts } from "../fonts/font-loader.server";
import type { Layer, LayerComposition } from "./layer-types";

export interface RenderLayersInput {
  imageUrl: string;
  composition: LayerComposition;
  fontsToLoad?: string[];
}

export async function renderComposition(input: RenderLayersInput): Promise<Buffer> {
  const { canvasWidth, canvasHeight, layers } = input.composition;

  // Detecta fontes usadas nas camadas de texto/pill.
  const fontNames = new Set<string>();
  for (const layer of layers) {
    if (
      layer.type === "text" ||
      layer.type === "pill" ||
      layer.type === "button" ||
      layer.type === "card"
    ) {
      fontNames.add(layer.fontFamily);
    }
  }
  if (input.fontsToLoad) for (const f of input.fontsToLoad) fontNames.add(f);
  const fonts = await loadFonts(Array.from(fontNames));

  const element: ReactElement = (
    <div
      style={{
        width: canvasWidth,
        height: canvasHeight,
        display: "flex",
        position: "relative",
        backgroundColor: "#000",
      }}
    >
      <img
        src={input.imageUrl}
        width={canvasWidth}
        height={canvasHeight}
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          width: canvasWidth,
          height: canvasHeight,
          objectFit: "cover",
        }}
      />
      {layers.map((layer) => renderLayer(layer))}
    </div>
  );

  const svg = await satori(element, {
    width: canvasWidth,
    height: canvasHeight,
    fonts: fonts.map((f) => ({
      name: f.name,
      data: f.data,
      weight: f.weight,
      style: f.style,
    })),
    embedFont: true,
  });

  const resvg = new Resvg(svg, {
    fitTo: { mode: "width", value: canvasWidth },
    font: { loadSystemFonts: false },
  });
  return resvg.render().asPng();
}

function renderLayer(layer: Layer): ReactElement {
  if (layer.type === "text") {
    // Destaque inline: quebra em palavras e colore as que fazem parte do
    // trecho destacado, mantendo o fluxo natural com flexWrap.
    if (layer.highlight) {
      const highlightWords = new Set(
        layer.highlight
          .toLowerCase()
          .split(/\s+/)
          .map((w) => w.replace(/[^\wáàâãéèêíïóôõöúçñ$]/gi, "")),
      );
      const words = layer.text.split(/\s+/);
      return (
        <div
          key={layer.id}
          style={{
            position: "absolute",
            left: layer.x,
            top: layer.y,
            fontFamily: layer.fontFamily,
            fontSize: layer.fontSize,
            fontWeight: layer.fontWeight,
            lineHeight: layer.lineHeight,
            letterSpacing: layer.letterSpacing ?? 0,
            textTransform: layer.textTransform ?? "none",
            maxWidth: layer.maxWidth ?? 980,
            display: "flex",
            flexWrap: "wrap",
          }}
        >
          {words.map((word, i) => {
            const clean = word.replace(/[^\wáàâãéèêíïóôõöúçñ$]/gi, "").toLowerCase();
            const isHi = highlightWords.has(clean);
            return (
              <span
                key={i}
                style={{
                  color: isHi ? (layer.highlightColor ?? "#F59E0B") : layer.color,
                  marginRight: layer.fontSize * 0.26,
                }}
              >
                {word}
              </span>
            );
          })}
        </div>
      );
    }
    return (
      <div
        key={layer.id}
        style={{
          position: "absolute",
          left: layer.x,
          top: layer.y,
          fontFamily: layer.fontFamily,
          fontSize: layer.fontSize,
          fontWeight: layer.fontWeight,
          color: layer.color,
          lineHeight: layer.lineHeight,
          letterSpacing: layer.letterSpacing ?? 0,
          textTransform: layer.textTransform ?? "none",
          textAlign: layer.align ?? "left",
          maxWidth: layer.maxWidth ?? 980,
          display: "flex",
          whiteSpace: "pre-wrap",
        }}
      >
        {layer.text}
      </div>
    );
  }

  if (layer.type === "pill") {
    return (
      <div
        key={layer.id}
        style={{
          position: "absolute",
          left: layer.x,
          top: layer.y,
          display: "flex",
          alignSelf: "flex-start",
          paddingLeft: layer.paddingX,
          paddingRight: layer.paddingX,
          paddingTop: layer.paddingY,
          paddingBottom: layer.paddingY,
          backgroundColor: layer.bg,
          color: layer.color,
          fontFamily: layer.fontFamily,
          fontSize: layer.fontSize,
          fontWeight: 700,
          letterSpacing: layer.letterSpacing ?? 4,
          textTransform: "uppercase",
          borderRadius: layer.radius ?? 999,
        }}
      >
        {layer.text}
      </div>
    );
  }

  if (layer.type === "rect") {
    const dir = layer.gradientDirection ?? "to bottom";
    // Satori não aceita a keyword "transparent" em gradiente — usa rgba 0.
    const from = layer.gradientFrom ?? "rgba(0,0,0,0)";
    const bg = `linear-gradient(${dir}, ${from} 0%, ${layer.bg} 100%)`;
    return (
      <div
        key={layer.id}
        style={{
          position: "absolute",
          left: layer.x,
          top: layer.y,
          width: layer.width,
          height: layer.height,
          ...(layer.gradient
            ? { backgroundImage: bg }
            : { backgroundColor: layer.bg }),
          opacity: layer.opacity ?? 1,
          borderRadius: layer.radius ?? 0,
          display: "flex",
        }}
      />
    );
  }

  if (layer.type === "line") {
    return (
      <div
        key={layer.id}
        style={{
          position: "absolute",
          left: layer.x,
          top: layer.y,
          width: layer.width,
          height: layer.height,
          backgroundColor: layer.color,
          borderRadius: 4,
          display: "flex",
        }}
      />
    );
  }

  if (layer.type === "button") {
    return (
      <div
        key={layer.id}
        style={{
          position: "absolute",
          left: layer.x,
          top: layer.y,
          display: "flex",
          alignSelf: "flex-start",
          paddingLeft: layer.paddingX,
          paddingRight: layer.paddingX,
          paddingTop: layer.paddingY,
          paddingBottom: layer.paddingY,
          backgroundColor: layer.bg,
          color: layer.color,
          fontFamily: layer.fontFamily,
          fontSize: layer.fontSize,
          fontWeight: 700,
          borderRadius: layer.radius,
        }}
      >
        {layer.text}
      </div>
    );
  }

  if (layer.type === "image") {
    return (
      <img
        key={layer.id}
        src={layer.url}
        width={layer.width}
        height={layer.height}
        style={{
          position: "absolute",
          left: layer.x,
          top: layer.y,
          width: layer.width,
          height: layer.height,
          objectFit: layer.fit ?? "contain",
          borderRadius: layer.radius ?? 0,
        }}
      />
    );
  }

  if (layer.type === "card") {
    const iconD = Math.round(layer.height * 0.5);
    return (
      <div
        key={layer.id}
        style={{
          position: "absolute",
          left: layer.x,
          top: layer.y,
          width: layer.width,
          height: layer.height,
          backgroundColor: layer.bg,
          opacity: layer.opacity ?? 1,
          borderRadius: layer.radius,
          display: "flex",
          alignItems: "center",
          paddingLeft: 22,
          paddingRight: 22,
        }}
      >
        {layer.iconDataUri ? (
          <div
            style={{
              width: iconD,
              height: iconD,
              borderRadius: 999,
              backgroundColor: layer.iconBg ?? "rgba(255,255,255,0.12)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              marginRight: 18,
              flexShrink: 0,
            }}
          >
            <img
              src={layer.iconDataUri}
              width={Math.round(iconD * 0.56)}
              height={Math.round(iconD * 0.56)}
            />
          </div>
        ) : null}
        <div style={{ display: "flex", flexDirection: "column", flex: 1 }}>
          <div
            style={{
              fontFamily: layer.fontFamily,
              fontSize: Math.round(layer.height * 0.26),
              fontWeight: 700,
              color: layer.titleColor,
              lineHeight: 1.2,
              display: "flex",
            }}
          >
            {layer.title}
          </div>
          {layer.text ? (
            <div
              style={{
                fontFamily: layer.fontFamily,
                fontSize: Math.round(layer.height * 0.2),
                color: layer.textColor,
                lineHeight: 1.25,
                marginTop: 3,
                display: "flex",
              }}
            >
              {layer.text}
            </div>
          ) : null}
        </div>
      </div>
    );
  }

  return <div key="unknown" style={{ display: "none" }} />;
}
