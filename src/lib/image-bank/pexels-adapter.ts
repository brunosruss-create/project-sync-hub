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
 * Tenta uma busca no Pexels. Se retornar vazio, tenta de novo SEM orientation
 * (fallback pra maximizar recall — melhor uma foto sem crop ideal do que nenhuma).
 */
async function searchOnce(
  apiKey: string,
  query: string,
  orientation: string | null,
  signal: AbortSignal | undefined,
): Promise<any | null> {
  const params = new URLSearchParams({
    query,
    per_page: "5",
  });
  if (orientation) params.set("orientation", orientation);
  const url = `https://api.pexels.com/v1/search?${params.toString()}`;
  const res = await fetch(url, {
    headers: { Authorization: apiKey },
    signal,
  });
  if (!res.ok) return null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const json: any = await res.json();
  return json.photos?.[0] ?? null;
}

export const pexelsAdapter = {
  name: NAME,
  async search(query: string, opts: SearchOpts): Promise<ImageBankResult | null> {
    const apiKey = process.env.PEXELS_API_KEY;
    if (!apiKey) return null;
    if (!query.trim()) return null;

    // Nota: NÃO usamos `size=large` nem `color` — ambos filtram muito o pool
    // de resultados. Melhor pegar uma foto qualquer boa do que nenhuma.
    const orient = orientationFor(opts.aspectRatio);
    let photo = await searchOnce(apiKey, query, orient, opts.signal);

    // Fallback 1: se com orientation não achou, tenta sem
    if (!photo && orient) {
      photo = await searchOnce(apiKey, query, null, opts.signal);
    }
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
