// Template Institucional 01 — 9:16 (story 1080x1920).

import type { ReactElement } from "react";
import { registerTemplate, type TemplateProps } from "../registry";

const WIDTH = 1080;
const HEIGHT = 1920;

function Institucional01_9x16({ brandKit, slots }: TemplateProps): ReactElement {
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

      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          width: WIDTH,
          height: HEIGHT,
          backgroundColor: brandKit.secondaryColor,
          opacity: 0.55,
          display: "flex",
        }}
      />

      <div
        style={{
          position: "relative",
          width: WIDTH,
          height: HEIGHT,
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          padding: 90,
        }}
      >
        <div
          style={{
            width: 120,
            height: 12,
            backgroundColor: brandKit.supportColor,
            marginBottom: 50,
            display: "flex",
          }}
        />
        <div
          style={{
            fontFamily: brandKit.displayFont,
            fontSize: 160,
            fontWeight: 700,
            lineHeight: 1.05,
            marginBottom: 40,
          }}
        >
          {headline}
        </div>
        {subheadline ? (
          <div
            style={{
              fontSize: 52,
              lineHeight: 1.35,
              opacity: 0.9,
              maxWidth: 900,
            }}
          >
            {subheadline}
          </div>
        ) : null}
      </div>

      <div
        style={{
          position: "absolute",
          top: 80,
          left: 80,
          fontFamily: brandKit.displayFont,
          fontSize: 44,
          fontWeight: 700,
          letterSpacing: 5,
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
  id: "institucional-01-9x16",
  category: "institucional",
  ratio: "9:16",
  width: WIDTH,
  height: HEIGHT,
  slots: ["headline", "subheadline", "imageUrl"],
  retired: false,
  component: Institucional01_9x16,
});
