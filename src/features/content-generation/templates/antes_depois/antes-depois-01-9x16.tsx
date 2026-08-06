// Template Antes/Depois 01 — 9:16 (story 1080x1920).

import type { ReactElement } from "react";
import { registerTemplate, type TemplateProps } from "../registry";

const WIDTH = 1080;
const HEIGHT = 1920;

function AntesDepois01_9x16({ brandKit, slots }: TemplateProps): ReactElement {
  const headline = slots.headline ?? "Veja a transformação";

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
      {/* Título */}
      <div
        style={{
          height: 220,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: brandKit.displayFont,
          fontSize: 76,
          fontWeight: 700,
          color: brandKit.secondaryColor,
          textAlign: "center",
          paddingLeft: 40,
          paddingRight: 40,
        }}
      >
        {headline}
      </div>

      {/* Antes (topo) */}
      <div
        style={{
          height: 720,
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          alignItems: "center",
          backgroundColor: brandKit.secondaryColor,
          opacity: 0.9,
          color: "#FFFFFF",
        }}
      >
        <div
          style={{
            fontFamily: brandKit.displayFont,
            fontSize: 110,
            fontWeight: 700,
            letterSpacing: 12,
            textTransform: "uppercase",
          }}
        >
          Antes
        </div>
      </div>

      {/* Depois (base) */}
      <div
        style={{
          flex: 1,
          display: "flex",
          position: "relative",
          backgroundColor: brandKit.primaryColor,
        }}
      >
        {slots.imageUrl ? (
          <img
            src={slots.imageUrl}
            width={WIDTH}
            height={HEIGHT - 220 - 720}
            style={{
              width: WIDTH,
              height: HEIGHT - 220 - 720,
              objectFit: "cover",
            }}
          />
        ) : null}
        <div
          style={{
            position: "absolute",
            top: 40,
            left: 40,
            paddingLeft: 40,
            paddingRight: 40,
            paddingTop: 18,
            paddingBottom: 18,
            backgroundColor: brandKit.supportColor,
            color: brandKit.secondaryColor,
            fontFamily: brandKit.displayFont,
            fontSize: 64,
            fontWeight: 700,
            letterSpacing: 6,
            textTransform: "uppercase",
            borderRadius: 999,
            display: "flex",
          }}
        >
          Depois
        </div>
      </div>
    </div>
  );
}

registerTemplate({
  id: "antes-depois-01-9x16",
  category: "antes_depois",
  ratio: "9:16",
  width: WIDTH,
  height: HEIGHT,
  slots: ["headline", "imageUrl"],
  retired: false,
  component: AntesDepois01_9x16,
});
