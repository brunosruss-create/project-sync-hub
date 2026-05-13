import * as React from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { zodValidator, fallback } from "@tanstack/zod-adapter";
import { z } from "zod";
import { Download, BarChart3, Calendar, Wrench, Users } from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  LineChart,
  Line,
} from "recharts";
import { notify } from "@/lib/notify";
import { SkeletonCard } from "@/components/skeleton";
import { EmptyState } from "@/components/empty-state";

const searchSchema = z.object({
  period: fallback(z.enum(["today", "7d", "30d"]), "7d").default("7d"),
  tab: fallback(z.enum(["service", "appointments", "services", "team"]), "service").default("service"),
});

export const Route = createFileRoute("/_authenticated/reports")({
  validateSearch: zodValidator(searchSchema),
  head: () => ({
    meta: [
      { title: "Relatórios | ZapFlow" },
      { name: "description", content: "Indicadores e relatórios analíticos do seu negócio." },
    ],
  }),
  component: ReportsPage,
});

const PERIODS = [
  { id: "today", label: "Hoje" },
  { id: "7d", label: "Últimos 7 dias" },
  { id: "30d", label: "Últimos 30 dias" },
] as const;

const TABS = [
  { id: "service", label: "Atendimento", icon: BarChart3 },
  { id: "appointments", label: "Agendamentos", icon: Calendar },
  { id: "services", label: "Serviços", icon: Wrench },
  { id: "team", label: "Equipe", icon: Users },
] as const;

