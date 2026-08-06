// Template Promo 01 — proporção 9:16 (story/reel 1080x1920).
// Layout: imagem de fundo com overlay + texto grande no centro + CTA na base.

import type { ReactElement } from "react";
import { registerTemplate, type TemplateProps } from "../registry";

const WIDTH = 1080;
const HEIGHT = 1920;

function Promo01_9x16({ brandKit, slots }: TemplateProps): ReactElement {
  const headline = slots.headline ?? "Oferta especial";
  const subheadline = slots.subheadline ?? "";
  const price = slots.price ?? "";
  const cta = slots.ctaLabel ?? "Aproveitar";
  const imageUrl = slots.imageUrl;

  return (
    <div
      style={{
        width: WIDTH,
        height: HEIGHT,
        display: "flex",
        flexDirection: "column",
        position: "relative",
        backgroundColor: brandKit.primaryColor,
        fontFamily: brandKit.bodyFont,
        color: "#FFFFFF",
      }}
    >
      {/* Fundo: imagem cobrindo toda a área ou cor primária */}
      {imageUrl ? (
        <img
          src={imageUrl}
          width={WIDTH}
          height={HEIGHT}
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            width: WIDTH,
            height: HEIGHT,
            objectFit: "cover",
          }}
        />
      ) : null}

      {/* Overlay escuro sutil pra legibilidade */}
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          width: WIDTH,
          height: HEIGHT,
          backgroundColor: brandKit.secondaryColor,
          opacity: 0.45,
          display: "flex",
        }}
      />

      {/* Faixa topo com marca */}
      <div
        style={{
          position: "relative",
          height: 160,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: brandKit.displayFont,
          fontSize: 40,
          fontWeight: 700,
          letterSpacing: 3,
          textTransform: "uppercase",
        }}
      >
        {brandKit.defaultSignature || "SUA MARCA"}
      </div>

      {/* Bloco central de texto */}
      <div
        style={{
          position: "relative",
          flex: 1,
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          alignItems: "center",
          paddingLeft: 80,
          paddingRight: 80,
          textAlign: "center",
        }}
      >
        <div
          style={{
            fontFamily: brandKit.displayFont,
            fontSize: 140,
            fontWeight: 700,
            lineHeight: 1.05,
            marginBottom: 40,
            textShadow: "0 4px 20px rgba(0,0,0,0.4)",
          }}
        >
          {headline}
        </div>
        {subheadline ? (
          <div
            style={{
              fontSize: 44,
              lineHeight: 1.3,
              opacity: 0.95,
              marginBottom: 60,
            }}
          >
            {subheadline}
          </div>
        ) : null}
        {price ? (
          <div
            style={{
              fontFamily: brandKit.displayFont,
              fontSize: 160,
              fontWeight: 700,
              color: brandKit.supportColor,
              display: "flex",
            }}
          >
            {price}
          </div>
        ) : null}
      </div>

      {/* CTA na base */}
      <div
        style={{
          position: "relative",
          height: 200,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: brandKit.supportColor,
          color: brandKit.secondaryColor,
          fontFamily: brandKit.displayFont,
          fontSize: 68,
          fontWeight: 700,
          letterSpacing: 2,
          textTransform: "uppercase",
        }}
      >
        {cta}
      </div>
    </div>
  );
}

registerTemplate({
  id: "promo-01-9x16",
  category: "promo",
  ratio: "9:16",
  width: WIDTH,
  height: HEIGHT,
  slots: ["headline", "subheadline", "imageUrl", "price", "ctaLabel"],
  retired: false,
  component: Promo01_9x16,
});
