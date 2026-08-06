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

// ============================================================
// Reconciliação silenciosa: limpa contas de mensageria órfãs na Zernio.
//
// Mesmo bug que existia no disconnect (antes só limpava local) pode ter
// deixado contas conectadas do lado da Zernio sem correspondência ativa em
// zernio_accounts (ex.: desconexões feitas antes do fix, ou falha de rede no
// hard delete). Isso ocupa slot do plano e nunca é visível pro usuário.
// Roda em toda listagem, best-effort, sem expor nada na UI.
// ============================================================

/** Descobre os profileIds da Zernio pertencentes a este workspace de mensageria. */
async function collectMessagingProfileIds(ownerUserId: string): Promise<Set<string>> {
  const ids = new Set<string>();
  const wantedLabel = `zapflow:${ownerUserId}`;

  try {
    const { profiles } = await zernio.listProfiles();
    for (const p of profiles ?? []) {
      if (p?.name === wantedLabel && typeof p?._id === "string") ids.add(p._id);
    }
  } catch (e: any) {
    console.warn("[reconcile zernio] falha ao listar profiles:", e?.message ?? e);
  }

  const { data: rows } = await supabaseAdmin
    .from("zernio_accounts")
    .select("zernio_profile_id")
    .eq("owner_user_id", ownerUserId);
  for (const r of rows ?? []) {
    const pid = (r as any)?.zernio_profile_id;
    if (typeof pid === "string" && pid.length > 0) ids.add(pid);
  }

  return ids;
}

function extractAccountId(a: any): string | null {
  return (
    (typeof a?.accountId === "string" && a.accountId) ||
    (typeof a?._id === "string" && a._id) ||
    (typeof a?.id === "string" && a.id) ||
    null
  );
}

async function reconcileOrphanZernioAccountsInternal(ownerUserId: string) {
  const profileIds = await collectMessagingProfileIds(ownerUserId);

  // Contas ativas localmente (account_id não nulo = conexão em uso agora).
  const { data: localRows } = await supabaseAdmin
    .from("zernio_accounts")
    .select("account_id")
    .eq("owner_user_id", ownerUserId);
  const activeLocalIds = new Set(
    (localRows ?? [])
      .map((r: any) => r?.account_id)
      .filter((v: unknown): v is string => typeof v === "string" && v.length > 0),
  );

  // Diagnóstico: exposto temporariamente via ?debug=1 na tela de Conexões
  // para investigar por que uma conta ficou presa na Zernio. Remover depois
  // que o fluxo estiver validado em produção.
  const debug = {
    profileIds: [...profileIds],
    activeLocalAccountIds: [...activeLocalIds],
    perProfile: [] as Array<{
      profileId: string;
      remoteAccounts: Array<{ accountId: string | null; platform: string | null; raw: any }>;
      error?: string;
    }>,
    removed: [] as string[],
    failed: [] as Array<{ accountId: string; error: string }>,
  };

  for (const profileId of profileIds) {
    let remote: any;
    try {
      remote = await zernio.listAccounts(profileId);
    } catch (e: any) {
      const msg = String(e?.message ?? e);
      console.warn(`[reconcile zernio] listAccounts(${profileId}):`, msg);
      debug.perProfile.push({ profileId, remoteAccounts: [], error: msg });
      continue;
    }
    const remoteList: any[] = Array.isArray(remote?.accounts)
      ? remote.accounts
      : Array.isArray(remote)
        ? remote
        : [];

    debug.perProfile.push({
      profileId,
      remoteAccounts: remoteList.map((a) => ({
        accountId: extractAccountId(a),
        platform: (typeof a?.platform === "string" ? a.platform : null),
        raw: a,
      })),
    });

    for (const a of remoteList) {
      const accountId = extractAccountId(a);
      if (!accountId || activeLocalIds.has(accountId)) continue;
      try {
        await zernio.deleteAccount(accountId);
        debug.removed.push(accountId);
      } catch (e: any) {
        const msg = String(e?.message ?? e);
        console.warn(`[reconcile zernio] deleteAccount(${accountId}):`, msg);
        debug.failed.push({ accountId, error: msg });
      }
    }
  }

  return debug;
}

/** Lista os canais Zernio conectados no workspace (pra UI de Ajustes). */
export const listZernioAccounts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    let debug: any = null;
    try {
      debug = await reconcileOrphanZernioAccountsInternal(context.userId);
    } catch (e: any) {
      debug = { error: String(e?.message ?? e) };
      console.warn("[zernio accounts] reconciliação silenciosa falhou:", e?.message ?? e);
    }

    // Diagnóstico ampliado (temporário): pergunta TUDO que a Zernio conhece
    // sob a nossa API_KEY — todos os profiles e todas as contas sem filtro —
    // pra descobrir onde a conta "presa" está realmente hospedada.
    try {
      const allProfilesResp: any = await zernio.listProfiles();
      const allAccountsResp: any = await zernio.listAccounts();
      debug = {
        ...(debug ?? {}),
        allProfiles: allProfilesResp?.profiles ?? allProfilesResp ?? null,
        allAccounts: allAccountsResp?.accounts ?? allAccountsResp ?? null,
      };
    } catch (e: any) {
      debug = { ...(debug ?? {}), globalScanError: String(e?.message ?? e) };
    }

    const { data } = await supabaseAdmin
      .from("zernio_accounts")
      .select("platform,account_id,username,display_name,status,connected_at")
      .eq("owner_user_id", context.userId);
    return { accounts: data ?? [], _debug: debug };
  });

export const disconnectZernioAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => platformInput.parse(d))
  .handler(async ({ data, context }) => {
    // 1) Lê o account_id atual antes de zerar localmente — precisamos dele
    //    pro hard delete remoto na Zernio.
    const { data: row } = await supabaseAdmin
      .from("zernio_accounts")
      .select("account_id")
      .eq("owner_user_id", context.userId)
      .eq("platform", data.platform)
      .maybeSingle();

    // 2) Hard delete na Zernio para liberar o slot do plano. Falhas não
    //    bloqueiam a limpeza local: se a conta já não existir mais na Zernio
    //    (ex.: usuário revogou pela Meta / limpeza dupla), a nossa base ainda
    //    precisa ficar coerente. Logamos pra observabilidade.
    if (row?.account_id) {
      try {
        await zernio.deleteAccount(row.account_id as string);
      } catch (e: any) {
        console.error(
          "[zernio disconnect] falha ao deletar conta remota",
          { accountId: row.account_id, platform: data.platform },
          e?.message ?? e,
        );
      }
    }

    // 3) Marca como desconectada no nosso banco.
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
