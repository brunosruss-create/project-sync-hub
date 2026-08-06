// Template Novidade 01 — 9:16 (story 1080x1920).

import type { ReactElement } from "react";
import { registerTemplate, type TemplateProps } from "../registry";

const WIDTH = 1080;
const HEIGHT = 1920;

function Novidade01_9x16({ brandKit, slots }: TemplateProps): ReactElement {
  const headline = slots.headline ?? "Chegou algo novo!";
  const subheadline = slots.subheadline ?? "";
  const cta = slots.ctaLabel ?? "Ver detalhes";

  return (
    <div
      style={{
        width: WIDTH,
        height: HEIGHT,
        display: "flex",
        flexDirection: "column",
        backgroundColor: "#FFFFFF",
        fontFamily: brandKit.bodyFont,
      }}
    >
      {/* Bloco superior colorido com "NOVIDADE" */}
      <div
        style={{
          height: 600,
          backgroundColor: brandKit.primaryColor,
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          flexDirection: "column",
          padding: 60,
        }}
      >
        <div
          style={{
            display: "flex",
            paddingLeft: 60,
            paddingRight: 60,
            paddingTop: 20,
            paddingBottom: 20,
            backgroundColor: brandKit.supportColor,
            color: brandKit.secondaryColor,
            fontFamily: brandKit.displayFont,
            fontSize: 60,
            fontWeight: 700,
            letterSpacing: 8,
            textTransform: "uppercase",
            borderRadius: 999,
            marginBottom: 60,
          }}
        >
          Novidade
        </div>
        <div
          style={{
            fontFamily: brandKit.displayFont,
            fontSize: 130,
            fontWeight: 700,
            color: "#FFFFFF",
            lineHeight: 1.05,
            textAlign: "center",
          }}
        >
          {headline}
        </div>
      </div>

      {/* Imagem grande no meio */}
      <div style={{ flex: 1, display: "flex" }}>
        {slots.imageUrl ? (
          <img
            src={slots.imageUrl}
            width={WIDTH}
            height={HEIGHT - 600 - 240}
            style={{
              width: WIDTH,
              height: HEIGHT - 600 - 240,
              objectFit: "cover",
            }}
          />
        ) : (
          <div
            style={{
              width: WIDTH,
              height: HEIGHT - 600 - 240,
              backgroundColor: brandKit.secondaryColor,
              opacity: 0.1,
              display: "flex",
            }}
          />
        )}
      </div>

      {/* Bloco inferior com subheadline + CTA */}
      <div
        style={{
          height: 240,
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          alignItems: "center",
          padding: 40,
          backgroundColor: brandKit.secondaryColor,
          color: "#FFFFFF",
        }}
      >
        {subheadline ? (
          <div
            style={{
              fontSize: 40,
              lineHeight: 1.3,
              marginBottom: 20,
              textAlign: "center",
            }}
          >
            {subheadline}
          </div>
        ) : null}
        <div
          style={{
            fontFamily: brandKit.displayFont,
            fontSize: 56,
            fontWeight: 700,
            color: brandKit.supportColor,
            letterSpacing: 2,
          }}
        >
          {cta}
        </div>
      </div>
    </div>
  );
}

registerTemplate({
  id: "novidade-01-9x16",
  category: "novidade",
  ratio: "9:16",
  width: WIDTH,
  height: HEIGHT,
  slots: ["headline", "subheadline", "imageUrl", "ctaLabel"],
  retired: false,
  component: Novidade01_9x16,
});
