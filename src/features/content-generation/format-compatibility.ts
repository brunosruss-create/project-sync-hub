// Compatibilidade entre PostFormat do módulo AI_Content_Generation e as
// redes/PostTypes suportadas pelo Social_Publishing_Module.
// Função pura — sem I/O — usável tanto no server quanto no client.

import type { PostFormat, TargetNetwork } from "./types";
import type { PostType } from "@/lib/social-post-validation";

// Mapeamento formato → PostType padrão por rede.
// Cada entrada representa o postType default que o AI Content module
// entrega ao Social_Publishing_Module no handoff.
const FORMAT_TO_POSTTYPE: Record<PostFormat, Partial<Record<TargetNetwork, PostType>>> = {
  single: {
    facebook: "feed",
    instagram: "feed",
    tiktok: "video",
    youtube: "video",
  },
  carousel: {
    facebook: "feed", // FB não tem carrossel nativo em posts publicados via API — cai pra imagem única
    instagram: "carousel",
    tiktok: "photo_carousel",
    // youtube não tem carrossel
  },
  story: {
    facebook: "reels", // Reels é o mais próximo de story vertical no FB
    instagram: "stories",
    tiktok: "video",
    youtube: "short",
  },
};

/**
 * Retorna o postType compatível de uma rede para o formato dado, ou null se
 * a rede NÃO suporta esse formato.
 */
export function postTypeFor(
  format: PostFormat,
  network: TargetNetwork,
): PostType | null {
  return FORMAT_TO_POSTTYPE[format][network] ?? null;
}

/**
 * Filtra a lista de redes alvo mantendo apenas as compatíveis com o formato.
 * Retorna { compatible: [...redes suportadas], dropped: [...redes descartadas] }.
 */
export function filterCompatibleNetworks(
  format: PostFormat,
  networks: TargetNetwork[],
): { compatible: TargetNetwork[]; dropped: TargetNetwork[] } {
  const compatible: TargetNetwork[] = [];
  const dropped: TargetNetwork[] = [];
  for (const net of networks) {
    if (postTypeFor(format, net) !== null) compatible.push(net);
    else dropped.push(net);
  }
  return { compatible, dropped };
}

/**
 * Confere que TODAS as redes selecionadas são compatíveis com o formato.
 * Retorna a lista de incompatibilidades (vazia se OK).
 */
export function checkFormatCompatibility(
  format: PostFormat,
  networks: TargetNetwork[],
): { network: TargetNetwork; reason: string }[] {
  return networks
    .filter((n) => postTypeFor(format, n) === null)
    .map((n) => ({
      network: n,
      reason: `Formato "${format}" não é suportado em ${n}`,
    }));
}
