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

/**
 * Busca vários resultados e retorna um aleatório dentre os top N.
 * Evita repetir sempre a mesma foto (bug de sempre pegar photos[0]).
 */
async function searchMany(
  apiKey: string,
  query: string,
  orientation: string | null,
  signal: AbortSignal | undefined,
): Promise<any[]> {
  const params = new URLSearchParams({
    query,
    per_page: "30", // pool grande pra ter variedade
  });
  if (orientation) params.set("orientation", orientation);
  const url = `https://api.pexels.com/v1/search?${params.toString()}`;
  const res = await fetch(url, {
    headers: { Authorization: apiKey },
    signal,
  });
  if (!res.ok) return [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const json: any = await res.json();
  return Array.isArray(json.photos) ? json.photos : [];
}

function pickRandom<T>(arr: T[]): T | null {
  if (arr.length === 0) return null;
  const idx = Math.floor(Math.random() * arr.length);
  return arr[idx];
}

export const pexelsAdapter = {
  name: NAME,
  async search(query: string, opts: SearchOpts): Promise<ImageBankResult | null> {
    const apiKey = process.env.PEXELS_API_KEY;
    if (!apiKey) return null;
    if (!query.trim()) return null;

    const orient = orientationFor(opts.aspectRatio);
    let photos = await searchMany(apiKey, query, orient, opts.signal);

    // Fallback: sem orientation se veio vazio
    if (photos.length === 0 && orient) {
      photos = await searchMany(apiKey, query, null, opts.signal);
    }
    if (photos.length === 0) return null;

    // Escolhe aleatório entre os melhores resultados (prioriza fotos com
    // resolução alta — mais provável de serem profissionais). Pega top 15
    // por relevância (ordem que o Pexels devolve) e sorteia entre eles.
    const topPool = photos.slice(0, 15);
    const photo = pickRandom(topPool);
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
