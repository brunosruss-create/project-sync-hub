// Template Dica 01 — 1080x1080. Layout educativo estilo carrossel:
//   • Fundo colorido dividido em top/bottom
//   • Número "01" gigante como elemento visual
//   • Título forte + descrição
//   • Faixa inferior com marca
// Referência: posts de coach/mentor tipo Ana Beatriz.

import type { ReactElement } from "react";
import { registerTemplate, type TemplateProps } from "../registry";
import { brandSignature, brandSig, accentLine, withAlpha } from "../primitives";

const WIDTH = 1080;
const HEIGHT = 1080;

function Dica01_1x1({ brandKit, slots }: TemplateProps): ReactElement {
  const headline = slots.headline ?? "Dica de ouro pra você";
  const body = slots.description ?? slots.subheadline ?? "";
  const signature = brandSig(brandKit);

  return (
    <div
      style={{
        width: WIDTH,
        height: HEIGHT,
        display: "flex",
        flexDirection: "column",
        backgroundColor: brandKit.secondaryColor,
        fontFamily: brandKit.bodyFont,
        position: "relative",
      }}
    >
      {/* Faixa superior — "DICA" + assinatura */}
      <div
        style={{
          height: 90,
          display: "flex",
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          paddingLeft: 60,
          paddingRight: 60,
          backgroundColor: brandKit.primaryColor,
        }}
      >
        <div
          style={{
            display: "flex",
            fontFamily: brandKit.displayFont,
            fontSize: 22,
            fontWeight: 700,
            letterSpacing: 6,
            textTransform: "uppercase",
            color: "#FFFFFF",
          }}
        >
          Dica rápida
        </div>
        {brandSignature({
          text: signature,
          color: "#FFFFFF",
          fontFamily: brandKit.displayFont,
          fontSize: 18,
        })}
      </div>

      {/* Miolo: número gigante + textos */}
      <div
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "row",
          padding: 60,
          alignItems: "center",
        }}
      >
        {/* Número gigante decorativo */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            marginRight: 40,
          }}
        >
          <div
            style={{
              fontFamily: brandKit.displayFont,
              fontSize: 260,
              fontWeight: 700,
              lineHeight: 0.85,
              color: brandKit.supportColor,
              display: "flex",
              letterSpacing: -8,
            }}
          >
            01
          </div>
          <div style={{ marginTop: 10, display: "flex" }}>
            {accentLine({ color: brandKit.supportColor, width: 60, height: 5 })}
          </div>
        </div>

        {/* Textos */}
        <div
          style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            color: "#FFFFFF",
          }}
        >
          <div
            style={{
              fontFamily: brandKit.displayFont,
              fontSize: 62,
              fontWeight: 700,
              lineHeight: 1.05,
              marginBottom: 24,
              display: "flex",
            }}
          >
            {headline}
          </div>
          {body ? (
            <div
              style={{
                fontSize: 26,
                lineHeight: 1.4,
                opacity: 0.85,
                display: "flex",
              }}
            >
              {body}
            </div>
          ) : null}
        </div>
      </div>

      {/* Rodapé com CTA implícito de swipe */}
      <div
        style={{
          height: 90,
          display: "flex",
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: withAlpha(brandKit.supportColor, 0.15),
          color: brandKit.supportColor,
          fontFamily: brandKit.displayFont,
          fontSize: 22,
          fontWeight: 700,
          letterSpacing: 4,
          textTransform: "uppercase",
        }}
      >
        Salve pra ver depois →
      </div>
    </div>
  );
}

registerTemplate({
  id: "dica-01-1x1",
  category: "dica",
  ratio: "1:1",
  width: WIDTH,
  height: HEIGHT,
  slots: ["headline", "subheadline", "description"],
  retired: false,
  component: Dica01_1x1,
});
