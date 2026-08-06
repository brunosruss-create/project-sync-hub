// Template Institucional 01 — 1080x1080. Foto grande + mensagem da marca.

import type { ReactElement } from "react";
import { registerTemplate, type TemplateProps } from "../registry";

const WIDTH = 1080;
const HEIGHT = 1080;

function Institucional01_1x1({ brandKit, slots }: TemplateProps): ReactElement {
  const headline = slots.headline ?? "Somos referência";
  const subheadline = slots.subheadline ?? "";

  return (
    <div
      style={{
        width: WIDTH,
        height: HEIGHT,
        display: "flex",
        position: "relative",
        backgroundColor: brandKit.secondaryColor,
        fontFamily: brandKit.bodyFont,
        color: "#FFFFFF",
      }}
    >
      {slots.imageUrl ? (
        <img
          src={slots.imageUrl}
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

      {/* Overlay preto/degradê pra legibilidade */}
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          width: WIDTH,
          height: HEIGHT,
          backgroundColor: brandKit.secondaryColor,
          opacity: 0.5,
          display: "flex",
        }}
      />

      {/* Bloco de conteúdo */}
      <div
        style={{
          position: "relative",
          width: WIDTH,
          height: HEIGHT,
          display: "flex",
          flexDirection: "column",
          justifyContent: "flex-end",
          padding: 70,
        }}
      >
        <div
          style={{
            width: 80,
            height: 8,
            backgroundColor: brandKit.supportColor,
            marginBottom: 30,
            display: "flex",
          }}
        />
        <div
          style={{
            fontFamily: brandKit.displayFont,
            fontSize: 90,
            fontWeight: 700,
            lineHeight: 1.05,
            marginBottom: 20,
          }}
        >
          {headline}
        </div>
        {subheadline ? (
          <div
            style={{
              fontSize: 32,
              lineHeight: 1.35,
              opacity: 0.9,
              maxWidth: 800,
            }}
          >
            {subheadline}
          </div>
        ) : null}
      </div>

      {/* Marca no canto superior */}
      <div
        style={{
          position: "absolute",
          top: 60,
          left: 60,
          fontFamily: brandKit.displayFont,
          fontSize: 32,
          fontWeight: 700,
          letterSpacing: 4,
          color: "#FFFFFF",
          display: "flex",
        }}
      >
        {brandKit.defaultSignature || "SUA MARCA"}
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
