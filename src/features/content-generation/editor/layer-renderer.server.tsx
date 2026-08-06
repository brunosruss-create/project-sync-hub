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
    if (layer.type === "text" || layer.type === "pill") {
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
          letterSpacing: layer.letterSpacing,
          textTransform: layer.textTransform ?? "none",
          textAlign: layer.align,
          maxWidth: layer.maxWidth,
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
          letterSpacing: 4,
          textTransform: "uppercase",
          borderRadius: 999,
        }}
      >
        {layer.text}
      </div>
    );
  }

  if (layer.type === "rect") {
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

  return <div key="unknown" style={{ display: "none" }} />;
}
