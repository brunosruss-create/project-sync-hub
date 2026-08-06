// Adaptador Pixabay. API doc: https://pixabay.com/api/docs/
// Query param: key=<API_KEY>

import type { ImageBankResult } from "@/features/content-generation/types";
import type { SearchOpts } from "./pexels-adapter";

const NAME = "pixabay" as const;

function orientationFor(aspectRatio: SearchOpts["aspectRatio"]): string | null {
  if (aspectRatio === "9:16") return "vertical";
  if (aspectRatio === "16:9" || aspectRatio === "1:1") return "horizontal";
  return null;
}

export const pixabayAdapter = {
  name: NAME,
  async search(query: string, opts: SearchOpts): Promise<ImageBankResult | null> {
    const apiKey = process.env.PIXABAY_API_KEY;
    if (!apiKey) return null;

    const params = new URLSearchParams({
      key: apiKey,
      q: query,
      per_page: "3",
      image_type: "photo",
      safesearch: "true",
    });
    const orient = orientationFor(opts.aspectRatio);
    if (orient) params.set("orientation", orient);

    const url = `https://pixabay.com/api/?${params.toString()}`;
    const res = await fetch(url, { signal: opts.signal });
    if (!res.ok) return null;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const json: any = await res.json();
    const photo = json.hits?.[0];
    if (!photo) return null;

    return {
      url: photo.largeImageURL ?? photo.webformatURL,
      provider: NAME,
      author: photo.user ?? "Unknown",
      providerUrl: photo.pageURL,
      attributionUrl: photo.pageURL,
      width: photo.imageWidth ?? photo.webformatWidth,
      height: photo.imageHeight ?? photo.webformatHeight,
    };
  },
};
