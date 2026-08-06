// Template Agenda 01 — 9:16 (story 1080x1920).

import type { ReactElement } from "react";
import { registerTemplate, type TemplateProps } from "../registry";

const WIDTH = 1080;
const HEIGHT = 1920;

function Agenda01_9x16({ brandKit, slots }: TemplateProps): ReactElement {
  const eventDate = slots.eventDate ?? "Em breve";
  const headline = slots.headline ?? "Marque na sua agenda";
  const subheadline = slots.subheadline ?? "";
  const cta = slots.ctaLabel ?? "Reservar";

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
      <div
        style={{
          height: 180,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: brandKit.displayFont,
          fontSize: 44,
          fontWeight: 700,
          letterSpacing: 6,
          textTransform: "uppercase",
          color: brandKit.supportColor,
        }}
      >
        Agenda
      </div>

      <div
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          alignItems: "center",
          paddingLeft: 80,
          paddingRight: 80,
        }}
      >
        <div
          style={{
            display: "flex",
            paddingLeft: 100,
            paddingRight: 100,
            paddingTop: 40,
            paddingBottom: 40,
            backgroundColor: brandKit.supportColor,
            color: brandKit.secondaryColor,
            fontFamily: brandKit.displayFont,
            fontSize: 180,
            fontWeight: 700,
            borderRadius: 40,
            marginBottom: 80,
          }}
        >
          {eventDate}
        </div>
        <div
          style={{
            fontFamily: brandKit.displayFont,
            fontSize: 96,
            fontWeight: 700,
            lineHeight: 1.1,
            textAlign: "center",
            marginBottom: 40,
          }}
        >
          {headline}
        </div>
        {subheadline ? (
          <div
            style={{
              fontSize: 46,
              lineHeight: 1.3,
              textAlign: "center",
              opacity: 0.85,
            }}
          >
            {subheadline}
          </div>
        ) : null}
      </div>

      <div
        style={{
          height: 200,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: brandKit.primaryColor,
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
  id: "agenda-01-9x16",
  category: "agenda",
  ratio: "9:16",
  width: WIDTH,
  height: HEIGHT,
  slots: ["headline", "subheadline", "eventDate", "ctaLabel"],
  retired: false,
  component: Agenda01_9x16,
});
