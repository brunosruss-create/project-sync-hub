// Adaptador Unsplash. API doc: https://unsplash.com/documentation
// Header: Authorization: Client-ID <ACCESS_KEY>

import type { ImageBankResult } from "@/features/content-generation/types";
import type { SearchOpts } from "./pexels-adapter";

const NAME = "unsplash" as const;

function orientationFor(aspectRatio: SearchOpts["aspectRatio"]): string | null {
  if (aspectRatio === "9:16") return "portrait";
  if (aspectRatio === "16:9") return "landscape";
  if (aspectRatio === "1:1") return "squarish";
  return null;
}

export const unsplashAdapter = {
  name: NAME,
  async search(query: string, opts: SearchOpts): Promise<ImageBankResult | null> {
    const apiKey = process.env.UNSPLASH_ACCESS_KEY;
    if (!apiKey) return null;

    const params = new URLSearchParams({
      query,
      per_page: "1",
    });
    const orient = orientationFor(opts.aspectRatio);
    if (orient) params.set("orientation", orient);
    // Unsplash aceita `color` como um nome (black, white, etc). Sem mapping direto
    // de hex, então ignoramos colorHint aqui.

    const url = `https://api.unsplash.com/search/photos?${params.toString()}`;
    const res = await fetch(url, {
      headers: { Authorization: `Client-ID ${apiKey}` },
      signal: opts.signal,
    });
    if (!res.ok) return null;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const json: any = await res.json();
    const photo = json.results?.[0];
    if (!photo) return null;

    return {
      url: photo.urls?.regular ?? photo.urls?.full,
      provider: NAME,
      author: photo.user?.name ?? photo.user?.username ?? "Unknown",
      providerUrl: photo.links?.html,
      attributionUrl: photo.user?.links?.html ?? photo.links?.html,
      width: photo.width,
      height: photo.height,
    };
  },
};
