// Widget "Saúde dos Canais" no dashboard. Um card, uma leitura visual:
// quem tá conectado, quem tá recebendo, quem tá em silêncio.
//
// Mostra até 3 canais (evolution/cloud/instagram); se um está `not_configured`
// mantemos ele visível de propósito — é convite discreto pra ligar, não motivo
// pra esconder. Mesma lógica das colunas do Kanban vazias.

import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import { WifiOff, Wifi, AlertTriangle, Clock, Plug } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge, type BadgeVariant } from "@/components/ui/badge";
import { getChannelHealth, type ChannelHealth, type ChannelStatus } from "@/lib/channel-health.functions";

const STATUS_VARIANT: Record<ChannelStatus, BadgeVariant> = {
  connected: "success",
  disconnected: "danger",
  pending: "warning",
  error: "danger",
  not_configured: "neutral",
};

const STATUS_LABEL: Record<ChannelStatus, string> = {
  connected: "Conectado",
  disconnected: "Desconectado",
  pending: "Pendente",
  error: "Erro",
  not_configured: "Não configurado",
};

function StatusIcon({ status }: { status: ChannelStatus }) {
  const size = 14;
  if (status === "connected") return <Wifi size={size} style={{ color: "#25C880" }} />;
  if (status === "pending") return <Clock size={size} style={{ color: "#F59E0B" }} />;
  if (status === "error") return <AlertTriangle size={size} style={{ color: "#EF4444" }} />;
  if (status === "not_configured") return <Plug size={size} style={{ color: "var(--text-muted)" }} />;
  return <WifiOff size={size} style={{ color: "#EF4444" }} />;
}

function formatRelative(dateIso: string | null): string {
  if (!dateIso) return "—";
  const d = new Date(dateIso);
  const diff = (Date.now() - d.getTime()) / 1000;
  if (diff < 60) return "agora";
  if (diff < 3600) return `há ${Math.floor(diff / 60)}min`;
  if (diff < 86400) return `há ${Math.floor(diff / 3600)}h`;
  return `há ${Math.floor(diff / 86400)}d`;
}

/**
 * "Silencioso" = conectado + 0 mensagens em 24h. Não é erro por si só, mas
 * merece um destaque discreto: pode ser fim de semana, pode ser webhook
 * quebrado. Cabe ao dono investigar.
 */
function isQuiet(c: ChannelHealth): boolean {
  return c.status === "connected" && c.count24h === 0;
}

export function ChannelHealthCard() {
  const fetchFn = useServerFn(getChannelHealth);
  const q = useQuery({
    queryKey: ["channel-health"],
    queryFn: () => fetchFn(),
    // Refetch a cada 60s: janela boa entre "atualiza sozinho" e "não sobrecarrega".
    refetchInterval: 60_000,
    staleTime: 30_000,
  });

  const channels = q.data?.channels ?? [];
  const anyIssue = channels.some(
    (c) => c.status === "disconnected" || c.status === "error" || c.status === "pending",
  );

  return (
    <Card style={{ padding: 16 }}>
      <div className="flex items-center justify-between" style={{ marginBottom: 12 }}>
        <div className="flex items-center" style={{ gap: 8 }}>
          <span style={{ fontSize: 14, fontWeight: 600, letterSpacing: "-0.01em" }}>
            Saúde dos canais
          </span>
          {anyIssue && <Badge variant="warning">Atenção</Badge>}
        </div>
        <Link
          to="/settings/whatsapp"
          style={{
            fontSize: 12,
            color: "var(--brand-400)",
            textDecoration: "none",
            fontWeight: 500,
          }}
        >
          Gerenciar →
        </Link>
      </div>

      {q.isLoading ? (
        <div style={{ padding: 20, textAlign: "center", fontSize: 12, color: "var(--text-muted)" }}>
          Carregando…
        </div>
      ) : q.isError ? (
        <div style={{ padding: 20, textAlign: "center", fontSize: 12, color: "var(--text-muted)" }}>
          Não foi possível carregar o status.
        </div>
      ) : (
        <div className="flex flex-col" style={{ gap: 8 }}>
          {channels.map((c) => {
            const quiet = isQuiet(c);
            return (
              <div
                key={c.channel}
                className="flex items-center"
                style={{
                  gap: 10,
                  padding: "8px 10px",
                  borderRadius: "var(--radius-control)",
                  background: "var(--bg-base)",
                  border: "1px solid var(--border)",
                }}
              >
                <StatusIcon status={c.status} />
                <div className="flex-1 min-w-0">
                  <div
                    className="flex items-center"
                    style={{ gap: 6, fontSize: 13, fontWeight: 500 }}
                  >
                    <span className="truncate">{c.label}</span>
                    <Badge variant={STATUS_VARIANT[c.status]}>
                      {STATUS_LABEL[c.status]}
                    </Badge>
                    {quiet && (
                      <Badge variant="warning" title="Conectado mas sem mensagens em 24h">
                        Silencioso
                      </Badge>
                    )}
                  </div>
                  <div
                    style={{
                      marginTop: 2,
                      fontSize: 11,
                      color: "var(--text-muted)",
                      display: "flex",
                      gap: 10,
                      flexWrap: "wrap",
                    }}
                  >
                    <span>
                      Última msg: <strong>{formatRelative(c.lastInboundAt)}</strong>
                    </span>
                    <span>
                      Últimas 24h: <strong>{c.count24h}</strong>
                    </span>
                    {c.hint && <span title={c.hint}>· {c.hint}</span>}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}
