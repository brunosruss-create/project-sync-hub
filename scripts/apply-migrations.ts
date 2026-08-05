/**
 * Aplica migrations pendentes de supabase/manual/*.sql no banco remoto,
 * via RPC `public.apply_migration_sql(text)` (ver
 * supabase/manual/20260808000100_bootstrap_apply_sql_rpc.sql).
 *
 * Fluxo: lista arquivos em ordem alfabética, cruza com o ledger
 * `public.schema_manual_migrations`, aplica só as que faltam. Cada arquivo
 * é enviado inteiro (a função executa `execute sql` — o Postgres aceita
 * múltiplas statements). O próprio arquivo termina se registrando no
 * ledger (padrão do projeto), então basta rodar até o final sem erro.
 *
 * Rodar com: npm run migrations:apply
 *
 * Segurança: usa SERVICE_ROLE_KEY que já ignora RLS. NUNCA rodar com chave
 * anônima — a função de RPC só concede EXECUTE ao service_role.
 */
import { createClient } from "@supabase/supabase-js";
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const MANUAL_DIR = resolve(REPO_ROOT, "supabase/manual");
const LEDGER_TABLE = "schema_manual_migrations";
const APPLY_FN = "apply_migration_sql";

/** Lê .env / .env.local sem depender de dotenv (mesmo do check-migrations). */
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
      process.env[key] = line
        .slice(eq + 1)
        .trim()
        .replace(/^["']|["']$/g, "");
    }
  }
}

function fail(msg: string): never {
  throw new Error(msg);
}

async function main() {
  loadEnvFiles();

  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const serviceKey =
    process.env.APP_SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url) fail("SUPABASE_URL (ou VITE_SUPABASE_URL) não encontrada.");
  if (!serviceKey) fail("SUPABASE_SERVICE_ROLE_KEY não encontrada no .env.");

  const repoFiles = readdirSync(MANUAL_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort();
  if (repoFiles.length === 0) fail(`Nenhum .sql em ${MANUAL_DIR}`);

  const supabase = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: appliedRows, error: readErr } = await supabase
    .from(LEDGER_TABLE)
    .select("filename");
  if (readErr) {
    if (/does not exist|schema cache/i.test(readErr.message)) {
      fail(
        `Ledger public.${LEDGER_TABLE} não existe.\n` +
          "Rode primeiro no SQL Editor:\n" +
          "  - supabase/manual/20260803000000_migration_ledger.sql\n" +
          "  - supabase/manual/20260803000100_migration_ledger_backfill.sql\n" +
          "  - supabase/manual/20260808000100_bootstrap_apply_sql_rpc.sql",
      );
    }
    fail(`Erro ao ler ledger: ${readErr.message}`);
  }
  const applied = new Set((appliedRows ?? []).map((r: { filename: string }) => r.filename));
  const pending = repoFiles.filter((f) => !applied.has(f));

  if (pending.length === 0) {
    console.log("✔ Banco em dia.\n");
    return;
  }

  console.log(`\n→ Aplicando ${pending.length} migration(s):`);
  for (const f of pending) console.log(`   • ${f}`);
  console.log("");

  for (const filename of pending) {
    const path = resolve(MANUAL_DIR, filename);
    const sql = readFileSync(path, "utf8");
    process.stdout.write(`  ${filename} ... `);

    const { error } = await supabase.rpc(APPLY_FN, { sql });
    if (error) {
      // Sinaliza qual arquivo quebrou — o resto fica pendente pra próxima corrida.
      const isMissingFn = /function.*does not exist|schema cache/i.test(error.message);
      const hint = isMissingFn
        ? `\n     ↳ RPC ${APPLY_FN} ainda não foi aplicada. Cole no SQL Editor primeiro:\n` +
          `       supabase/manual/20260808000100_bootstrap_apply_sql_rpc.sql`
        : "";
      console.log("✖");
      fail(`Falha em ${filename}: ${error.message}${hint}`);
    }
    console.log("✔");
  }

  console.log(`\n✔ ${pending.length} migration(s) aplicada(s).\n`);
}

main().catch((e) => {
  console.error(`\n✖ ${e instanceof Error ? e.message : String(e)}\n`);
  process.exitCode = 1;
});
