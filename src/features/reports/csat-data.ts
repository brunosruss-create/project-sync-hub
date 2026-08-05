// Fase 10: dados dedicados do dashboard de CSAT.
// Separado de features/reports/data.ts pra manter aquele arquivo focado no
// relatório "Atendimento" — as métricas de satisfação têm ciclo de vida
// próprio (janela do cliente, sample mínimo, agente que respondeu).

import { supabase } from "@/integrations/supabase/client";
import { periodRange, type Period } from "./data";

export type CsatSurveyRow = {
  id: string;
  status: string;
  rating: number | null;
  sent_at: string;
  answered_at: string | null;
  contact_id: string | null;
  answered_by: string | null; // agente que atendeu antes da pesquisa
};

/** Amostra mínima para uma média deixar de ser ruído. */
export const CSAT_MIN_SAMPLE = 5;

export type CsatDashboard = {
  totalSent: number;
  totalAnswered: number;
  responseRate: number; // 0..1
  avg: number | null; // null quando amostra pequena
  distribution: { rating: number; count: number }[]; // 1..5
  weekly: { week: string; avg: number | null; answered: number }[];
  byAgent: { agentId: string; name: string; avg: number | null; answered: number }[];
  recent: {
    id: string;
    rating: number;
    answeredAt: string;
    contactName: string | null;
    agentName: string | null;
  }[];
};

async function fetchSurveys(start: Date, end: Date): Promise<CsatSurveyRow[]> {
  const { data, error } = await supabase
    .from("csat_surveys")
    .select("id,status,rating,sent_at,answered_at,contact_id,answered_by")
    .in("status", ["sent", "answered", "expired"])
    .gte("sent_at", start.toISOString())
    .lt("sent_at", end.toISOString())
    .order("sent_at", { ascending: true })
    .limit(10000);
  if (error) return [];
  return (data ?? []) as CsatSurveyRow[];
}

async function fetchContactNames(ids: string[]): Promise<Map<string, string>> {
  const m = new Map<string, string>();
  if (ids.length === 0) return m;
  const { data } = await supabase.from("contacts").select("id,name").in("id", ids);
  for (const r of data ?? []) m.set(String((r as any).id), (r as any).name ?? "—");
  return m;
}

async function fetchAgentNames(ids: string[]): Promise<Map<string, string>> {
  const m = new Map<string, string>();
  if (ids.length === 0) return m;
  const { data } = await supabase
    .from("profiles")
    .select("id,full_name,email")
    .in("id", ids);
  for (const r of data ?? []) {
    const row = r as any;
    m.set(String(row.id), row.full_name || row.email || `${String(row.id).slice(0, 6)}…`);
  }
  return m;
}

function weekKey(d: Date): string {
  // Chave de semana ISO leve: "YYYY-WW". Suficiente pra ordenar e agrupar
  // sem depender de lib de data. Semanas começam na segunda pra bater com
  // Brasil (calendário de trabalho, não domingo americano).
  const target = new Date(d);
  target.setHours(0, 0, 0, 0);
  const day = (target.getDay() + 6) % 7; // seg=0
  target.setDate(target.getDate() - day);
  const y = target.getFullYear();
  const start = new Date(y, 0, 1);
  const startDay = (start.getDay() + 6) % 7;
  start.setDate(start.getDate() - startDay);
  const diffDays = Math.round((target.getTime() - start.getTime()) / 86400000);
  const week = Math.floor(diffDays / 7) + 1;
  return `${y}-${String(week).padStart(2, "0")}`;
}

export async function getCsatDashboard(period: Period): Promise<CsatDashboard> {
  const { start, end } = periodRange(period);
  const surveys = await fetchSurveys(start, end);

  const answered = surveys.filter(
    (s) => s.status === "answered" && typeof s.rating === "number",
  );
  const responseRate = surveys.length ? answered.length / surveys.length : 0;
  const avg =
    answered.length >= CSAT_MIN_SAMPLE
      ? answered.reduce((sum, s) => sum + (s.rating ?? 0), 0) / answered.length
      : null;

  const distribution = [1, 2, 3, 4, 5].map((rating) => ({
    rating,
    count: answered.filter((s) => s.rating === rating).length,
  }));

  // Trend semanal — mostra tendência mesmo em janelas curtas (30d = 4-5 semanas).
  const weekMap = new Map<string, { sum: number; count: number }>();
  for (const s of answered) {
    if (!s.answered_at) continue;
    const k = weekKey(new Date(s.answered_at));
    const bucket = weekMap.get(k) ?? { sum: 0, count: 0 };
    bucket.sum += s.rating ?? 0;
    bucket.count += 1;
    weekMap.set(k, bucket);
  }
  const weekly = Array.from(weekMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([week, b]) => ({
      week,
      answered: b.count,
      // Semanas com < 3 respostas não geram média: preferimos "—" (mostrado
      // com null) a uma linha volátil que confunde a leitura do gráfico.
      avg: b.count >= 3 ? b.sum / b.count : null,
    }));

  // Por agente
  const agentMap = new Map<string, { sum: number; count: number }>();
  for (const s of answered) {
    if (!s.answered_by) continue;
    const bucket = agentMap.get(s.answered_by) ?? { sum: 0, count: 0 };
    bucket.sum += s.rating ?? 0;
    bucket.count += 1;
    agentMap.set(s.answered_by, bucket);
  }
  const agentNames = await fetchAgentNames(Array.from(agentMap.keys()));
  const byAgent = Array.from(agentMap.entries())
    .map(([id, b]) => ({
      agentId: id,
      name: agentNames.get(id) ?? `${id.slice(0, 6)}…`,
      answered: b.count,
      avg: b.count >= CSAT_MIN_SAMPLE ? b.sum / b.count : null,
    }))
    .sort((a, b) => (b.avg ?? -1) - (a.avg ?? -1));

  // Respostas recentes (últimas 20 respondidas)
  const recentAnswered = [...answered]
    .filter((s) => s.answered_at)
    .sort((a, b) => (b.answered_at ?? "").localeCompare(a.answered_at ?? ""))
    .slice(0, 20);
  const contactIds = Array.from(
    new Set(recentAnswered.map((s) => s.contact_id).filter((v): v is string => !!v)),
  );
  const contactNames = await fetchContactNames(contactIds);
  const recent = recentAnswered.map((s) => ({
    id: s.id,
    rating: s.rating ?? 0,
    answeredAt: s.answered_at ?? "",
    contactName: s.contact_id ? contactNames.get(s.contact_id) ?? null : null,
    agentName: s.answered_by ? agentNames.get(s.answered_by) ?? null : null,
  }));

  return {
    totalSent: surveys.length,
    totalAnswered: answered.length,
    responseRate,
    avg,
    distribution,
    weekly,
    byAgent,
    recent,
  };
}
