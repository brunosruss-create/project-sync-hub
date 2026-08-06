// Template Novidade 01 — 1080x1080. "Novidade" com selo grande e imagem central.

import type { ReactElement } from "react";
import { registerTemplate, type TemplateProps } from "../registry";
import { signatureBar } from "../shared";

const WIDTH = 1080;
const HEIGHT = 1080;

function Novidade01_1x1({ brandKit, slots }: TemplateProps): ReactElement {
  const headline = slots.headline ?? "Chegou algo novo!";
  const subheadline = slots.subheadline ?? "";
  const cta = slots.ctaLabel ?? "Confira agora";

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
      <div style={signatureBar(brandKit)}>{brandKit.defaultSignature || "SUA MARCA"}</div>

      {/* Selo "NOVIDADE" no topo */}
      <div style={{ display: "flex", justifyContent: "center", marginTop: 70 }}>
        <div
          style={{
            display: "flex",
            paddingLeft: 46,
            paddingRight: 46,
            paddingTop: 12,
            paddingBottom: 12,
            backgroundColor: brandKit.supportColor,
            color: brandKit.secondaryColor,
            fontFamily: brandKit.displayFont,
            fontSize: 42,
            fontWeight: 700,
            letterSpacing: 6,
            textTransform: "uppercase",
            borderRadius: 999,
          }}
        >
          Novidade
        </div>
      </div>

      {/* Imagem central redonda */}
      <div style={{ display: "flex", justifyContent: "center", marginTop: 40 }}>
        {slots.imageUrl ? (
          <img
            src={slots.imageUrl}
            width={460}
            height={460}
            style={{
              width: 460,
              height: 460,
              objectFit: "cover",
              borderRadius: 999,
              borderColor: brandKit.primaryColor,
              borderWidth: 12,
              borderStyle: "solid",
            }}
          />
        ) : (
          <div
            style={{
              width: 460,
              height: 460,
              borderRadius: 999,
              backgroundColor: brandKit.primaryColor,
              opacity: 0.2,
              display: "flex",
            }}
          />
        )}
      </div>

      {/* Título + subtítulo */}
      <div
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          alignItems: "center",
          paddingLeft: 80,
          paddingRight: 80,
          textAlign: "center",
        }}
      >
        <div
          style={{
            fontFamily: brandKit.displayFont,
            fontSize: 66,
            fontWeight: 700,
            color: brandKit.secondaryColor,
            lineHeight: 1.1,
            marginTop: 20,
          }}
        >
          {headline}
        </div>
        {subheadline ? (
          <div
            style={{
              fontSize: 30,
              lineHeight: 1.35,
              color: brandKit.secondaryColor,
              opacity: 0.75,
              marginTop: 14,
            }}
          >
            {subheadline}
          </div>
        ) : null}
      </div>

      {/* CTA como faixa fina no rodapé */}
      <div
        style={{
          height: 90,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: brandKit.primaryColor,
          color: "#FFFFFF",
          fontFamily: brandKit.displayFont,
          fontSize: 36,
          fontWeight: 700,
        }}
      >
        {cta}
      </div>
    </div>
  );
}

registerTemplate({
  id: "novidade-01-1x1",
  category: "novidade",
  ratio: "1:1",
  width: WIDTH,
  height: HEIGHT,
  slots: ["headline", "subheadline", "imageUrl", "ctaLabel"],
  retired: false,
  component: Novidade01_1x1,
});
