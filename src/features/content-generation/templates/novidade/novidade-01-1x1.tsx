// Template Novidade 01 — 1080x1080. Layout de lançamento:
//   • Fundo colorido com "NOVO" grande decorativo
//   • Foto em card com borda + inclinação implícita (via posicionamento)
//   • Título + subtítulo + CTA sutil

import type { ReactElement } from "react";
import { registerTemplate, type TemplateProps } from "../registry";
import {
  pillBadge,
  brandSignature,
  brandSig,
  framedPhoto,
  accentLine,
} from "../primitives";

const WIDTH = 1080;
const HEIGHT = 1080;

function Novidade01_1x1({ brandKit, slots }: TemplateProps): ReactElement {
  const headline = slots.headline ?? "Chegou novidade!";
  const subheadline = slots.subheadline ?? "";
  const cta = slots.ctaLabel ?? "Ver detalhes";
  const signature = brandSig(brandKit);

  return (
    <div
      style={{
        width: WIDTH,
        height: HEIGHT,
        display: "flex",
        flexDirection: "row",
        backgroundColor: brandKit.primaryColor,
        fontFamily: brandKit.bodyFont,
        position: "relative",
      }}
    >
      {/* Fundo decorativo — "NOVO" gigante quase transparente */}
      <div
        style={{
          position: "absolute",
          top: -30,
          left: -40,
          fontFamily: brandKit.displayFont,
          fontSize: 480,
          fontWeight: 700,
          color: "#FFFFFF",
          opacity: 0.08,
          lineHeight: 0.9,
          display: "flex",
          letterSpacing: -30,
        }}
      >
        NOVO
      </div>

      {/* Coluna esquerda: conteúdo */}
      <div
        style={{
          width: 560,
          height: HEIGHT,
          padding: "60px 50px",
          display: "flex",
          flexDirection: "column",
          color: "#FFFFFF",
          position: "relative",
        }}
      >
        <div style={{ display: "flex" }}>
          {brandSignature({
            text: signature,
            color: "#FFFFFF",
            fontFamily: brandKit.displayFont,
            fontSize: 20,
          })}
        </div>

        <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center" }}>
          <div style={{ marginBottom: 28, display: "flex" }}>
            {pillBadge({
              text: "Lançamento",
              bgColor: brandKit.supportColor,
              textColor: brandKit.secondaryColor,
              fontFamily: brandKit.displayFont,
            })}
          </div>
          <div
            style={{
              fontFamily: brandKit.displayFont,
              fontSize: 78,
              fontWeight: 700,
              lineHeight: 1.02,
              marginBottom: 22,
              display: "flex",
              letterSpacing: -1,
            }}
          >
            {headline}
          </div>
          {subheadline ? (
            <div
              style={{
                fontSize: 24,
                lineHeight: 1.4,
                opacity: 0.9,
                maxWidth: 460,
                display: "flex",
              }}
            >
              {subheadline}
            </div>
          ) : null}
        </div>

        {/* CTA na base com seta */}
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ marginBottom: 16, display: "flex" }}>
            {accentLine({ color: brandKit.supportColor, width: 60, height: 5 })}
          </div>
          <div
            style={{
              fontFamily: brandKit.displayFont,
              fontSize: 30,
              fontWeight: 700,
              display: "flex",
            }}
          >
            {cta} →
          </div>
        </div>
      </div>

      {/* Coluna direita: foto emoldurada */}
      <div
        style={{
          flex: 1,
          height: HEIGHT,
          padding: 40,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {framedPhoto({
          url: slots.imageUrl,
          width: 440,
          height: 560,
          borderColor: "#FFFFFF",
          borderWidth: 8,
          borderRadius: 24,
          fallbackBg: brandKit.secondaryColor,
        })}
      </div>
    </div>
  );
}

registerTemplate({
  id: "novidade-01-1x1",
  category: "novidade",
  ratio: "1:1",
  width: WIDTH,
  height: HEIGHT,
  slots: ["headline", "subheadline", "imageUrl", "ctaLabel"],
  retired: false,
  component: Novidade01_1x1,
});
