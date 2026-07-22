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
import {
  getServiceReport,
  getAppointmentsReport,
  getServicesReport,
  getTeamReport,
  formatBRL,
  formatDuration,
  type Period,
  type ServiceReport,
  type AppointmentsReport,
  type ServicesReport,
  type TeamReport,
} from "@/features/reports/data";
import { ManagerOnly } from "@/components/manager-only";

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
  component: () => (
    <ManagerOnly>
      <ReportsPage />
    </ManagerOnly>
  ),
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

type AnyReport = ServiceReport | AppointmentsReport | ServicesReport | TeamReport;

function ReportsPage() {
  const { period, tab } = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [report, setReport] = React.useState<AnyReport | null>(null);
  const [reportTab, setReportTab] = React.useState<typeof tab | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    const fetcher =
      tab === "service" ? getServiceReport
      : tab === "appointments" ? getAppointmentsReport
      : tab === "services" ? getServicesReport
      : getTeamReport;
    fetcher(period as Period)
      .then((r) => { if (!cancelled) { setReport(r as AnyReport); setReportTab(tab); } })
      .catch((e) => { if (!cancelled) setError(e?.message ?? "Falha ao carregar."); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [period, tab]);

  const exportCsv = () => {
    const rows = (report as any)?.exportRows as Array<Record<string, string | number>> | undefined;
    if (!rows || rows.length === 0) {
      notify.info("Nada para exportar.");
      return;
    }
    const keys = Object.keys(rows[0]);
    const csv = [
      keys.join(","),
      ...rows.map((r) => keys.map((k) => JSON.stringify(r[k] ?? "")).join(",")),
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
      <div className="flex flex-wrap items-center justify-between" style={{ gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 600, letterSpacing: "-0.015em" }}>Relatórios</h1>
          <p style={{ marginTop: 2, fontSize: 12, color: "var(--text-muted)" }}>
            Análise consolidada do seu negócio.
          </p>
        </div>

        <div className="flex flex-wrap items-center" style={{ gap: 8 }}>
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

      {loading || reportTab !== tab ? (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: 12 }}>
          {Array.from({ length: 4 }).map((_, i) => <SkeletonCard key={i} />)}
        </div>
      ) : error ? (
        <EmptyState title="Erro ao carregar" description={error} />
      ) : !report ? (
        <EmptyState title="Sem dados" description="Tente outro período." />
      ) : (
        <ReportTab tab={tab} report={report} />
      )}

      <p style={{ fontSize: 11, color: "var(--text-muted)" }}>
        Dica: o <Link to="/dashboard" style={{ color: "var(--brand-400)" }}>Dashboard</Link> mostra a
        visão em tempo real. Use os Relatórios para análises consolidadas e exportações.
      </p>
    </div>
  );
}

function ReportTab({ tab, report }: { tab: "service" | "appointments" | "services" | "team"; report: AnyReport }) {
  if (tab === "service") {
    const r = report as ServiceReport;
    if (r.totalInbound === 0 && r.ranking.length === 0) {
      return <EmptyState title="Sem atendimentos no período" description="Nenhuma mensagem registrada nesse intervalo." />;
    }
    return (
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 12 }}>
        <Card title="Volume de atendimentos por dia" span={2}>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={r.series}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="d" tick={{ fontSize: 11, fill: "var(--text-muted)" }} />
              <YAxis tick={{ fontSize: 11, fill: "var(--text-muted)" }} allowDecimals={false} />
              <Tooltip contentStyle={{ background: "var(--bg-surface)", border: "1px solid var(--border)", fontSize: 12 }} />
              <Bar dataKey="v" fill="var(--brand-400)" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Card>

        <KpiCard label="Tempo médio de resposta" value={formatDuration(r.tmrSeconds)} delta={r.tmrDelta.label} good={r.tmrDelta.good} />
        <KpiCard label="Taxa de resolução" value={r.resolvedPct} delta={r.resolvedDelta.label} good={r.resolvedDelta.good} />

        <Card title="Ranking por agente" span={2}>
          {r.ranking.length === 0 ? (
            <EmptyState title="Sem dados de agente" description="Ainda não houve mensagens enviadas no período." />
          ) : (
            <SimpleTable
              cols={["Agente", "Atendimentos", "TMR", "Resolvidos"]}
              rows={r.ranking.map((x) => [x.name, x.total, x.tmr, x.resolved])}
            />
          )}
        </Card>
      </div>
    );
  }

  if (tab === "appointments") {
    const r = report as AppointmentsReport;
    if (r.total === 0) {
      return <EmptyState title="Sem agendamentos no período" description="Crie agendamentos em /schedule." />;
    }
    return (
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 12 }}>
        <Card title="Agendamentos por dia" span={2}>
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={r.series}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="d" tick={{ fontSize: 11, fill: "var(--text-muted)" }} />
              <YAxis tick={{ fontSize: 11, fill: "var(--text-muted)" }} allowDecimals={false} />
              <Tooltip contentStyle={{ background: "var(--bg-surface)", border: "1px solid var(--border)", fontSize: 12 }} />
              <Line type="monotone" dataKey="v" stroke="var(--brand-400)" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </Card>

        <KpiCard label="Taxa de cancelamento" value={r.cancelPct} delta={r.cancelDelta.label} good={!r.cancelDelta.good} />
        <KpiCard label="Receita estimada" value={formatBRL(r.revenueCents)} delta={r.revenueDelta.label} good={r.revenueDelta.good} />

        <Card title="Top serviços agendados" span={2}>
          {r.topServices.length === 0 ? (
            <EmptyState title="Sem serviços" description="Os agendamentos do período não têm serviço associado." />
          ) : (
            <SimpleTable
              cols={["Serviço", "Agendamentos", "Receita"]}
              rows={r.topServices.map((x) => [x.name, x.qty, x.revenue])}
            />
          )}
        </Card>
      </div>
    );
  }

  if (tab === "services") {
    const r = report as ServicesReport;
    if (r.total === 0) {
      return <EmptyState title="Sem serviços concluídos" description="Marque agendamentos como concluídos para ver receita." />;
    }
    return (
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 12 }}>
        <KpiCard label="Receita total" value={formatBRL(r.totalRevenueCents)} delta={r.revenueDelta.label} good={r.revenueDelta.good} />
        <KpiCard label="Ticket médio" value={formatBRL(r.ticketCents)} delta={r.ticketDelta.label} good={r.ticketDelta.good} />
        <Card title="Receita por serviço" span={2}>
          <SimpleTable
            cols={["Serviço", "Vendas", "Receita", "Ticket médio"]}
            rows={r.rows.map((x) => [x.name, x.qty, x.revenue, x.avg])}
          />
        </Card>
      </div>
    );
  }

  const r = report as TeamReport;
  if (r.rows.length === 0) {
    return <EmptyState title="Sem atividade da equipe" description="Nenhum agente enviou mensagens no período." />;
  }
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 12 }}>
      <Card title="Produtividade por agente" span={2}>
        <SimpleTable
          cols={["Agente", "Atendimentos", "Tempo médio", "Resolvidos"]}
          rows={r.rows.map((x) => [x.name, x.total, x.tmr, x.resolved])}
        />
      </Card>
    </div>
  );
}

/* -------------- Components -------------- */

function Card({ title, children, span = 1 }: { title: string; children: React.ReactNode; span?: number }) {
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

function KpiCard({ label, value, delta, good }: { label: string; value: string; delta: string; good?: boolean }) {
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
        {delta}
      </div>
    </div>
  );
}

function SimpleTable({ cols, rows }: { cols: string[]; rows: Array<Array<string | number>> }) {
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
