// Helper HTTP do Evolution API. Server-only (lê process.env).
import QRCode from "qrcode";

const BASE = () => {
  let url = (process.env.EVOLUTION_API_URL ?? "")
    .trim()
    .replace(/^['"]|['"]$/g, "")
    .replace(/\/$/, "");
  if (url && !/^https?:\/\//i.test(url)) url = `https://${url}`;
  return url;
};
const KEY = () => process.env.EVOLUTION_API_KEY ?? "";

async function call<T = any>(
  path: string,
  init?: RequestInit & { json?: unknown },
): Promise<T> {
  if (!BASE() || !KEY()) {
    throw new Error(
      "Evolution não configurado. Defina EVOLUTION_API_URL e EVOLUTION_API_KEY.",
    );
  }
  const headers: Record<string, string> = {
    apikey: KEY(),
    "Content-Type": "application/json",
    ...((init?.headers as Record<string, string>) ?? {}),
  };
  const res = await fetch(`${BASE()}${path}`, {
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
    const detailedMessage = data?.response?.message ?? data?.message ?? data?.error;
    const msg = Array.isArray(detailedMessage)
      ? detailedMessage.join("; ")
      : detailedMessage || `Evolution ${res.status}`;
    throw new Error(typeof msg === "string" ? msg : JSON.stringify(msg));
  }
  return data as T;
}

export const evo = {
  createInstance: (body: {
    instanceName: string;
    integration?: string;
    qrcode?: boolean;
    webhook?: { url: string; headers?: Record<string, string>; events?: string[]; webhookByEvents?: boolean; webhookBase64?: boolean };
  }) => call("/instance/create", { method: "POST", json: body }),

  fetchInstances: (instanceName?: string) =>
    call(`/instance/fetchInstances${instanceName ? `?instanceName=${encodeURIComponent(instanceName)}` : ""}`),

  connect: (name: string) =>
    call(`/instance/connect/${encodeURIComponent(name)}`, { method: "GET" }),

  connectionState: (name: string) =>
    call(`/instance/connectionState/${encodeURIComponent(name)}`, { method: "GET" }),

  logout: (name: string) =>
    call(`/instance/logout/${encodeURIComponent(name)}`, { method: "DELETE" }),

  deleteInstance: (name: string) =>
    call(`/instance/delete/${encodeURIComponent(name)}`, { method: "DELETE" }),

  setWebhook: (
    name: string,
    body: {
      webhook: {
        enabled: boolean;
        url: string;
        headers?: Record<string, string>;
        byEvents?: boolean;
        base64?: boolean;
        events: string[];
      };
    },
  ) =>
    call(`/webhook/set/${encodeURIComponent(name)}`, {
      method: "POST",
      json: body,
    }),

  sendText: (
    name: string,
    body: { number: string; text: string; quoted?: any },
  ) =>
    call(`/message/sendText/${encodeURIComponent(name)}`, {
      method: "POST",
      json: body,
    }),

  sendMedia: (
    name: string,
    body: {
      number: string;
      mediatype: "image" | "document" | "video";
      mimetype: string;
      media: string;
      fileName?: string;
      caption?: string;
      quoted?: any;
    },
  ) =>
    call(`/message/sendMedia/${encodeURIComponent(name)}`, {
      method: "POST",
      json: body,
    }),

  sendWhatsAppAudio: (
    name: string,
    body: { number: string; audio: string; quoted?: any },
  ) =>
    call(`/message/sendWhatsAppAudio/${encodeURIComponent(name)}`, {
      method: "POST",
      json: body,
    }),

  sendReaction: (
    name: string,
    body: {
      key: { id: string; fromMe: boolean; remoteJid: string };
      reaction: string;
    },
  ) =>
    call(`/message/sendReaction/${encodeURIComponent(name)}`, {
      method: "POST",
      json: body,
    }),

  deleteMessageForEveryone: (
    name: string,
    body: { id: string; fromMe: boolean; remoteJid: string; participant?: string },
  ) =>
    call(`/chat/deleteMessageForEveryone/${encodeURIComponent(name)}`, {
      method: "DELETE",
      json: body,
    }),

  updateMessage: (
    name: string,
    body: {
      number: string;
      key: { id: string; fromMe: boolean; remoteJid: string };
      text: string;
    },
  ) =>
    call(`/chat/updateMessage/${encodeURIComponent(name)}`, {
      method: "POST",
      json: body,
    }),


  fetchProfilePictureUrl: (name: string, number: string) =>
    call<{ profilePictureUrl?: string | null } | any>(
      `/chat/fetchProfilePictureUrl/${encodeURIComponent(name)}`,
      { method: "POST", json: { number } },
    ),

  getBase64FromMediaMessage: (
    name: string,
    body: { message: any; convertToMp4?: boolean },
  ) =>
    call<{ base64?: string; mimetype?: string; fileName?: string } | any>(
      `/chat/getBase64FromMediaMessage/${encodeURIComponent(name)}`,
      { method: "POST", json: body },
    ),
};

/**
 * Baixa o binário (base64) de uma mensagem de mídia recebida via webhook.
 * Tenta com `{ message: m }` primeiro e cai para `{ message: { key, message } }`.
 */
export async function downloadInboundMedia(
  instanceName: string,
  m: any,
): Promise<{ buffer: Buffer; mimetype: string; fileName: string | null } | null> {
  if (!BASE() || !KEY()) return null;
  const tries: any[] = [
    { message: m },
    { message: { key: m?.key, message: m?.message } },
  ];
  for (const body of tries) {
    try {
      const r: any = await evo.getBase64FromMediaMessage(instanceName, body);
      const base64: string | undefined = r?.base64 ?? r?.data?.base64 ?? r?.media;
      const mimetype: string =
        r?.mimetype ?? r?.data?.mimetype ?? r?.mediaType ?? "application/octet-stream";
      const fileName: string | null = r?.fileName ?? r?.data?.fileName ?? null;
      if (typeof base64 === "string" && base64.length > 0) {
        const clean = base64.includes(",") ? base64.split(",").pop()! : base64;
        return { buffer: Buffer.from(clean, "base64"), mimetype, fileName };
      }
    } catch (e: any) {
      console.warn("[evolution downloadInboundMedia] tentativa falhou:", e?.message ?? e);
    }
  }
  return null;
}

export async function tryFetchProfilePicture(
  instanceName: string,
  phone: string,
): Promise<string | null> {
  if (!BASE() || !KEY()) return null;
  try {
    const r: any = await evo.fetchProfilePictureUrl(instanceName, phone);
    const url =
      r?.profilePictureUrl ?? r?.url ?? r?.data?.profilePictureUrl ?? null;
    return typeof url === "string" && url.startsWith("http") ? url : null;
  } catch {
    return null;
  }
}

function firstString(...values: unknown[]): string | null {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

export function extractQRCode(payload: any): string | null {
  return firstString(
    payload?.base64,
    payload?.qrcode?.base64,
    payload?.qrcode?.code,
    payload?.qrcode,
    payload?.code,
    payload?.data?.base64,
    payload?.data?.qrcode?.base64,
    payload?.data?.qrcode?.code,
    payload?.data?.qrcode,
    payload?.data?.code,
  );
}

export async function normalizeQRCodeImage(qr: string | null): Promise<string | null> {
  if (!qr) return null;
  const value = qr.trim();
  if (!value) return null;
  if (value.startsWith("data:image/")) return value;
  if (/^(iVBORw0KGgo|\/9j\/|R0lGOD)/.test(value)) {
    return `data:image/png;base64,${value}`;
  }
  try {
    return await QRCode.toDataURL(value, {
      errorCorrectionLevel: "M",
      margin: 2,
      width: 320,
    });
  } catch (e: any) {
    console.warn("[evolution] qrcode render:", e?.message ?? e);
    return null;
  }
}

export function instanceNameForOwner(userId: string | null | undefined): string {
  // single-tenant: nome fixo. Mantemos param p/ futuro multi-tenant.
  return "zapflow_main";
}
