// Template Catálogo 01 — 1080x1080. Card de produto:
//   • Foto grande centralizada com fundo neutro
//   • Nome + descrição + preço destacado
//   • Duração/tempo como badge secundário
//   • CTA pill inferior

import type { ReactElement } from "react";
import { registerTemplate, type TemplateProps } from "../registry";
import {
  brandSignature,
  brandSig,
  framedPhoto,
  outlineBadge,
  accentLine,
} from "../primitives";

const WIDTH = 1080;
const HEIGHT = 1080;

function Catalogo01_1x1({ brandKit, slots }: TemplateProps): ReactElement {
  const name = slots.headline ?? "Nosso serviço";
  const description = slots.description ?? slots.subheadline ?? "";
  const price = slots.price ?? "";
  const duration = slots.duration ?? "";
  const cta = slots.ctaLabel ?? "Agendar agora";
  const signature = brandSig(brandKit);

  return (
    <div
      style={{
        width: WIDTH,
        height: HEIGHT,
        display: "flex",
        flexDirection: "column",
        backgroundColor: "#FAFAF9",
        fontFamily: brandKit.bodyFont,
      }}
    >
      {/* Header */}
      <div
        style={{
          height: 80,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          paddingLeft: 60,
          paddingRight: 60,
          borderBottomColor: "#E5E5E1",
          borderBottomWidth: 1,
          borderBottomStyle: "solid",
        }}
      >
        {brandSignature({
          text: signature,
          color: brandKit.secondaryColor,
          fontFamily: brandKit.displayFont,
          fontSize: 20,
        })}
        <div style={{ display: "flex" }}>
          {outlineBadge({
            text: "Catálogo",
            color: brandKit.primaryColor,
            fontFamily: brandKit.displayFont,
          })}
        </div>
      </div>

      {/* Foto centralizada com moldura */}
      <div
        style={{
          padding: "50px 60px 30px",
          display: "flex",
          justifyContent: "center",
        }}
      >
        {framedPhoto({
          url: slots.imageUrl,
          width: 500,
          height: 400,
          borderColor: brandKit.secondaryColor,
          borderWidth: 4,
          borderRadius: 20,
          fallbackBg: brandKit.primaryColor,
        })}
      </div>

      {/* Info do serviço */}
      <div
        style={{
          flex: 1,
          padding: "0 60px",
          display: "flex",
          flexDirection: "column",
        }}
      >
        <div
          style={{
            fontFamily: brandKit.displayFont,
            fontSize: 54,
            fontWeight: 700,
            lineHeight: 1.05,
            color: brandKit.secondaryColor,
            marginBottom: 10,
            display: "flex",
          }}
        >
          {name}
        </div>

        {description ? (
          <div
            style={{
              fontSize: 22,
              lineHeight: 1.4,
              color: brandKit.secondaryColor,
              opacity: 0.65,
              marginBottom: 18,
              maxWidth: 900,
              display: "flex",
            }}
          >
            {description.slice(0, 140)}
          </div>
        ) : null}

        {/* Faixa: preço + duração */}
        <div
          style={{
            display: "flex",
            flexDirection: "row",
            alignItems: "flex-end",
            marginTop: 10,
          }}
        >
          {price ? (
            <div style={{ display: "flex", flexDirection: "column" }}>
              <div
                style={{
                  fontSize: 12,
                  color: brandKit.secondaryColor,
                  opacity: 0.55,
                  letterSpacing: 3,
                  textTransform: "uppercase",
                  fontWeight: 600,
                  marginBottom: 2,
                  display: "flex",
                }}
              >
                A partir de
              </div>
              <div
                style={{
                  fontFamily: brandKit.displayFont,
                  fontSize: 72,
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
          {duration ? (
            <div
              style={{
                marginLeft: 28,
                marginBottom: 8,
                display: "flex",
                alignItems: "center",
                fontSize: 18,
                color: brandKit.secondaryColor,
                opacity: 0.65,
                fontWeight: 500,
              }}
            >
              • {duration}
            </div>
          ) : null}
        </div>
      </div>

      {/* CTA pill */}
      <div
        style={{
          padding: "30px 60px 50px",
          display: "flex",
          justifyContent: "center",
        }}
      >
        <div
          style={{
            display: "flex",
            paddingLeft: 40,
            paddingRight: 40,
            paddingTop: 22,
            paddingBottom: 22,
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
    </div>
  );
}

registerTemplate({
  id: "catalogo-01-1x1",
  category: "catalogo",
  ratio: "1:1",
  width: WIDTH,
  height: HEIGHT,
  slots: ["headline", "subheadline", "description", "imageUrl", "price", "duration", "ctaLabel"],
  retired: false,
  component: Catalogo01_1x1,
});
