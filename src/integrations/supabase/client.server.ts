import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL =
  process.env.VITE_SUPABASE_URL ||
  "https://xrezmnaspkctuidehqqi.supabase.co";
const SERVICE_ROLE_KEY = process.env.APP_SUPABASE_SERVICE_ROLE_KEY;

if (!SERVICE_ROLE_KEY) {
  // eslint-disable-next-line no-console
  console.warn("APP_SUPABASE_SERVICE_ROLE_KEY is not set");
}

export const supabaseAdmin = createClient(
  SUPABASE_URL,
  SERVICE_ROLE_KEY ?? "",
  {
    auth: { persistSession: false, autoRefreshToken: false },
  },
);
