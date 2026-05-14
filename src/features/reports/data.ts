import { supabase } from "@/integrations/supabase/client";

export type Period = "today" | "7d" | "30d";

export function periodRange(period: Period): { start: Date; end: Date; prevStart: Date; prevEnd: Date } {
  const end = new Date();
  const start = new Date(end);
  if (period === "today") {
    start.setHours(0, 0, 0, 0);
  } else if (period === "7d") {
    start.setDate(end.getDate() - 7);
  } else {
    start.setDate(end.getDate() - 30);
  }
  const span = end.getTime() - start.getTime();
  const prevEnd = new Date(start);
  const prevStart = new Date(start.getTime() - span);
  return { start, end, prevStart, prevEnd };
}

const BRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
export function formatBRL(cents: number): string {
  return BRL.format((cents || 0) / 100);
}
export function formatDuration(seconds: number): string {
  if (!seconds || !isFinite(seconds)) return "—";
  if (seconds < 60) return `${Math.round(seconds)}s`;
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return s ? `${m}m ${s}s` : `${m}m`;
}
export function pct(part: number, total: number): string {
  if (!total) return "—";
  return `${Math.round((part / total) * 100)}%`;
}
export function deltaPct(curr: number, prev: number): { value: number | null; label: string; good: boolean } {
  if (!prev) return { value: null, label: "—", good: true };
  const v = ((curr - prev) / prev) * 100;
  return { value: v, label: `${v >= 0 ? "+" : ""}${v.toFixed(1)}% vs. período anterior`, good: v >= 0 };
}

/* --------------- shared types --------------- */

interface MessageRow {
  id: string;
  contact_id: string | null;
  direction: "inbound" | "outbound" | null;
  sent_by: string | null;
  created_at: string;
}

interface ApptRow {
  id: string;
  service_id: string | null;
  agent_id: string | null;
  status: string | null;
  starts_at: string;
}

async function fetchMessages(start: Date, end: Date): Promise<MessageRow[]> {
  const { data, error } = await supabase
    .from("messages")
    .select("id, contact_id, direction, sent_by, created_at")
    .gte("created_at", start.toISOString())
    .lt("created_at", end.toISOString())
    .order("created_at", { ascending: true })
    .limit(10000);
  if (error) throw error;
  return (data ?? []) as MessageRow[];
}

async function fetchAppointments(start: Date, end: Date): Promise<ApptRow[]> {
  const { data, error } = await supabase
    .from("appointments")
    .select("id, service_id, agent_id, status, starts_at")
    .gte("starts_at", start.toISOString())
    .lt("starts_at", end.toISOString())
    .limit(10000);
  if (error) throw error;
  return (data ?? []) as ApptRow[];
}

async function fetchServices(ids: string[]): Promise<Map<string, { name: string; price_cents: number }>> {
  const map = new Map<string, { name: string; price_cents: number }>();
  if (ids.length === 0) return map;
  const { data } = await supabase.from("services").select("id, name, price_cents").in("id", ids);
  for (const r of data ?? []) {
    map.set(String((r as any).id), { name: (r as any).name ?? "—", price_cents: (r as any).price_cents ?? 0 });
  }
  return map;
}

async function fetchProfiles(ids: string[]): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  if (ids.length === 0) return map;
  const { data } = await supabase.from("profiles").select("id, full_name, email").in("id", ids);
  for (const r of data ?? []) {
    const row = r as any;
    map.set(String(row.id), row.full_name || row.email || `${String(row.id).slice(0, 6)}…`);
  }
  return map;
}

/* --------------- TMR (avg first response) --------------- */

function avgResponseSeconds(msgs: MessageRow[], filterAgent?: string): number {
  // Group inbound→next outbound per contact
  const byContact = new Map<string, MessageRow[]>();
  for (const m of msgs) {
    if (!m.contact_id) continue;
    const arr = byContact.get(m.contact_id) ?? [];
    arr.push(m);
    byContact.set(m.contact_id, arr);
  }
  let total = 0;
  let count = 0;
  for (const arr of byContact.values()) {
    for (let i = 0; i < arr.length; i++) {
      const m = arr[i];
      if (m.direction !== "inbound") continue;
      // find next outbound
      for (let j = i + 1; j < arr.length; j++) {
        const n = arr[j];
        if (n.direction === "outbound") {
          if (filterAgent && n.sent_by !== filterAgent) break;
          const dt = (new Date(n.created_at).getTime() - new Date(m.created_at).getTime()) / 1000;
          if (dt >= 0 && dt < 24 * 3600) {
            total += dt;
            count += 1;
          }
          break;
        }
      }
    }
  }
  return count ? total / count : 0;
}

/* --------------- bucketing --------------- */

