// Fase 10: Dashboard de satisfação (CSAT).
// Extraído do relatório de Atendimento pra dar espaço a: KPIs, distribuição,
// trend semanal, ranking por atendente e feed de respostas recentes.

import * as React from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  LineChart,
  Line,
  CartesianGrid,
  Cell,
} from "recharts";
import { Card as UICard } from "@/components/ui/card";
import { EmptyState } from "@/components/empty-state";
import { Smile, Frown, Meh, Star } from "lucide-react";
import type { CsatDashboard } from "./csat-data";
import { CSAT_MIN_SAMPLE } from "./csat-data";

const RATING_COLORS: Record<number, string> = {
  1: "#EF4444",
  2: "#F97316",
  3: "#F59E0B",
  4: "#84CC16",
  5: "#25C880",
};

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function RatingBadge({ rating }: { rating: number }) {
  const color = RATING_COLORS[rating] ?? "var(--text-muted)";
  return (
    <span
      className="inline-flex items-center"
      style={{
        gap: 3,
        padding: "2px 8px",
        borderRadius: "var(--radius-pill)",
        background: `color-mix(in oklab, ${color} 16%, transparent)`,
        color,
        fontSize: 12,
        fontWeight: 600,
      }}
    >
      <Star size={11} fill={color} stroke={color} /> {rating}
    </span>
  );
}

