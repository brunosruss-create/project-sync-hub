import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// Lazy on purpose: se este módulo acabar sendo puxado para o bundle do
// navegador por algum import transitivo (ex.: um helper "solto" fora de um
// createServerFn().handler(), como já aconteceu antes — ver incidente
// 2026-07-25), a mera importação do arquivo NÃO deve executar createClient.
// process.env é {} no browser, então SERVICE_ROLE_KEY viraria "" e
// createClient(url, "") lança "supabaseKey is required" na hora do import,
// derrubando a página inteira antes mesmo de qualquer handler rodar. Com o
// Proxy, o client real só é construído no primeiro uso — que só acontece de
// verdade dentro de código server-side.
let real: SupabaseClient | null = null;

function getRealClient(): SupabaseClient {
  if (real) return real;
  const SUPABASE_URL =
    process.env.SUPABASE_URL ||
    process.env.VITE_SUPABASE_URL ||
    "https://xrezmnaspkctuidehqqi.supabase.co";

  // Aceita os dois nomes de secret comuns no Lovable/Supabase
  const SERVICE_ROLE_KEY =
    process.env.APP_SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!SERVICE_ROLE_KEY) {
    // eslint-disable-next-line no-console
    console.warn(
      "[supabaseAdmin] Nenhuma service role key encontrada (esperado APP_SUPABASE_SERVICE_ROLE_KEY ou SUPABASE_SERVICE_ROLE_KEY). Operações admin vão falhar por RLS.",
    );
  }

  real = createClient(SUPABASE_URL, SERVICE_ROLE_KEY ?? "", {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return real;
}

export const supabaseAdmin: SupabaseClient = new Proxy({} as SupabaseClient, {
  get(_target, prop, receiver) {
    return Reflect.get(getRealClient(), prop, receiver);
  },
});
