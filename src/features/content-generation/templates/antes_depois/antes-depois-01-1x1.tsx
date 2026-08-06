// Template Antes/Depois 01 — 1080x1080. Split vertical:
//   • Header com título e badge "Transformação"
//   • Duas colunas: "Antes" (escuro/sem foto) e "Depois" (foto real)
//   • Barra separadora com seta

import type { ReactElement } from "react";
import { registerTemplate, type TemplateProps } from "../registry";
import { brandSignature, brandSig, pillBadge } from "../primitives";

const WIDTH = 1080;
const HEIGHT = 1080;

function AntesDepois01_1x1({ brandKit, slots }: TemplateProps): ReactElement {
  const headline = slots.headline ?? "Veja a transformação";
  const signature = brandSig(brandKit);
  const imageUrl = slots.imageUrl;

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
      {/* Header */}
      <div
        style={{
          padding: "44px 60px 24px",
          display: "flex",
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        {brandSignature({
          text: signature,
          color: brandKit.secondaryColor,
          fontFamily: brandKit.displayFont,
          fontSize: 20,
        })}
        {pillBadge({
          text: "Transformação",
          bgColor: brandKit.primaryColor,
          fontFamily: brandKit.displayFont,
        })}
      </div>

      {/* Título */}
      <div
        style={{
          padding: "0 60px 30px",
          display: "flex",
        }}
      >
        <div
          style={{
            fontFamily: brandKit.displayFont,
            fontSize: 56,
            fontWeight: 700,
            lineHeight: 1.05,
            color: brandKit.secondaryColor,
            letterSpacing: -1,
            display: "flex",
          }}
        >
          {headline}
        </div>
      </div>

      {/* Blocos antes/depois */}
      <div
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "row",
          padding: "0 60px 60px",
        }}
      >
        {/* Bloco Antes */}
        <div
          style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            alignItems: "center",
            backgroundColor: brandKit.secondaryColor,
            borderRadius: 24,
            marginRight: 12,
            color: "#FFFFFF",
            padding: 30,
          }}
        >
          <div
            style={{
              fontSize: 12,
              fontWeight: 700,
              letterSpacing: 5,
              textTransform: "uppercase",
              opacity: 0.5,
              marginBottom: 10,
              display: "flex",
            }}
          >
            Etapa 1
          </div>
          <div
            style={{
              fontFamily: brandKit.displayFont,
              fontSize: 100,
              fontWeight: 700,
              letterSpacing: -3,
              lineHeight: 1,
              display: "flex",
              marginBottom: 14,
            }}
          >
            Antes
          </div>
          <div
            style={{
              fontSize: 16,
              opacity: 0.6,
              textAlign: "center",
              display: "flex",
              lineHeight: 1.4,
            }}
          >
            Ponto de partida antes do procedimento
          </div>
        </div>

        {/* Bloco Depois com foto real */}
        <div
          style={{
            flex: 1,
            display: "flex",
            marginLeft: 12,
            borderRadius: 24,
            position: "relative",
            overflow: "hidden",
            backgroundColor: brandKit.primaryColor,
          }}
        >
          {imageUrl ? (
            <img
              src={imageUrl}
              width={470}
              height={640}
              style={{
                width: "100%",
                height: "100%",
                objectFit: "cover",
              }}
            />
          ) : null}
          {/* Selo "DEPOIS" flutuante */}
          <div
            style={{
              position: "absolute",
              top: 20,
              left: 20,
              display: "flex",
              paddingLeft: 20,
              paddingRight: 20,
              paddingTop: 8,
              paddingBottom: 8,
              backgroundColor: brandKit.supportColor,
              color: brandKit.secondaryColor,
              fontFamily: brandKit.displayFont,
              fontSize: 16,
              fontWeight: 700,
              letterSpacing: 4,
              textTransform: "uppercase",
              borderRadius: 999,
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
