// Template Depoimento 01 — 1080x1080. Foto redonda + aspas grandes + quote.

import type { ReactElement } from "react";
import { registerTemplate, type TemplateProps } from "../registry";
import { signatureBar } from "../shared";

const WIDTH = 1080;
const HEIGHT = 1080;

function Depoimento01_1x1({ brandKit, slots }: TemplateProps): ReactElement {
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
      <div style={signatureBar(brandKit)}>{brandKit.defaultSignature || "SUA MARCA"}</div>

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
        {/* Aspas gigantes */}
        <div
          style={{
            fontFamily: brandKit.displayFont,
            fontSize: 220,
            lineHeight: 0.8,
            color: brandKit.supportColor,
            marginBottom: 20,
          }}
        >
          &ldquo;
        </div>

        {/* Quote */}
        <div
          style={{
            fontFamily: brandKit.displayFont,
            fontSize: 56,
            fontWeight: 700,
            lineHeight: 1.2,
            marginBottom: 60,
          }}
        >
          {quote}
        </div>

        {/* Foto do cliente + nome */}
        <div style={{ display: "flex", alignItems: "center" }}>
          {slots.imageUrl ? (
            <img
              src={slots.imageUrl}
              width={110}
              height={110}
              style={{
                width: 110,
                height: 110,
                objectFit: "cover",
                borderRadius: 999,
              }}
            />
          ) : (
            <div
              style={{
                width: 110,
                height: 110,
                borderRadius: 999,
                backgroundColor: brandKit.supportColor,
                display: "flex",
              }}
            />
          )}
          <div
            style={{
              marginLeft: 24,
              fontSize: 34,
              fontWeight: 700,
            }}
          >
            {author}
          </div>
        </div>
      </div>
    </div>
  );
}

registerTemplate({
  id: "depoimento-01-1x1",
  category: "depoimento",
  ratio: "1:1",
  width: WIDTH,
  height: HEIGHT,
  slots: ["headline", "authorName", "imageUrl"],
  retired: false,
  component: Depoimento01_1x1,
});
