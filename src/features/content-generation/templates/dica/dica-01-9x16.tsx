// Template Dica 01 — 9:16 (story 1080x1920).

import type { ReactElement } from "react";
import { registerTemplate, type TemplateProps } from "../registry";

const WIDTH = 1080;
const HEIGHT = 1920;

function Dica01_9x16({ brandKit, slots }: TemplateProps): ReactElement {
  const headline = slots.headline ?? "Dica rápida pra você";
  const body = slots.description ?? slots.subheadline ?? "";

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
      {/* Header estampado */}
      <div
        style={{
          height: 500,
          backgroundColor: brandKit.primaryColor,
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          alignItems: "center",
          paddingLeft: 60,
          paddingRight: 60,
        }}
      >
        <div
          style={{
            fontFamily: brandKit.displayFont,
            fontSize: 220,
            fontWeight: 700,
            color: "#FFFFFF",
            letterSpacing: 20,
            textTransform: "uppercase",
          }}
        >
          Dica
        </div>
        <div
          style={{
            height: 12,
            width: 300,
            backgroundColor: brandKit.supportColor,
            marginTop: 30,
            display: "flex",
          }}
        />
      </div>

      {/* Conteúdo grande */}
      <div
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          paddingLeft: 90,
          paddingRight: 90,
        }}
      >
        <div
          style={{
            fontFamily: brandKit.displayFont,
            fontSize: 130,
            fontWeight: 700,
            color: brandKit.secondaryColor,
            lineHeight: 1.05,
            marginBottom: 50,
          }}
        >
          {headline}
        </div>
        {body ? (
          <div
            style={{
              fontSize: 52,
              lineHeight: 1.35,
              color: brandKit.secondaryColor,
              opacity: 0.8,
            }}
          >
            {body}
          </div>
        ) : null}
      </div>

      {/* Assinatura no rodapé */}
      <div
        style={{
          height: 140,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: brandKit.secondaryColor,
          color: "#FFFFFF",
          fontFamily: brandKit.displayFont,
          fontSize: 44,
          fontWeight: 700,
          letterSpacing: 3,
        }}
      >
        {brandKit.defaultSignature || "SUA MARCA"}
      </div>
    </div>
  );
}

registerTemplate({
  id: "dica-01-9x16",
  category: "dica",
  ratio: "9:16",
  width: WIDTH,
  height: HEIGHT,
  slots: ["headline", "subheadline", "description"],
  retired: false,
  component: Dica01_9x16,
});
