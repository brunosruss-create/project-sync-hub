// Template Agenda 01 — 1080x1080. Anúncio de evento/horário.

import type { ReactElement } from "react";
import { registerTemplate, type TemplateProps } from "../registry";
import { ctaBar } from "../shared";

const WIDTH = 1080;
const HEIGHT = 1080;

function Agenda01_1x1({ brandKit, slots }: TemplateProps): ReactElement {
  const eventDate = slots.eventDate ?? "Em breve";
  const headline = slots.headline ?? "Marque na sua agenda";
  const subheadline = slots.subheadline ?? "";
  const cta = slots.ctaLabel ?? "Reservar horário";

  return (
    <div
      style={{
        width: WIDTH,
        height: HEIGHT,
        display: "flex",
        flexDirection: "column",
        backgroundColor: brandKit.secondaryColor,
        fontFamily: brandKit.bodyFont,
        color: "#FFFFFF",
      }}
    >
      {/* Faixa topo com marca */}
      <div
        style={{
          height: 90,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: brandKit.displayFont,
          fontSize: 32,
          fontWeight: 700,
          letterSpacing: 4,
        }}
      >
        {brandKit.defaultSignature || "AGENDA"}
      </div>

      {/* Data em destaque */}
      <div
        style={{
          flex: 1,
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
            display: "flex",
            paddingLeft: 60,
            paddingRight: 60,
            paddingTop: 30,
            paddingBottom: 30,
            backgroundColor: brandKit.supportColor,
            color: brandKit.secondaryColor,
            fontFamily: brandKit.displayFont,
            fontSize: 96,
            fontWeight: 700,
            borderRadius: 24,
            marginBottom: 40,
          }}
        >
          {eventDate}
        </div>
        <div
          style={{
            fontFamily: brandKit.displayFont,
            fontSize: 60,
            fontWeight: 700,
            lineHeight: 1.15,
            textAlign: "center",
          }}
        >
          {headline}
        </div>
        {subheadline ? (
          <div
            style={{
              fontSize: 30,
              lineHeight: 1.35,
              textAlign: "center",
              opacity: 0.8,
              marginTop: 20,
            }}
          >
            {subheadline}
          </div>
        ) : null}
      </div>

      <div style={ctaBar(brandKit)}>{cta}</div>
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
