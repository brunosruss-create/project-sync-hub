import * as React from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Check, Download, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import {
  SettingsLayout,
  buttonPrimary,
  buttonSecondary,
  card,
} from "@/features/settings/settings-layout";

export const Route = createFileRoute("/_authenticated/settings/billing")({
  component: BillingPage,
});

type PlanKey = "trial" | "starter" | "pro" | "enterprise";

const PLANS: {
  key: PlanKey;
  name: string;
  price: string;
  period: string;
  features: string[];
  highlight?: boolean;
}[] = [
  {
    key: "starter",
    name: "Starter",
    price: "R$ 97",
    period: "/mês",
    features: ["3 agentes", "500 contatos", "1 número WhatsApp", "Sem IA"],
  },
  {
    key: "pro",
    name: "Pro",
    price: "R$ 197",
    period: "/mês",
    features: [
      "10 agentes",
      "Contatos ilimitados",
      "IA incluída",
      "Múltiplos números",
      "Relatórios avançados",
    ],
    highlight: true,
  },
  {
    key: "enterprise",
    name: "Enterprise",
    price: "Custom",
    period: "",
    features: ["Agentes ilimitados", "SLA dedicado", "Onboarding", "Integrações sob medida"],
  },
];

const INVOICES = [
  { id: "INV-0042", date: "01/05/2026", amount: "R$ 197,00", status: "Pago" },
  { id: "INV-0041", date: "01/04/2026", amount: "R$ 197,00", status: "Pago" },
  { id: "INV-0040", date: "01/03/2026", amount: "R$ 97,00", status: "Pago" },
];

