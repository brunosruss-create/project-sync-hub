/**
 * Compara supabase/manual/*.sql com o ledger public.schema_manual_migrations
 * e informa o que ainda falta rodar no SQL Editor.
 *
 * Existe porque as migrations deste projeto são aplicadas à mão (ver
 * docs/INFRAESTRUTURA.md) e não havia nenhuma forma de saber o que já rodou.
 *
 * Rodar com: npm run migrations:check
 */
import { createClient } from "@supabase/supabase-js";
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const MANUAL_DIR = resolve(REPO_ROOT, "supabase/manual");
const LEDGER_TABLE = "schema_manual_migrations";

/** Lê .env / .env.local sem dependência extra (o projeto não usa dotenv). */
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
      // .env.local não sobrescreve o que já veio do ambiente real
      if (process.env[key]) continue;
      process.env[key] = line
        .slice(eq + 1)
        .trim()
        .replace(/^["']|["']$/g, "");
    }
  }
}

/**
 * Sinaliza falha e encerra. Usa `exitCode` em vez de `process.exit()` porque
 * matar o processo com handles do supabase-js ainda abertos dispara uma
 * assertion do libuv no Windows.
 */
class CheckError extends Error {}

function fail(msg: string): never {
  throw new CheckError(msg);
}

async function main() {
  loadEnvFiles();

  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  // Mesmos nomes aceitos por src/integrations/supabase/client.server.ts
  const serviceKey =
    process.env.APP_SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url) fail("SUPABASE_URL (ou VITE_SUPABASE_URL) não encontrada no ambiente nem no .env");
  if (!serviceKey) {
    fail(
      "Service role key não encontrada. Defina SUPABASE_SERVICE_ROLE_KEY (ou " +
        "APP_SUPABASE_SERVICE_ROLE_KEY) no .env — o ledger tem RLS e a chave anônima não lê.",
    );
  }

  const repoFiles = readdirSync(MANUAL_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort();

  if (repoFiles.length === 0) fail(`Nenhum .sql encontrado em ${MANUAL_DIR}`);

  const supabase = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data, error } = await supabase.from(LEDGER_TABLE).select("filename");

  if (error) {
    if (/does not exist|schema cache/i.test(error.message)) {
      fail(
        `Tabela public.${LEDGER_TABLE} não existe ainda.\n` +
          "  Rode primeiro, no SQL Editor:\n" +
          "    supabase/manual/20260803000000_migration_ledger.sql\n" +
          "    supabase/manual/20260803000100_migration_ledger_backfill.sql",
      );
    }
    fail(`Erro ao consultar o ledger: ${error.message}`);
  }

  const applied = new Set((data ?? []).map((r: { filename: string }) => r.filename));
  const pending = repoFiles.filter((f) => !applied.has(f));
  const orphans = [...applied].filter((f) => !repoFiles.includes(f)).sort();

  console.log(`\nMigrations manuais: ${repoFiles.length} no repo, ${applied.size} no ledger\n`);

  if (pending.length > 0) {
    console.log(`⚠ Faltando aplicar (${pending.length}) — rode no SQL Editor, nesta ordem:`);
    for (const f of pending) console.log(`    supabase/manual/${f}`);
    console.log("");
  }

  if (orphans.length > 0) {
    console.log(`ℹ No ledger mas ausentes do repo (${orphans.length}) — arquivo renomeado/removido?`);
    for (const f of orphans) console.log(`    ${f}`);
    console.log("");
  }

  if (pending.length === 0 && orphans.length === 0) {
    console.log("✔ Banco em dia com o repo.\n");
  }

  // Exit != 0 quando há pendência, para servir de gate em CI/pre-deploy.
  process.exitCode = pending.length > 0 ? 1 : 0;
}

main().catch((e) => {
  console.error(`\n✖ ${e instanceof Error ? e.message : String(e)}\n`);
  process.exitCode = 1;
});
