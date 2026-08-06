// Template Agenda 01 — 1080x1080. Layout evento/reserva:
//   • Data grande em card contrastante
//   • Título + info secundária
//   • CTA pill grande

import type { ReactElement } from "react";
import { registerTemplate, type TemplateProps } from "../registry";
import { brandSignature, brandSig, accentLine, pillBadge } from "../primitives";

const WIDTH = 1080;
const HEIGHT = 1080;

function Agenda01_1x1({ brandKit, slots }: TemplateProps): ReactElement {
  const eventDate = slots.eventDate ?? "Em breve";
  const headline = slots.headline ?? "Anote na agenda";
  const subheadline = slots.subheadline ?? "";
  const cta = slots.ctaLabel ?? "Garantir vaga";
  const signature = brandSig(brandKit);

  return (
    <div
      style={{
        width: WIDTH,
        height: HEIGHT,
        display: "flex",
        flexDirection: "column",
        backgroundColor: brandKit.secondaryColor,
        fontFamily: brandKit.bodyFont,
        position: "relative",
      }}
    >
      {/* Header */}
      <div
        style={{
          height: 90,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          paddingLeft: 60,
          paddingRight: 60,
        }}
      >
        {brandSignature({
          text: signature,
          color: "#FFFFFF",
          fontFamily: brandKit.displayFont,
          fontSize: 20,
        })}
        {pillBadge({
          text: "Agenda",
          bgColor: brandKit.supportColor,
          textColor: brandKit.secondaryColor,
          fontFamily: brandKit.displayFont,
        })}
      </div>

      {/* Corpo: data + info */}
      <div
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          padding: "0 60px",
          color: "#FFFFFF",
        }}
      >
        {/* Data em card gigante */}
        <div
          style={{
            display: "flex",
            paddingLeft: 60,
            paddingRight: 60,
            paddingTop: 30,
            paddingBottom: 30,
            backgroundColor: brandKit.primaryColor,
            borderRadius: 32,
            marginBottom: 40,
          }}
        >
          <div
            style={{
              fontFamily: brandKit.displayFont,
              fontSize: 140,
              fontWeight: 700,
              lineHeight: 1,
              display: "flex",
              letterSpacing: -2,
            }}
          >
            {eventDate}
          </div>
        </div>

        <div
          style={{
            fontFamily: brandKit.displayFont,
            fontSize: 62,
            fontWeight: 700,
            lineHeight: 1.05,
            textAlign: "center",
            marginBottom: 20,
            display: "flex",
          }}
        >
          {headline}
        </div>

        {subheadline ? (
          <div
            style={{
              fontSize: 24,
              lineHeight: 1.4,
              opacity: 0.8,
              textAlign: "center",
              maxWidth: 800,
              display: "flex",
            }}
          >
            {subheadline}
          </div>
        ) : null}

        <div style={{ marginTop: 26, display: "flex" }}>
          {accentLine({ color: brandKit.supportColor, width: 80, height: 4 })}
        </div>
      </div>

      {/* CTA */}
      <div
        style={{
          padding: "0 60px 50px",
          display: "flex",
          justifyContent: "center",
        }}
      >
        <div
          style={{
            display: "flex",
            paddingLeft: 40,
            paddingRight: 40,
            paddingTop: 22,
            paddingBottom: 22,
            backgroundColor: brandKit.supportColor,
            color: brandKit.secondaryColor,
            fontFamily: brandKit.displayFont,
            fontSize: 28,
            fontWeight: 700,
            borderRadius: 999,
            letterSpacing: 1,
          }}
        >
          {cta} →
        </div>
      </div>
    </div>
  );
}

registerTemplate({
  id: "agenda-01-1x1",
  category: "agenda",
  ratio: "1:1",
  width: WIDTH,
  height: HEIGHT,
  slots: ["headline", "subheadline", "eventDate", "ctaLabel"],
  retired: false,
  component: Agenda01_1x1,
});
