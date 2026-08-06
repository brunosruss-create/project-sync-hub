// Template Catálogo 01 — 9:16 (story 1080x1920).

import type { ReactElement } from "react";
import { registerTemplate, type TemplateProps } from "../registry";

const WIDTH = 1080;
const HEIGHT = 1920;

function Catalogo01_9x16({ brandKit, slots }: TemplateProps): ReactElement {
  const name = slots.headline ?? "Serviço";
  const description = slots.description ?? slots.subheadline ?? "";
  const price = slots.price ?? "";
  const duration = slots.duration ?? "";
  const cta = slots.ctaLabel ?? "Agendar agora";

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
      {/* Foto grande no topo (60% da altura) */}
      <div style={{ display: "flex", height: 1150, position: "relative" }}>
        {slots.imageUrl ? (
          <img
            src={slots.imageUrl}
            width={WIDTH}
            height={1150}
            style={{
              width: WIDTH,
              height: 1150,
              objectFit: "cover",
            }}
          />
        ) : (
          <div
            style={{
              width: WIDTH,
              height: 1150,
              backgroundColor: brandKit.primaryColor,
              opacity: 0.2,
              display: "flex",
            }}
          />
        )}
        {/* Marca no topo */}
        <div
          style={{
            position: "absolute",
            top: 60,
            left: 60,
            paddingLeft: 30,
            paddingRight: 30,
            paddingTop: 14,
            paddingBottom: 14,
            backgroundColor: "#FFFFFFDD",
            color: brandKit.secondaryColor,
            fontFamily: brandKit.displayFont,
            fontSize: 34,
            fontWeight: 700,
            letterSpacing: 3,
            borderRadius: 999,
            display: "flex",
          }}
        >
          {brandKit.defaultSignature || "CATÁLOGO"}
        </div>
      </div>

      {/* Info do serviço */}
      <div
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          padding: 60,
          justifyContent: "center",
        }}
      >
        <div
          style={{
            fontFamily: brandKit.displayFont,
            fontSize: 96,
            fontWeight: 700,
            color: brandKit.secondaryColor,
            lineHeight: 1.05,
            marginBottom: 24,
          }}
        >
          {name}
        </div>
        {description ? (
          <div
            style={{
              fontSize: 42,
              color: brandKit.secondaryColor,
              opacity: 0.7,
              lineHeight: 1.35,
              marginBottom: 40,
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
            marginTop: 12,
          }}
        >
          {price ? (
            <div
              style={{
                fontFamily: brandKit.displayFont,
                fontSize: 120,
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
                marginLeft: 40,
                fontSize: 44,
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

      <div
        style={{
          height: 200,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: brandKit.supportColor,
          color: brandKit.secondaryColor,
          fontFamily: brandKit.displayFont,
          fontSize: 72,
          fontWeight: 700,
          letterSpacing: 2,
        }}
      >
        {cta}
      </div>
    </div>
  );
}

registerTemplate({
  id: "catalogo-01-9x16",
  category: "catalogo",
  ratio: "9:16",
  width: WIDTH,
  height: HEIGHT,
  slots: ["headline", "subheadline", "description", "imageUrl", "price", "duration", "ctaLabel"],
  retired: false,
  component: Catalogo01_9x16,
});
