import * as React from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  Plus,
  ChevronLeft,
  ChevronRight,
  X,
  CheckCircle2,
  Clock,
  CalendarClock,
  MessageSquare,
  Trash2,
  AlertTriangle,
  Filter,
} from "lucide-react";
import { notify as nfy } from "@/lib/notify";
import { supabase } from "@/integrations/supabase/client";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { listProfessionals } from "@/lib/professionals.functions";
import { notifyAppointmentChange } from "@/lib/appointments.functions";
import { useWorkspaceOwnerId } from "@/hooks/use-workspace-owner";
import { EmptyState } from "@/components/empty-state";
import {
  HOUR_END,
  HOUR_START,
  MOCK_APPOINTMENTS,
  MOCK_CONTACTS,
  MONTHS_PT,
  PX_PER_MIN,
  SLOT_MIN,
  STATUS_COLOR,
  STATUS_LABEL,
  WEEKDAYS_PT,
  type Agent,
  type Appointment,
  type AppointmentStatus,
  type ContactCard,
  type Service,
  addDays,
  addMinutes,
  formatHM,
  formatDateBR,
  fromDateTimeInput,
  isPast,
  parseDateBR,
  sameDay,
  startOfDay,
  startOfMonthGrid,
  startOfWeek,
  timeSlots,
  toDateInput,
} from "@/features/schedule/data";
import { utcToZonedLocal, zonedLocalToUtc } from "@/features/schedule/tz";
import { effectiveHours, parseHM, DAY_ORDER, type NormalizedHours } from "@/lib/working-hours";
import { useProfile } from "@/hooks/use-profile";
import { ScheduleModal } from "@/features/inbox/schedule-modal";

function nameToColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  const hue = Math.abs(hash) % 360;
  return `hsl(${hue}, 55%, 45%)`;
}

export const Route = createFileRoute("/_authenticated/schedule")({
  component: SchedulePage,
});

type ViewMode = "day" | "week" | "month" | "list";

