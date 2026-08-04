import * as React from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Wifi, WifiOff } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Badge, type BadgeVariant } from "@/components/ui/badge";
import { EmptyState as SharedEmptyState } from "@/components/empty-state";
import { adminCard } from "./_authenticated.super-admin";

export const Route = createFileRoute("/_authenticated/super-admin/health")({
  component: HealthAdmin,
});

type Instance = {
  instance_id: string;
  instance_name: string;
  status: string;
  owner_user_id: string;
  owner_email: string | null;
  created_at: string;
  updated_at: string | null;
};

const STATUS_COLOR: Record<string, string> = {
  connected: "#10B981",
  online: "#10B981",
  open: "#10B981",
  connecting: "#F59E0B",
  disconnected: "#6B7280",
  closed: "#EF4444",
  offline: "#EF4444",
};

const INSTANCE_STATUS_VARIANT: Record<string, BadgeVariant> = {
  connected: "success",
  online: "success",
  open: "success",
  connecting: "warning",
  disconnected: "neutral",
  closed: "danger",
  offline: "danger",
};

function statusMeta(s: string) {
  const key = s?.toLowerCase() ?? "";
  return {
    label: s || "—",
    color: STATUS_COLOR[key] ?? "#6B7280",
    variant: INSTANCE_STATUS_VARIANT[key] ?? "neutral",
    isOnline: ["connected", "online", "open"].includes(key),
  };
}

function HealthAdmin() {
  const { data: items = [], isLoading, error } = useQuery({
    queryKey: ["admin", "instances"],
    queryFn: async (): Promise<Instance[]> => {
      const { data, error } = await supabase.rpc("admin_list_instances");
      if (error) throw error;
      return (data ?? []) as Instance[];
    },
    refetchInterval: 15_000,
  });

  const totals = {
    online: items.filter((i) => statusMeta(i.status).isOnline).length,
    other: items.filter((i) => !statusMeta(i.status).isOnline).length,
    total: items.length,
  };

  return (
    <div className="flex flex-col" style={{ gap: 16 }}>
      <div>
        <h2 style={{ fontSize: 20, fontWeight: 600 }}>Saúde das instâncias</h2>
        <p style={{ fontSize: 13, color: "var(--text-muted)", marginTop: 4 }}>
          Status real das conexões WhatsApp de todos os workspaces.
        </p>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(min(180px, 100%), 1fr))",
          gap: 12,
        }}
      >
        <Stat label="Conectadas" value={totals.online} color="#10B981" icon={<Wifi size={16} />} />
        <Stat label="Outras" value={totals.other} color="#F59E0B" icon={<WifiOff size={16} />} />
        <Stat label="Total" value={totals.total} color="#A78BFA" icon={<Wifi size={16} />} />
      </div>

      {error ? (
        <div style={{ ...adminCard, color: "#F87171" }}>
          Erro ao carregar instâncias: {(error as Error).message}
        </div>
      ) : (
        <div style={{ ...adminCard, padding: 0, overflow: "hidden" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ background: "var(--bg-overlay)", color: "var(--text-muted)", fontSize: 11, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                <th style={th}>Workspace</th>
                <th style={th}>Instância</th>
                <th style={th}>Status</th>
                <th style={th}>Atualizado</th>
                <th style={th}>Criado</th>
              </tr>
            </thead>
            <tbody>
              {items.length === 0 && !isLoading ? (
                <tr>
                  <td colSpan={5} style={{ padding: 0 }}>
                    <SharedEmptyState title="Nenhuma instância WhatsApp registrada." />
                  </td>
                </tr>
              ) : (
                items.map((i) => {
                  const meta = statusMeta(i.status);
                  return (
                    <tr key={i.instance_id} style={{ borderTop: "1px solid var(--border)" }}>
                      <td style={td}>{i.owner_email ?? i.owner_user_id}</td>
                      <td style={{ ...td, fontFamily: "var(--font-mono, monospace)", fontSize: 12 }}>
                        {i.instance_name}
                      </td>
                      <td style={td}>
                        <Badge variant={meta.variant} withDot={meta.isOnline}>
                          {meta.label}
                        </Badge>
                      </td>
                      <td style={{ ...td, color: "var(--text-muted)" }}>
                        {i.updated_at ? new Date(i.updated_at).toLocaleString("pt-BR") : "—"}
                      </td>
                      <td style={{ ...td, color: "var(--text-muted)" }}>
                        {new Date(i.created_at).toLocaleDateString("pt-BR")}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, color, icon }: { label: string; value: number; color: string; icon: React.ReactNode }) {
  return (
    <div style={adminCard}>
      <div className="flex items-center justify-between" style={{ color: "var(--text-muted)" }}>
        <span style={{ fontSize: 12 }}>{label}</span>
        <span style={{ color }}>{icon}</span>
      </div>
      <div style={{ fontSize: 26, fontWeight: 600, marginTop: 8, color }}>{value}</div>
    </div>
  );
}

const th: React.CSSProperties = { padding: "10px 12px", textAlign: "left", fontWeight: 500 };
const td: React.CSSProperties = { padding: "12px" };
