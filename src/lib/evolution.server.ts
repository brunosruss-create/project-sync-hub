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

  sendText: (name: string, body: { number: string; text: string }) =>
    call(`/message/sendText/${encodeURIComponent(name)}`, {
      method: "POST",
      json: body,
    }),
};

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
