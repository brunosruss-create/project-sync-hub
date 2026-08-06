// Fonte única da chave/modelo Gemini para todos os módulos que consomem IA.
// A chave vive em public.global_settings (key='gemini_api_key'), configurada
// pelo Super Admin em /super-admin/ia — nunca em env var.
//
// Cacheado em memória por 30s para evitar hit de banco em cada geração.

import { supabaseAdmin } from "@/integrations/supabase/client.server";

interface CachedCreds {
  apiKey: string;
  model: string;
  expiresAt: number;
}

let cache: CachedCreds | null = null;
const TTL_MS = 30_000;

export interface GeminiCredentials {
  apiKey: string;
  model: string;
}

export async function loadGeminiCredentials(opts?: {
  preferredModel?: string;
}): Promise<GeminiCredentials> {
  const now = Date.now();
  if (cache && cache.expiresAt > now) {
    return {
      apiKey: cache.apiKey,
      model: opts?.preferredModel ?? cache.model,
    };
  }

  const { data } = await supabaseAdmin
    .from("global_settings")
    .select("key,value")
    .in("key", ["gemini_api_key", "gemini_model"]);

  const map = Object.fromEntries(
    (data ?? []).map((r) => [
      (r as { key: string }).key,
      (r as { value: string | null }).value ?? "",
    ]),
  );

  const apiKey = (map.gemini_api_key ?? "").trim();
  const model = (map.gemini_model ?? "").trim() || "gemini-2.0-flash";

  if (!apiKey) {
    // Fallback pra env var só se o Super Admin ainda não configurou
    // (útil em dev/staging onde ambiente pode ter chave setada).
    const envKey =
      process.env.GEMINI_API_KEY ??
      process.env.GOOGLE_GENAI_API_KEY ??
      process.env.GOOGLE_API_KEY;
    if (envKey) {
      cache = { apiKey: envKey, model, expiresAt: now + TTL_MS };
      return { apiKey: envKey, model: opts?.preferredModel ?? model };
    }
    throw new Error(
      "Gemini não configurado — Super Admin deve preencher a chave em /super-admin/ia.",
    );
  }

  cache = { apiKey, model, expiresAt: now + TTL_MS };
  return { apiKey, model: opts?.preferredModel ?? model };
}

/** Invalida o cache — chamar quando o Super Admin atualizar as credenciais. */
export function invalidateGeminiCredentialsCache(): void {
  cache = null;
}
