// Carrega fontes TTF do node_modules/@expo-google-fonts em ArrayBuffer,
// no formato que o Satori espera. Cacheado em memória por processo.

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { AnyFont } from "./whitelist";

// Mapa: nome amigável (usado no BrandKit) → subpasta do pacote @expo-google-fonts
const FONT_PACKAGE_MAP: Record<AnyFont, string> = {
  "Playfair Display": "playfair-display",
  "Bebas Neue": "bebas-neue",
  Montserrat: "montserrat",
  Poppins: "poppins",
  Oswald: "oswald",
  Inter: "inter",
  "DM Sans": "dm-sans",
  Lato: "lato",
  Nunito: "nunito",
  "Dancing Script": "dancing-script",
  Caveat: "caveat",
};

// Alguns pacotes têm apenas peso Regular disponível como default (ex: Bebas Neue).
// Estrutura: <package>/<variant>/<file>.ttf
const FONT_VARIANT_MAP: Partial<Record<AnyFont, { regular: string; bold?: string }>> = {
  "Playfair Display": {
    regular: "400Regular/PlayfairDisplay_400Regular.ttf",
    bold: "700Bold/PlayfairDisplay_700Bold.ttf",
  },
  "Bebas Neue": {
    regular: "400Regular/BebasNeue_400Regular.ttf",
  },
  Montserrat: {
    regular: "400Regular/Montserrat_400Regular.ttf",
    bold: "700Bold/Montserrat_700Bold.ttf",
  },
  Poppins: {
    regular: "400Regular/Poppins_400Regular.ttf",
    bold: "700Bold/Poppins_700Bold.ttf",
  },
  Oswald: {
    regular: "400Regular/Oswald_400Regular.ttf",
    bold: "700Bold/Oswald_700Bold.ttf",
  },
  Inter: {
    regular: "400Regular/Inter_400Regular.ttf",
    bold: "700Bold/Inter_700Bold.ttf",
  },
  "DM Sans": {
    regular: "400Regular/DMSans_400Regular.ttf",
    bold: "700Bold/DMSans_700Bold.ttf",
  },
  Lato: {
    regular: "400Regular/Lato_400Regular.ttf",
    bold: "700Bold/Lato_700Bold.ttf",
  },
  Nunito: {
    regular: "400Regular/Nunito_400Regular.ttf",
    bold: "700Bold/Nunito_700Bold.ttf",
  },
  "Dancing Script": {
    regular: "400Regular/DancingScript_400Regular.ttf",
    bold: "700Bold/DancingScript_700Bold.ttf",
  },
  Caveat: {
    regular: "400Regular/Caveat_400Regular.ttf",
    bold: "700Bold/Caveat_700Bold.ttf",
  },
};

// Interface que casa com FontOptions do Satori.
export interface LoadedFont {
  name: string;
  data: ArrayBuffer;
  weight: 400 | 700;
  style: "normal";
}

// Cache em memória, chave = nome da fonte.
const fontCache = new Map<string, LoadedFont[]>();

async function resolveNodeModulesRoot(): Promise<string> {
  // Sobe da posição atual do módulo até encontrar `node_modules`.
  const start = fileURLToPath(import.meta.url);
  let dir = path.dirname(start);
  for (let i = 0; i < 10; i++) {
    const candidate = path.join(dir, "node_modules");
    try {
      const stat = await fs.stat(candidate);
      if (stat.isDirectory()) return candidate;
    } catch {
      // sobe
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  // Fallback: cwd/node_modules
  return path.join(process.cwd(), "node_modules");
}

let nodeModulesRoot: string | null = null;

async function loadFontFile(pkg: string, relPath: string): Promise<ArrayBuffer> {
  if (!nodeModulesRoot) nodeModulesRoot = await resolveNodeModulesRoot();
  const full = path.join(nodeModulesRoot, "@expo-google-fonts", pkg, relPath);
  const buf = await fs.readFile(full);
  // Retornamos ArrayBuffer novo pra desacoplar do Buffer do Node.
  const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
  return ab as ArrayBuffer;
}

/**
 * Carrega uma ou mais fontes por nome. Se a fonte já foi carregada neste
 * processo, retorna do cache. Cada fonte pode ter até 2 pesos (400 + 700).
 */
export async function loadFonts(names: string[]): Promise<LoadedFont[]> {
  const unique = Array.from(new Set(names));
  const out: LoadedFont[] = [];
  for (const name of unique) {
    if (fontCache.has(name)) {
      out.push(...(fontCache.get(name) ?? []));
      continue;
    }
    const pkg = FONT_PACKAGE_MAP[name as AnyFont];
    const variants = FONT_VARIANT_MAP[name as AnyFont];
    if (!pkg || !variants) {
      // Fonte não whitelistada: pula silenciosamente.
      continue;
    }
    const loaded: LoadedFont[] = [];
    try {
      const regularData = await loadFontFile(pkg, variants.regular);
      loaded.push({ name, data: regularData, weight: 400, style: "normal" });
    } catch (err) {
      // Se o arquivo Regular não existe, a fonte é inutilizável.
      throw new Error(
        `Fonte "${name}" não encontrada: ${(err as Error).message}. Verifique se @expo-google-fonts/${pkg} está instalado.`,
      );
    }
    if (variants.bold) {
      try {
        const boldData = await loadFontFile(pkg, variants.bold);
        loaded.push({ name, data: boldData, weight: 700, style: "normal" });
      } catch {
        // Bold é opcional: se falhar, seguimos só com Regular.
      }
    }
    fontCache.set(name, loaded);
    out.push(...loaded);
  }
  return out;
}
