import { createClient } from "@supabase/supabase-js";

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

export const supabaseAdmin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY ?? "", {
  auth: { persistSession: false, autoRefreshToken: false },
});
