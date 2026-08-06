// Image_Bank: abstração de banco de imagens de estoque.
// Ordem de fallback: Pexels → Unsplash → Pixabay.
// Timeout curto por provedor (3s). Em falha, tenta próximo.
// Log de provedor bem-sucedido fica em `content_jobs.image_provider_used`.

import type { ImageBankResult } from "@/features/content-generation/types";
import { pexelsAdapter, type SearchOpts } from "./image-bank/pexels-adapter";
import { unsplashAdapter } from "./image-bank/unsplash-adapter";
import { pixabayAdapter } from "./image-bank/pixabay-adapter";

export { cacheImageBankImage } from "./image-bank/cache.server";

const PROVIDERS = [pexelsAdapter, unsplashAdapter, pixabayAdapter] as const;
const DEFAULT_TIMEOUT_MS = 3000;

function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  signal: AbortSignal,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      // dispara abort no fetch subjacente
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (signal as any).dispatchEvent?.(new Event("abort"));
      reject(new Error(`Timeout de ${timeoutMs}ms`));
    }, timeoutMs);
    promise
      .then((v) => {
        clearTimeout(timer);
        resolve(v);
      })
      .catch((err) => {
        clearTimeout(timer);
        reject(err);
      });
  });
}

/**
 * Busca uma imagem no Image_Bank tentando Pexels → Unsplash → Pixabay em ordem.
 * Retorna a primeira resposta bem-sucedida ou null se todos falharem.
 * Nunca lança para fora — falhas de provedor viram null.
 */
export async function searchImage(
  query: string,
  opts: SearchOpts = {},
): Promise<ImageBankResult | null> {
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  for (const provider of PROVIDERS) {
    const ctrl = new AbortController();
    try {
      const result = await withTimeout(
        provider.search(query, { ...opts, signal: ctrl.signal }),
        timeoutMs,
        ctrl.signal,
      );
      if (result) return result;
    } catch (err) {
      // Log discreto — próximo provedor assume.
      console.warn(
        `[image-bank] provedor ${provider.name} falhou: ${(err as Error).message}`,
      );
      continue;
    }
  }
  return null;
}
