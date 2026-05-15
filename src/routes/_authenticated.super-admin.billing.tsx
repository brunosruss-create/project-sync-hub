import * as React from "react";
import { createFileRoute } from "@tanstack/react-router";
import { TrendingUp, TrendingDown, DollarSign, AlertTriangle } from "lucide-react";
import { adminCard } from "./_authenticated.super-admin";

export const Route = createFileRoute("/_authenticated/super-admin/billing")({
  component: BillingAdmin,
});

const KPIS = [
  { label: "MRR Total", value: "—", icon: DollarSign },
  { label: "Churn do mês", value: "—", icon: TrendingDown },
  { label: "Upgrades", value: "—", icon: TrendingUp },
  { label: "Downgrades", value: "—", icon: TrendingDown },
];

function BillingAdmin() {
  return (
    <div className="flex flex-col" style={{ gap: 20 }}>
      <div>
        <h2 style={{ fontSize: 20, fontWeight: 600 }}>Cobrança</h2>
        <p style={{ fontSize: 13, color: "rgba(255,255,255,0.5)", marginTop: 4 }}>
          Os dados de billing serão integrados quando o Stripe estiver ativo.
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
              <div style={{ fontSize: 26, fontWeight: 600, marginTop: 10, color: "rgba(255,255,255,0.5)" }}>
                {k.value}
              </div>
            </div>
          );
        })}
      </div>

      <div style={adminCard}>
        <div className="flex items-center gap-2" style={{ marginBottom: 12 }}>
          <AlertTriangle size={16} style={{ color: "#F59E0B" }} />
          <h3 style={{ fontSize: 14, fontWeight: 600 }}>Integração de billing pendente</h3>
        </div>
        <p style={{ fontSize: 13, color: "rgba(255,255,255,0.6)", lineHeight: 1.6 }}>
          Conecte o Stripe para ver MRR, churn, upgrades, downgrades e workspaces em
          trial vencido com dados reais. Enquanto isso, esta tela ficará vazia para
          não exibir métricas falsas.
        </p>
      </div>
    </div>
  );
}