function ReportsPage() {
  const { period, tab } = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    setLoading(true);
    const t = setTimeout(() => setLoading(false), 350);
    return () => clearTimeout(t);
  }, [period, tab]);

  const exportCsv = () => {
    const rows = mockData(period, tab);
    if (rows.length === 0) {
      notify.info("Nada para exportar.");
      return;
    }
    const keys = Object.keys(rows[0]);
    const csv = [
      keys.join(","),
      ...rows.map((r) => keys.map((k) => JSON.stringify((r as any)[k] ?? "")).join(",")),
    ].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `relatorio-${tab}-${period}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    notify.success("Relatório exportado.");
  };

  return (
    <div className="flex flex-col" style={{ gap: 16 }}>
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between" style={{ gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 600, letterSpacing: "-0.015em" }}>Relatórios</h1>
          <p style={{ marginTop: 2, fontSize: 12, color: "var(--text-muted)" }}>
            Análise consolidada do seu negócio.
          </p>
        </div>

        <div className="flex flex-wrap items-center" style={{ gap: 8 }}>
          {/* Período */}
          <div
            className="flex items-center"
            style={{
              gap: 2,
              padding: 2,
              background: "var(--bg-overlay)",
              borderRadius: 6,
              border: "1px solid var(--border)",
            }}
          >
            {PERIODS.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => navigate({ search: (prev) => ({ ...prev, period: p.id }) })}
                style={{
                  height: 26,
                  padding: "0 10px",
                  borderRadius: 4,
                  fontSize: 12,
                  fontWeight: 500,
                  background: period === p.id ? "var(--bg-surface)" : "transparent",
                  color: period === p.id ? "var(--text-primary)" : "var(--text-muted)",
                  border: period === p.id ? "1px solid var(--border)" : "1px solid transparent",
                }}
              >
                {p.label}
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={exportCsv}
            className="inline-flex items-center"
            style={{
              gap: 6,
              height: 32,
              padding: "0 12px",
              borderRadius: 6,
              border: "1px solid var(--border-strong)",
              background: "transparent",
              color: "var(--text-primary)",
              fontSize: 13,
              fontWeight: 500,
            }}
          >
            <Download size={14} />
            Exportar CSV
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div
        className="flex"
        style={{ borderBottom: "1px solid var(--border)", gap: 4, overflowX: "auto" }}
        role="tablist"
      >
        {TABS.map((t) => {
          const active = tab === t.id;
          const Icon = t.icon;
          return (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => navigate({ search: (prev) => ({ ...prev, tab: t.id }) })}
              className="inline-flex items-center"
              style={{
                gap: 6,
                height: 36,
                padding: "0 12px",
                background: "transparent",
                color: active ? "var(--brand-400)" : "var(--text-muted)",
                borderBottom: active ? "2px solid var(--brand-400)" : "2px solid transparent",
                fontSize: 13,
                fontWeight: 500,
                whiteSpace: "nowrap",
              }}
            >
              <Icon size={14} />
              {t.label}
            </button>
          );
        })}
      </div>

      {/* Conteúdo */}
      {loading ? (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))",
            gap: 12,
          }}
        >
          {Array.from({ length: 4 }).map((_, i) => (
            <SkeletonCard key={i} />
          ))}
        </div>
      ) : (
        <ReportTab tab={tab} period={period} />
      )}

      <p style={{ fontSize: 11, color: "var(--text-muted)" }}>
        Dica: o <Link to="/dashboard" style={{ color: "var(--brand-400)" }}>Dashboard</Link> mostra a
        visão em tempo real. Use os Relatórios para análises consolidadas e exportações.
      </p>
    </div>
  );
}

/* -------------- Tabs -------------- */

function ReportTab({
  tab,
  period,
}: {
  tab: "service" | "appointments" | "services" | "team";
  period: "today" | "7d" | "30d";
}) {
  const data = mockData(period, tab);

  if (data.length === 0) {
    return (
      <EmptyState
        title="Sem dados no período"
        description="Selecione outro intervalo ou aguarde novas interações."
      />
    );
  }

  if (tab === "service") {
    const chart = mockSeries(period);
    return (
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 12 }}>
        <Card title="Volume de atendimentos por dia" span={2}>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={chart}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="d" tick={{ fontSize: 11, fill: "var(--text-muted)" }} />
              <YAxis tick={{ fontSize: 11, fill: "var(--text-muted)" }} />
              <Tooltip contentStyle={{ background: "var(--bg-surface)", border: "1px solid var(--border)", fontSize: 12 }} />
              <Bar dataKey="v" fill="var(--brand-400)" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Card>

        <KpiCard label="Tempo médio de resposta" value="2m 14s" delta="-12%" good />
        <KpiCard label="Taxa de resolução" value="87%" delta="+4%" good />

        <Card title="Ranking por agente" span={2}>
          <SimpleTable
            cols={["Agente", "Atendimentos", "TMR", "Resolvidos"]}
            rows={data.map((r: any) => [r.name, r.total, r.tmr, r.resolved])}
          />
        </Card>
      </div>
    );
  }

  if (tab === "appointments") {
    const chart = mockSeries(period);
    return (
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 12 }}>
        <Card title="Agendamentos por dia" span={2}>
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={chart}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="d" tick={{ fontSize: 11, fill: "var(--text-muted)" }} />
              <YAxis tick={{ fontSize: 11, fill: "var(--text-muted)" }} />
              <Tooltip contentStyle={{ background: "var(--bg-surface)", border: "1px solid var(--border)", fontSize: 12 }} />
              <Line type="monotone" dataKey="v" stroke="var(--brand-400)" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </Card>

        <KpiCard label="No-show rate" value="6,3%" delta="-1,2%" good />
        <KpiCard label="Receita estimada" value="R$ 12.480,00" delta="+18%" good />

        <Card title="Top serviços agendados" span={2}>
          <SimpleTable
            cols={["Serviço", "Agendamentos", "Receita"]}
            rows={data.map((r: any) => [r.name, r.qty, r.revenue])}
          />
        </Card>
      </div>
    );
  }

  if (tab === "services") {
    return (
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 12 }}>
        <KpiCard label="Receita total" value="R$ 24.910,00" delta="+22%" good />
        <KpiCard label="Ticket médio" value="R$ 134,90" delta="+5%" good />
        <Card title="Receita por serviço" span={2}>
          <SimpleTable
            cols={["Serviço", "Vendas", "Receita", "Ticket médio"]}
            rows={data.map((r: any) => [r.name, r.qty, r.revenue, r.avg])}
          />
        </Card>
      </div>
    );
  }

  // team
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 12 }}>
      <Card title="Produtividade por agente" span={2}>
        <SimpleTable
          cols={["Agente", "Atendimentos", "Tempo médio", "Satisfação"]}
          rows={data.map((r: any) => [r.name, r.total, r.tmr, r.score])}
        />
      </Card>
    </div>
  );
}

/* -------------- Components -------------- */

function Card({
  title,
  children,
  span = 1,
}: {
  title: string;
  children: React.ReactNode;
  span?: number;
}) {
  return (
    <div
      style={{
        gridColumn: `span ${span}`,
        background: "var(--bg-surface)",
        border: "1px solid var(--border)",
        borderRadius: 8,
        padding: 16,
      }}
    >
      <h3 style={{ fontSize: 13, fontWeight: 600, marginBottom: 12 }}>{title}</h3>
      {children}
    </div>
  );
}

function KpiCard({
  label,
  value,
  delta,
  good,
}: {
  label: string;
  value: string;
  delta: string;
  good?: boolean;
}) {
  return (
    <div
      style={{
        background: "var(--bg-surface)",
        border: "1px solid var(--border)",
        borderRadius: 8,
        padding: 16,
      }}
    >
      <div style={{ fontSize: 12, color: "var(--text-muted)" }}>{label}</div>
      <div style={{ fontSize: 24, fontWeight: 600, marginTop: 4 }}>{value}</div>
      <div
        style={{
          marginTop: 6,
          fontSize: 11,
          fontWeight: 600,
          color: good ? "var(--success)" : "var(--danger)",
        }}
      >
        {delta} vs. período anterior
      </div>
    </div>
  );
}

function SimpleTable({
  cols,
  rows,
}: {
  cols: string[];
  rows: Array<Array<string | number>>;
}) {
  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, minWidth: 480 }}>
        <thead>
          <tr>
            {cols.map((c, i) => (
              <th
                key={c}
                style={{
                  textAlign: i === 0 ? "left" : "right",
                  padding: "8px 10px",
                  borderBottom: "1px solid var(--border)",
                  fontSize: 11,
                  fontWeight: 600,
                  color: "var(--text-muted)",
                  textTransform: "uppercase",
                  letterSpacing: "0.04em",
                }}
              >
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} style={{ borderTop: "1px solid var(--border)" }}>
              {r.map((cell, j) => (
                <td
                  key={j}
                  style={{
                    padding: "10px",
                    textAlign: j === 0 ? "left" : "right",
                    color: j === 0 ? "var(--text-primary)" : "var(--text-muted)",
                    fontWeight: j === 0 ? 500 : 400,
                  }}
                >
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* -------------- Mock helpers -------------- */

function mockSeries(period: "today" | "7d" | "30d") {
  const days = period === "today" ? 1 : period === "7d" ? 7 : 30;
  const labels = period === "today" ? ["Hoje"] : Array.from({ length: days }, (_, i) => `D${i + 1}`);
  return labels.map((d, i) => ({ d, v: Math.round(20 + Math.sin(i / 2) * 10 + Math.random() * 10) }));
}

function mockData(_period: string, tab: string) {
  if (tab === "service") {
    return [
      { name: "Ana Silva", total: 142, tmr: "1m 48s", resolved: 124 },
      { name: "Bruno Costa", total: 118, tmr: "2m 32s", resolved: 99 },
      { name: "Sofia (IA)", total: 96, tmr: "8s", resolved: 71 },
    ];
  }
  if (tab === "appointments") {
    return [
      { name: "Revisão de Óleo", qty: 28, revenue: "R$ 2.517,20" },
      { name: "Alinhamento", qty: 19, revenue: "R$ 1.520,00" },
      { name: "Diagnóstico", qty: 14, revenue: "R$ 980,00" },
    ];
  }
  if (tab === "services") {
    return [
      { name: "Revisão de Óleo", qty: 88, revenue: "R$ 7.911,20", avg: "R$ 89,90" },
      { name: "Alinhamento", qty: 47, revenue: "R$ 3.760,00", avg: "R$ 80,00" },
      { name: "Higienização", qty: 22, revenue: "R$ 2.398,00", avg: "R$ 109,00" },
    ];
  }
  return [
    { name: "Ana Silva", total: 142, tmr: "1m 48s", score: "4,8 ★" },
    { name: "Bruno Costa", total: 118, tmr: "2m 32s", score: "4,6 ★" },
    { name: "Carla Mendes", total: 76, tmr: "3m 12s", score: "4,4 ★" },
  ];
}
