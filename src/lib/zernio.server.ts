// Cliente HTTP da Zernio API. Server-only (lê process.env.ZERNIO_API_KEY).
//
// Zernio é a camada de conexão OFICIAL via OAuth: WhatsApp Cloud API (WABA) e
// Instagram DM. A Evolution API (QR code, não-oficial) continua intocada e
// convive com esta integração — o roteamento de envio é decidido por
// contacts.channel (ver zernio.functions.ts / job-worker).
//
// Modelo multi-tenant: 1 "profile" Zernio por workspace (owner_user_id). Cada
// profile agrupa as contas (accounts) que aquela empresa conectou. O profileId
// fica salvo em zernio_accounts. A API key é única da plataforma ZapFlow.

const BASE = "https://zernio.com/api/v1";

function KEY(): string {
  const k = (process.env.ZERNIO_API_KEY ?? "").trim();
  if (!k) {
    throw new Error(
      "Zernio não configurado. Defina o secret ZERNIO_API_KEY (Vercel + Railway).",
    );
  }
  return k;
}

async function call<T = any>(
  path: string,
  init?: RequestInit & { json?: unknown; query?: Record<string, string | undefined> },
): Promise<T> {
  let url = `${BASE}${path}`;
  if (init?.query) {
    const qs = Object.entries(init.query)
      .filter(([, v]) => v !== undefined && v !== "")
      .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v as string)}`)
      .join("&");
    if (qs) url += `${path.includes("?") ? "&" : "?"}${qs}`;
  }

  const headers: Record<string, string> = {
    Authorization: `Bearer ${KEY()}`,
    "Content-Type": "application/json",
    ...((init?.headers as Record<string, string>) ?? {}),
  };

  const res = await fetch(url, {
    ...init,
    headers,
    body: init?.json !== undefined ? JSON.stringify(init.json) : init?.body,
  });

  const text = await res.text();
  let data: any = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }

  if (!res.ok) {
    const detail = data?.error?.message ?? data?.message ?? data?.error;
    const msg =
      (Array.isArray(detail) ? detail.join("; ") : detail) || `Zernio ${res.status}`;
    throw new Error(typeof msg === "string" ? msg : JSON.stringify(msg));
  }
  return data as T;
}

function firstString(...vals: unknown[]): string | null {
  for (const v of vals) if (typeof v === "string" && v.trim()) return v.trim();
  return null;
}

export type ZernioPlatform = "whatsapp" | "instagram";

export type ZernioProfile = {
  _id: string;
  userId: string;
  name: string;
  isDefault: boolean;
  accountUsernames?: string[];
};

export type ZernioConversation = {
  id: string;
  platform: string;
  accountId: string;
  accountUsername?: string;
  participantId: string;
  participantName?: string;
  participantPicture?: string;
  lastMessage?: string;
  updatedTime?: string;
  status?: "active" | "archived";
  unreadCount?: number;
  url?: string;
  instagramProfile?: {
    isFollower?: boolean;
    isFollowing?: boolean;
    followerCount?: number;
    isVerified?: boolean;
  };
  metadata?: Record<string, unknown>;
};

export type ZernioSendBody = {
  accountId: string;
  message?: string; // texto (campo correto da API — NÃO é "text")
  attachmentUrl?: string;
  attachmentType?: "image" | "video" | "audio" | "file";
  attachmentName?: string;
  voiceNote?: boolean;
  replyTo?: string; // platformMessageId da mensagem citada
  // Instagram/Facebook: enviar fora da janela de 24h (HUMAN_AGENT → até 7 dias).
  messageTag?: "HUMAN_AGENT";
  messagingType?: "MESSAGE_TAG";
};

export const zernio = {
  // ---------- Profiles ----------
  listProfiles: () => call<{ profiles: ZernioProfile[] }>("/profiles"),

  createProfile: (body: { name: string; color?: string }) =>
    call<{ profile: ZernioProfile } | ZernioProfile>("/profiles", {
      method: "POST",
      json: body,
    }),

  // ---------- Connect (OAuth redirect flow) ----------
  // Retorna { authUrl } — redirecione o usuário pra lá. Após o signup na Meta,
  // a Zernio processa o callback e redireciona pro redirectUrl com
  // ?connected=<platform>&profileId=...&accountId=...&username=...
  getWhatsAppAuthUrl: (profileId: string, redirectUrl: string) =>
    call<{ authUrl: string; state: string }>("/connect/whatsapp", {
      method: "GET",
      query: { profileId, redirect_url: redirectUrl },
    }),

  getInstagramAuthUrl: (profileId: string, redirectUrl: string) =>
    call<{ authUrl: string; state: string }>("/connect/instagram", {
      method: "GET",
      query: { profileId, redirect_url: redirectUrl },
    }),

  // ---------- Accounts ----------
  listAccounts: (profileId?: string) =>
    call<any>("/accounts", { method: "GET", query: { profileId } }),

  // Hard delete na Zernio — libera o slot do plano e revoga o vínculo OAuth.
  // Espelha o mesmo endpoint usado pelo cliente de publicação (ver
  // zernio-publishing.server.ts).
  deleteAccount: (accountId: string) =>
    call<any>(`/accounts/${encodeURIComponent(accountId)}`, { method: "DELETE" }),

  // ---------- Inbox: conversations ----------
  listConversations: (params?: {
    profileId?: string;
    platform?: ZernioPlatform;
    accountId?: string;
    status?: "active" | "archived";
    limit?: number;
    cursor?: string;
  }) =>
    call<{
      data: ZernioConversation[];
      pagination?: { hasMore: boolean; nextCursor?: string };
    }>("/inbox/conversations", {
      method: "GET",
      query: {
        profileId: params?.profileId,
        platform: params?.platform,
        accountId: params?.accountId,
        status: params?.status,
        limit: params?.limit ? String(params.limit) : undefined,
        cursor: params?.cursor,
      },
    }),

  getConversation: (conversationId: string) =>
    call<ZernioConversation>(`/inbox/conversations/${encodeURIComponent(conversationId)}`),

  markConversationRead: (conversationId: string) =>
    call(`/inbox/conversations/${encodeURIComponent(conversationId)}/read`, {
      method: "POST",
    }),

  // ---------- Inbox: messages ----------
  listMessages: (conversationId: string, params?: { limit?: number; cursor?: string }) =>
    call<any>(`/inbox/conversations/${encodeURIComponent(conversationId)}/messages`, {
      method: "GET",
      query: {
        limit: params?.limit ? String(params.limit) : undefined,
        cursor: params?.cursor,
      },
    }),

  sendMessage: (conversationId: string, body: ZernioSendBody) =>
    call<any>(`/inbox/conversations/${encodeURIComponent(conversationId)}/messages`, {
      method: "POST",
      json: body,
    }),

  addReaction: (conversationId: string, messageId: string, emoji: string) =>
    call(
      `/inbox/conversations/${encodeURIComponent(conversationId)}/messages/${encodeURIComponent(messageId)}/reactions`,
      { method: "POST", json: { emoji } },
    ),

  sendTyping: (conversationId: string) =>
    call(`/inbox/conversations/${encodeURIComponent(conversationId)}/typing`, {
      method: "POST",
    }),

  // ---------- WhatsApp templates ----------
  // Lista os templates aprovados da WABA associada à conta. São buscados
  // direto da WhatsApp Cloud API (Meta), então refletem o status real.
  listTemplates: (accountId: string) =>
    call<any>("/whatsapp/templates", { method: "GET", query: { accountId } }),

  // Envia um template aprovado dentro de uma conversa existente. `elements`
  // carrega { name, language, components } (components preenche variáveis do
  // header/body/botões, na ordem). Usado quando a janela de 24h já fechou.
  sendTemplateToConversation: (
    conversationId: string,
    elements: Array<{ name: string; language: string; components?: unknown[] }>,
  ) =>
    call<any>(`/inbox/conversations/${encodeURIComponent(conversationId)}/messages`, {
      method: "POST",
      json: { template: { elements } },
    }),
};

// ============================================================
// Download de mídia recebida via Zernio.
//
// WhatsApp: a `url` do attachment aponta para GET /whatsapp/media/... da Zernio,
// que é AUTENTICADO (exige Authorization: Bearer) e EXPIRA em ~7 dias (a mídia
// vive no store da Meta, não da Zernio). Por isso baixamos no recebimento e
// persistimos no nosso Storage — nunca guardar a URL crua da Zernio.
// Instagram/Facebook: `url` é CDN público (o header é inofensivo, mas só
// enviamos para hosts da Zernio para não vazar a key a terceiros).
// ============================================================
export async function downloadZernioMedia(
  url: string,
): Promise<{ buffer: Buffer; mime: string } | null> {
  try {
    const isZernioHost = /(^https?:\/\/)?([^/]*\.)?zernio\.com\//i.test(url);
    const headers: Record<string, string> = {};
    if (isZernioHost) headers.Authorization = `Bearer ${KEY()}`;
    const res = await fetch(url, { headers });
    if (!res.ok) {
      console.error("[zernio media] download falhou:", res.status, url.slice(0, 80));
      return null;
    }
    const mime =
      res.headers.get("content-type")?.split(";")[0].trim() || "application/octet-stream";
    const buffer = Buffer.from(new Uint8Array(await res.arrayBuffer()));
    return { buffer, mime };
  } catch (e: any) {
    console.error("[zernio media] erro:", e?.message ?? e);
    return null;
  }
}

/**
 * Garante que o workspace tenha um profile Zernio dedicado. Cria sob demanda.
 * Retorna o profileId. (1 profile por empresa → isola as contas conectadas.)
 */
export async function ensureZernioProfile(workspaceLabel: string): Promise<string> {
  const { profiles } = await zernio.listProfiles();
  const wanted = `zapflow:${workspaceLabel}`;
  const found = profiles.find((p) => p.name === wanted);
  if (found) return found._id;
  const created: any = await zernio.createProfile({ name: wanted });
  const id = created?.profile?._id ?? created?._id;
  if (!id) throw new Error("Falha ao criar profile Zernio.");
  return id as string;
}


// ============================================================
// Envio + persistência para canais Zernio (whatsapp_cloud / instagram).
// Usado pelo roteamento em evolution.functions.ts quando contact.channel != evolution.
// Server-only (supabaseAdmin + zernio HTTP). NÃO importar em código de cliente.
// ============================================================
import { supabaseAdmin } from "@/integrations/supabase/client.server";

type ZernioChannel = "whatsapp_cloud" | "instagram";

function platformForChannel(channel: ZernioChannel): ZernioPlatform {
  return channel === "instagram" ? "instagram" : "whatsapp";
}

export async function sendZernioToContact(params: {
  ownerUserId: string;
  contactId: string;
  channel: ZernioChannel;
  text?: string;
  attachment?: { url: string; mime: string; name?: string; voiceNote?: boolean };
  /** platformMessageId da mensagem citada (opcional). */
  replyToExternalId?: string;
  /** null quando quem envia é a IA; senão o id do atendente humano. */
  sentBy?: string | null;
  /** preview p/ persistir na mensagem citada. */
  quoted?: {
    messageId: string;
    preview?: { content?: string; author?: string; message_type?: string };
  };
}): Promise<{ ok: true; externalId: string | null }> {
  const platform = platformForChannel(params.channel);

  const { data: contact, error: ce } = await supabaseAdmin
    .from("contacts")
    .select("id,external_conversation_id")
    .eq("id", params.contactId)
    .eq("owner_user_id", params.ownerUserId)
    .maybeSingle();
  if (ce || !contact?.external_conversation_id) {
    throw new Error("Contato sem conversa Zernio associada.");
  }

  const { data: account } = await supabaseAdmin
    .from("zernio_accounts")
    .select("account_id,status")
    .eq("owner_user_id", params.ownerUserId)
    .eq("platform", platform)
    .maybeSingle();
  if (!account?.account_id) {
    throw new Error(
      `Canal ${platform} não conectado neste workspace (conecte via OAuth em Ajustes).`,
    );
  }

  const conversationId = contact.external_conversation_id as string;

  const body: ZernioSendBody = { accountId: account.account_id as string };
  if (params.text) body.message = params.text;
  if (params.attachment) {
    body.attachmentUrl = params.attachment.url;
    body.attachmentType = mimeToAttachmentType(params.attachment.mime, params.attachment.voiceNote);
    if (params.attachment.name) body.attachmentName = params.attachment.name;
    // Instagram não suporta voiceNote (não tem conceito de "nota de voz" no DM).
    // Mandar o flag causa rejeição da API. Áudio é enviado como attachment normal.
    if (params.attachment.voiceNote && params.channel !== "instagram") body.voiceNote = true;
  }
  if (params.replyToExternalId) body.replyTo = params.replyToExternalId;

  let externalId: string | null = null;
  try {
    const r: any = await zernio.sendMessage(conversationId, body);
    externalId = firstSendId(r);
  } catch (e: any) {
    throw new Error(`Falha no envio (${platform}): ${e?.message ?? e}`);
  }

  const messageType = params.attachment
    ? attachmentMessageType(params.attachment.mime, params.attachment.voiceNote)
    : "text";

  const insert: Record<string, unknown> = {
    owner_user_id: params.ownerUserId,
    contact_id: params.contactId,
    direction: "outbound",
    content: params.text ?? "",
    message_type: messageType,
    status: "sent",
    sent_by: params.sentBy ?? null,
    channel: params.channel,
    external_conversation_id: conversationId,
    whatsapp_message_id: externalId,
    quoted_message_id: params.quoted?.messageId ?? null,
    quoted_preview: params.quoted?.preview ?? null,
    // sentBy null = enviado pela IA (job-worker). Marca is_ai para o inbox
    // diferenciar resposta automática de mensagem de atendente humano.
    ...(params.sentBy == null ? { is_ai: true } : {}),
  };
  if (params.attachment) {
    insert.media_url = params.attachment.url;
    insert.media_mime = params.attachment.mime;
    insert.media_name = params.attachment.name ?? null;
  }
  await supabaseAdmin.from("messages").insert(insert);

  return { ok: true, externalId };
}

function firstSendId(r: any): string | null {
  return (
    firstString(
      r?.message?.id,
      r?.message?.platformMessageId,
      r?.data?.id,
      r?.data?.message?.id,
      r?.platformMessageId,
      r?.messageId,
      r?.id,
    ) ?? null
  );
}

function attachmentMessageType(
  mime: string,
  voiceNote?: boolean,
): "image" | "audio" | "video" | "document" {
  const m = (mime || "").toLowerCase();
  if (voiceNote || m.startsWith("audio/")) return "audio";
  if (m.startsWith("image/")) return "image";
  if (m.startsWith("video/")) return "video";
  return "document";
}

// Tipo de anexo que a API da Zernio espera (image/video/audio/file).
function mimeToAttachmentType(
  mime: string,
  voiceNote?: boolean,
): "image" | "video" | "audio" | "file" {
  const m = (mime || "").toLowerCase();
  if (voiceNote || m.startsWith("audio/")) return "audio";
  if (m.startsWith("image/")) return "image";
  if (m.startsWith("video/")) return "video";
  return "file";
}
