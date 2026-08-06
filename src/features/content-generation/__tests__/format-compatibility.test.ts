// Requirement 9.5: incompatibilidade de formato × rede deve ser detectada.

import { describe, it, expect } from "vitest";
import {
  postTypeFor,
  filterCompatibleNetworks,
  checkFormatCompatibility,
} from "@/features/content-generation/format-compatibility";

describe("format compatibility", () => {
  it("single é compatível com todas as 4 redes", () => {
    for (const net of ["facebook", "instagram", "tiktok", "youtube"] as const) {
      expect(postTypeFor("single", net)).not.toBeNull();
    }
  });

  it("carousel NÃO é suportado no YouTube", () => {
    expect(postTypeFor("carousel", "youtube")).toBeNull();
  });

  it("carousel é suportado em FB/IG/TikTok", () => {
    expect(postTypeFor("carousel", "facebook")).not.toBeNull();
    expect(postTypeFor("carousel", "instagram")).not.toBeNull();
    expect(postTypeFor("carousel", "tiktok")).not.toBeNull();
  });

  it("story compatível com IG/FB/TikTok/YouTube (short)", () => {
    for (const net of ["facebook", "instagram", "tiktok", "youtube"] as const) {
      expect(postTypeFor("story", net)).not.toBeNull();
    }
  });

  it("filterCompatibleNetworks dropa redes incompatíveis", () => {
    const { compatible, dropped } = filterCompatibleNetworks("carousel", [
      "instagram",
      "youtube",
      "tiktok",
    ]);
    expect(compatible).toEqual(["instagram", "tiktok"]);
    expect(dropped).toEqual(["youtube"]);
  });

  it("checkFormatCompatibility lista incompatibilidades explicitamente", () => {
    const issues = checkFormatCompatibility("carousel", ["youtube", "instagram"]);
    expect(issues.length).toBe(1);
    expect(issues[0].network).toBe("youtube");
  });

  it("todas as redes compatíveis: nenhuma incompatibilidade", () => {
    const issues = checkFormatCompatibility("single", [
      "facebook",
      "instagram",
      "tiktok",
      "youtube",
    ]);
    expect(issues.length).toBe(0);
  });
});
