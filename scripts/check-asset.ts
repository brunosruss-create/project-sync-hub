// Diagnóstico de um asset específico.
import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function loadEnvFiles(): void {
  for (const name of [".env", ".env.local"]) {
    const path = resolve(REPO_ROOT, name);
    if (!existsSync(path)) continue;
    for (const rawLine of readFileSync(path, "utf8").split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line || line.startsWith("#")) continue;
      const eq = line.indexOf("=");
      if (eq === -1) continue;
      const key = line.slice(0, eq).trim();
      if (process.env[key]) continue;
      process.env[key] = line.slice(eq + 1).trim().replace(/^["']|["']$/g, "");
    }
  }
}

loadEnvFiles();

const url = process.env.VITE_SUPABASE_URL ?? process.env.SUPABASE_URL;
const key =
  process.env.APP_SUPABASE_SERVICE_ROLE_KEY ??
  process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) throw new Error("Env vars ausentes");

const sb = createClient(url, key);

async function main() {
  const { data: assets } = await sb
    .from("generated_assets")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(2);
  console.log("=== Assets recentes ===");
  console.log(JSON.stringify(assets, null, 2));

  // Testa se a URL é acessível
  if (assets && assets[0]) {
    const url = (assets[0] as any).rendered_image_url;
    console.log("\n=== Testando URL ===");
    console.log(url);
    const res = await fetch(url);
    console.log("HTTP status:", res.status);
    console.log("Content-Type:", res.headers.get("content-type"));
    console.log("Content-Length:", res.headers.get("content-length"));
  }

  console.log("\n=== Bucket ai-content ===");
  const { data: buckets } = await sb.storage.listBuckets();
  const bucket = buckets?.find((b) => b.id === "ai-content");
  console.log(JSON.stringify(bucket, null, 2));
}

main().then(() => process.exit(0));
