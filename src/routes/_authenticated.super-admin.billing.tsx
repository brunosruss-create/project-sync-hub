import * as React from "react";
import { createFileRoute } from "@tanstack/react-router";
import { TrendingUp, TrendingDown, DollarSign, AlertTriangle } from "lucide-react";
import { EmptyState as SharedEmptyState } from "@/components/empty-state";
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
        <p style={{ fontSize: 13, color: "var(--text-muted)", marginTop: 4 }}>
          Os dados de billing serão integrados quando o Stripe estiver ativo.
        </p>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(min(200px, 100%), 1fr))",
          gap: 12,
        }}
      >
        {KPIS.map((k) => {
          const Icon = k.icon;
          return (
            <div key={k.label} style={adminCard}>
              <div className="flex items-center justify-between">
                <span style={{ fontSize: 12, color: "var(--text-muted)" }}>{k.label}</span>
                <Icon size={14} style={{ color: "var(--text-muted)" }} />
              </div>
              <div style={{ fontSize: 26, fontWeight: 600, marginTop: 10, color: "var(--text-muted)" }}>
                {k.value}
              </div>
            </div>
          );
        })}
      </div>

      <div style={adminCard}>
        <SharedEmptyState
          icon={<AlertTriangle size={32} style={{ color: "#F59E0B" }} aria-hidden />}
          title="Integração de billing pendente"
          description="Conecte o Stripe para ver MRR, churn, upgrades, downgrades e workspaces em trial vencido com dados reais. Enquanto isso, esta tela ficará vazia para não exibir métricas falsas."
        />
      </div>
    </div>
  );
}
