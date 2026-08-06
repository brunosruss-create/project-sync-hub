// Template Depoimento 01 — 1080x1080. Layout de review/testimonial:
//   • Aspas decorativas gigantes no topo
//   • Quote centralizado com destaque
//   • Card do cliente na base: foto redonda + nome + 5 estrelas
// Referência: cards de review de e-commerce.

import type { ReactElement } from "react";
import { registerTemplate, type TemplateProps } from "../registry";
import {
  brandSignature,
  brandSig,
  circlePhoto,
  accentLine,
} from "../primitives";

const WIDTH = 1080;
const HEIGHT = 1080;

function Depoimento01_1x1({ brandKit, slots }: TemplateProps): ReactElement {
  const quote = slots.headline ?? "A melhor experiência que já tive!";
  const author = slots.authorName ?? "Cliente satisfeito";
  const signature = brandSig(brandKit);

  return (
    <div
      style={{
        width: WIDTH,
        height: HEIGHT,
        display: "flex",
        flexDirection: "column",
        backgroundColor: "#FFFFFF",
        fontFamily: brandKit.bodyFont,
        position: "relative",
      }}
    >
      {/* Header sutil */}
      <div
        style={{
          display: "flex",
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "40px 60px 0",
        }}
      >
        {brandSignature({
          text: signature,
          color: brandKit.secondaryColor,
          fontFamily: brandKit.displayFont,
          fontSize: 18,
        })}
        <div
          style={{
            display: "flex",
            fontSize: 14,
            fontWeight: 600,
            color: brandKit.primaryColor,
            letterSpacing: 4,
            textTransform: "uppercase",
          }}
        >
          Depoimento
        </div>
      </div>

      {/* Bloco de quote */}
      <div
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          alignItems: "center",
          paddingLeft: 90,
          paddingRight: 90,
          textAlign: "center",
        }}
      >
        {/* Aspas gigantes decorativas */}
        <div
          style={{
            fontFamily: brandKit.displayFont,
            fontSize: 240,
            fontWeight: 700,
            lineHeight: 0.6,
            color: brandKit.primaryColor,
            display: "flex",
            marginBottom: 20,
          }}
        >
          &ldquo;
        </div>

        {/* Quote */}
        <div
          style={{
            fontFamily: brandKit.displayFont,
            fontSize: 52,
            fontWeight: 700,
            lineHeight: 1.2,
            color: brandKit.secondaryColor,
            marginBottom: 24,
            display: "flex",
          }}
        >
          {quote}
        </div>

        {/* 5 estrelas */}
        <div style={{ display: "flex", flexDirection: "row", gap: 6, marginBottom: 30 }}>
          {["★", "★", "★", "★", "★"].map((s, i) => (
            <div
              key={i}
              style={{
                fontSize: 40,
                color: brandKit.supportColor,
                display: "flex",
                lineHeight: 1,
              }}
            >
              {s}
            </div>
          ))}
        </div>
      </div>

      {/* Card do cliente na base */}
      <div
        style={{
          display: "flex",
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "center",
          padding: "30px 60px 50px",
        }}
      >
        {circlePhoto({
          url: slots.imageUrl,
          size: 100,
          borderColor: brandKit.primaryColor,
          borderWidth: 4,
          fallbackBg: brandKit.primaryColor,
        })}
        <div
          style={{
            marginLeft: 20,
            display: "flex",
            flexDirection: "column",
          }}
        >
          <div
            style={{
              fontSize: 26,
              fontWeight: 700,
              color: brandKit.secondaryColor,
              display: "flex",
            }}
          >
            {author}
          </div>
          <div style={{ marginTop: 6, display: "flex" }}>
            {accentLine({ color: brandKit.primaryColor, width: 40, height: 3 })}
          </div>
          <div
            style={{
              fontSize: 14,
              color: brandKit.secondaryColor,
              opacity: 0.55,
              letterSpacing: 2,
              textTransform: "uppercase",
              marginTop: 6,
              display: "flex",
              fontWeight: 600,
            }}
          >
            Cliente verificado
          </div>
        </div>
      </div>
    </div>
  );
}

registerTemplate({
  id: "depoimento-01-1x1",
  category: "depoimento",
  ratio: "1:1",
  width: WIDTH,
  height: HEIGHT,
  slots: ["headline", "authorName", "imageUrl"],
  retired: false,
  component: Depoimento01_1x1,
});
