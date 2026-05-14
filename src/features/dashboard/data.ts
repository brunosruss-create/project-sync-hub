import { supabase } from "@/integrations/supabase/client";

export type DashPeriod = "today" | "week" | "month" | "custom";

function range(period: DashPeriod) {
  const end = new Date();
  const start = new Date(end);
  if (period === "today") start.setHours(0, 0, 0, 0);
  else if (period === "week") start.setDate(end.getDate() - 7);
  else start.setDate(end.getDate() - 30); // month + custom fallback
  const span = end.getTime() - start.getTime();
  const prevEnd = new Date(start);
  const prevStart = new Date(start.getTime() - span);
  return { start, end, prevStart, prevEnd };
}

function fmtDuration(seconds: number): string {
  if (!seconds || !isFinite(seconds)) return "—";
  if (seconds < 60) return `${Math.round(seconds)}s`;
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return s ? `${m}m ${s}s` : `${m}m`;
}

function avgRespSeconds(msgs: any[]): number {
  const byContact = new Map<string, any[]>();
  for (const m of msgs) {
    if (!m.contact_id) continue;
    const arr = byContact.get(m.contact_id) ?? [];
    arr.push(m);
    byContact.set(m.contact_id, arr);
  }
  let total = 0, count = 0;
  for (const arr of byContact.values()) {
    for (let i = 0; i < arr.length; i++) {
      if (arr[i].direction !== "inbound") continue;
      for (let j = i + 1; j < arr.length; j++) {
        if (arr[j].direction === "outbound") {
          const dt = (new Date(arr[j].created_at).getTime() - new Date(arr[i].created_at).getTime()) / 1000;
          if (dt >= 0 && dt < 86400) { total += dt; count++; }
          break;
        }
      }
    }
  }
  return count ? total / count : 0;
}

function pctDelta(curr: number, prev: number): number {
  if (!prev) return 0;
  return Math.round(((curr - prev) / prev) * 100);
}

export interface DashboardData {
  kpis: {
    atendimentos: { value: number; delta: number };
    tmr: { value: string; seconds: number; delta: number };
    resolution: { value: string; pct: number; delta: number };
    appointments: { value: number; delta: number };
  };
  hourly: { hour: string; msgs: number }[];
  kanban: { name: string; value: number; color: string }[];
  upcoming: { id: string; time: string; client: string; service: string }[];
  topServices: { name: string; count: number }[];
  agents: { name: string; online: boolean }[];
  urgent: { id: string; client: string; waiting: number; last: string }[];
}

const COLUMN_FALLBACK: Record<string, { label: string; color: string }> = {
  waiting: { label: "Aguardando", color: "#F59E0B" },
  in_progress: { label: "Em Atendimento", color: "#3B82F6" },
  done: { label: "Concluído", color: "#10B981" },
  archived: { label: "Arquivado", color: "#6B7280" },
  urgent: { label: "Urgente", color: "#EF4444" },
};

