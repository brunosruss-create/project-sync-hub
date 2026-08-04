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

// ============================================================
// Templates do WhatsApp (Cloud API via Zernio).
//
// Templates são criados/aprovados pela Meta; aqui só LISTAMOS os aprovados e
// ENVIAMOS para uma conversa (útil para re-engajar fora da janela de 24h, em
// que o WhatsApp não permite texto livre). Só existe para whatsapp_cloud.
// ============================================================
import { resolveWorkspaceOwnerId } from "@/lib/workspace.server";

/** Resolve o account_id da conta WhatsApp Cloud conectada do workspace. */
async function whatsappCloudAccountId(ownerUserId: string): Promise<string> {
  const { data } = await supabaseAdmin
    .from("zernio_accounts")
    .select("account_id,status")
    .eq("owner_user_id", ownerUserId)
    .eq("platform", "whatsapp")
    .maybeSingle();
  if (!data?.account_id) {
    throw new Error("Nenhuma conta WhatsApp oficial (Zernio) conectada neste workspace.");
  }
  return data.account_id as string;
}

type NormalizedTemplate = {
  name: string;
  language: string;
  category: string | null;
  status: string | null;
  // any[] (não unknown[]) porque o serializer do server fn precisa de um tipo
  // serializável; o conteúdo dos components é definido pela Meta e passa direto.
  components: any[];
};

function normalizeTemplates(raw: any): NormalizedTemplate[] {
  const arr: any[] = Array.isArray(raw)
    ? raw
    : Array.isArray(raw?.templates)
      ? raw.templates
      : Array.isArray(raw?.data)
        ? raw.data
        : [];
  return arr.map((t) => ({
    name: String(t?.name ?? ""),
    language: String(t?.language ?? t?.language_code ?? "pt_BR"),
    category: t?.category ?? null,
    status: t?.status ?? null,
    components: Array.isArray(t?.components) ? t.components : [],
  }));
}

/** Lista templates aprovados da conta WhatsApp Cloud do workspace. */
export const listZernioTemplates = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const ownerId = await resolveWorkspaceOwnerId(context.userId);
    const accountId = await whatsappCloudAccountId(ownerId);
    const raw = await zernio.listTemplates(accountId);
    const templates = normalizeTemplates(raw)
      // Só os aprovados são enviáveis. Status vem em caixa alta na Cloud API.
      .filter((t) => !t.status || String(t.status).toUpperCase() === "APPROVED");
    return { templates };
  });

const sendTemplateInput = z.object({
  contactId: z.string().uuid(),
  name: z.string().min(1).max(512),
  language: z.string().min(2).max(16),
  /** Valores das variáveis do corpo ({{1}}, {{2}}...), na ordem. */
  bodyParams: z.array(z.string().max(1024)).max(20).optional(),
  /** Texto renderizado (com variáveis já substituídas) para exibir no inbox. */
  previewText: z.string().max(4096),
});

/**
 * Envia um template aprovado para a conversa de um contato WhatsApp Cloud e
 * persiste a mensagem no histórico. `previewText` é o que aparece no inbox
 * (a Zernio não devolve o texto renderizado, então o cliente monta e envia).
 */
export const sendZernioTemplate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => sendTemplateInput.parse(d))
  .handler(async ({ data, context }) => {
    const ownerId = await resolveWorkspaceOwnerId(context.userId);

    const { data: contact } = await supabaseAdmin
      .from("contacts")
      .select("id,channel,external_conversation_id")
      .eq("id", data.contactId)
      .eq("owner_user_id", ownerId)
      .maybeSingle();
    if (!contact?.external_conversation_id) {
      throw new Error("Contato sem conversa Zernio associada.");
    }
    if (contact.channel !== "whatsapp_cloud") {
      throw new Error("Templates só podem ser enviados para contatos do WhatsApp oficial.");
    }

    // Monta o component de corpo a partir dos parâmetros (se houver).
    const components =
      data.bodyParams && data.bodyParams.length > 0
        ? [
            {
              type: "body",
              parameters: data.bodyParams.map((text) => ({ type: "text", text })),
            },
          ]
        : [];

    let externalId: string | null = null;
    try {
      const r: any = await zernio.sendTemplateToConversation(
        contact.external_conversation_id as string,
        [{ name: data.name, language: data.language, components }],
      );
      externalId =
        r?.message?.id ??
        r?.message?.platformMessageId ??
        r?.data?.id ??
        r?.id ??
        null;
    } catch (e: any) {
      throw new Error(`Falha ao enviar template: ${e?.message ?? e}`);
    }

    await supabaseAdmin.from("messages").insert({
      owner_user_id: ownerId,
      contact_id: contact.id,
      direction: "outbound",
      content: data.previewText,
      message_type: "text",
      status: "sent",
      sent_by: context.userId,
      channel: "whatsapp_cloud",
      external_conversation_id: contact.external_conversation_id,
      whatsapp_message_id: externalId,
    });

    await supabaseAdmin
      .from("contacts")
      .update({
        last_message: data.previewText,
        last_message_at: new Date().toISOString(),
        last_direction: "outbound",
      })
      .eq("id", contact.id);

    return { ok: true, externalId };
  });