function SchedulePage() {
  const [view, setView] = React.useState<ViewMode>("week");
  const [cursor, setCursor] = React.useState<Date>(new Date());
  const [items, setItems] = React.useState<Appointment[]>([]);

  const [contacts, setContacts] = React.useState<ContactCard[]>(MOCK_CONTACTS);
  const [services, setServices] = React.useState<Service[]>([]);

  const fetchProfessionals = useServerFn(listProfessionals);
  const profQ = useQuery({
    queryKey: ["professionals"],
    queryFn: () => fetchProfessionals(),
    staleTime: 30_000,
  });
  const agents = React.useMemo<Agent[]>(
    () =>
      (profQ.data ?? []).map((p) => ({
        id: p.id,
        name: p.name,
        color: p.avatar_color || nameToColor(p.name),
      })),
    [profQ.data],
  );
  const [agentFilter, setAgentFilter] = React.useState<string>("all");
  const [editing, setEditing] = React.useState<
    { mode: "create"; preset?: Partial<Appointment> } | { mode: "edit"; appt: Appointment } | null
  >(null);
  const [openId, setOpenId] = React.useState<string | null>(null);

  // Cmd+K → "Novo agendamento" + tecla "A"
  React.useEffect(() => {
    const onNew = () => setEditing({ mode: "create" });
    window.addEventListener("zf:new-appointment", onNew);
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() !== "a" || e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      const tag = t?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || t?.isContentEditable) return;
      onNew();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("zf:new-appointment", onNew);
      window.removeEventListener("keydown", onKey);
    };
  }, []);

  // tz do negócio (fallback SP) — usado para normalizar Dates como "phantom
  // local" para que a UI da agenda mostre o mesmo wall-clock que a mensagem WA.
  const profileQ = useProfile();
  const tz =
    ((profileQ.data as unknown as { business_timezone?: string } | null)?.business_timezone as
      string | undefined) || "America/Sao_Paulo";

  // Hydrate from supabase + realtime + cross-tab events
  const mapAppt = React.useCallback(
    (r: any): Appointment => ({
      id: r.id,
      contact_id: r.contact_id ?? "",
      service_id: r.service_id ?? "",
      professional_id: r.professional_id ?? "",
      starts_at: utcToZonedLocal(new Date(r.starts_at), tz),
      ends_at: utcToZonedLocal(new Date(r.ends_at), tz),
      status: (r.status ?? "scheduled") as AppointmentStatus,
      notes: r.notes ?? "",
      notify_whatsapp: !!r.notify_whatsapp,
      client_name: r.client_name ?? null,
    }),
    [tz],
  );

  const reload = React.useCallback(async () => {
    const [{ data: appts, error: apptErr }, { data: cts }, { data: svc }] = await Promise.all([
      supabase
        .from("appointments")
        .select(
          "id,contact_id,service_id,professional_id,starts_at,ends_at,status,notes,notify_whatsapp,client_name",
        ),
      supabase
        .from("contacts")
        .select(
          "id,name,phone,tags,priority,kanban_column,last_message,last_message_at,is_unread,assigned_agent_id",
        ),
      supabase
        .from("services")
        .select(
          "id,name,description,price_cents,duration_minutes,buffer_minutes,color,status,created_at",
        )
        .order("created_at", { ascending: true }),
    ]);
    if (apptErr) console.warn("[schedule] select appointments:", apptErr.message);
    setItems(
      appts && appts.length > 0 ? appts.map(mapAppt) : import.meta.env.DEV ? MOCK_APPOINTMENTS : [],
    );
    if (cts && cts.length > 0) {
      setContacts(
        cts.map((r: any) => ({
          id: r.id,
          name: r.name,
          phone: r.phone,
          tags: Array.isArray(r.tags) ? r.tags : [],
          priority: r.priority === "urgent" ? "urgent" : "normal",
          kanban_column: r.kanban_column ?? "waiting",
          lastMessage: r.last_message ?? "",
          lastMessageAt: r.last_message_at ? new Date(r.last_message_at) : new Date(),
          assignedAgent: r.assigned_agent_id ?? null,
          isUnread: !!r.is_unread,
        })),
      );
    }
    setServices(
      (svc ?? []).map((s: any) => ({
        id: s.id,
        name: s.name,
        description: s.description ?? "",
        price_cents: s.price_cents ?? 0,
        duration_minutes: s.duration_minutes ?? 30,
        buffer_minutes: s.buffer_minutes ?? 0,
        color: s.color ?? "#25C880",
        status: (s.status ?? "active") as Service["status"],
        created_at: s.created_at ? new Date(s.created_at) : new Date(),
        price_disclosure_policy: null,
        photo_send_policy: null,
        photos: [],
      })),
    );
  }, [mapAppt]);

  React.useEffect(() => {
    void reload();
    // refresh ao voltar para a aba
    const onVis = () => {
      if (document.visibilityState === "visible") void reload();
    };
    document.addEventListener("visibilitychange", onVis);
    // evento disparado pelo ScheduleModal (Inbox/WhatsApp)
    const onCreated = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (!detail?.id) {
        void reload();
        return;
      }
      setItems((prev) =>
        prev.some((a) => a.id === detail.id) ? prev : [...prev, mapAppt(detail)],
      );
    };
    window.addEventListener("zf:appointment-created", onCreated);
    // realtime
    const ch = supabase
      .channel("appointments-rt")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "appointments" },
        (payload) => {
          if (payload.eventType === "DELETE") {
            const id = (payload.old as any)?.id;
            if (id) setItems((prev) => prev.filter((a) => a.id !== id));
            return;
          }
          const row = payload.new as any;
          if (!row) return;
          setItems((prev) => {
            const next = mapAppt(row);
            const i = prev.findIndex((a) => a.id === next.id);
            if (i === -1) return [...prev, next];
            const copy = prev.slice();
            copy[i] = next;
            return copy;
          });
        },
      )
      .subscribe();
    return () => {
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("zf:appointment-created", onCreated);
      supabase.removeChannel(ch);
    };
  }, [reload, mapAppt]);

  // Filtra por agente (select único): "all" mostra todos; "unassigned" mostra
  // appointments sem vínculo (legado / criados antes do cadastro do profissional).
  const filtered = React.useMemo(() => {
    const knownIds = new Set(agents.map((g) => g.id));
    return items.filter((a) => {
      if (a.status === "cancelled") return false;
      if (agentFilter === "all") return true;
      if (agentFilter === "unassigned")
        return !a.professional_id || !knownIds.has(a.professional_id);
      return a.professional_id === agentFilter;
    });
  }, [items, agentFilter, agents]);

  const open = openId ? (items.find((i) => i.id === openId) ?? null) : null;

  const notifyChangeFn = useServerFn(notifyAppointmentChange);
  const { workspaceOwnerId } = useWorkspaceOwnerId();

  const setStatus = async (id: string, status: AppointmentStatus) => {
    const before = items.find((a) => a.id === id) ?? null;
    setItems((prev) => prev.map((a) => (a.id === id ? { ...a, status } : a)));
    nfy.success(`Status: ${STATUS_LABEL[status]}`);
    await supabase.from("appointments").update({ status }).eq("id", id);
    if (status === "cancelled" && before && before.status !== "cancelled") {
      void notifyChangeFn({ data: { appointmentId: id, kind: "cancelled" } }).catch((e) =>
        console.warn("[schedule] notify cancel falhou:", e),
      );
    }
  };

  const remove = async (id: string) => {
    setItems((prev) => prev.filter((a) => a.id !== id));
    setOpenId(null);
    nfy.success("Agendamento removido.");
    await supabase.from("appointments").delete().eq("id", id);
  };

  /* nav */
  const shift = (dir: 1 | -1) => {
    if (view === "day") setCursor((d) => addDays(d, dir));
    else if (view === "week") setCursor((d) => addDays(d, 7 * dir));
    else if (view === "month") setCursor((d) => new Date(d.getFullYear(), d.getMonth() + dir, 1));
  };
  const today = () => setCursor(new Date());

  const headerLabel = React.useMemo(() => {
    if (view === "day")
      return cursor.toLocaleDateString("pt-BR", {
        weekday: "long",
        day: "2-digit",
        month: "long",
      });
    if (view === "week") {
      const s = startOfWeek(cursor);
      const e = addDays(s, 6);
      return `${s.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" })} – ${e.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" })}`;
    }
    if (view === "month") return `${MONTHS_PT[cursor.getMonth()]} ${cursor.getFullYear()}`;
    return "Próximos agendamentos";
  }, [view, cursor]);

  // Jornada usada para sombrear a grade. Com um profissional filtrado mostra a
  // dele; em "todos" cai na do negócio, que é o denominador comum.
  const gridHours = React.useMemo(() => {
    const biz = (profileQ.data as { business_hours?: unknown } | null)?.business_hours;
    const pro = profQ.data?.find((p) => p.id === agentFilter);
    return effectiveHours(pro?.working_hours, biz as never);
  }, [profQ.data, agentFilter, profileQ.data]);

  const ctx = { contacts, services, agents, hours: gridHours, tz };

  return (
    <div className="flex flex-col" style={{ gap: 16, height: "calc(100vh - 48px - 48px)" }}>
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between" style={{ gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 600, letterSpacing: "-0.015em" }}>Agenda</h1>
          <p style={{ marginTop: 2, fontSize: 12, color: "var(--text-muted)" }}>
            {filtered.length} agendamento{filtered.length === 1 ? "" : "s"}
            {agentFilter !== "all" && agents.length > 0
              ? ` · ${agents.find((a) => a.id === agentFilter)?.name ?? ""}`
              : ` · ${agents.length} ${agents.length === 1 ? "profissional" : "profissionais"}`}
          </p>
        </div>

        <div className="flex flex-wrap items-center" style={{ gap: 8 }}>
          <ViewTabs view={view} onChange={setView} />
          <div className="relative inline-flex items-center" style={{ gap: 6 }}>
            <Filter size={14} style={{ color: "var(--text-muted)" }} />
            <select
              value={agentFilter}
              onChange={(e) => setAgentFilter(e.target.value)}
              aria-label="Filtrar por profissional"
              style={{
                height: 32,
                padding: "0 28px 0 10px",
                borderRadius: 6,
                border: "1px solid var(--border-strong)",
                background: "var(--bg-surface)",
                color: "var(--text-primary)",
                fontSize: 13,
                fontWeight: 500,
                cursor: "pointer",
              }}
            >
              <option value="all">Todos os profissionais</option>
              <option value="unassigned">Sem profissional</option>
              {agents.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </div>
          <button
            type="button"
            onClick={() => setEditing({ mode: "create" })}
            className="btn-primary"
          >
            <Plus size={14} />
            Novo Agendamento
          </button>
        </div>
      </div>

      {/* Toolbar */}
      <div
        className="flex items-center justify-between"
        style={{
          padding: "8px 10px",
          borderRadius: 8,
          background: "var(--bg-surface)",
          border: "1px solid var(--border)",
        }}
      >
        <div className="flex items-center" style={{ gap: 6 }}>
          <IconBtn label="Anterior" onClick={() => shift(-1)} disabled={view === "list"}>
            <ChevronLeft size={15} />
          </IconBtn>
          <button
            type="button"
            onClick={today}
            style={{
              height: 28,
              padding: "0 10px",
              borderRadius: 6,
              border: "1px solid var(--border-strong)",
              background: "transparent",
              fontSize: 12,
              fontWeight: 500,
              color: "var(--text-primary)",
            }}
          >
            Hoje
          </button>
          <IconBtn label="Próximo" onClick={() => shift(1)} disabled={view === "list"}>
            <ChevronRight size={15} />
          </IconBtn>
        </div>
        <div
          style={{
            fontSize: 13,
            fontWeight: 600,
            color: "var(--text-primary)",
            textTransform: "capitalize",
          }}
        >
          {headerLabel}
        </div>
        <div style={{ width: 80 }} />
      </div>

      {/* Body */}
      <div
        className="flex-1 overflow-hidden"
        style={{
          border: "1px solid var(--border)",
          borderRadius: 10,
          background: "var(--bg-surface)",
        }}
      >
        {view === "day" && (
          <DayView
            date={cursor}
            items={filtered}
            ctx={ctx}
            onOpen={(id) => setOpenId(id)}
            onSlotClick={(starts) => setEditing({ mode: "create", preset: { starts_at: starts } })}
          />
        )}
        {view === "week" && (
          <WeekView
            date={cursor}
            items={filtered}
            ctx={ctx}
            onOpen={(id) => setOpenId(id)}
            onSlotClick={(starts) => setEditing({ mode: "create", preset: { starts_at: starts } })}
          />
        )}
        {view === "month" && (
          <MonthView
            date={cursor}
            items={filtered}
            ctx={ctx}
            onOpen={(id) => setOpenId(id)}
            onDayClick={(d) => {
              setCursor(d);
              setView("day");
            }}
          />
        )}
        {view === "list" && <ListView items={filtered} ctx={ctx} onOpen={(id) => setOpenId(id)} />}
      </div>

      {editing && (
        <ScheduleModal
          open
          onClose={() => setEditing(null)}
          initial={editing.mode === "edit" ? editing.appt : null}
          preset={
            editing.mode === "create"
              ? {
                  starts_at: editing.preset?.starts_at,
                  professional_id: editing.preset?.professional_id,
                }
              : undefined
          }
          onSubmitted={() => {
            setEditing(null);
            void reload();
          }}
        />
      )}

      {open && (
        <DetailPanel
          appt={open}
          ctx={ctx}
          onClose={() => setOpenId(null)}
          onStatus={setStatus}
          onEdit={() => {
            setEditing({ mode: "edit", appt: open });
            setOpenId(null);
          }}
          onDelete={() => remove(open.id)}
        />
      )}
    </div>
  );
}

