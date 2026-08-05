// Saúde dos canais: fotografia rápida do estado de conexão + fluxo de
// mensagens dos últimos 30 dias / 24h. Um só endpoint pra alimentar o
// widget do dashboard, evitando dashboard fazer 6 queries separadas do
// browser (mais round-trips, RLS refeita a cada uma).

import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export type ChannelKey = "whatsapp_evolution" | "whatsapp_cloud" | "instagram";

export type ChannelStatus =
  | "connected"
  | "disconnected"
  | "pending"
  | "error"
  | "not_configured";

export type ChannelHealth = {
  channel: ChannelKey;
  label: string;
  status: ChannelStatus;
  /** Última mensagem recebida (inbound) neste canal — null se nunca. */
  lastInboundAt: string | null;
  /** Contagem de mensagens dos últimos 24h neste canal. */
  count24h: number;
  /** Observação livre pra UI colocar em tooltip (motivo do status). */
  hint?: string;
};

const LABELS: Record<ChannelKey, string> = {
  whatsapp_evolution: "WhatsApp (QR)",
  whatsapp_cloud: "WhatsApp Cloud",
  instagram: "Instagram",
};

/**
 * Retorna a saúde de todos os canais suportados. Sempre inclui os 3, mesmo
 * quando não conectados — a UI decide como mostrar `not_configured`. Isso
 * evita que o widget "some" quando o usuário desconecta tudo.
 */
export const getChannelHealth = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<{ channels: ChannelHealth[] }> => {
    const ownerUserId = context.userId;

    // 1) Evolution (WhatsApp QR): 0 ou 1 linha por workspace.
    const evoP = supabaseAdmin
      .from("whatsapp_instances")
      .select("status,last_connected_at")
      .eq("owner_user_id", ownerUserId)
      .maybeSingle();

    // 2) Zernio (WhatsApp Cloud + Instagram): até 1 linha por plataforma.
    const zernioP = supabaseAdmin
      .from("zernio_accounts")
      .select("platform,status,connected_at")
      .eq("owner_user_id", ownerUserId);

    // 3) Última mensagem inbound por canal.
    // Agregação em SQL seria mais elegante, mas essa tabela vive sob RLS
    // agressiva e nem sempre um Postgres RPC ajuda — 3 queries pequenas com
    // limit 1 são pragmáticas e cabem no orçamento.
    const CHANNELS: ChannelKey[] = ["whatsapp_evolution", "whatsapp_cloud", "instagram"];

    const now = Date.now();
    const sinceIso = new Date(now - 24 * 60 * 60 * 1000).toISOString();

    // Última mensagem por canal (uma query por canal, cada uma retornando 1 row).
    const lastInboundPs = CHANNELS.map((ch) =>
      supabaseAdmin
        .from("messages")
        .select("created_at")
        .eq("owner_user_id", ownerUserId)
        .eq("direction", "inbound")
        .eq("channel", ch)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
    );

    // Contagem 24h por canal (count exact + head evita pagar payload).
    const count24hPs = CHANNELS.map((ch) =>
      supabaseAdmin
        .from("messages")
        .select("id", { count: "exact", head: true })
        .eq("owner_user_id", ownerUserId)
        .eq("channel", ch)
        .gte("created_at", sinceIso),
    );

    const [evo, zernio, ...rest] = await Promise.all([
      evoP,
      zernioP,
      ...lastInboundPs,
      ...count24hPs,
    ]);

    // Se a coluna `channel` ainda não existe, todas as queries acima falham
    // com o mesmo erro. Degradação: só zera as métricas, mantém status
    // vindo de instances/zernio_accounts.
    const lastInboundResults = rest.slice(0, CHANNELS.length);
    const count24hResults = rest.slice(CHANNELS.length, CHANNELS.length * 2);

    function lastFor(idx: number): string | null {
      const r = lastInboundResults[idx] as any;
      if (r?.error) return null;
      return (r?.data?.created_at as string | undefined) ?? null;
    }
    function countFor(idx: number): number {
      const r = count24hResults[idx] as any;
      if (r?.error) return 0;
      return typeof r?.count === "number" ? r.count : 0;
    }

    const evoRow = (evo.data as any) ?? null;
    // Evolution: null quando o workspace nunca chegou a criar a instância
    // (empresa nova ainda não conectou o QR).
    let evoStatus: ChannelStatus = "not_configured";
    let evoHint: string | undefined;
    if (evoRow) {
      const s = String(evoRow.status ?? "disconnected");
      evoStatus =
        s === "connected"
          ? "connected"
          : s === "pending"
            ? "pending"
            : s === "error"
              ? "error"
              : "disconnected";
      if (evoStatus === "disconnected" && evoRow.last_connected_at) {
        evoHint = `Última conexão: ${formatRelative(new Date(evoRow.last_connected_at))}`;
      }
    }

    const zernioRows = ((zernio.data as any[]) ?? []) as Array<{
      platform: string;
      status: string | null;
      connected_at: string | null;
    }>;
    function zernioStatusFor(platform: string): {
      status: ChannelStatus;
      hint?: string;
    } {
      const row = zernioRows.find((r) => r.platform === platform);
      if (!row) return { status: "not_configured" };
      const s = String(row.status ?? "");
      const status: ChannelStatus =
        s === "connected"
          ? "connected"
          : s === "connecting"
            ? "pending"
            : s === "error"
              ? "error"
              : "disconnected";
      const hint = row.connected_at
        ? `Conectado desde ${formatRelative(new Date(row.connected_at))}`
        : undefined;
      return { status, hint };
    }

    const zc = zernioStatusFor("whatsapp");
    const zi = zernioStatusFor("instagram");

    return {
      channels: [
        {
          channel: "whatsapp_evolution",
          label: LABELS.whatsapp_evolution,
          status: evoStatus,
          lastInboundAt: lastFor(0),
          count24h: countFor(0),
          hint: evoHint,
        },
        {
          channel: "whatsapp_cloud",
          label: LABELS.whatsapp_cloud,
          status: zc.status,
          lastInboundAt: lastFor(1),
          count24h: countFor(1),
          hint: zc.hint,
        },
        {
          channel: "instagram",
          label: LABELS.instagram,
          status: zi.status,
          lastInboundAt: lastFor(2),
          count24h: countFor(2),
          hint: zi.hint,
        },
      ],
    };
  });

function formatRelative(d: Date): string {
  const diff = (Date.now() - d.getTime()) / 1000;
  if (diff < 60) return "agora";
  if (diff < 3600) return `há ${Math.floor(diff / 60)}min`;
  if (diff < 86400) return `há ${Math.floor(diff / 3600)}h`;
  return `há ${Math.floor(diff / 86400)}d`;
}
