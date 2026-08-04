import { createServerFn } from "@tanstack/react-start";
import { getRequest, getRequestHost } from "@tanstack/react-start/server";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { zernio, ensureZernioProfile, type ZernioPlatform } from "@/lib/zernio.server";

// URL pública do app (pra montar o redirect_url do OAuth). Mesma lógica do
// evolution.functions.ts.
function isPublicHost(host: string | null | undefined): host is string {
  if (!host) return false;
  return !/^(localhost|127\.|0\.0\.0\.0|::1|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/i.test(host);
}
function publicBaseUrl(): string {
  const fromEnv =
    process.env.PUBLIC_APP_URL || process.env.APP_PUBLIC_URL || process.env.VITE_PUBLIC_APP_URL;
  if (fromEnv) return fromEnv.replace(/\/$/, "");
  try {
    const req = getRequest();
    const fwdHost = req.headers.get("x-forwarded-host");
    const fwdProto = req.headers.get("x-forwarded-proto") ?? "https";
    if (isPublicHost(fwdHost)) return `${fwdProto}://${fwdHost}`;
    const host = getRequestHost();
    if (isPublicHost(host)) return `https://${host}`;
  } catch {}
  return "";
}

const platformInput = z.object({ platform: z.enum(["whatsapp", "instagram"]) });

/**
 * Gera a URL de OAuth da Zernio para o workspace conectar um canal.
 * Garante um profile Zernio dedicado por workspace e registra a linha em
 * zernio_accounts como 'connecting'. Retorna { authUrl } pra redirecionar.
 */
export const getZernioConnectUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => platformInput.parse(d))
  .handler(async ({ data, context }) => {
    const ownerUserId = context.userId;
    const platform = data.platform as ZernioPlatform;

    const profileId = await ensureZernioProfile(ownerUserId);

    // Registra/atualiza a linha do canal como "connecting", guardando o profileId.
    const { data: existing } = await supabaseAdmin
      .from("zernio_accounts")
      .select("id")
      .eq("owner_user_id", ownerUserId)
      .eq("platform", platform)
      .maybeSingle();
    if (existing?.id) {
      await supabaseAdmin
        .from("zernio_accounts")
        .update({ zernio_profile_id: profileId, status: "connecting" })
        .eq("id", existing.id);
    } else {
      await supabaseAdmin.from("zernio_accounts").insert({
        owner_user_id: ownerUserId,
        platform,
        zernio_profile_id: profileId,
        status: "connecting",
      });
    }

    const base = publicBaseUrl();
    if (!base) {
      throw new Error(
        "URL pública do app não detectada. Defina o secret PUBLIC_APP_URL e tente novamente.",
      );
    }
    const redirectUrl = `${base}/zernio-callback`;

    const { authUrl } =
      platform === "whatsapp"
        ? await zernio.getWhatsAppAuthUrl(profileId, redirectUrl)
        : await zernio.getInstagramAuthUrl(profileId, redirectUrl);

    return { authUrl };
  });

const saveInput = z.object({
  platform: z.enum(["whatsapp", "instagram"]),
  accountId: z.string().min(1).max(255),
  username: z.string().max(255).optional(),
});

/**
 * Persiste a conta conectada após o retorno do OAuth. Chamado pelo route de
 * callback (browser autenticado → server fn com bearer token do usuário).
 * Nenhum token da Meta é armazenado — a Zernio guarda internamente.
 */
export const saveZernioConnection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => saveInput.parse(d))
  .handler(async ({ data, context }) => {
    const ownerUserId = context.userId;
    const { data: existing } = await supabaseAdmin
      .from("zernio_accounts")
      .select("id")
      .eq("owner_user_id", ownerUserId)
      .eq("platform", data.platform)
      .maybeSingle();

    const patch = {
      account_id: data.accountId,
      username: data.username ?? null,
      status: "connected",
      connected_at: new Date().toISOString(),
    };

    if (existing?.id) {
      await supabaseAdmin.from("zernio_accounts").update(patch).eq("id", existing.id);
    } else {
      await supabaseAdmin.from("zernio_accounts").insert({
        owner_user_id: ownerUserId,
        platform: data.platform,
        zernio_profile_id: "",
        ...patch,
      });
    }
    return { ok: true };
  });

/** Lista os canais Zernio conectados no workspace (pra UI de Ajustes). */
export const listZernioAccounts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data } = await supabaseAdmin
      .from("zernio_accounts")
      .select("platform,account_id,username,display_name,status,connected_at")
      .eq("owner_user_id", context.userId);
    return { accounts: data ?? [] };
  });

export const disconnectZernioAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => platformInput.parse(d))
  .handler(async ({ data, context }) => {
    await supabaseAdmin
      .from("zernio_accounts")
      .update({ status: "disconnected", account_id: null })
      .eq("owner_user_id", context.userId)
      .eq("platform", data.platform);
    return { ok: true };
  });
