// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - tanstackStart, viteReact, tailwindcss, tsConfigPaths, cloudflare (build-only),
//     componentTagger (dev-only), VITE_* env injection, @ path alias, React/TanStack dedupe,
//     error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... } }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";

// Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
// @cloudflare/vite-plugin builds from this — wrangler.jsonc main alone is insufficient.
//
// Externals: satori, @resvg/resvg-js, node-vibrant e cheerio — todos com deps
// nativas (.node) ou imports dinâmicos que o Rollup não sabe parsear.
// Deixá-los como externals faz o Nitro carregá-los em runtime como CommonJS
// no servidor, sem tentar bundlar.
const AI_CONTENT_EXTERNALS = [
  "satori",
  "@resvg/resvg-js",
  "node-vibrant",
  "node-vibrant/node",
  "cheerio",
  "@google/genai",
  /^@resvg\/resvg-js-.+$/,
];

export default defineConfig({
  tanstackStart: {
    server: { entry: "server" },
  },
  vite: {
    ssr: {
      external: [
        "satori",
        "@resvg/resvg-js",
        "node-vibrant",
        "node-vibrant/node",
        "cheerio",
        "@google/genai",
      ],
    },
    build: {
      rollupOptions: {
        external: AI_CONTENT_EXTERNALS,
      },
    },
  },
});
