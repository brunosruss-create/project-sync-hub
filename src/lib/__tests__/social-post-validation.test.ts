// Task 18: Testes unitários do módulo de validação de publicação social.
// Feature: social-media-publishing

import { describe, it, expect } from "vitest";
import {
  validatePostTarget,
  getSupportedPostTypes,
  getLimits,
  PLATFORM_LIMITS,
  type SocialPlatform,
  type PostType,
} from "@/lib/social-post-validation";

describe("social-post-validation", () => {
  describe("getSupportedPostTypes", () => {
    it("retorna post types corretos para cada plataforma", () => {
      expect(getSupportedPostTypes("facebook")).toEqual(["feed", "reels", "stories"]);
      expect(getSupportedPostTypes("instagram")).toEqual(["feed", "carousel", "story", "reel"]);
      expect(getSupportedPostTypes("tiktok")).toEqual(["video", "photo_carousel"]);
      expect(getSupportedPostTypes("youtube")).toEqual(["video", "short"]);
    });
  });

  describe("getLimits", () => {
    it("retorna limites para combinação suportada", () => {
      const limits = getLimits("instagram", "reel");
      expect(limits).not.toBeNull();
      expect(limits!.charLimit).toBe(2200);
      expect(limits!.maxMedia).toBe(1);
      expect(limits!.mediaTypes).toEqual(["video"]);
      expect(limits!.maxVideoDurationSec).toBe(90);
    });

    it("retorna null para combinação não suportada", () => {
      expect(getLimits("youtube", "carousel" as PostType)).toBeNull();
    });
  });

  describe("tabela de limites: uma asserção por combinação", () => {
    const cases: Array<[SocialPlatform, PostType, number, number, number]> = [
      // [platform, postType, charLimit, minMedia, maxMedia]
      ["facebook", "feed", 50_000, 0, 1],
      ["facebook", "reels", 50_000, 1, 1],
      ["facebook", "stories", 50_000, 1, 1],
      ["instagram", "feed", 2200, 1, 1],
      ["instagram", "carousel", 2200, 2, 10],
      ["instagram", "story", 2200, 1, 1],
      ["instagram", "reel", 2200, 1, 1],
      ["tiktok", "video", 2200, 1, 1],
      ["tiktok", "photo_carousel", 4000, 2, 35],
      ["youtube", "video", 5000, 1, 1],
      ["youtube", "short", 5000, 1, 1],
    ];
    for (const [platform, postType, charLimit, minMedia, maxMedia] of cases) {
      it(`${platform}/${postType}: char=${charLimit}, min=${minMedia}, max=${maxMedia}`, () => {
        const limits = getLimits(platform, postType);
        expect(limits).not.toBeNull();
        expect(limits!.charLimit).toBe(charLimit);
        expect(limits!.minMedia).toBe(minMedia);
        expect(limits!.maxMedia).toBe(maxMedia);
      });
    }
  });

  describe("validatePostTarget", () => {
    it("aceita post válido do Instagram feed", () => {
      const result = validatePostTarget({
        platform: "instagram",
        postType: "feed",
        text: "Hello world!",
        mediaItems: [{ type: "image", mime: "image/jpeg" }],
      });
      expect(result.valid).toBe(true);
      expect(result.violations).toHaveLength(0);
    });

    it("rejeita texto que excede o limite", () => {
      const result = validatePostTarget({
        platform: "instagram",
        postType: "feed",
        text: "x".repeat(2201),
        mediaItems: [{ type: "image" }],
      });
      expect(result.valid).toBe(false);
      expect(result.violations[0].constraint).toBe("char_limit");
    });

    it("rejeita quando falta mídia obrigatória", () => {
      const result = validatePostTarget({
        platform: "instagram",
        postType: "reel",
        text: "Meu reel",
        mediaItems: [],
      });
      expect(result.valid).toBe(false);
      expect(result.violations.some((v) => v.constraint === "media_required")).toBe(true);
    });

    it("rejeita tipo de mídia errado", () => {
      const result = validatePostTarget({
        platform: "instagram",
        postType: "reel",
        text: "Reel",
        mediaItems: [{ type: "image" }],
      });
      expect(result.valid).toBe(false);
      expect(result.violations.some((v) => v.constraint === "format")).toBe(true);
    });

    it("rejeita excesso de mídia no carousel", () => {
      const result = validatePostTarget({
        platform: "instagram",
        postType: "carousel",
        text: "Carousel",
        mediaItems: Array.from({ length: 11 }, () => ({ type: "image" as const })),
      });
      expect(result.valid).toBe(false);
      expect(result.violations.some((v) => v.constraint === "count")).toBe(true);
    });

    it("rejeita postType não suportado", () => {
      const result = validatePostTarget({
        platform: "youtube",
        postType: "carousel" as PostType,
        text: "Test",
        mediaItems: [],
      });
      expect(result.valid).toBe(false);
      expect(result.violations[0].constraint).toBe("post_type_unsupported");
    });

    it("rejeita postType null", () => {
      const result = validatePostTarget({
        platform: "tiktok",
        postType: null,
        text: "Test",
        mediaItems: [],
      });
      expect(result.valid).toBe(false);
      expect(result.violations[0].constraint).toBe("post_type_unsupported");
    });

    it("rejeita duração de vídeo excedida", () => {
      const result = validatePostTarget({
        platform: "instagram",
        postType: "reel",
        text: "Reel longo",
        mediaItems: [{ type: "video", mime: "video/mp4", durationSec: 95 }],
      });
      expect(result.valid).toBe(false);
      expect(result.violations.some((v) => v.constraint === "duration")).toBe(true);
    });

    it("aceita TikTok photo_carousel com 35 imagens", () => {
      const result = validatePostTarget({
        platform: "tiktok",
        postType: "photo_carousel",
        text: "Carousel grande",
        mediaItems: Array.from({ length: 35 }, () => ({ type: "image" as const, mime: "image/jpeg" })),
      });
      expect(result.valid).toBe(true);
    });

    it("rejeita mix de foto e vídeo quando não permitido", () => {
      const result = validatePostTarget({
        platform: "tiktok",
        postType: "photo_carousel",
        text: "Mix",
        mediaItems: [
          { type: "image", mime: "image/jpeg" },
          { type: "video", mime: "video/mp4" },
        ],
      });
      expect(result.valid).toBe(false);
      // Pode ser "format" (vídeo não aceito em photo_carousel) ou "mixed_media"
      expect(result.violations.length).toBeGreaterThan(0);
    });
  });
});