function bucketByDay(rows: { created_at?: string; starts_at?: string }[], start: Date, end: Date, period: Period, key: "created_at" | "starts_at") {
  if (period === "today") {
    const arr = Array.from({ length: 24 }, (_, h) => ({ d: `${String(h).padStart(2, "0")}h`, v: 0 }));
    for (const r of rows) {
      const t = (r as any)[key] as string | undefined;
      if (!t) continue;
      const h = new Date(t).getHours();
      if (h >= 0 && h < 24) arr[h].v += 1;
    }
    return arr;
  }
  const days = period === "7d" ? 7 : 30;
  const arr: { d: string; v: number; iso: string }[] = [];
  const base = new Date(start);
  base.setHours(0, 0, 0, 0);
  for (let i = 0; i < days; i++) {
    const d = new Date(base);
    d.setDate(base.getDate() + i);
    arr.push({ d: d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }), v: 0, iso: d.toISOString().slice(0, 10) });
  }
  const idx = new Map(arr.map((x, i) => [x.iso, i]));
  for (const r of rows) {
    const t = (r as any)[key] as string | undefined;
    if (!t) continue;
    const iso = new Date(t).toISOString().slice(0, 10);
    const i = idx.get(iso);
    if (i !== undefined) arr[i].v += 1;
  }
  return arr.map(({ d, v }) => ({ d, v }));
}

/* --------------- public reports --------------- */

export interface ServiceReport {
  series: { d: string; v: number }[];
  tmrSeconds: number;
  tmrDelta: ReturnType<typeof deltaPct>;
  resolvedPct: string;
  resolvedDelta: ReturnType<typeof deltaPct>;
  ranking: { name: string; total: number; tmr: string; resolved: number }[];
  totalInbound: number;
  exportRows: Array<Record<string, string | number>>;
}

export async function getServiceReport(period: Period): Promise<ServiceReport> {
  const { start, end, prevStart, prevEnd } = periodRange(period);
  const [msgs, prevMsgs, appts, prevAppts] = await Promise.all([
    fetchMessages(start, end),
    fetchMessages(prevStart, prevEnd),
    fetchAppointments(start, end),
    fetchAppointments(prevStart, prevEnd),
  ]);

  const inbound = msgs.filter((m) => m.direction === "inbound");
  const series = bucketByDay(inbound, start, end, period, "created_at");

  const tmr = avgResponseSeconds(msgs);
  const prevTmr = avgResponseSeconds(prevMsgs);
  const tmrDelta = deltaPct(prevTmr - tmr, prevTmr); // lower is better → invert sign

  const completed = appts.filter((a) => a.status === "completed").length;
  const prevCompleted = prevAppts.filter((a) => a.status === "completed").length;
  const resolvedPct = pct(completed, appts.length);
  const resolvedDelta = deltaPct(
    appts.length ? completed / appts.length : 0,
    prevAppts.length ? prevCompleted / prevAppts.length : 0,
  );

  // ranking by sent_by
  const byAgent = new Map<string, { contacts: Set<string>; resolved: number }>();
  for (const m of msgs) {
    if (m.direction !== "outbound" || !m.sent_by) continue;
    const r = byAgent.get(m.sent_by) ?? { contacts: new Set<string>(), resolved: 0 };
    if (m.contact_id) r.contacts.add(m.contact_id);
    byAgent.set(m.sent_by, r);
  }
  for (const a of appts) {
    if (a.status === "completed" && a.agent_id && byAgent.has(a.agent_id)) {
      byAgent.get(a.agent_id)!.resolved += 1;
    }
  }
  const profileIds = Array.from(byAgent.keys());
  const profiles = await fetchProfiles(profileIds);
  const ranking = Array.from(byAgent.entries())
    .map(([agentId, r]) => ({
      name: profiles.get(agentId) ?? `${agentId.slice(0, 6)}…`,
      total: r.contacts.size,
      tmr: formatDuration(avgResponseSeconds(msgs, agentId)),
      resolved: r.resolved,
    }))
    .sort((a, b) => b.total - a.total);

  return {
    series,
    tmrSeconds: tmr,
    tmrDelta,
    resolvedPct,
    resolvedDelta,
    ranking,
    totalInbound: inbound.length,
    exportRows: ranking.map((r) => ({ Agente: r.name, Atendimentos: r.total, TMR: r.tmr, Resolvidos: r.resolved })),
  };
}

export interface AppointmentsReport {
  series: { d: string; v: number }[];
  cancelPct: string;
  cancelDelta: ReturnType<typeof deltaPct>;
  revenueCents: number;
  revenueDelta: ReturnType<typeof deltaPct>;
  topServices: { name: string; qty: number; revenue: string }[];
  total: number;
  exportRows: Array<Record<string, string | number>>;
}

