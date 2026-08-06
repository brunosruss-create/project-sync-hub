// Template Dica 01 — 1080x1080. Dica prática numerada.

import type { ReactElement } from "react";
import { registerTemplate, type TemplateProps } from "../registry";
import { signatureBar } from "../shared";

const WIDTH = 1080;
const HEIGHT = 1080;

function Dica01_1x1({ brandKit, slots }: TemplateProps): ReactElement {
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
      <div style={signatureBar(brandKit)}>{brandKit.defaultSignature || "DICA"}</div>

      {/* Badge grande "DICA" */}
      <div
        style={{
          display: "flex",
          justifyContent: "center",
          marginTop: 70,
        }}
      >
        <div
          style={{
            display: "flex",
            paddingLeft: 60,
            paddingRight: 60,
            paddingTop: 24,
            paddingBottom: 24,
            backgroundColor: brandKit.primaryColor,
            color: "#FFFFFF",
            fontFamily: brandKit.displayFont,
            fontSize: 60,
            fontWeight: 700,
            letterSpacing: 8,
            textTransform: "uppercase",
            borderRadius: 999,
          }}
        >
          Dica
        </div>
      </div>

      {/* Conteúdo */}
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
            fontSize: 82,
            fontWeight: 700,
            color: brandKit.secondaryColor,
            lineHeight: 1.1,
            marginBottom: 28,
          }}
        >
          {headline}
        </div>
        {body ? (
          <div
            style={{
              fontSize: 34,
              lineHeight: 1.4,
              color: brandKit.secondaryColor,
              opacity: 0.8,
            }}
          >
            {body}
          </div>
        ) : null}
      </div>

      {/* Faixa inferior colorida */}
      <div
        style={{
          height: 24,
          backgroundColor: brandKit.supportColor,
          display: "flex",
        }}
      />
    </div>
  );
}

registerTemplate({
  id: "dica-01-1x1",
  category: "dica",
  ratio: "1:1",
  width: WIDTH,
  height: HEIGHT,
  slots: ["headline", "subheadline", "description"],
  retired: false,
  component: Dica01_1x1,
});