export function CsatDashboard({ data }: { data: CsatDashboard }) {
  const {
    totalSent,
    totalAnswered,
    responseRate,
    avg,
    distribution,
    weekly,
    byAgent,
    recent,
  } = data;

  if (totalSent === 0) {
    return (
      <UICard style={{ padding: 24 }}>
        <EmptyState
          icon={<Smile size={40} style={{ color: "var(--brand-400)" }} aria-hidden />}
          title="Ainda não há pesquisas de satisfação"
          description="Ative a mensagem de CSAT em Configurações → Mensagens. Ao resolver conversas, a pesquisa vai automaticamente."
        />
      </UICard>
    );
  }

  return (
    <div className="flex flex-col" style={{ gap: 16 }}>
      {/* KPIs */}
      <div
        className="grid gap-3"
        style={{
          gridTemplateColumns: "repeat(auto-fit, minmax(min(200px, 100%), 1fr))",
        }}
      >
        <KpiCard
          icon={<Smile size={16} />}
          label="Nota média"
          value={avg === null ? "—" : avg.toFixed(1)}
          hint={
            avg === null
              ? `${totalAnswered} resposta${totalAnswered === 1 ? "" : "s"} — abaixo de ${CSAT_MIN_SAMPLE}`
              : `${totalAnswered} resposta${totalAnswered === 1 ? "" : "s"}`
          }
        />
        <KpiCard
          icon={<Meh size={16} />}
          label="Taxa de resposta"
          value={`${Math.round(responseRate * 100)}%`}
          hint={`${totalAnswered} de ${totalSent} enviadas`}
        />
        <KpiCard
          icon={<Frown size={16} />}
          label="Notas 1 e 2"
          value={String(
            (distribution.find((d) => d.rating === 1)?.count ?? 0) +
              (distribution.find((d) => d.rating === 2)?.count ?? 0),
          )}
          hint="Clientes insatisfeitos"
          tone="warn"
        />
      </div>

      {/* Distribuição + Trend semanal (lado a lado, empilham no mobile) */}
      <div
        className="grid gap-3"
        style={{ gridTemplateColumns: "repeat(auto-fit, minmax(min(320px, 100%), 1fr))" }}
      >
        <UICard style={{ padding: 16 }}>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 12 }}>
            Distribuição das notas
          </div>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={distribution}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis
                dataKey="rating"
                tick={{ fontSize: 11, fill: "var(--text-muted)" }}
                tickLine={false}
                axisLine={false}
              />
              <YAxis
                allowDecimals={false}
                tick={{ fontSize: 11, fill: "var(--text-muted)" }}
                tickLine={false}
                axisLine={false}
              />
              <Tooltip
                cursor={{ fill: "var(--bg-overlay)" }}
                contentStyle={{
                  background: "var(--bg-surface)",
                  border: "1px solid var(--border)",
                  borderRadius: "var(--radius-card)",
                  fontSize: 12,
                }}
              />
              <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                {distribution.map((d) => (
                  <Cell key={d.rating} fill={RATING_COLORS[d.rating] ?? "var(--brand-400)"} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </UICard>

        <UICard style={{ padding: 16 }}>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 12 }}>
            Tendência semanal
          </div>
          {weekly.length === 0 ? (
            <div
              style={{
                padding: 30,
                textAlign: "center",
                fontSize: 12,
                color: "var(--text-muted)",
              }}
            >
              Ainda sem respostas suficientes por semana para desenhar tendência.
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={weekly}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis
                  dataKey="week"
                  tick={{ fontSize: 10, fill: "var(--text-muted)" }}
                  tickLine={false}
                  axisLine={false}
                />
                <YAxis
                  domain={[1, 5]}
                  tick={{ fontSize: 11, fill: "var(--text-muted)" }}
                  tickLine={false}
                  axisLine={false}
                />
                <Tooltip
                  contentStyle={{
                    background: "var(--bg-surface)",
                    border: "1px solid var(--border)",
                    borderRadius: "var(--radius-card)",
                    fontSize: 12,
                  }}
                  formatter={(value: any) =>
                    value === null ? "—" : Number(value).toFixed(2)
                  }
                />
                <Line
                  type="monotone"
                  dataKey="avg"
                  stroke="var(--brand-400)"
                  strokeWidth={2}
                  dot={{ r: 3, fill: "var(--brand-400)" }}
                  connectNulls
                />
              </LineChart>
            </ResponsiveContainer>
          )}
        </UICard>
      </div>

      {/* Ranking por atendente */}
      <UICard style={{ padding: 16 }}>
        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 12 }}>
          Satisfação por atendente
        </div>
        {byAgent.length === 0 ? (
          <div
            style={{ padding: 20, textAlign: "center", fontSize: 12, color: "var(--text-muted)" }}
          >
            Nenhuma resposta atribuída a um atendente no período.
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {byAgent.map((row) => (
              <div
                key={row.agentId}
                className="flex items-center"
                style={{
                  gap: 10,
                  padding: "8px 10px",
                  borderRadius: "var(--radius-control)",
                  background: "var(--bg-base)",
                  border: "1px solid var(--border)",
                }}
              >
                <div style={{ flex: 1, minWidth: 0, fontSize: 13, fontWeight: 500 }}>
                  {row.name}
                </div>
                <div style={{ fontSize: 12, color: "var(--text-muted)" }}>
                  {row.answered} resposta{row.answered === 1 ? "" : "s"}
                </div>
                <div
                  style={{
                    fontSize: 13,
                    fontWeight: 600,
                    color: row.avg === null ? "var(--text-muted)" : "var(--text-primary)",
                    minWidth: 40,
                    textAlign: "right",
                  }}
                >
                  {row.avg === null ? "—" : row.avg.toFixed(1)}
                </div>
              </div>
            ))}
          </div>
        )}
      </UICard>

      {/* Respostas recentes */}
      <UICard style={{ padding: 16 }}>
        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 12 }}>
          Últimas respostas
        </div>
        {recent.length === 0 ? (
          <div
            style={{ padding: 20, textAlign: "center", fontSize: 12, color: "var(--text-muted)" }}
          >
            Ainda sem respostas.
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {recent.map((r) => (
              <div
                key={r.id}
                className="flex items-center"
                style={{
                  gap: 10,
                  padding: "8px 10px",
                  borderRadius: "var(--radius-control)",
                  background: "var(--bg-base)",
                  border: "1px solid var(--border)",
                }}
              >
                <RatingBadge rating={r.rating} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 500 }}>
                    {r.contactName ?? "Contato removido"}
                  </div>
                  {r.agentName && (
                    <div style={{ fontSize: 11, color: "var(--text-muted)" }}>
                      atendido por {r.agentName}
                    </div>
                  )}
                </div>
                <div style={{ fontSize: 11, color: "var(--text-muted)" }}>
                  {formatDate(r.answeredAt)}
                </div>
              </div>
            ))}
          </div>
        )}
      </UICard>
    </div>
  );
}

function KpiCard({
  icon,
  label,
  value,
  hint,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  hint: string;
  tone?: "warn";
}) {
  const accent = tone === "warn" ? "#F59E0B" : "var(--brand-400)";
  return (
    <UICard style={{ padding: 14 }}>
      <div
        className="flex items-center"
        style={{ gap: 6, fontSize: 11.5, color: "var(--text-muted)" }}
      >
        <span style={{ color: accent, display: "inline-flex" }}>{icon}</span>
        {label}
      </div>
      <div
        style={{
          fontSize: 24,
          fontWeight: 600,
          marginTop: 6,
          letterSpacing: "-0.01em",
        }}
      >
        {value}
      </div>
      <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2 }}>{hint}</div>
    </UICard>
  );
}
