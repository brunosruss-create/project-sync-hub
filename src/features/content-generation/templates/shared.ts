// Helpers de estilo compartilhados pelos templates.
// Todos retornam objetos plain de estilo compatíveis com Satori.

import type { BrandKit } from "../types";

export function signatureBar(brandKit: BrandKit, height = 90) {
  return {
    height,
    display: "flex" as const,
    alignItems: "center" as const,
    paddingLeft: 60,
    paddingRight: 60,
    backgroundColor: brandKit.secondaryColor,
    fontFamily: brandKit.displayFont,
    fontSize: 32,
    fontWeight: 700 as const,
    letterSpacing: 2,
    color: "#FFFFFF",
  };
}

export function ctaBar(brandKit: BrandKit, height = 120, fontSize = 48) {
  return {
    height,
    display: "flex" as const,
    alignItems: "center" as const,
    justifyContent: "center" as const,
    backgroundColor: brandKit.supportColor,
    color: brandKit.secondaryColor,
    fontFamily: brandKit.displayFont,
    fontSize,
    fontWeight: 700 as const,
    letterSpacing: 1,
  };
}