function BillingPage() {
  const current: PlanKey = "trial";
  const trialDaysLeft: number = 2;
  const usage = {
    contacts: { used: 47, total: 100 },
    messages: { used: 312, total: 1000 },
    agents: { used: 1, total: 1 },
  };
  const trialUrgent = trialDaysLeft < 3;

  return (
    <SettingsLayout
      title="Planos & Cobrança"
      description="Acompanhe seu uso, gerencie seu plano e veja o histórico financeiro."
    >
      <div style={{ ...card, marginBottom: 24 }}>
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <div style={{ fontSize: 11, fontWeight: 600, textTransform: "uppercase", color: "var(--text-muted)", letterSpacing: "0.05em" }}>
              Plano atual
            </div>
            <h2 style={{ fontSize: 22, fontWeight: 600, marginTop: 4 }}>
              Trial gratuito
            </h2>
            {current === "trial" && (
              <div
                className="inline-flex items-center gap-2"
                style={{
                  marginTop: 8,
                  padding: "6px 12px",
                  borderRadius: 999,
                  fontSize: 12,
                  fontWeight: 500,
                  background: trialUrgent
                    ? "color-mix(in oklab, #EF4444 18%, transparent)"
                    : "color-mix(in oklab, #F59E0B 18%, transparent)",
                  color: trialUrgent ? "#EF4444" : "#F59E0B",
                }}
              >
                {trialUrgent && <AlertTriangle size={12} />}
                {trialDaysLeft} {trialDaysLeft === 1 ? "dia restante" : "dias restantes"} no trial
              </div>
            )}
          </div>
          <button style={buttonPrimary}>Fazer upgrade</button>
        </div>

        <div
          style={{
            marginTop: 20,
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
            gap: 16,
          }}
        >
          <UsageBar label="Contatos" {...usage.contacts} />
          <UsageBar label="Mensagens este mês" {...usage.messages} />
          <UsageBar label="Agentes" {...usage.agents} />
        </div>
      </div>

      <div style={{ marginBottom: 12, fontSize: 13, fontWeight: 600 }}>
        Comparativo de planos
      </div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
          gap: 12,
          marginBottom: 32,
        }}
      >
        {PLANS.map((p) => (
          <div
            key={p.key}
            style={{
              ...card,
              border: p.highlight
                ? "1px solid var(--brand-400)"
                : "1px solid var(--border)",
              position: "relative",
            }}
          >
            {p.highlight && (
              <div
                style={{
                  position: "absolute",
                  top: -10,
                  right: 16,
                  padding: "2px 10px",
                  borderRadius: 999,
                  background: "var(--brand-400)",
                  color: "#fff",
                  fontSize: 11,
                  fontWeight: 600,
                }}
              >
                Recomendado
              </div>
            )}
            <h3 style={{ fontSize: 16, fontWeight: 600 }}>{p.name}</h3>
            <div style={{ marginTop: 8, marginBottom: 16 }}>
              <span style={{ fontSize: 24, fontWeight: 600 }}>{p.price}</span>
              <span style={{ fontSize: 13, color: "var(--text-muted)" }}>{p.period}</span>
            </div>
            <ul className="flex flex-col" style={{ gap: 8, marginBottom: 16 }}>
              {p.features.map((f) => (
                <li key={f} className="flex items-center gap-2" style={{ fontSize: 13 }}>
                  <Check size={14} style={{ color: "var(--brand-400)" }} />
                  {f}
                </li>
              ))}
            </ul>
            <button
              style={{
                ...(p.highlight ? buttonPrimary : buttonSecondary),
                width: "100%",
              }}
              onClick={() => toast(`Upgrade para ${p.name} em breve`)}
            >
              {p.key === "enterprise" ? "Falar com vendas" : "Fazer upgrade"}
            </button>
          </div>
        ))}
      </div>

      <div style={{ marginBottom: 12, fontSize: 13, fontWeight: 600 }}>
        Histórico de faturas
      </div>
      <div style={card}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ fontSize: 12, color: "var(--text-muted)", textAlign: "left" }}>
              <th style={{ padding: "8px 4px", fontWeight: 500 }}>Fatura</th>
              <th style={{ padding: "8px 4px", fontWeight: 500 }}>Data</th>
              <th style={{ padding: "8px 4px", fontWeight: 500 }}>Valor</th>
              <th style={{ padding: "8px 4px", fontWeight: 500 }}>Status</th>
              <th style={{ padding: "8px 4px", fontWeight: 500 }}></th>
            </tr>
          </thead>
          <tbody>
            {INVOICES.map((inv, i) => (
              <tr
                key={inv.id}
                style={{
                  borderTop: i === 0 ? "1px solid var(--border)" : "1px solid var(--border)",
                  fontSize: 13,
                }}
              >
                <td style={{ padding: "10px 4px", fontWeight: 500 }}>{inv.id}</td>
                <td style={{ padding: "10px 4px", color: "var(--text-muted)" }}>{inv.date}</td>
                <td style={{ padding: "10px 4px" }}>{inv.amount}</td>
                <td style={{ padding: "10px 4px" }}>
                  <span
                    style={{
                      fontSize: 11,
                      padding: "3px 8px",
                      borderRadius: 999,
                      background: "color-mix(in oklab, #10B981 18%, transparent)",
                      color: "#10B981",
                    }}
                  >
                    {inv.status}
                  </span>
                </td>
                <td style={{ padding: "10px 4px", textAlign: "right" }}>
                  <button
                    style={{
                      ...buttonSecondary,
                      height: 28,
                      padding: "0 10px",
                      fontSize: 12,
                    }}
                    className="inline-flex items-center gap-1"
                  >
                    <Download size={12} /> PDF
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </SettingsLayout>
  );
}

function UsageBar({ label, used, total }: { label: string; used: number; total: number }) {
  const pct = Math.min(100, Math.round((used / total) * 100));
  const danger = pct > 85;
  return (
    <div>
      <div className="flex items-center justify-between" style={{ marginBottom: 6 }}>
        <span style={{ fontSize: 12, color: "var(--text-muted)" }}>{label}</span>
        <span style={{ fontSize: 12, fontWeight: 500 }}>
          {used} / {total}
        </span>
      </div>
      <div
        style={{
          height: 6,
          borderRadius: 999,
          background: "var(--bg-overlay)",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            width: `${pct}%`,
            height: "100%",
            background: danger ? "#EF4444" : "var(--brand-400)",
            transition: "width 0.3s",
          }}
        />
      </div>
    </div>
  );
}
