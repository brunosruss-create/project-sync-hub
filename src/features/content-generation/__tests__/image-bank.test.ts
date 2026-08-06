// Requirement 4.3: falha em cascata Pexels → Unsplash → Pixabay.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const fetchMock = vi.fn();
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(globalThis as any).fetch = fetchMock;

describe("image-bank fallback order", () => {
  beforeEach(() => {
    fetchMock.mockReset();
    process.env.PEXELS_API_KEY = "pex-key";
    process.env.UNSPLASH_ACCESS_KEY = "uns-key";
    process.env.PIXABAY_API_KEY = "pix-key";
  });

  afterEach(() => {
    delete process.env.PEXELS_API_KEY;
    delete process.env.UNSPLASH_ACCESS_KEY;
    delete process.env.PIXABAY_API_KEY;
  });

  it("usa Pexels quando ele responde com resultado", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        photos: [
          {
            src: { large2x: "https://pexels.example/img.jpg" },
            photographer: "Bob",
            photographer_url: "https://bob.example",
            url: "https://pexels.example/photo",
            width: 1200,
            height: 800,
          },
        ],
      }),
    });
    const { searchImage } = await import("@/lib/image-bank.server");
    const result = await searchImage("café da manhã");
    expect(result?.provider).toBe("pexels");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("cai para Unsplash quando Pexels retorna vazio", async () => {
    fetchMock
      .mockResolvedValueOnce({ ok: true, json: async () => ({ photos: [] }) })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          results: [
            {
              urls: { regular: "https://uns.example/img.jpg" },
              user: { name: "Alice", links: { html: "https://alice.example" } },
              links: { html: "https://uns.example/photo" },
              width: 1000,
              height: 1000,
            },
          ],
        }),
      });
    const { searchImage } = await import("@/lib/image-bank.server");
    const result = await searchImage("terapia");
    expect(result?.provider).toBe("unsplash");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("cai para Pixabay quando Pexels e Unsplash não retornam", async () => {
    fetchMock
      .mockResolvedValueOnce({ ok: true, json: async () => ({ photos: [] }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ results: [] }) })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          hits: [
            {
              largeImageURL: "https://pix.example/img.jpg",
              user: "Carla",
              pageURL: "https://pix.example/photo",
              imageWidth: 1024,
              imageHeight: 1024,
            },
          ],
        }),
      });
    const { searchImage } = await import("@/lib/image-bank.server");
    const result = await searchImage("cerveja artesanal");
    expect(result?.provider).toBe("pixabay");
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("retorna null quando todos os provedores falham", async () => {
    fetchMock
      .mockResolvedValueOnce({ ok: true, json: async () => ({ photos: [] }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ results: [] }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ hits: [] }) });
    const { searchImage } = await import("@/lib/image-bank.server");
    const result = await searchImage("qualquer coisa");
    expect(result).toBeNull();
  });
});
