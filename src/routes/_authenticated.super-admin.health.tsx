import * as React from "react";
import { createFileRoute } from "@tanstack/react-router";
import { RefreshCw, Wifi, WifiOff } from "lucide-react";
import { toast } from "sonner";
import {
  adminCard,
  adminBtnGhost,
} from "./_authenticated.super-admin";

export const Route = createFileRoute("/_authenticated/super-admin/health")({
  component: HealthAdmin,
});

type Status = "online" | "degraded" | "offline";
type Instance = {
  id: string;
  workspace: string;
  number: string;
  status: Status;
  last_ping: string;
  msgs_per_min: number;
  errors: number;
  latency_ms: number;
};

const SEED: Instance[] = [
  { id: "1", workspace: "Auto Center Silva", number: "+55 11 98765-4321", status: "online", last_ping: "agora", msgs_per_min: 24, errors: 0, latency_ms: 142 },
  { id: "2", workspace: "Clínica Bem-Estar", number: "+55 21 99876-5432", status: "online", last_ping: "5s atrás", msgs_per_min: 8, errors: 0, latency_ms: 98 },
  { id: "3", workspace: "Dr. Pedro Odonto", number: "+55 31 97777-1234", status: "degraded", last_ping: "1m atrás", msgs_per_min: 2, errors: 4, latency_ms: 820 },
  { id: "4", workspace: "Studio Beauty", number: "+55 11 99999-7777", status: "online", last_ping: "agora", msgs_per_min: 41, errors: 1, latency_ms: 167 },
  { id: "5", workspace: "Loja Fashion BR", number: "+55 11 98888-1111", status: "offline", last_ping: "12m atrás", msgs_per_min: 0, errors: 12, latency_ms: 0 },
];

const STATUS_META: Record<Status, { label: string; color: string }> = {
  online: { label: "Online", color: "#10B981" },
  degraded: { label: "Degradado", color: "#F59E0B" },
  offline: { label: "Offline", color: "#EF4444" },
};

function HealthAdmin() {
  const [items, setItems] = React.useState(SEED);

  const totals = {
    online: items.filter((i) => i.status === "online").length,
    degraded: items.filter((i) => i.status === "degraded").length,
    offline: items.filter((i) => i.status === "offline").length,
  };

  const reconnect = (id: string) => {
    toast.success("Reconexão iniciada…");
    setTimeout(() => {
      setItems((arr) =>
        arr.map((i) => (i.id === id ? { ...i, status: "online", last_ping: "agora", errors: 0 } : i)),
      );
      toast.success("Conexão restabelecida");
    }, 1200);
  };

  return (
    <div className="flex flex-col" style={{ gap: 16 }}>
      <div>
        <h2 style={{ fontSize: 20, fontWeight: 600 }}>Saúde das instâncias</h2>
        <p style={{ fontSize: 13, color: "rgba(255,255,255,0.5)", marginTop: 4 }}>
          Status em tempo real das conexões WhatsApp de todos os workspaces.
        </p>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
          gap: 12,
        }}
      >
        <Stat label="Online" value={totals.online} color="#10B981" icon={<Wifi size={16} />} />
        <Stat label="Degradado" value={totals.degraded} color="#F59E0B" icon={<Wifi size={16} />} />
        <Stat label="Offline" value={totals.offline} color="#EF4444" icon={<WifiOff size={16} />} />
        <Stat label="Total" value={items.length} color="#A78BFA" icon={<Wifi size={16} />} />
      </div>

      <div style={{ ...adminCard, padding: 0, overflow: "hidden" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr style={{ background: "#0F0F13", color: "rgba(255,255,255,0.55)", fontSize: 11, textTransform: "uppercase", letterSpacing: "0.05em" }}>
              <th style={th}>Workspace</th>
              <th style={th}>Número</th>
              <th style={th}>Status</th>
              <th style={th}>Último ping</th>
              <th style={th}>Msgs/min</th>
              <th style={th}>Erros</th>
              <th style={th}>Latência</th>
              <th style={th}>Ações</th>
            </tr>
          </thead>
          <tbody>
            {items.map((i) => {
              const meta = STATUS_META[i.status];
              return (
                <tr key={i.id} style={{ borderTop: "1px solid #1F1F23" }}>
                  <td style={td}>{i.workspace}</td>
                  <td style={{ ...td, fontFamily: "var(--font-mono, monospace)", fontSize: 12 }}>
                    {i.number}
                  </td>
                  <td style={td}>
                    <span
                      className="inline-flex items-center gap-1"
                      style={{
                        fontSize: 11,
                        fontWeight: 600,
                        padding: "3px 8px",
                        borderRadius: 999,
                        background: `color-mix(in oklab, ${meta.color} 18%, transparent)`,
                        color: meta.color,
                      }}
                    >
                      <span
                        className={i.status === "online" ? "pulse-dot" : ""}
                        style={{
                          width: 6,
                          height: 6,
                          borderRadius: 999,
                          background: meta.color,
                        }}
                      />
                      {meta.label}
                    </span>
                  </td>
                  <td style={{ ...td, color: "rgba(255,255,255,0.6)" }}>{i.last_ping}</td>
                  <td style={td}>{i.msgs_per_min}</td>
                  <td style={{ ...td, color: i.errors > 0 ? "#F87171" : "rgba(255,255,255,0.6)" }}>
                    {i.errors}
                  </td>
                  <td style={{ ...td, color: i.latency_ms > 500 ? "#F59E0B" : "rgba(255,255,255,0.7)" }}>
                    {i.latency_ms ? `${i.latency_ms}ms` : "—"}
                  </td>
                  <td style={td}>
                    <button
                      style={adminBtnGhost}
                      className="inline-flex items-center gap-1"
                      onClick={() => reconnect(i.id)}
                      disabled={i.status === "online"}
                    >
                      <RefreshCw size={12} /> Reconectar
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Stat({ label, value, color, icon }: { label: string; value: number; color: string; icon: React.ReactNode }) {
  return (
    <div style={adminCard}>
      <div className="flex items-center justify-between" style={{ color: "rgba(255,255,255,0.5)" }}>
        <span style={{ fontSize: 12 }}>{label}</span>
        <span style={{ color }}>{icon}</span>
      </div>
      <div style={{ fontSize: 26, fontWeight: 600, marginTop: 8, color }}>{value}</div>
    </div>
  );
}

const th: React.CSSProperties = { padding: "10px 12px", textAlign: "left", fontWeight: 500 };
const td: React.CSSProperties = { padding: "12px" };
