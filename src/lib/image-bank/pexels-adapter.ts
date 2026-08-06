// Adaptador Pexels. API doc: https://www.pexels.com/api/documentation/
// Header: Authorization: <API_KEY>

import type { ImageBankResult } from "@/features/content-generation/types";

export interface SearchOpts {
  aspectRatio?: "1:1" | "9:16" | "16:9";
  minWidth?: number;
  colorHint?: string; // hex sem #
  timeoutMs?: number;
  signal?: AbortSignal;
}

const NAME = "pexels" as const;

function orientationFor(aspectRatio: SearchOpts["aspectRatio"]): string | null {
  if (aspectRatio === "9:16") return "portrait";
  if (aspectRatio === "16:9") return "landscape";
  if (aspectRatio === "1:1") return "square";
  return null;
}

export const pexelsAdapter = {
  name: NAME,
  async search(query: string, opts: SearchOpts): Promise<ImageBankResult | null> {
    const apiKey = process.env.PEXELS_API_KEY;
    if (!apiKey) return null;

    const params = new URLSearchParams({
      query,
      per_page: "1",
      size: "large",
    });
    const orient = orientationFor(opts.aspectRatio);
    if (orient) params.set("orientation", orient);
    if (opts.colorHint) {
      // Pexels aceita "color" com hex sem #
      params.set("color", opts.colorHint.replace(/^#/, ""));
    }

    const url = `https://api.pexels.com/v1/search?${params.toString()}`;
    const res = await fetch(url, {
      headers: { Authorization: apiKey },
      signal: opts.signal,
    });
    if (!res.ok) return null;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const json: any = await res.json();
    const photo = json.photos?.[0];
    if (!photo) return null;

    return {
      url: photo.src?.large2x ?? photo.src?.large ?? photo.src?.original,
      provider: NAME,
      author: photo.photographer ?? "Unknown",
      providerUrl: photo.url,
      attributionUrl: photo.photographer_url ?? photo.url,
      width: photo.width,
      height: photo.height,
    };
  },
};
