import * as React from "react";
import { createFileRoute } from "@tanstack/react-router";
import { TrendingUp, TrendingDown, DollarSign, AlertTriangle, Mail, PauseCircle } from "lucide-react";
import { toast } from "sonner";
import {
  adminCard,
  adminBtnGhost,
  adminBtnDanger,
} from "./_authenticated.super-admin";

export const Route = createFileRoute("/_authenticated/super-admin/billing")({
  component: BillingAdmin,
});

const KPIS = [
  { label: "MRR Total", value: "R$ 24.580", delta: "+12%", positive: true, icon: DollarSign },
  { label: "Churn do mês", value: "2.3%", delta: "-0.4%", positive: true, icon: TrendingDown },
  { label: "Upgrades", value: "18", delta: "+5", positive: true, icon: TrendingUp },
  { label: "Downgrades", value: "4", delta: "-2", positive: true, icon: TrendingDown },
];

const EXPIRED = [
  { id: "1", workspace: "Mecânica Garagem", owner: "carlos@garagem.com", expired_at: "2026-04-27", days: 16 },
  { id: "2", workspace: "Estética Lara", owner: "lara@estetica.com", expired_at: "2026-05-02", days: 11 },
  { id: "3", workspace: "Padaria Pão Quente", owner: "jose@pao.com", expired_at: "2026-05-08", days: 5 },
  { id: "4", workspace: "Dr. Pedro Odonto", owner: "pedro@odonto.com", expired_at: "2026-05-12", days: 1 },
];

function BillingAdmin() {
  const [items, setItems] = React.useState(EXPIRED);

  return (
    <div className="flex flex-col" style={{ gap: 20 }}>
      <div>
        <h2 style={{ fontSize: 20, fontWeight: 600 }}>Cobrança</h2>
        <p style={{ fontSize: 13, color: "rgba(255,255,255,0.5)", marginTop: 4 }}>
          Visão financeira da plataforma.
        </p>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
          gap: 12,
        }}
      >
        {KPIS.map((k) => {
          const Icon = k.icon;
          return (
            <div key={k.label} style={adminCard}>
              <div className="flex items-center justify-between">
                <span style={{ fontSize: 12, color: "rgba(255,255,255,0.5)" }}>{k.label}</span>
                <Icon size={14} style={{ color: "rgba(255,255,255,0.4)" }} />
              </div>
              <div style={{ fontSize: 26, fontWeight: 600, marginTop: 10 }}>{k.value}</div>
              <div
                className="inline-flex items-center"
                style={{
                  marginTop: 6,
                  fontSize: 11,
                  fontWeight: 600,
                  padding: "2px 8px",
                  borderRadius: 999,
                  color: k.positive ? "#10B981" : "#F87171",
                  background: k.positive
                    ? "color-mix(in oklab, #10B981 15%, transparent)"
                    : "color-mix(in oklab, #EF4444 15%, transparent)",
                }}
              >
                {k.delta}
              </div>
            </div>
          );
        })}
      </div>

      <div style={adminCard}>
        <div className="flex items-center gap-2" style={{ marginBottom: 16 }}>
          <AlertTriangle size={16} style={{ color: "#F59E0B" }} />
          <h3 style={{ fontSize: 14, fontWeight: 600 }}>Workspaces em trial vencido</h3>
          <span
            style={{
              fontSize: 11,
              padding: "2px 8px",
              borderRadius: 999,
              background: "color-mix(in oklab, #F59E0B 18%, transparent)",
              color: "#F59E0B",
              fontWeight: 600,
            }}
          >
            {items.length}
          </span>
        </div>

        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr style={{ color: "rgba(255,255,255,0.55)", fontSize: 11, textTransform: "uppercase", letterSpacing: "0.05em" }}>
              <th style={th}>Workspace</th>
              <th style={th}>Dono</th>
              <th style={th}>Expirou em</th>
              <th style={th}>Dias</th>
              <th style={th}>Ações</th>
            </tr>
          </thead>
          <tbody>
            {items.map((w) => (
              <tr key={w.id} style={{ borderTop: "1px solid #1F1F23" }}>
                <td style={td}>{w.workspace}</td>
                <td style={{ ...td, color: "rgba(255,255,255,0.7)" }}>{w.owner}</td>
                <td style={{ ...td, color: "rgba(255,255,255,0.6)" }}>
                  {new Date(w.expired_at).toLocaleDateString("pt-BR")}
                </td>
                <td style={td}>
                  <span style={{ color: w.days <= 3 ? "#F87171" : "#F59E0B", fontWeight: 600 }}>
                    {w.days}d
                  </span>
                </td>
                <td style={td}>
                  <div className="flex gap-1">
                    <button
                      style={adminBtnGhost}
                      className="inline-flex items-center gap-1"
                      onClick={() => toast.success(`Email de cobrança enviado para ${w.owner}`)}
                    >
                      <Mail size={12} /> Enviar email
                    </button>
                    <button
                      style={adminBtnDanger}
                      className="inline-flex items-center gap-1"
                      onClick={() => {
                        if (confirm(`Suspender ${w.workspace}?`)) {
                          setItems((x) => x.filter((i) => i.id !== w.id));
                          toast.success("Workspace suspenso");
                        }
                      }}
                    >
                      <PauseCircle size={12} /> Suspender
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const th: React.CSSProperties = { padding: "10px 12px", textAlign: "left", fontWeight: 500 };
const td: React.CSSProperties = { padding: "12px" };
