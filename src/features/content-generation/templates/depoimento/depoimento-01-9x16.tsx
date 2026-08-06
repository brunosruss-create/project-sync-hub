// Template Depoimento 01 — 9:16 (story 1080x1920).

import type { ReactElement } from "react";
import { registerTemplate, type TemplateProps } from "../registry";

const WIDTH = 1080;
const HEIGHT = 1920;

function Depoimento01_9x16({ brandKit, slots }: TemplateProps): ReactElement {
  const quote = slots.headline ?? "Melhor experiência que já tive!";
  const author = slots.authorName ?? "Cliente satisfeito";

  return (
    <div
      style={{
        width: WIDTH,
        height: HEIGHT,
        display: "flex",
        flexDirection: "column",
        backgroundColor: brandKit.primaryColor,
        fontFamily: brandKit.bodyFont,
        color: "#FFFFFF",
      }}
    >
      {/* Header */}
      <div
        style={{
          height: 180,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: brandKit.displayFont,
          fontSize: 42,
          fontWeight: 700,
          letterSpacing: 4,
          textTransform: "uppercase",
          color: brandKit.supportColor,
        }}
      >
        Depoimento
      </div>

      {/* Bloco quote */}
      <div
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          alignItems: "center",
          paddingLeft: 90,
          paddingRight: 90,
          textAlign: "center",
        }}
      >
        <div
          style={{
            fontFamily: brandKit.displayFont,
            fontSize: 320,
            lineHeight: 0.7,
            color: brandKit.supportColor,
            marginBottom: 40,
          }}
        >
          &ldquo;
        </div>
        <div
          style={{
            fontFamily: brandKit.displayFont,
            fontSize: 82,
            fontWeight: 700,
            lineHeight: 1.15,
          }}
        >
          {quote}
        </div>
      </div>

      {/* Rodapé com foto + nome */}
      <div
        style={{
          height: 340,
          display: "flex",
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: brandKit.secondaryColor,
        }}
      >
        {slots.imageUrl ? (
          <img
            src={slots.imageUrl}
            width={200}
            height={200}
            style={{
              width: 200,
              height: 200,
              objectFit: "cover",
              borderRadius: 999,
            }}
          />
        ) : (
          <div
            style={{
              width: 200,
              height: 200,
              borderRadius: 999,
              backgroundColor: brandKit.primaryColor,
              display: "flex",
            }}
          />
        )}
        <div
          style={{
            marginLeft: 40,
            fontSize: 56,
            fontWeight: 700,
          }}
        >
          {author}
        </div>
      </div>
    </div>
  );
}

registerTemplate({
  id: "depoimento-01-9x16",
  category: "depoimento",
  ratio: "9:16",
  width: WIDTH,
  height: HEIGHT,
  slots: ["headline", "authorName", "imageUrl"],
  retired: false,
  component: Depoimento01_9x16,
});
