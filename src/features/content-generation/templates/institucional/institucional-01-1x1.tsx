// Template Institucional 01 — 1080x1080. Layout editorial:
//   • Foto full-bleed + overlay escuro em degradê
//   • Headline gigante na base
//   • Marca discreta no topo
//   • Barra de acento no lateral esquerdo

import type { ReactElement } from "react";
import { registerTemplate, type TemplateProps } from "../registry";
import {
  fullBleedPhoto,
  brandSignature,
  brandSig,
  accentLine,
  withAlpha,
} from "../primitives";

const WIDTH = 1080;
const HEIGHT = 1080;

function Institucional01_1x1({ brandKit, slots }: TemplateProps): ReactElement {
  const headline = slots.headline ?? "Somos referência";
  const subheadline = slots.subheadline ?? "";
  const signature = brandSig(brandKit);

  return (
    <div
      style={{
        width: WIDTH,
        height: HEIGHT,
        display: "flex",
        position: "relative",
        backgroundColor: brandKit.secondaryColor,
        fontFamily: brandKit.bodyFont,
      }}
    >
      {fullBleedPhoto({
        url: slots.imageUrl,
        width: WIDTH,
        height: HEIGHT,
        overlayColor: brandKit.secondaryColor,
        overlayOpacity: 0.5,
        fallbackBg: brandKit.secondaryColor,
      })}

      {/* Gradiente na base */}
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: 0,
          height: 720,
          display: "flex",
          background: `linear-gradient(180deg, ${withAlpha(
            brandKit.secondaryColor,
            0,
          )} 0%, ${withAlpha(brandKit.secondaryColor, 0.92)} 60%)`,
        }}
      />

      {/* Barra vertical decorativa à esquerda */}
      <div
        style={{
          position: "absolute",
          left: 60,
          top: 300,
          width: 5,
          height: 320,
          backgroundColor: brandKit.supportColor,
          display: "flex",
        }}
      />

      {/* Assinatura no topo */}
      <div
        style={{
          position: "absolute",
          top: 44,
          left: 60,
          right: 60,
          display: "flex",
        }}
      >
        {brandSignature({
          text: signature,
          color: "#FFFFFF",
          fontFamily: brandKit.displayFont,
          fontSize: 20,
        })}
      </div>

      {/* Headline na base */}
      <div
        style={{
          position: "absolute",
          left: 90,
          right: 60,
          bottom: 80,
          display: "flex",
          flexDirection: "column",
          color: "#FFFFFF",
        }}
      >
        <div
          style={{
            fontSize: 12,
            fontWeight: 700,
            color: brandKit.supportColor,
            letterSpacing: 5,
            textTransform: "uppercase",
            marginBottom: 18,
            display: "flex",
          }}
        >
          A gente acredita
        </div>
        <div
          style={{
            fontFamily: brandKit.displayFont,
            fontSize: 90,
            fontWeight: 700,
            lineHeight: 1,
            letterSpacing: -1.5,
            marginBottom: 22,
            maxWidth: 900,
            display: "flex",
          }}
        >
          {headline}
        </div>
        {subheadline ? (
          <div
            style={{
              fontSize: 24,
              lineHeight: 1.45,
              opacity: 0.88,
              maxWidth: 780,
              display: "flex",
            }}
          >
            {subheadline}
          </div>
        ) : null}
        <div style={{ marginTop: 24, display: "flex" }}>
          {accentLine({ color: brandKit.supportColor, width: 90, height: 4 })}
        </div>
      </div>
    </div>
  );
}

registerTemplate({
  id: "institucional-01-1x1",
  category: "institucional",
  ratio: "1:1",
  width: WIDTH,
  height: HEIGHT,
  slots: ["headline", "subheadline", "imageUrl"],
  retired: false,
  component: Institucional01_1x1,
});
