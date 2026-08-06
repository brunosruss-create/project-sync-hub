// Template Promo 01 — proporção 1:1 (feed 1080x1080).
// Layout moderno: imagem à direita ocupando 60% + coluna de texto à esquerda
// com hierarquia clara (marca no topo → headline grande → preço em destaque
// → CTA discreto no rodapé com underline animado).

import type { ReactElement } from "react";
import { registerTemplate, type TemplateProps } from "../registry";

const WIDTH = 1080;
const HEIGHT = 1080;

function Promo01_1x1({ brandKit, slots }: TemplateProps): ReactElement {
  const headline = slots.headline ?? "Oferta especial";
  const subheadline = slots.subheadline ?? "";
  const price = slots.price ?? "";
  const cta = slots.ctaLabel ?? "Aproveitar";
  const imageUrl = slots.imageUrl;
  const signature = brandKit.defaultSignature || "SUA MARCA";

  return (
    <div
      style={{
        width: WIDTH,
        height: HEIGHT,
        display: "flex",
        flexDirection: "row",
        backgroundColor: "#FFFFFF",
        fontFamily: brandKit.bodyFont,
      }}
    >
      {/* Coluna texto — 45% */}
      <div
        style={{
          width: 486,
          height: HEIGHT,
          display: "flex",
          flexDirection: "column",
          padding: "60px 50px",
          backgroundColor: brandKit.secondaryColor,
          color: "#FFFFFF",
          position: "relative",
        }}
      >
        {/* Assinatura no topo */}
        <div
          style={{
            fontSize: 22,
            fontWeight: 600,
            letterSpacing: 4,
            textTransform: "uppercase",
            opacity: 0.7,
            display: "flex",
          }}
        >
          {signature}
        </div>

        {/* Meio: bloco central alinhado */}
        <div
          style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
          }}
        >
          {/* Selo colorido em cima do headline */}
          <div
            style={{
              display: "flex",
              paddingLeft: 18,
              paddingRight: 18,
              paddingTop: 6,
              paddingBottom: 6,
              backgroundColor: brandKit.primaryColor,
              borderRadius: 999,
              fontFamily: brandKit.displayFont,
              fontSize: 18,
              fontWeight: 700,
              letterSpacing: 3,
              textTransform: "uppercase",
              width: "fit-content",
              marginBottom: 22,
            }}
          >
            Oferta
          </div>

          <div
            style={{
              fontFamily: brandKit.displayFont,
              fontSize: 60,
              fontWeight: 700,
              lineHeight: 1.05,
              marginBottom: 20,
              display: "flex",
            }}
          >
            {headline}
          </div>

          {subheadline ? (
            <div
              style={{
                fontSize: 20,
                lineHeight: 1.4,
                opacity: 0.75,
                marginBottom: 30,
                display: "flex",
              }}
            >
              {subheadline}
            </div>
          ) : null}

          {price ? (
            <div style={{ display: "flex", flexDirection: "column", marginTop: 8 }}>
              <div
                style={{
                  fontSize: 14,
                  fontWeight: 500,
                  opacity: 0.6,
                  letterSpacing: 2,
                  textTransform: "uppercase",
                  marginBottom: 4,
                }}
              >
                A partir de
              </div>
              <div
                style={{
                  fontFamily: brandKit.displayFont,
                  fontSize: 90,
                  fontWeight: 700,
                  lineHeight: 1,
                  color: brandKit.primaryColor,
                  display: "flex",
                }}
              >
                {price}
              </div>
            </div>
          ) : null}
        </div>

        {/* Rodapé: CTA com sublinhado colorido */}
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div
            style={{
              fontFamily: brandKit.displayFont,
              fontSize: 26,
              fontWeight: 700,
              display: "flex",
              marginBottom: 8,
            }}
          >
            {cta}
          </div>
          <div
            style={{
              width: 80,
              height: 3,
              backgroundColor: brandKit.supportColor,
              display: "flex",
            }}
          />
        </div>
      </div>

      {/* Coluna imagem — 55% */}
      <div
        style={{
          width: WIDTH - 486,
          height: HEIGHT,
          display: "flex",
          position: "relative",
          backgroundColor: brandKit.secondaryColor,
        }}
      >
        {imageUrl ? (
          <img
            src={imageUrl}
            width={WIDTH - 486}
            height={HEIGHT}
            style={{
              width: WIDTH - 486,
              height: HEIGHT,
              objectFit: "cover",
            }}
          />
        ) : (
          <div
            style={{
              width: WIDTH - 486,
              height: HEIGHT,
              display: "flex",
              backgroundColor: brandKit.primaryColor,
              opacity: 0.3,
            }}
          />
        )}
      </div>
    </div>
  );
}

registerTemplate({
  id: "promo-01-1x1",
  category: "promo",
  ratio: "1:1",
  width: WIDTH,
  height: HEIGHT,
  slots: ["headline", "subheadline", "imageUrl", "price", "ctaLabel"],
  retired: false,
  component: Promo01_1x1,
});
