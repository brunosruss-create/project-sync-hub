// Template Catálogo 01 — 1080x1080. Card de serviço com foto + nome + preço.

import type { ReactElement } from "react";
import { registerTemplate, type TemplateProps } from "../registry";
import { signatureBar, ctaBar } from "../shared";

const WIDTH = 1080;
const HEIGHT = 1080;

function Catalogo01_1x1({ brandKit, slots }: TemplateProps): ReactElement {
  const name = slots.headline ?? "Serviço";
  const description = slots.description ?? slots.subheadline ?? "";
  const price = slots.price ?? "";
  const duration = slots.duration ?? "";
  const cta = slots.ctaLabel ?? "Agendar";

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
      <div style={signatureBar(brandKit)}>{brandKit.defaultSignature || "CATÁLOGO"}</div>

      {/* Foto grande */}
      <div style={{ display: "flex", height: 540 }}>
        {slots.imageUrl ? (
          <img
            src={slots.imageUrl}
            width={WIDTH}
            height={540}
            style={{
              width: WIDTH,
              height: 540,
              objectFit: "cover",
            }}
          />
        ) : (
          <div
            style={{
              width: WIDTH,
              height: 540,
              backgroundColor: brandKit.primaryColor,
              opacity: 0.2,
              display: "flex",
            }}
          />
        )}
      </div>

      {/* Info do serviço */}
      <div
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          padding: 40,
        }}
      >
        <div
          style={{
            fontFamily: brandKit.displayFont,
            fontSize: 60,
            fontWeight: 700,
            color: brandKit.secondaryColor,
            lineHeight: 1.05,
            marginBottom: 12,
          }}
        >
          {name}
        </div>
        {description ? (
          <div
            style={{
              fontSize: 26,
              color: brandKit.secondaryColor,
              opacity: 0.7,
              lineHeight: 1.4,
              marginBottom: 20,
            }}
          >
            {description}
          </div>
        ) : null}
        <div
          style={{
            display: "flex",
            flexDirection: "row",
            alignItems: "center",
            marginTop: 6,
          }}
        >
          {price ? (
            <div
              style={{
                fontFamily: brandKit.displayFont,
                fontSize: 68,
                fontWeight: 700,
                color: brandKit.primaryColor,
                display: "flex",
              }}
            >
              {price}
            </div>
          ) : null}
          {duration ? (
            <div
              style={{
                marginLeft: 24,
                fontSize: 28,
                color: brandKit.secondaryColor,
                opacity: 0.7,
                display: "flex",
              }}
            >
              {duration}
            </div>
          ) : null}
        </div>
      </div>

      <div style={ctaBar(brandKit, 100, 42)}>{cta}</div>
    </div>
  );
}

registerTemplate({
  id: "catalogo-01-1x1",
  category: "catalogo",
  ratio: "1:1",
  width: WIDTH,
  height: HEIGHT,
  slots: ["headline", "subheadline", "description", "imageUrl", "price", "duration", "ctaLabel"],
  retired: false,
  component: Catalogo01_1x1,
});
