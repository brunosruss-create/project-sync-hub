// Template Promo 01 — proporção 1:1 (feed 1080x1080).
// Layout: fundo com cor primária, imagem à direita, texto e preço à esquerda,
// CTA em faixa inferior com cor de apoio.

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

  return (
    <div
      style={{
        width: WIDTH,
        height: HEIGHT,
        display: "flex",
        flexDirection: "column",
        backgroundColor: brandKit.primaryColor,
        fontFamily: brandKit.bodyFont,
        color: "#FFFFFF",
      }}
    >
      {/* Faixa superior com logo/marca */}
      <div
        style={{
          height: 90,
          display: "flex",
          alignItems: "center",
          paddingLeft: 60,
          paddingRight: 60,
          backgroundColor: brandKit.secondaryColor,
          fontFamily: brandKit.displayFont,
          fontSize: 32,
          fontWeight: 700,
          letterSpacing: 2,
        }}
      >
        {brandKit.defaultSignature || "SUA MARCA"}
      </div>

      {/* Área principal: texto à esquerda + imagem à direita */}
      <div
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "row",
        }}
      >
        {/* Coluna texto */}
        <div
          style={{
            width: 540,
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            paddingLeft: 60,
            paddingRight: 30,
          }}
        >
          <div
            style={{
              fontFamily: brandKit.displayFont,
              fontSize: 72,
              fontWeight: 700,
              lineHeight: 1.05,
              marginBottom: 24,
            }}
          >
            {headline}
          </div>
          {subheadline ? (
            <div
              style={{
                fontSize: 28,
                lineHeight: 1.35,
                opacity: 0.92,
                marginBottom: 24,
              }}
            >
              {subheadline}
            </div>
          ) : null}
          {price ? (
            <div
              style={{
                fontFamily: brandKit.displayFont,
                fontSize: 84,
                fontWeight: 700,
                color: brandKit.supportColor,
                marginTop: 12,
                display: "flex",
              }}
            >
              {price}
            </div>
          ) : null}
        </div>

        {/* Coluna imagem */}
        <div
          style={{
            width: 480,
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            padding: 30,
          }}
        >
          {imageUrl ? (
            <img
              src={imageUrl}
              width={420}
              height={420}
              style={{
                width: 420,
                height: 420,
                objectFit: "cover",
                borderRadius: 32,
              }}
            />
          ) : (
            <div
              style={{
                width: 420,
                height: 420,
                borderRadius: 32,
                backgroundColor: brandKit.secondaryColor,
                display: "flex",
                justifyContent: "center",
                alignItems: "center",
                opacity: 0.4,
              }}
            />
          )}
        </div>
      </div>

      {/* Faixa CTA inferior */}
      <div
        style={{
          height: 120,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: brandKit.supportColor,
          color: brandKit.secondaryColor,
          fontFamily: brandKit.displayFont,
          fontSize: 48,
          fontWeight: 700,
          letterSpacing: 1,
        }}
      >
        {cta}
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
