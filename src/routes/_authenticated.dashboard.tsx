import * as React from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import {
  MessageSquare,
  Clock,
  TrendingUp,
  Calendar,
  AlertCircle,
  ArrowUpRight,
  ArrowDownRight,
} from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useProfile } from "@/hooks/use-profile";
import { getDashboardData, type DashboardData, type DashPeriod } from "@/features/dashboard/data";

export const Route = createFileRoute("/_authenticated/dashboard")({
  component: Dashboard,
});

type Period = DashPeriod;

function Dashboard() {
  const { user } = useAuth();
  const { data: profile } = useProfile();
  const [period, setPeriod] = React.useState<Period>("today");
  const [loading, setLoading] = React.useState(true);
  const [data, setData] = React.useState<DashboardData | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    setLoading(true);
    getDashboardData(period, user?.id)
      .then((d) => { if (!cancelled) { setData(d); setLoading(false); } })
      .catch((e) => { console.warn("[dashboard] load:", e?.message ?? e); if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [period, user?.id]);

  const displayName =
    profile?.full_name ||
    (user?.user_metadata?.full_name as string | undefined) ||
    user?.email?.split("@")[0] ||
    "ali";

  const kpis = [
    { label: "Atendimentos", value: data ? String(data.kpis.atendimentos.value) : "—", delta: data?.kpis.atendimentos.delta ?? 0, icon: MessageSquare },
    { label: "Tempo médio de resposta", value: data?.kpis.tmr.value ?? "—", delta: data?.kpis.tmr.delta ?? 0, icon: Clock },
    { label: "Taxa de resolução", value: data?.kpis.resolution.value ?? "—", delta: data?.kpis.resolution.delta ?? 0, icon: TrendingUp },
    { label: "Agendamentos no período", value: data ? String(data.kpis.appointments.value) : "—", delta: data?.kpis.appointments.delta ?? 0, icon: Calendar },
  ];

  const hourly = data?.hourly ?? [];
  const kanban = data?.kanban ?? [];
  const upcoming = data?.upcoming ?? [];
  const topServices = data?.topServices ?? [];
  const agents = data?.agents ?? [];
  const urgent = data?.urgent ?? [];

  return (
    <div className="flex flex-col" style={{ gap: 20 }}>
      <div className="flex items-end justify-between flex-wrap gap-4">
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 600, letterSpacing: "-0.015em" }}>
            Olá, {displayName}
          </h1>
          <p style={{ marginTop: 4, fontSize: 13, color: "var(--text-muted)" }}>
            Aqui está o resumo do seu workspace.
          </p>
        </div>
        <PeriodFilter value={period} onChange={setPeriod} />
      </div>

      {/* LINHA 1 — KPIs */}
      <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))" }}>
        {kpis.map((k) =>
          loading ? (
            <Skeleton key={k.label} h={104} />
          ) : (
            <KPI key={k.label} {...k} />
          ),
        )}
      </div>

      {/* LINHA 2 */}
      <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(12, 1fr)" }}>
        <div style={{ gridColumn: "span 12 / span 12" }} className="lg:col-span-8">
          <ChartCard title="Atendimentos por hora (últimas 24h)">
            {loading ? (
              <Skeleton h={240} />
            ) : (
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={hourly}>
                  <XAxis
                    dataKey="hour"
                    stroke="var(--text-muted)"
                    fontSize={10}
                    tickLine={false}
                    axisLine={false}
                    interval={2}
                  />
                  <YAxis stroke="var(--text-muted)" fontSize={10} tickLine={false} axisLine={false} />
                  <Tooltip
                    cursor={{ fill: "var(--bg-overlay)" }}
                    contentStyle={{
                      background: "var(--bg-surface)",
                      border: "1px solid var(--border)",
                      borderRadius: 8,
                      fontSize: 12,
                    }}
                  />
                  <Bar dataKey="msgs" fill="var(--brand-400)" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </ChartCard>
        </div>
        <div style={{ gridColumn: "span 12 / span 12" }} className="lg:col-span-4">
          <ChartCard title="Distribuição por coluna">
            {loading ? (
              <Skeleton h={240} />
            ) : (
              <KanbanDistribution data={kanban} />
            )}
          </ChartCard>
        </div>
      </div>

      {/* LINHA 3 */}
      <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(12, 1fr)" }}>
        <div style={{ gridColumn: "span 12 / span 12" }} className="lg:col-span-5">
          <ChartCard title="Próximos agendamentos">
            {loading ? (
              <Skeleton h={240} />
            ) : (
              <ul className="flex flex-col" style={{ gap: 8 }}>
                {upcoming.map((a, i) => (
                  <li
                    key={i}
                    className="flex items-center gap-3"
                    style={{
                      padding: "8px 4px",
                      borderTop: i === 0 ? 0 : "1px solid var(--border)",
                    }}
                  >
                    <div
                      style={{
                        width: 52,
                        textAlign: "center",
                        fontSize: 13,
                        fontWeight: 600,
                        color: "var(--brand-400)",
                      }}
                    >
                      {a.time}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div style={{ fontSize: 13, fontWeight: 500 }}>{a.client}</div>
                      <div style={{ fontSize: 12, color: "var(--text-muted)" }}>{a.service}</div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </ChartCard>
        </div>
        <div style={{ gridColumn: "span 12 / span 12" }} className="lg:col-span-4">
          <ChartCard title="Top 5 serviços">
            {loading ? (
              <Skeleton h={240} />
            ) : (
              <ul className="flex flex-col" style={{ gap: 8 }}>
                {topServices.map((s, i) => (
                  <li
                    key={s.name}
                    className="flex items-center justify-between"
                    style={{
                      padding: "8px 4px",
                      borderTop: i === 0 ? 0 : "1px solid var(--border)",
                      fontSize: 13,
                    }}
                  >
                    <span>{s.name}</span>
                    <span
                      style={{
                        padding: "2px 8px",
                        borderRadius: 999,
                        background: "var(--bg-overlay)",
                        fontSize: 12,
                        fontWeight: 600,
                      }}
                    >
                      {s.count}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </ChartCard>
        </div>
        <div style={{ gridColumn: "span 12 / span 12" }} className="lg:col-span-3">
          <ChartCard title="Agentes online">
            {loading ? (
              <Skeleton h={240} />
            ) : (
              <ul className="flex flex-col" style={{ gap: 10 }}>
                {agents.map((a) => (
                  <li key={a.name} className="flex items-center gap-2" style={{ fontSize: 13 }}>
                    <div style={{ position: "relative" }}>
                      <div
                        style={{
                          width: 32,
                          height: 32,
                          borderRadius: 999,
                          background: "var(--bg-overlay)",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          fontWeight: 600,
                          fontSize: 12,
                        }}
                      >
                        {a.name.charAt(0)}
                      </div>
                      <span
                        style={{
                          position: "absolute",
                          right: -1,
                          bottom: -1,
                          width: 10,
                          height: 10,
                          borderRadius: 999,
                          background: a.online ? "#10B981" : "#9CA3AF",
                          border: "2px solid var(--bg-surface)",
                        }}
                      />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div style={{ fontWeight: 500 }} className="truncate">
                        {a.name}
                      </div>
                      <div style={{ fontSize: 11, color: "var(--text-muted)" }}>
                        {a.online ? "Online" : "Offline"}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </ChartCard>
        </div>
      </div>

      {/* LINHA 4 — URGENTES */}
      <ChartCard title="Atendimentos sem resposta há mais de 5 min" danger>
        {loading ? (
          <Skeleton h={120} />
        ) : urgent.length === 0 ? (
          <p style={{ fontSize: 13, color: "var(--text-muted)" }}>
            Nenhuma conversa pendente. 
          </p>
        ) : (
          <ul className="flex flex-col" style={{ gap: 8 }}>
            {urgent.map((u) => (
              <li key={u.id}>
                <Link
                  to="/inbox"
                  className="flex items-center gap-3"
                  style={{
                    padding: "10px 12px",
                    borderRadius: 8,
                    border: "1px solid color-mix(in oklab, #EF4444 35%, var(--border))",
                    background: "color-mix(in oklab, #EF4444 6%, var(--bg-surface))",
                    textDecoration: "none",
                    color: "var(--text-primary)",
                  }}
                >
                  <AlertCircle size={16} style={{ color: "#EF4444", flexShrink: 0 }} />
                  <div className="flex-1 min-w-0">
                    <div style={{ fontSize: 13, fontWeight: 500 }}>{u.client}</div>
                    <div className="truncate" style={{ fontSize: 12, color: "var(--text-muted)" }}>
                      {u.last}
                    </div>
                  </div>
                  <span
                    style={{
                      fontSize: 11,
                      fontWeight: 600,
                      color: "#EF4444",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {u.waiting} min
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </ChartCard>
    </div>
  );
}

function PeriodFilter({ value, onChange }: { value: Period; onChange: (v: Period) => void }) {
  const items: { v: Period; label: string }[] = [
    { v: "today", label: "Hoje" },
    { v: "week", label: "Semana" },
    { v: "month", label: "Mês" },
    { v: "custom", label: "Personalizado" },
  ];
  return (
    <div
      className="flex"
      style={{
        padding: 3,
        borderRadius: 8,
        border: "1px solid var(--border)",
        background: "var(--bg-surface)",
      }}
    >
      {items.map((i) => {
        const active = value === i.v;
        return (
          <button
            key={i.v}
            onClick={() => onChange(i.v)}
            style={{
              padding: "5px 10px",
              borderRadius: 6,
              border: 0,
              fontSize: 12,
              fontWeight: 500,
              cursor: "pointer",
              background: active ? "var(--bg-overlay)" : "transparent",
              color: active ? "var(--text-primary)" : "var(--text-muted)",
            }}
          >
            {i.label}
          </button>
        );
      })}
    </div>
  );
}

function KPI({
  label,
  value,
  delta,
  icon: Icon,
}: {
  label: string;
  value: string;
  delta: number;
  icon: React.ComponentType<{ size?: number; style?: React.CSSProperties }>;
}) {
  const positive = delta >= 0;
  return (
    <div
      style={{
        padding: 16,
        borderRadius: 10,
        background: "var(--bg-surface)",
        border: "1px solid var(--border)",
      }}
    >
      <div className="flex items-center justify-between">
        <span style={{ fontSize: 12, color: "var(--text-muted)" }}>{label}</span>
        <Icon size={14} style={{ color: "var(--text-muted)" }} />
      </div>
      <div style={{ marginTop: 12, fontSize: 24, fontWeight: 600, letterSpacing: "-0.01em" }}>
        {value}
      </div>
      <div
        className="inline-flex items-center gap-1"
        style={{
          marginTop: 6,
          fontSize: 11,
          fontWeight: 600,
          padding: "2px 6px",
          borderRadius: 999,
          color: positive ? "#10B981" : "#EF4444",
          background: positive
            ? "color-mix(in oklab, #10B981 15%, transparent)"
            : "color-mix(in oklab, #EF4444 15%, transparent)",
        }}
      >
        {positive ? <ArrowUpRight size={11} /> : <ArrowDownRight size={11} />}
        {Math.abs(delta)}% vs ontem
      </div>
    </div>
  );
}

function KanbanDistribution({ data }: { data: { name: string; value: number; color: string }[] }) {
  const items = (data ?? []).filter((d) => d.value > 0).sort((a, b) => b.value - a.value);
  const total = items.reduce((s, d) => s + d.value, 0);

  if (total === 0) {
    return (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          height: 180,
          gap: 8,
          color: "var(--text-muted)",
        }}
      >
        <span style={{ fontSize: 28 }}>📊</span>
        <span style={{ fontSize: 13 }}>Nenhum dado ainda</span>
      </div>
    );
  }

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 24,
        width: "100%",
        flexWrap: "wrap",
      }}
    >
      <div style={{ position: "relative", flexShrink: 0, width: 180, height: 180 }}>
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            pointerEvents: "none",
            zIndex: 1,
          }}
        >
          <span style={{ fontSize: 26, fontWeight: 600, lineHeight: 1 }}>{total}</span>
          <span style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2 }}>total</span>
        </div>
        <PieChart width={180} height={180}>
          <Pie
            data={items}
            cx={90}
            cy={90}
            innerRadius={54}
            outerRadius={82}
            paddingAngle={3}
            dataKey="value"
            strokeWidth={0}
            animationBegin={0}
            animationDuration={800}
            animationEasing="ease-out"
          >
            {items.map((entry, i) => (
              <Cell key={`c-${i}`} fill={entry.color} stroke="none" />
            ))}
          </Pie>
          <Tooltip
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const item = payload[0] as { name: string; value: number };
              const pct = ((item.value / total) * 100).toFixed(0);
              return (
                <div
                  style={{
                    background: "var(--bg-surface)",
                    border: "1px solid var(--border)",
                    borderRadius: 8,
                    padding: "8px 12px",
                    fontSize: 12,
                    color: "var(--text-primary)",
                    boxShadow: "0 8px 24px rgba(0,0,0,0.12)",
                  }}
                >
                  <div style={{ fontWeight: 500 }}>{item.name}</div>
                  <div style={{ color: "var(--text-muted)", marginTop: 2 }}>
                    {item.value} · {pct}%
                  </div>
                </div>
              );
            }}
          />
        </PieChart>
      </div>

      <div style={{ flex: 1, minWidth: 160, display: "flex", flexDirection: "column", gap: 10 }}>
        {items.map((item) => {
          const pct = (item.value / total) * 100;
          return (
            <div key={item.name} style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span
                style={{
                  width: 10,
                  height: 10,
                  borderRadius: "50%",
                  background: item.color,
                  flexShrink: 0,
                }}
              />
              <span style={{ fontSize: 12, color: "var(--text-primary)", flex: 1 }}>
                {item.name}
              </span>
              <div
                style={{
                  width: 60,
                  height: 4,
                  background: "var(--bg-overlay)",
                  borderRadius: 2,
                  overflow: "hidden",
                }}
              >
                <div
                  style={{
                    width: `${pct}%`,
                    height: "100%",
                    background: item.color,
                    borderRadius: 2,
                    transition: "width 800ms ease-out",
                  }}
                />
              </div>
              <span style={{ fontSize: 12, fontWeight: 600, minWidth: 18, textAlign: "right" }}>
                {item.value}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ChartCard({
  title,
  children,
  danger,
}: {
  title: string;
  children: React.ReactNode;
  danger?: boolean;
}) {
  return (
    <div
      style={{
        padding: 16,
        borderRadius: 10,
        background: "var(--bg-surface)",
        border: danger
          ? "1px solid color-mix(in oklab, #EF4444 30%, var(--border))"
          : "1px solid var(--border)",
        height: "100%",
      }}
    >
      <h3 style={{ fontSize: 13, fontWeight: 600, marginBottom: 14 }}>{title}</h3>
      {children}
    </div>
  );
}

function Skeleton({ h }: { h: number }) {
  return (
    <div
      style={{
        height: h,
        borderRadius: 10,
        background:
          "linear-gradient(90deg, var(--bg-surface) 0%, var(--bg-overlay) 50%, var(--bg-surface) 100%)",
        backgroundSize: "200% 100%",
        animation: "shimmer 1.4s ease-in-out infinite",
        border: "1px solid var(--border)",
      }}
    />
  );
}