export async function getDashboardData(period: DashPeriod, currentUserId?: string): Promise<DashboardData> {
  const { start, end, prevStart, prevEnd } = range(period);
  const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
  const todayEnd = new Date(todayStart); todayEnd.setDate(todayStart.getDate() + 1);

  const nowIso = new Date().toISOString();
  const since24hIso = new Date(Date.now() - 24 * 3600 * 1000).toISOString();

  const [msgsRes, prevMsgsRes, apptsRes, prevApptsRes, upcomingRes, contactsRes, columnsRes, recentMsgsRes] = await Promise.all([
    supabase.from("messages").select("id,contact_id,direction,sent_by,created_at")
      .gte("created_at", start.toISOString()).lt("created_at", end.toISOString())
      .order("created_at", { ascending: true }).limit(10000),
    supabase.from("messages").select("id,contact_id,direction,sent_by,created_at")
      .gte("created_at", prevStart.toISOString()).lt("created_at", prevEnd.toISOString()).limit(10000),
    supabase.from("appointments").select("id,contact_id,service_id,agent_id,status,starts_at")
      .gte("starts_at", start.toISOString()).lt("starts_at", end.toISOString()).limit(5000),
    supabase.from("appointments").select("id,status,starts_at")
      .gte("starts_at", prevStart.toISOString()).lt("starts_at", prevEnd.toISOString()).limit(5000),
    // Próximos agendamentos: do agora em diante, qualquer data, exceto cancelados.
    supabase.from("appointments").select("id,contact_id,service_id,starts_at,status")
      .gte("starts_at", nowIso)
      .neq("status", "cancelled").order("starts_at", { ascending: true }).limit(6),
    supabase.from("contacts").select("id,name,kanban_column"),
    supabase.from("kanban_columns").select("slug,label,color,position").order("position", { ascending: true }),
    // Mensagens das últimas 24h para detectar pendências por contato (independente de last_direction).
    supabase.from("messages").select("contact_id,direction,created_at")
      .gte("created_at", since24hIso).order("created_at", { ascending: true }).limit(10000),
  ]);


  const msgs = msgsRes.data ?? [];
  const prevMsgs = prevMsgsRes.data ?? [];
  const appts = apptsRes.data ?? [];
  const prevAppts = prevApptsRes.data ?? [];
  const upcomingRows = upcomingRes.data ?? [];
  const recentMsgs = recentMsgsRes.data ?? [];
  const contacts = contactsRes.data ?? [];
  const columns = columnsRes.data ?? [];

  // KPIs
  const inbound = msgs.filter((m: any) => m.direction === "inbound");
  const prevInbound = prevMsgs.filter((m: any) => m.direction === "inbound");
  const distinctContacts = new Set(inbound.map((m: any) => m.contact_id).filter(Boolean));
  const prevDistinct = new Set(prevInbound.map((m: any) => m.contact_id).filter(Boolean));

  const tmr = avgRespSeconds(msgs);
  const prevTmr = avgRespSeconds(prevMsgs);

  const completed = appts.filter((a: any) => a.status === "completed").length;
  const prevCompleted = prevAppts.filter((a: any) => a.status === "completed").length;
  const resPct = appts.length ? Math.round((completed / appts.length) * 100) : 0;
  const prevResPct = prevAppts.length ? Math.round((prevCompleted / prevAppts.length) * 100) : 0;

  // Hourly chart (last 24h regardless of period — matches title)
  const hourly = Array.from({ length: 24 }, (_, h) => ({ hour: `${String(h).padStart(2, "0")}h`, msgs: 0 }));
  const since24 = Date.now() - 24 * 3600 * 1000;
  for (const m of msgs) {
    const t = new Date(m.created_at).getTime();
    if (t < since24) continue;
    const h = new Date(m.created_at).getHours();
    hourly[h].msgs += 1;
  }

  // Kanban distribution
  const colMeta = new Map<string, { label: string; color: string; pos: number }>();
  columns.forEach((c: any, i: number) => colMeta.set(c.slug, { label: c.label, color: c.color || "#6B7280", pos: c.position ?? i }));
  const counts = new Map<string, number>();
  for (const c of contacts as any[]) {
    const slug = c.kanban_column || "waiting";
    counts.set(slug, (counts.get(slug) ?? 0) + 1);
  }
  const kanban = Array.from(counts.entries())
    .map(([slug, value]) => {
      const meta = colMeta.get(slug);
      const fb = COLUMN_FALLBACK[slug];
      return {
        name: meta?.label || fb?.label || slug,
        color: meta?.color || fb?.color || "#6B7280",
        value,
        pos: meta?.pos ?? 99,
      };
    })
    .sort((a, b) => a.pos - b.pos)
    .map(({ name, value, color }) => ({ name, value, color }));

  // Próximos agendamentos: do agora em diante (até 6 itens), independente do período selecionado.
  const apptServiceIds = Array.from(new Set(upcomingRows.map((a: any) => a.service_id).filter(Boolean)));
  const apptContactIds = Array.from(new Set(upcomingRows.map((a: any) => a.contact_id).filter(Boolean)));
  const [svcRes, ctRes] = await Promise.all([
    apptServiceIds.length
      ? supabase.from("services").select("id,name").in("id", apptServiceIds as string[])
      : Promise.resolve({ data: [] as any[] }),
    apptContactIds.length
      ? supabase.from("contacts").select("id,name").in("id", apptContactIds as string[])
      : Promise.resolve({ data: [] as any[] }),
  ]);
  const svcMap = new Map((svcRes.data ?? []).map((s: any) => [s.id, s.name]));
  const ctMap = new Map((ctRes.data ?? []).map((c: any) => [c.id, c.name]));
  const todayIso = new Date(); todayIso.setHours(0, 0, 0, 0);
  const tomorrowIso = new Date(todayIso); tomorrowIso.setDate(todayIso.getDate() + 1);
  const upcoming = upcomingRows.map((a: any) => {
    const d = new Date(a.starts_at);
    const isToday = d >= todayIso && d < tomorrowIso;
    const time = isToday
      ? d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })
      : d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }) + " " +
        d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
    return {
      id: a.id,
      time,
      client: ctMap.get(a.contact_id) || "—",
      service: svcMap.get(a.service_id) || "—",
    };
  });


  // Top services in period
  const periodSvcIds = Array.from(new Set(appts.map((a: any) => a.service_id).filter(Boolean)));
  const periodSvc = periodSvcIds.length
    ? (await supabase.from("services").select("id,name").in("id", periodSvcIds as string[])).data ?? []
    : [];
  const periodSvcMap = new Map(periodSvc.map((s: any) => [s.id, s.name]));
  const svcCount = new Map<string, number>();
  for (const a of appts as any[]) {
    if (!a.service_id) continue;
    svcCount.set(a.service_id, (svcCount.get(a.service_id) ?? 0) + 1);
  }
  const topServices = Array.from(svcCount.entries())
    .map(([id, count]) => ({ name: periodSvcMap.get(id) || "—", count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  // Agents online: any profile with outbound message in last 5min, plus the current user (always online).
  const recentAgentIds = new Set<string>();
  const since5 = Date.now() - 5 * 60 * 1000;
  for (const m of msgs as any[]) {
    if (m.direction === "outbound" && m.sent_by && new Date(m.created_at).getTime() >= since5) {
      recentAgentIds.add(m.sent_by);
    }
  }
  if (currentUserId) recentAgentIds.add(currentUserId);

  const allAgentIds = new Set<string>(recentAgentIds);
  for (const m of msgs as any[]) if (m.direction === "outbound" && m.sent_by) allAgentIds.add(m.sent_by);
  const agentIdsArr = Array.from(allAgentIds);
  const profiles = agentIdsArr.length
    ? (await supabase.from("profiles").select("id,full_name,email").in("id", agentIdsArr)).data ?? []
    : [];
  const agents = profiles.map((p: any) => ({
    name: p.full_name || p.email || `${String(p.id).slice(0, 6)}…`,
    online: recentAgentIds.has(p.id),
  })).sort((a, b) => Number(b.online) - Number(a.online)).slice(0, 6);

  // Urgent: last_direction inbound and last_message_at > 5min ago
  const fiveMinAgo = Date.now() - 5 * 60 * 1000;
  const urgent = (contacts as any[])
    .filter((c) => c.last_direction === "inbound" && c.last_message_at && new Date(c.last_message_at).getTime() < fiveMinAgo)
    .map((c) => ({
      id: c.id,
      client: c.name || "—",
      waiting: Math.max(1, Math.round((Date.now() - new Date(c.last_message_at).getTime()) / 60000)),
      last: c.last_message || "",
    }))
    .sort((a, b) => b.waiting - a.waiting)
    .slice(0, 5);

  return {
    kpis: {
      atendimentos: { value: distinctContacts.size, delta: pctDelta(distinctContacts.size, prevDistinct.size) },
      tmr: { value: fmtDuration(tmr), seconds: tmr, delta: pctDelta(prevTmr - tmr, prevTmr) },
      resolution: { value: appts.length ? `${resPct}%` : "—", pct: resPct, delta: pctDelta(resPct, prevResPct) },
      appointments: { value: appts.length, delta: pctDelta(appts.length, prevAppts.length) },
    },
    hourly,
    kanban,
    upcoming,
    topServices,
    agents,
    urgent,
  };
}