/* ============== sub: tabs ============== */

function ViewTabs({ view, onChange }: { view: ViewMode; onChange: (v: ViewMode) => void }) {
  const tabs: Array<{ id: ViewMode; label: string }> = [
    { id: "day", label: "Dia" },
    { id: "week", label: "Semana" },
    { id: "month", label: "Mês" },
    { id: "list", label: "Lista" },
  ];
  return (
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
      {tabs.map((t) => (
        <button
          key={t.id}
          type="button"
          onClick={() => onChange(t.id)}
          style={{
            height: 26,
            padding: "0 12px",
            borderRadius: 4,
            fontSize: 12,
            fontWeight: 500,
            background: view === t.id ? "var(--bg-surface)" : "transparent",
            color: view === t.id ? "var(--text-primary)" : "var(--text-muted)",
            border: view === t.id ? "1px solid var(--border)" : "1px solid transparent",
          }}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

function IconBtn({
  children,
  onClick,
  label,
  disabled,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      disabled={disabled}
      className="inline-flex items-center justify-center"
      style={{
        width: 28,
        height: 28,
        borderRadius: 6,
        background: "transparent",
        border: "1px solid var(--border-strong)",
        color: "var(--text-primary)",
        opacity: disabled ? 0.4 : 1,
      }}
    >
      {children}
    </button>
  );
}

/* ============== sub: views ============== */

interface Ctx {
  contacts: ContactCard[];
  services: Service[];
  agents: Agent[];
  /** Jornada do profissional filtrado (ou do negócio, em "todos"). */
  hours: NormalizedHours | null;
  tz: string;
}

function lookup(ctx: Ctx, a: Appointment) {
  const contact = ctx.contacts.find((c) => c.id === a.contact_id);
  const service = ctx.services.find((s) => s.id === a.service_id);
  const agent = ctx.agents.find((g) => g.id === a.professional_id);
  return { contact, service, agent, color: service?.color ?? "#3B82F6" };
}

const HOURS = Array.from({ length: HOUR_END - HOUR_START + 1 }, (_, i) => HOUR_START + i);
const HOUR_HEIGHT = 60 * PX_PER_MIN; // 84px per hour
const TIME_COL_W = 60;
const GRID_TOP_PAD = 10; // espaço para o label do HOUR_START não ser cortado

function HourGrid({ children, height }: { children: React.ReactNode; height: number }) {
  return (
    <div style={{ position: "relative", height: height + GRID_TOP_PAD, paddingTop: GRID_TOP_PAD }}>
      {HOURS.slice(0, -1).map((h, i) => (
        <div
          key={h}
          style={{
            position: "absolute",
            top: GRID_TOP_PAD + i * HOUR_HEIGHT,
            left: 0,
            right: 0,
            height: HOUR_HEIGHT,
            borderTop: i === 0 ? "none" : "1px solid var(--border-strong)",
          }}
        >
          <div
            style={{
              position: "absolute",
              top: HOUR_HEIGHT / 2,
              left: 0,
              right: 0,
              borderTop: "1px dashed var(--border)",
              opacity: 0.4,
            }}
          />
        </div>
      ))}
      {children}
    </div>
  );
}

function TimeColumn() {
  return (
    <div
      style={{
        width: TIME_COL_W,
        flexShrink: 0,
        borderRight: "1px solid var(--border)",
        position: "relative",
        paddingTop: GRID_TOP_PAD,
      }}
    >
      {HOURS.slice(0, -1).map((h, i) => (
        <div
          key={h}
          style={{
            position: "absolute",
            top: GRID_TOP_PAD + i * HOUR_HEIGHT - 6,
            left: 0,
            right: 8,
            textAlign: "right",
            fontSize: 10,
            color: "var(--text-muted)",
            fontFamily: "var(--font-mono, ui-monospace)",
            letterSpacing: "0.02em",
          }}
        >
          {String(h).padStart(2, "0")}:00
        </div>
      ))}
    </div>
  );
}

function DayView({
  date,
  items,
  ctx,
  onOpen,
  onSlotClick,
}: {
  date: Date;
  items: Appointment[];
  ctx: Ctx;
  onOpen: (id: string) => void;
  onSlotClick: (starts: Date) => void;
}) {
  const dayItems = items.filter((a) => sameDay(a.starts_at, date));
  const totalMin = (HOUR_END - HOUR_START) * 60;
  const height = totalMin * PX_PER_MIN;

  return (
    <div className="flex" style={{ height: "100%", overflow: "auto" }}>
      <TimeColumn />
      <div
        style={{ flex: 1, position: "relative" }}
        onClick={(e) => {
          const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
          const y = e.clientY - rect.top;
          const minutes = Math.max(
            0,
            Math.round((y - GRID_TOP_PAD) / PX_PER_MIN / SLOT_MIN) * SLOT_MIN,
          );
          const starts = startOfDay(date);
          starts.setMinutes(minutes + HOUR_START * 60);
          onSlotClick(starts);
        }}
      >
        <HourGrid height={height}>
          <UnavailableBands day={date} hours={ctx.hours} tz={ctx.tz} />
          {dayItems.map((a) => (
            <EventBlock key={a.id} a={a} ctx={ctx} onOpen={onOpen} left={8} right={8} />
          ))}
          <NowLine date={date} tz={ctx.tz} />
        </HourGrid>
      </div>
    </div>
  );
}

function WeekView({
  date,
  items,
  ctx,
  onOpen,
  onSlotClick,
}: {
  date: Date;
  items: Appointment[];
  ctx: Ctx;
  onOpen: (id: string) => void;
  onSlotClick: (starts: Date) => void;
}) {
  const ws = startOfWeek(date);
  const days = Array.from({ length: 7 }, (_, i) => addDays(ws, i));
  const totalMin = (HOUR_END - HOUR_START) * 60;
  const height = totalMin * PX_PER_MIN;

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column", overflow: "hidden" }}>
      {/* scroll container compartilhado por header e grid — garante alinhamento */}
      <div style={{ flex: 1, overflow: "auto" }}>
        {/* day header (sticky) */}
        <div
          className="flex"
          style={{
            position: "sticky",
            top: 0,
            zIndex: 4,
            background: "var(--bg-surface)",
            borderBottom: "1px solid var(--border-strong)",
            boxShadow: "0 1px 0 var(--border)",
          }}
        >
          <div
            style={{ width: TIME_COL_W, flexShrink: 0, borderRight: "1px solid var(--border)" }}
          />
          {days.map((d, i) => {
            const isToday = sameDay(d, new Date());
            return (
              <div
                key={i}
                className="flex flex-col items-center justify-center"
                style={{
                  flex: 1,
                  padding: "8px 4px",
                  gap: 2,
                  borderLeft: i === 0 ? "none" : "1px solid var(--border)",
                }}
              >
                <span
                  style={{
                    fontSize: 10,
                    color: "var(--text-muted)",
                    textTransform: "uppercase",
                    letterSpacing: "0.05em",
                  }}
                >
                  {WEEKDAYS_PT[i]}
                </span>
                <span
                  style={{
                    fontSize: 14,
                    fontWeight: 600,
                    color: isToday ? "#fff" : "var(--text-primary)",
                    background: isToday ? "var(--brand-400)" : "transparent",
                    width: 24,
                    height: 24,
                    borderRadius: 999,
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    boxShadow: isToday
                      ? "0 2px 6px color-mix(in oklab, var(--brand-400) 40%, transparent)"
                      : "none",
                  }}
                >
                  {d.getDate()}
                </span>
              </div>
            );
          })}
        </div>
        {/* grid */}
        <div className="flex">
          <TimeColumn />
          <div className="flex" style={{ flex: 1 }}>
            {days.map((d, i) => {
              const dayItems = items.filter((a) => sameDay(a.starts_at, d));
              return (
                <div
                  key={i}
                  style={{
                    flex: 1,
                    position: "relative",
                    borderLeft: i === 0 ? "none" : "1px solid var(--border)",
                  }}
                  onClick={(e) => {
                    const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
                    const y = e.clientY - rect.top;
                    const minutes = Math.max(
                      0,
                      Math.round((y - GRID_TOP_PAD) / PX_PER_MIN / SLOT_MIN) * SLOT_MIN,
                    );
                    const starts = startOfDay(d);
                    starts.setMinutes(minutes + HOUR_START * 60);
                    onSlotClick(starts);
                  }}
                >
                  <HourGrid height={height}>
                    <UnavailableBands day={d} hours={ctx.hours} tz={ctx.tz} />
                    {dayItems.map((a) => (
                      <EventBlock
                        key={a.id}
                        a={a}
                        ctx={ctx}
                        onOpen={onOpen}
                        left={3}
                        right={3}
                        compact
                      />
                    ))}
                    <NowLine date={d} tz={ctx.tz} />
                  </HourGrid>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

/** Date.getDay() (0=domingo) → chave usada por working-hours. */
const DAY_KEY_BY_INDEX = [
  DAY_ORDER[6],
  DAY_ORDER[0],
  DAY_ORDER[1],
  DAY_ORDER[2],
  DAY_ORDER[3],
  DAY_ORDER[4],
  DAY_ORDER[5],
] as const;

/**
 * Sombreia na grade o que não dá para agendar: o passado e as faixas fora da
 * jornada. Sai da mesma configuração (`working-hours`) que o modal usa para
 * avisar de encaixe, então as duas telas nunca discordam sobre o expediente.
 *
 * Só sinaliza — clicar continua abrindo o modal, porque encaixe manual é decisão
 * do humano. Quem bloqueia por jornada é o caminho da IA.
 */
function UnavailableBands({
  day,
  hours,
  tz,
}: {
  day: Date;
  hours: NormalizedHours | null;
  tz: string;
}) {
  const winStart = HOUR_START * 60;
  const winEnd = HOUR_END * 60;
  const bands: Array<{ from: number; to: number }> = [];

  if (hours) {
    const cfg = hours[DAY_KEY_BY_INDEX[day.getDay()]];
    if (!cfg?.active || cfg.ranges.length === 0) {
      bands.push({ from: winStart, to: winEnd });
    } else {
      // Sombreia os vãos: antes da primeira faixa, entre faixas (almoço) e
      // depois da última.
      let cursor = winStart;
      for (const r of cfg.ranges) {
        const rs = parseHM(r.start) ?? winStart;
        const re = parseHM(r.end) ?? winEnd;
        if (rs > cursor) bands.push({ from: cursor, to: rs });
        cursor = Math.max(cursor, re);
      }
      if (cursor < winEnd) bands.push({ from: cursor, to: winEnd });
    }
  }

  const now = utcToZonedLocal(new Date(), tz);
  if (sameDay(day, now)) {
    bands.push({ from: winStart, to: now.getHours() * 60 + now.getMinutes() });
  } else if (day.getTime() < startOfDay(now).getTime()) {
    bands.push({ from: winStart, to: winEnd });
  }

  return (
    <>
      {bands.map((b, i) => {
        const from = Math.max(b.from, winStart);
        const to = Math.min(b.to, winEnd);
        if (to <= from) return null;
        return (
          <div
            key={i}
            aria-hidden
            style={{
              position: "absolute",
              top: GRID_TOP_PAD + (from - winStart) * PX_PER_MIN,
              left: 0,
              right: 0,
              height: (to - from) * PX_PER_MIN,
              background: "var(--bg-overlay)",
              opacity: 0.5,
              pointerEvents: "none",
            }}
          />
        );
      })}
    </>
  );
}

function NowLine({ date, tz }: { date: Date; tz: string }) {
  // As datas da grade são "phantom local" (campos = relógio do negócio), então o
  // agora precisa vir do mesmo relógio — senão a linha desliza no fuso errado.
  const now = utcToZonedLocal(new Date(), tz);
  if (!sameDay(date, now)) return null;
  const minutes = now.getHours() * 60 + now.getMinutes() - HOUR_START * 60;
  if (minutes < 0 || minutes > (HOUR_END - HOUR_START) * 60) return null;
  return (
    <div
      style={{
        position: "absolute",
        top: GRID_TOP_PAD + minutes * PX_PER_MIN,
        left: 0,
        right: 0,
        height: 2,
        background: "#EF4444",
        zIndex: 5,
        pointerEvents: "none",
      }}
    >
      <div
        style={{
          position: "absolute",
          left: -4,
          top: -3,
          width: 8,
          height: 8,
          borderRadius: 999,
          background: "#EF4444",
        }}
      />
    </div>
  );
}

function EventBlock({
  a,
  ctx,
  onOpen,
  left,
  right,
  compact,
}: {
  a: Appointment;
  ctx: Ctx;
  onOpen: (id: string) => void;
  left: number;
  right: number;
  compact?: boolean;
}) {
  const { contact, service, agent, color } = lookup(ctx, a);
  const startMin = a.starts_at.getHours() * 60 + a.starts_at.getMinutes() - HOUR_START * 60;
  const dur = (a.ends_at.getTime() - a.starts_at.getTime()) / 60_000;
  const top = Math.max(0, GRID_TOP_PAD + startMin * PX_PER_MIN);
  const height = Math.max(22, dur * PX_PER_MIN - 2);
  const past = isPast(a.ends_at);

  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onOpen(a.id);
      }}
      style={{
        position: "absolute",
        top,
        left,
        right,
        height,
        boxSizing: "border-box",
        textAlign: "left",
        padding: compact ? "3px 5px" : "5px 7px",
        borderRadius: 6,
        background: `color-mix(in oklab, ${color} 14%, var(--bg-surface))`,
        border: `1px solid color-mix(in oklab, ${color} 40%, transparent)`,
        borderLeft: `3px solid ${color}`,
        color: "var(--text-primary)",
        opacity: past ? 0.55 : 1,
        overflow: "hidden",
        animation: "fadeSlideIn 200ms ease-out",
        transition: "transform 120ms ease",
        cursor: "pointer",
      }}
      onMouseEnter={(e) => (e.currentTarget.style.transform = "scale(1.01)")}
      onMouseLeave={(e) => (e.currentTarget.style.transform = "scale(1)")}
    >
      <div className="truncate" style={{ fontSize: compact ? 11 : 12, fontWeight: 600 }}>
        {a.client_name || contact?.name || "Sem contato"}
      </div>
      {height > 32 && (
        <div
          className="flex items-center"
          style={{
            gap: 4,
            fontSize: 10,
            color: "var(--text-muted)",
            marginTop: 2,
          }}
        >
          <span
            className="font-mono"
            style={{
              padding: "0 4px",
              borderRadius: 3,
              background: `color-mix(in oklab, ${color} 18%, transparent)`,
              color: "var(--text-primary)",
            }}
          >
            {service?.name?.slice(0, compact ? 14 : 24)}
          </span>
        </div>
      )}
      {height > 52 && (
        <div
          className="flex items-center justify-between"
          style={{ marginTop: 4, fontSize: 10, color: "var(--text-muted)" }}
        >
          <span className="font-mono">
            {formatHM(a.starts_at)}–{formatHM(a.ends_at)}
          </span>
          {agent && (
            <span
              title={agent.name}
              style={{
                width: 16,
                height: 16,
                borderRadius: 999,
                background: agent.color,
                color: "#fff",
                fontSize: 9,
                fontWeight: 600,
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              {agent.name.charAt(0)}
            </span>
          )}
        </div>
      )}
    </button>
  );
}

function MonthView({
  date,
  items,
  ctx,
  onOpen,
  onDayClick,
}: {
  date: Date;
  items: Appointment[];
  ctx: Ctx;
  onOpen: (id: string) => void;
  onDayClick: (d: Date) => void;
}) {
  const start = startOfMonthGrid(date);
  const cells = Array.from({ length: 42 }, (_, i) => addDays(start, i));
  const month = date.getMonth();

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column" }}>
      <div
        className="flex"
        style={{
          borderBottom: "1px solid var(--border)",
          background: "var(--bg-overlay)",
        }}
      >
        {WEEKDAYS_PT.map((w) => (
          <div
            key={w}
            style={{
              flex: 1,
              padding: "8px 10px",
              fontSize: 10,
              color: "var(--text-muted)",
              textTransform: "uppercase",
              letterSpacing: "0.05em",
              fontWeight: 600,
            }}
          >
            {w}
          </div>
        ))}
      </div>
      <div
        style={{
          flex: 1,
          display: "grid",
          gridTemplateColumns: "repeat(7, 1fr)",
          gridTemplateRows: "repeat(6, 1fr)",
          minHeight: 0,
        }}
      >
        {cells.map((d, i) => {
          const inMonth = d.getMonth() === month;
          const isToday = sameDay(d, new Date());
          const dayItems = items.filter((a) => sameDay(a.starts_at, d));
          return (
            <button
              key={i}
              type="button"
              onClick={() => onDayClick(d)}
              style={{
                textAlign: "left",
                padding: 6,
                borderTop: "1px solid var(--border)",
                borderLeft: i % 7 === 0 ? "none" : "1px solid var(--border)",
                background: inMonth ? "var(--bg-surface)" : "var(--bg-overlay)",
                color: inMonth ? "var(--text-primary)" : "var(--text-muted)",
                opacity: inMonth ? 1 : 0.6,
                display: "flex",
                flexDirection: "column",
                gap: 4,
                overflow: "hidden",
              }}
            >
              <div className="flex items-center justify-between">
                <span
                  style={{
                    fontSize: 12,
                    fontWeight: 600,
                    width: 22,
                    height: 22,
                    borderRadius: 999,
                    background: isToday ? "var(--brand-400)" : "transparent",
                    color: isToday ? "#fff" : "inherit",
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  {d.getDate()}
                </span>
                {dayItems.length > 3 && (
                  <span style={{ fontSize: 10, color: "var(--text-muted)" }}>
                    +{dayItems.length - 3}
                  </span>
                )}
              </div>
              <div className="flex flex-col" style={{ gap: 2 }}>
                {dayItems.slice(0, 3).map((a) => {
                  const { contact, color } = lookup(ctx, a);
                  return (
                    <span
                      key={a.id}
                      onClick={(e) => {
                        e.stopPropagation();
                        onOpen(a.id);
                      }}
                      className="truncate"
                      style={{
                        fontSize: 11,
                        padding: "1px 6px",
                        borderRadius: 4,
                        background: `color-mix(in oklab, ${color} 14%, transparent)`,
                        borderLeft: `2px solid ${color}`,
                        color: "var(--text-primary)",
                      }}
                    >
                      <span
                        className="font-mono"
                        style={{ color: "var(--text-muted)", marginRight: 4 }}
                      >
                        {formatHM(a.starts_at)}
                      </span>
                      {a.client_name || contact?.name || "Sem contato"}
                    </span>
                  );
                })}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function ListView({
  items,
  ctx,
  onOpen,
}: {
  items: Appointment[];
  ctx: Ctx;
  onOpen: (id: string) => void;
}) {
  const upcoming = [...items]
    .filter((a) => a.ends_at.getTime() >= Date.now() - 86_400_000)
    .sort((a, b) => a.starts_at.getTime() - b.starts_at.getTime());

  if (upcoming.length === 0) {
    return (
      <EmptyState
        icon={<CalendarClock size={48} style={{ color: "var(--brand-400)" }} aria-hidden="true" />}
        title="Sem agendamentos hoje"
        description="Que tal agendar o próximo? Crie um agendamento para organizar sua agenda."
        action={{
          label: "Novo agendamento",
          onClick: () => window.dispatchEvent(new CustomEvent("zf:new-appointment")),
        }}
      />
    );
  }

  // group by day
  const groups = new Map<string, Appointment[]>();
  for (const a of upcoming) {
    const key = toDateInput(a.starts_at);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(a);
  }

  return (
    <div style={{ height: "100%", overflow: "auto", padding: 16 }}>
      <div className="flex flex-col" style={{ gap: 16 }}>
        {Array.from(groups.entries()).map(([day, list]) => {
          const d = new Date(day + "T00:00:00");
          return (
            <section key={day}>
              <header
                style={{
                  fontSize: 11,
                  color: "var(--text-muted)",
                  textTransform: "uppercase",
                  letterSpacing: "0.05em",
                  marginBottom: 8,
                  fontWeight: 600,
                }}
              >
                {sameDay(d, new Date())
                  ? "Hoje"
                  : d.toLocaleDateString("pt-BR", {
                      weekday: "long",
                      day: "2-digit",
                      month: "long",
                    })}
              </header>
              <div className="flex flex-col" style={{ gap: 6 }}>
                {list.map((a) => {
                  const { contact, service, agent, color } = lookup(ctx, a);
                  return (
                    <button
                      key={a.id}
                      type="button"
                      onClick={() => onOpen(a.id)}
                      className="flex items-center w-full"
                      style={{
                        gap: 12,
                        padding: "10px 12px",
                        borderRadius: 8,
                        border: "1px solid var(--border)",
                        borderLeft: `3px solid ${color}`,
                        background: "var(--bg-surface)",
                        textAlign: "left",
                        opacity: isPast(a.ends_at) ? 0.55 : 1,
                      }}
                    >
                      <div
                        className="font-mono"
                        style={{
                          fontSize: 13,
                          fontWeight: 600,
                          color: "var(--text-primary)",
                          width: 90,
                        }}
                      >
                        {formatHM(a.starts_at)}–{formatHM(a.ends_at)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="truncate" style={{ fontSize: 13, fontWeight: 500 }}>
                          {a.client_name || contact?.name || "Sem contato"}
                        </div>
                        <div
                          className="truncate"
                          style={{ fontSize: 11, color: "var(--text-muted)" }}
                        >
                          {service?.name} · {agent?.name}
                        </div>
                      </div>
                      <span
                        style={{
                          fontSize: 10,
                          padding: "2px 7px",
                          borderRadius: 999,
                          color: STATUS_COLOR[a.status],
                          background: `color-mix(in oklab, ${STATUS_COLOR[a.status]} 12%, transparent)`,
                          border: `1px solid color-mix(in oklab, ${STATUS_COLOR[a.status]} 30%, transparent)`,
                          textTransform: "uppercase",
                          letterSpacing: "0.04em",
                          fontWeight: 500,
                        }}
                      >
                        {STATUS_LABEL[a.status]}
                      </span>
                    </button>
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}

/* ============== sub: detail panel ============== */

function DetailPanel({
  appt,
  ctx,
  onClose,
  onStatus,
  onEdit,
  onDelete,
}: {
  appt: Appointment;
  ctx: Ctx;
  onClose: () => void;
  onStatus: (id: string, s: AppointmentStatus) => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const { contact, service, agent, color } = lookup(ctx, appt);
  const past = isPast(appt.ends_at);
  return (
    <>
      <div
        onClick={onClose}
        style={{
          position: "fixed",
          inset: 0,
          background: "rgba(0,0,0,0.35)",
          zIndex: 40,
          animation: "fadeSlideIn 150ms ease-out",
        }}
      />
      <aside
        style={{
          position: "fixed",
          top: 0,
          right: 0,
          height: "100vh",
          width: 400,
          maxWidth: "100vw",
          background: "var(--bg-surface)",
          borderLeft: "1px solid var(--border)",
          zIndex: 50,
          display: "flex",
          flexDirection: "column",
          animation: "fadeSlideIn 200ms ease-out",
        }}
      >
        {/* Header */}
        <div
          className="flex items-center"
          style={{
            gap: 8,
            height: 48,
            padding: "0 12px",
            borderBottom: "1px solid var(--border)",
          }}
        >
          <div
            style={{
              width: 8,
              height: 28,
              borderRadius: 4,
              background: color,
            }}
          />
          <div className="flex-1 min-w-0">
            <div style={{ fontSize: 13, fontWeight: 600 }}>
              {appt.client_name || contact?.name || "—"}
            </div>
            <div style={{ fontSize: 11, color: "var(--text-muted)" }}>{service?.name}</div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar"
            className="inline-flex items-center justify-center"
            style={{
              width: 30,
              height: 30,
              borderRadius: 6,
              background: "transparent",
              color: "var(--text-muted)",
            }}
          >
            <X size={16} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto" style={{ padding: 16 }}>
          <span
            style={{
              display: "inline-block",
              fontSize: 10,
              padding: "3px 8px",
              borderRadius: 999,
              color: STATUS_COLOR[appt.status],
              background: `color-mix(in oklab, ${STATUS_COLOR[appt.status]} 12%, transparent)`,
              border: `1px solid color-mix(in oklab, ${STATUS_COLOR[appt.status]} 30%, transparent)`,
              textTransform: "uppercase",
              letterSpacing: "0.04em",
              fontWeight: 600,
              marginBottom: 12,
            }}
          >
            {STATUS_LABEL[appt.status]}
          </span>

          <DataRow
            label="Data"
            value={appt.starts_at.toLocaleDateString("pt-BR", {
              weekday: "long",
              day: "2-digit",
              month: "long",
              year: "numeric",
            })}
          />
          <DataRow
            label="Horário"
            value={`${formatHM(appt.starts_at)} – ${formatHM(appt.ends_at)}`}
            mono
          />
          <DataRow
            label="Duração"
            value={`${Math.round(
              (appt.ends_at.getTime() - appt.starts_at.getTime()) / 60_000,
            )} min`}
            mono
          />
          <DataRow label="Contato" value={appt.client_name || contact?.name || "—"} />
          <DataRow label="Telefone" value={contact?.phone ?? "—"} mono />
          <DataRow label="Serviço" value={service ? service.name : "—"} />
          {service && (
            <DataRow
              label="Valor"
              value={(service.price_cents / 100).toLocaleString("pt-BR", {
                style: "currency",
                currency: "BRL",
              })}
              mono
            />
          )}
          <DataRow
            label="Profissional"
            value={
              agent ? (
                <span className="inline-flex items-center" style={{ gap: 6 }}>
                  <span
                    style={{
                      width: 16,
                      height: 16,
                      borderRadius: 999,
                      background: agent.color,
                      color: "#fff",
                      fontSize: 9,
                      fontWeight: 600,
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    {agent.name.charAt(0)}
                  </span>
                  {agent.name}
                </span>
              ) : (
                "—"
              )
            }
          />
          <DataRow
            label="WhatsApp"
            value={appt.notify_whatsapp ? "Notificação ativada" : "Sem notificação"}
          />
          {appt.notes && <DataRow label="Observações" value={appt.notes} multiline />}
        </div>

        {/* Footer actions */}
        <div
          style={{
            padding: 12,
            borderTop: "1px solid var(--border)",
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: 6,
          }}
        >
          {!past && appt.status !== "confirmed" && (
            <ActionBtn
              icon={<CheckCircle2 size={13} />}
              onClick={() => onStatus(appt.id, "confirmed")}
            >
              Confirmar
            </ActionBtn>
          )}
          {!past && appt.status !== "in_progress" && appt.status !== "completed" && (
            <ActionBtn icon={<Clock size={13} />} onClick={() => onStatus(appt.id, "in_progress")}>
              Iniciar
            </ActionBtn>
          )}
          {!past && (
            <ActionBtn icon={<CalendarClock size={13} />} onClick={onEdit}>
              Remarcar
            </ActionBtn>
          )}
          {contact && (
            <ActionLink to="/inbox" icon={<MessageSquare size={13} />}>
              Conversa
            </ActionLink>
          )}
          {appt.status !== "cancelled" && !past && (
            <ActionBtn icon={<X size={13} />} danger onClick={() => onStatus(appt.id, "cancelled")}>
              Cancelar
            </ActionBtn>
          )}
          <ActionBtn icon={<Trash2 size={13} />} danger onClick={onDelete}>
            Excluir
          </ActionBtn>
        </div>
      </aside>
    </>
  );
}

function DataRow({
  label,
  value,
  mono,
  multiline,
}: {
  label: string;
  value: React.ReactNode;
  mono?: boolean;
  multiline?: boolean;
}) {
  return (
    <div
      style={{
        padding: "10px 0",
        borderBottom: "1px solid var(--border)",
        display: "flex",
        flexDirection: multiline ? "column" : "row",
        justifyContent: "space-between",
        alignItems: multiline ? "flex-start" : "center",
        gap: multiline ? 4 : 12,
      }}
    >
      <span
        style={{
          fontSize: 11,
          color: "var(--text-muted)",
          textTransform: "uppercase",
          letterSpacing: "0.05em",
        }}
      >
        {label}
      </span>
      <span
        style={{
          fontSize: 13,
          color: "var(--text-primary)",
          textAlign: multiline ? "left" : "right",
          fontFamily: mono ? "var(--font-mono, ui-monospace)" : undefined,
        }}
      >
        {value}
      </span>
    </div>
  );
}

function ActionBtn({
  children,
  icon,
  onClick,
  danger,
}: {
  children: React.ReactNode;
  icon: React.ReactNode;
  onClick?: () => void;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center justify-center"
      style={{
        gap: 5,
        height: 32,
        padding: "0 10px",
        borderRadius: 6,
        fontSize: 12,
        fontWeight: 500,
        border: "1px solid var(--border-strong)",
        background: "transparent",
        color: danger ? "#EF4444" : "var(--text-primary)",
      }}
    >
      {icon}
      {children}
    </button>
  );
}

function ActionLink({
  children,
  icon,
  to,
}: {
  children: React.ReactNode;
  icon: React.ReactNode;
  to: "/inbox";
}) {
  return (
    <Link
      to={to}
      className="inline-flex items-center justify-center"
      style={{
        gap: 5,
        height: 32,
        padding: "0 10px",
        borderRadius: 6,
        fontSize: 12,
        fontWeight: 500,
        border: "1px solid var(--border-strong)",
        background: "transparent",
        color: "var(--text-primary)",
        textDecoration: "none",
      }}
    >
      {icon}
      {children}
    </Link>
  );
}
