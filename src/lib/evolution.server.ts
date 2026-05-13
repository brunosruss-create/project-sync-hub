// Helper HTTP do Evolution API. Server-only (lê process.env).

const BASE = () => (process.env.EVOLUTION_API_URL ?? "").replace(/\/$/, "");
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
    const msg =
      (data && (data.message || data.error || data.response?.message)) ||
      `Evolution ${res.status}`;
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

export function instanceNameForOwner(userId: string | null | undefined): string {
  // single-tenant: nome fixo. Mantemos param p/ futuro multi-tenant.
  return "zapflow_main";
}
