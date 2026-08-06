// Template Antes/Depois 01 — 1080x1080.
// Nota: como Satori não suporta múltiplas imagens numa comparação nativa,
// mostramos "ANTES" (bloco escuro) e "DEPOIS" (bloco com imagem) lado a lado.

import type { ReactElement } from "react";
import { registerTemplate, type TemplateProps } from "../registry";
import { signatureBar } from "../shared";

const WIDTH = 1080;
const HEIGHT = 1080;

function AntesDepois01_1x1({ brandKit, slots }: TemplateProps): ReactElement {
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
      <div style={signatureBar(brandKit)}>{brandKit.defaultSignature || "TRANSFORMAÇÃO"}</div>

      {/* Título */}
      <div
        style={{
          height: 140,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: brandKit.displayFont,
          fontSize: 46,
          fontWeight: 700,
          color: brandKit.secondaryColor,
          textAlign: "center",
        }}
      >
        {headline}
      </div>

      {/* Blocos antes / depois */}
      <div style={{ flex: 1, display: "flex", flexDirection: "row" }}>
        <div
          style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            alignItems: "center",
            backgroundColor: brandKit.secondaryColor,
            opacity: 0.85,
            color: "#FFFFFF",
          }}
        >
          <div
            style={{
              fontFamily: brandKit.displayFont,
              fontSize: 60,
              fontWeight: 700,
              letterSpacing: 6,
              textTransform: "uppercase",
              marginBottom: 20,
            }}
          >
            Antes
          </div>
          <div style={{ fontSize: 30, opacity: 0.7 }}>foto ilustrativa</div>
        </div>

        <div
          style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            alignItems: "center",
            position: "relative",
            backgroundColor: brandKit.primaryColor,
          }}
        >
          {slots.imageUrl ? (
            <img
              src={slots.imageUrl}
              width={540}
              height={780}
              style={{
                width: 540,
                height: 780,
                objectFit: "cover",
              }}
            />
          ) : null}
          <div
            style={{
              position: "absolute",
              top: 30,
              left: 30,
              paddingLeft: 24,
              paddingRight: 24,
              paddingTop: 12,
              paddingBottom: 12,
              backgroundColor: brandKit.supportColor,
              color: brandKit.secondaryColor,
              fontFamily: brandKit.displayFont,
              fontSize: 36,
              fontWeight: 700,
              letterSpacing: 4,
              textTransform: "uppercase",
              borderRadius: 999,
              display: "flex",
            }}
          >
            Depois
          </div>
        </div>
      </div>
    </div>
  );
}

registerTemplate({
  id: "antes-depois-01-1x1",
  category: "antes_depois",
  ratio: "1:1",
  width: WIDTH,
  height: HEIGHT,
  slots: ["headline", "imageUrl"],
  retired: false,
  component: AntesDepois01_1x1,
});
