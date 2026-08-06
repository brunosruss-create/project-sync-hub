// Diagnóstico rápido do estado dos jobs de content_generation.
// Rodar com: tsx scripts/check-content-jobs.ts

import { createClient } from "@supabase/supabase-js";
import { readdirSync, readFileSync, existsSync } from "node:fs";
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
  console.log("=== message_jobs (últimos 5 de content_generation) ===");
  const { data: mj, error: mjErr } = await sb
    .from("message_jobs")
    .select("id,workspace_owner_id,status,attempts,last_error,scheduled_at,created_at,payload")
    .eq("job_type", "content_generation")
    .order("created_at", { ascending: false })
    .limit(5);
  if (mjErr) console.error("Erro message_jobs:", mjErr.message);
  console.log(JSON.stringify(mj, null, 2));

  console.log("\n=== content_jobs (últimos 5) ===");
  const { data: cj, error: cjErr } = await sb
    .from("content_jobs")
    .select("id,owner_user_id,status,stage,error_message,image_provider_used,duration_ms,created_at,completed_at")
    .order("created_at", { ascending: false })
    .limit(5);
  if (cjErr) console.error("Erro content_jobs:", cjErr.message);
  console.log(JSON.stringify(cj, null, 2));

  console.log("\n=== generated_assets (últimos 5) ===");
  const { data: ga, error: gaErr } = await sb
    .from("generated_assets")
    .select("id,job_id,target_network,approval_status,created_at")
    .order("created_at", { ascending: false })
    .limit(5);
  if (gaErr) console.error("Erro generated_assets:", gaErr.message);
  console.log(JSON.stringify(ga, null, 2));
}

main().then(() => process.exit(0));