export async function getAppointmentsReport(period: Period): Promise<AppointmentsReport> {
  const { start, end, prevStart, prevEnd } = periodRange(period);
  const [appts, prevAppts] = await Promise.all([
    fetchAppointments(start, end),
    fetchAppointments(prevStart, prevEnd),
  ]);

  const series = bucketByDay(appts, start, end, period, "starts_at");

  const cancelled = appts.filter((a) => a.status === "cancelled").length;
  const prevCancelled = prevAppts.filter((a) => a.status === "cancelled").length;
  const cancelPct = pct(cancelled, appts.length);
  const cancelDelta = deltaPct(
    appts.length ? cancelled / appts.length : 0,
    prevAppts.length ? prevCancelled / prevAppts.length : 0,
  );

  const billable = (a: ApptRow) => a.status === "confirmed" || a.status === "in_progress" || a.status === "completed";
  const serviceIds = Array.from(new Set([...appts, ...prevAppts].filter((a) => a.service_id).map((a) => a.service_id as string)));
  const services = await fetchServices(serviceIds);

  const sumRevenue = (rows: ApptRow[]) =>
    rows.filter(billable).reduce((acc, a) => acc + (a.service_id ? services.get(a.service_id)?.price_cents ?? 0 : 0), 0);
  const revenueCents = sumRevenue(appts);
  const prevRevenue = sumRevenue(prevAppts);
  const revenueDelta = deltaPct(revenueCents, prevRevenue);

  const byService = new Map<string, { qty: number; revenue: number }>();
  for (const a of appts) {
    if (!a.service_id) continue;
    const r = byService.get(a.service_id) ?? { qty: 0, revenue: 0 };
    r.qty += 1;
    if (billable(a)) r.revenue += services.get(a.service_id)?.price_cents ?? 0;
    byService.set(a.service_id, r);
  }
  const topServices = Array.from(byService.entries())
    .map(([id, r]) => ({ name: services.get(id)?.name ?? "—", qty: r.qty, revenue: formatBRL(r.revenue) }))
    .sort((a, b) => b.qty - a.qty)
    .slice(0, 10);

  return {
    series,
    cancelPct,
    cancelDelta,
    revenueCents,
    revenueDelta,
    topServices,
    total: appts.length,
    exportRows: topServices.map((r) => ({ Serviço: r.name, Agendamentos: r.qty, Receita: r.revenue })),
  };
}

export interface ServicesReport {
  totalRevenueCents: number;
  revenueDelta: ReturnType<typeof deltaPct>;
  ticketCents: number;
  ticketDelta: ReturnType<typeof deltaPct>;
  rows: { name: string; qty: number; revenue: string; avg: string }[];
  total: number;
  exportRows: Array<Record<string, string | number>>;
}

export async function getServicesReport(period: Period): Promise<ServicesReport> {
  const { start, end, prevStart, prevEnd } = periodRange(period);
  const [appts, prevAppts] = await Promise.all([
    fetchAppointments(start, end),
    fetchAppointments(prevStart, prevEnd),
  ]);
  const completed = appts.filter((a) => a.status === "completed");
  const prevCompleted = prevAppts.filter((a) => a.status === "completed");
  const ids = Array.from(new Set([...completed, ...prevCompleted].filter((a) => a.service_id).map((a) => a.service_id as string)));
  const services = await fetchServices(ids);

  const sum = (rows: ApptRow[]) => rows.reduce((acc, a) => acc + (a.service_id ? services.get(a.service_id)?.price_cents ?? 0 : 0), 0);
  const totalRevenueCents = sum(completed);
  const prevRev = sum(prevCompleted);
  const ticketCents = completed.length ? Math.round(totalRevenueCents / completed.length) : 0;
  const prevTicket = prevCompleted.length ? Math.round(prevRev / prevCompleted.length) : 0;

  const byService = new Map<string, { qty: number; revenue: number }>();
  for (const a of completed) {
    if (!a.service_id) continue;
    const r = byService.get(a.service_id) ?? { qty: 0, revenue: 0 };
    r.qty += 1;
    r.revenue += services.get(a.service_id)?.price_cents ?? 0;
    byService.set(a.service_id, r);
  }
  const rows = Array.from(byService.entries())
    .map(([id, r]) => ({
      name: services.get(id)?.name ?? "—",
      qty: r.qty,
      revenue: formatBRL(r.revenue),
      avg: formatBRL(r.qty ? Math.round(r.revenue / r.qty) : 0),
    }))
    .sort((a, b) => b.qty - a.qty);

  return {
    totalRevenueCents,
    revenueDelta: deltaPct(totalRevenueCents, prevRev),
    ticketCents,
    ticketDelta: deltaPct(ticketCents, prevTicket),
    rows,
    total: completed.length,
    exportRows: rows.map((r) => ({ Serviço: r.name, Vendas: r.qty, Receita: r.revenue, "Ticket médio": r.avg })),
  };
}

export interface TeamReport {
  rows: { name: string; total: number; tmr: string; resolved: number }[];
  exportRows: Array<Record<string, string | number>>;
}

export async function getTeamReport(period: Period): Promise<TeamReport> {
  const svc = await getServiceReport(period);
  return {
    rows: svc.ranking,
    exportRows: svc.ranking.map((r) => ({ Agente: r.name, Atendimentos: r.total, "Tempo médio": r.tmr, Resolvidos: r.resolved })),
  };
}
