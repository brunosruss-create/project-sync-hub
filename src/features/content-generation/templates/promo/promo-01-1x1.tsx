// Template Promo 01 — 1080x1080. Layout profissional em duas camadas:
//   • Foto full-bleed com gradiente escuro no fundo
//   • Card branco "flutuante" sobreposto com preço em destaque + CTA pill
// Referência visual: cards de e-commerce estilo Boticário/Vivara.

import type { ReactElement } from "react";
import { registerTemplate, type TemplateProps } from "../registry";
import {
  pillBadge,
  brandSignature,
  brandSig,
  fullBleedPhoto,
  withAlpha,
  accentLine,
} from "../primitives";

const WIDTH = 1080;
const HEIGHT = 1080;

function Promo01_1x1({ brandKit, slots }: TemplateProps): ReactElement {
  const headline = slots.headline ?? "Oferta especial";
  const subheadline = slots.subheadline ?? "";
  const price = slots.price ?? "";
  const cta = slots.ctaLabel ?? "Aproveitar agora";
  const signature = brandSig(brandKit);

  return (
    <div
      style={{
        width: WIDTH,
        height: HEIGHT,
        position: "relative",
        display: "flex",
        backgroundColor: brandKit.secondaryColor,
        fontFamily: brandKit.bodyFont,
      }}
    >
      {/* Camada 1: Foto de fundo com overlay escuro em degradê */}
      {fullBleedPhoto({
        url: slots.imageUrl,
        width: WIDTH,
        height: HEIGHT,
        overlayColor: brandKit.secondaryColor,
        overlayOpacity: 0.35,
        fallbackBg: brandKit.secondaryColor,
      })}

      {/* Gradiente escuro no rodapé pra legibilidade */}
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: 0,
          height: 620,
          display: "flex",
          background: `linear-gradient(180deg, ${withAlpha(
            brandKit.secondaryColor,
            0,
          )} 0%, ${withAlpha(brandKit.secondaryColor, 0.95)} 55%)`,
        }}
      />

      {/* Camada 2: assinatura no topo */}
      <div
        style={{
          position: "absolute",
          top: 44,
          left: 50,
          right: 50,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        {brandSignature({
          text: signature,
          color: "#FFFFFF",
          fontFamily: brandKit.displayFont,
          fontSize: 20,
        })}
        {pillBadge({
          text: "Oferta",
          bgColor: brandKit.primaryColor,
          fontFamily: brandKit.displayFont,
        })}
      </div>

      {/* Camada 3: bloco de conteúdo principal */}
      <div
        style={{
          position: "absolute",
          left: 50,
          right: 50,
          bottom: 60,
          display: "flex",
          flexDirection: "column",
          color: "#FFFFFF",
        }}
      >
        {/* Headline gigante */}
        <div
          style={{
            fontFamily: brandKit.displayFont,
            fontSize: 78,
            fontWeight: 700,
            lineHeight: 1.02,
            marginBottom: 22,
            letterSpacing: -1,
            display: "flex",
          }}
        >
          {headline}
        </div>

        {subheadline ? (
          <div
            style={{
              fontSize: 24,
              lineHeight: 1.35,
              opacity: 0.85,
              marginBottom: 28,
              maxWidth: 720,
              display: "flex",
            }}
          >
            {subheadline}
          </div>
        ) : null}

        {/* Faixa inferior: preço à esquerda + CTA à direita */}
        <div
          style={{
            display: "flex",
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            marginTop: 14,
          }}
        >
          {price ? (
            <div
              style={{
                display: "flex",
                flexDirection: "column",
              }}
            >
              <div
                style={{
                  fontSize: 12,
                  fontWeight: 600,
                  opacity: 0.6,
                  letterSpacing: 3,
                  textTransform: "uppercase",
                  marginBottom: 4,
                  display: "flex",
                }}
              >
                A partir de
              </div>
              <div
                style={{
                  fontFamily: brandKit.displayFont,
                  fontSize: 88,
                  fontWeight: 700,
                  lineHeight: 1,
                  color: brandKit.supportColor,
                  display: "flex",
                }}
              >
                {price}
              </div>
            </div>
          ) : (
            <div style={{ display: "flex" }} />
          )}

          {/* CTA como pill grande */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              paddingLeft: 32,
              paddingRight: 32,
              paddingTop: 20,
              paddingBottom: 20,
              backgroundColor: brandKit.primaryColor,
              color: "#FFFFFF",
              fontFamily: brandKit.displayFont,
              fontSize: 26,
              fontWeight: 700,
              borderRadius: 999,
              letterSpacing: 1,
            }}
          >
            {cta} →
          </div>
        </div>

        {/* Linha decorativa no rodapé */}
        <div style={{ marginTop: 26, display: "flex" }}>
          {accentLine({
            color: brandKit.supportColor,
            width: 100,
            height: 4,
          })}
        </div>
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
