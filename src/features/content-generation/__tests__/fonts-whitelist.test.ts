// Requirement 2.5: fontes restritas à whitelist.

import { describe, it, expect } from "vitest";
import {
  DISPLAY_FONTS,
  BODY_FONTS,
  SCRIPT_FONTS,
  ALL_FONTS,
  isValidDisplayFont,
  isValidBodyFont,
} from "@/features/content-generation/fonts/whitelist";

describe("Fonts whitelist", () => {
  it("tem exatamente 5 display fonts", () => {
    expect(DISPLAY_FONTS.length).toBe(5);
  });

  it("tem exatamente 4 body fonts", () => {
    expect(BODY_FONTS.length).toBe(4);
  });

  it("tem exatamente 2 script fonts", () => {
    expect(SCRIPT_FONTS.length).toBe(2);
  });

  it("ALL_FONTS é a união das 3 categorias", () => {
    expect(ALL_FONTS.length).toBe(DISPLAY_FONTS.length + BODY_FONTS.length + SCRIPT_FONTS.length);
  });

  it("aceita display font válido", () => {
    expect(isValidDisplayFont("Playfair Display")).toBe(true);
  });

  it("rejeita fonte fora da whitelist como display", () => {
    expect(isValidDisplayFont("Comic Sans")).toBe(false);
  });

  it("body aceita tanto BODY quanto SCRIPT fonts", () => {
    expect(isValidBodyFont("Inter")).toBe(true);
    expect(isValidBodyFont("Dancing Script")).toBe(true);
    expect(isValidBodyFont("Playfair Display")).toBe(false);
  });
});
