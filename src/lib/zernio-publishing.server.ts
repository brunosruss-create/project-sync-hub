// Client HTTP dedicado do módulo de publicação em redes sociais.
// Server-only (lê process.env.ZERNIO_API_KEY).
//
// 100% isolado do módulo de mensageria: NÃO importa nem é importado por
// zernio.server.ts. Reusa o mesmo padrão de autenticação Bearer + base URL,
// mas mantém implementação própria pra que mudanças em um não afetem o outro.
//
// Endpoints usados: /v1/connect/{platform}, /v1/posts, /v1/accounts,
// /v1/media/presign, /v1/profiles — nunca /v1/inbox/*.

import { supabaseAdmin } from "@/integrations/supabase/client.server";

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

// ============================================================
// Tipos
// ============================================================

export type SocialPlatform = "facebook" | "instagram" | "tiktok" | "youtube";

export type ZernioPostTargetInput = {
  platform: SocialPlatform;
  accountId: string;
  /** Texto da legenda/descrição. Para YouTube: campo `content` vira description. */
  content?: string;
  /** Itens de mídia (URLs públicas do nosso bucket social-media). */
  mediaItems?: Array<{ url: string; type: "image" | "video" }>;
  /** ISO 8601; ausente + publishNow=false => draft na Zernio */
  scheduledFor?: string;
  /** IANA, obrigatório se scheduledFor presente */
  timezone?: string;
  /** true para publicar na hora */
  publishNow?: boolean;
  /** Dados específicos da plataforma (contentType, shareToFeed, etc) */
  platformSpecificData?: Record<string, unknown>;
  /** Configurações específicas do TikTok (privacy_level, allow_comment, etc) */
  tiktokSettings?: Record<string, unknown>;
};

export type ZernioCreatePostBody = {
  content?: string;
  mediaItems?: Array<{ url: string; type: "image" | "video" }>;
  platforms: Array<{
    platform: SocialPlatform;
    accountId: string;
    platformSpecificData?: Record<string, unknown>;
    customMedia?: Array<{ url: string; type: "image" | "video" }>;
  }>;
  scheduledFor?: string;
  timezone?: string;
  publishNow?: boolean;
  tiktokSettings?: Record<string, unknown>;
};

export type ZernioPostResult = {
  post: {
    _id: string;
    status: string;
    platforms: Array<{
      platform: string;
      accountId: string;
      _id: string;
      status: string;
      platformPostId?: string;
      platformPostUrl?: string;
      error?: string;
    }>;
  };
};

// ============================================================
// API
// ============================================================

export const zernioPublishing = {
  // ---------- Profiles ----------
  listProfiles: () => call<{ profiles: any[] }>("/profiles"),

  createProfile: (body: { name: string }) =>
    call<any>("/profiles", { method: "POST", json: body }),

  // ---------- Connect (OAuth) ----------
  getConnectUrl: (platform: SocialPlatform, profileId: string, redirectUrl: string) =>
    call<{ authUrl: string; state: string }>(`/connect/${platform}`, {
      method: "GET",
      query: { profileId, redirect_url: redirectUrl },
    }),

  // ---------- Accounts ----------
  listAccounts: (profileId?: string, platform?: SocialPlatform) =>
    call<{ accounts: any[] }>("/accounts", {
      method: "GET",
      query: { profileId, platform },
    }),

  disconnectAccount: (accountId: string) =>
    call<any>(`/accounts/${encodeURIComponent(accountId)}`, { method: "DELETE" }),

  // ---------- Media ----------
  presignMedia: (body: { filename: string; contentType: string }) =>
    call<{ uploadUrl: string; publicUrl: string; key: string; expiresIn: number }>(
      "/media/presign",
      { method: "POST", json: body },
    ),

  // ---------- Posts ----------
  createPost: (body: ZernioCreatePostBody) =>
    call<ZernioPostResult>("/posts", { method: "POST", json: body }),

  getPost: (postId: string) =>
    call<{ post: any }>(`/posts/${encodeURIComponent(postId)}`),

  // ---------- TikTok Creator Info ----------
  getTikTokCreatorInfo: (accountId: string, mediaType: "video" | "photo") =>
    call<any>(`/accounts/${encodeURIComponent(accountId)}/tiktok/creator-info`, {
      method: "GET",
      query: { mediaType },
    }),

  // ---------- YouTube Playlists ----------
  listYouTubePlaylists: (accountId: string) =>
    call<any>(`/accounts/${encodeURIComponent(accountId)}/youtube-playlists`),
};

// ============================================================
// Profile de publicação (isolado do de mensageria)
// ============================================================

const SOCIAL_PROFILE_PREFIX = "zapflow-social:";

/**
 * Garante que o workspace tenha um profile Zernio dedicado a publicação.
 * Usa prefixo distinto do de mensageria (`zapflow:`) para nunca colidir.
 * Retorna o profileId.
 */
export async function ensureSocialProfile(workspaceLabel: string): Promise<string> {
  const { profiles } = await zernioPublishing.listProfiles();
  const wanted = `${SOCIAL_PROFILE_PREFIX}${workspaceLabel}`;
  const found = (profiles ?? []).find((p: any) => p.name === wanted);
  if (found) return found._id as string;
  const created: any = await zernioPublishing.createProfile({ name: wanted });
  const id = created?.profile?._id ?? created?._id;
  if (!id) throw new Error("Falha ao criar profile de publicação Zernio.");
  return id as string;
}

/**
 * Resolve o profileId de publicação de um workspace (busca em
 * social_account_connections, ou cria sob demanda se não existir nenhuma).
 */
export async function getSocialProfileId(ownerUserId: string): Promise<string> {
  // Tenta pegar de uma conexão existente (evita criar profile desnecessário)
  const { data: existing } = await supabaseAdmin
    .from("social_account_connections")
    .select("zernio_profile_id")
    .eq("owner_user_id", ownerUserId)
    .limit(1)
    .maybeSingle();
  if (existing?.zernio_profile_id) return existing.zernio_profile_id as string;

  // Busca business_name pra compor o label do profile
  const { data: profile } = await supabaseAdmin
    .from("profiles")
    .select("business_name")
    .eq("id", ownerUserId)
    .maybeSingle();
  const label = (profile as any)?.business_name || ownerUserId.slice(0, 12);
  return ensureSocialProfile(label);
}
