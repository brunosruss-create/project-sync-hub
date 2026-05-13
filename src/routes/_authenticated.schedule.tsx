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
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  HOUR_END,
  HOUR_START,
  MOCK_AGENTS,
  MOCK_APPOINTMENTS,
  MOCK_CONTACTS,
  MONTHS_PT,
  PX_PER_MIN,
  SEED_CATEGORIES,
  SEED_SERVICES,
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
  fromDateTimeInput,
  isPast,
  overlap,
  sameDay,
  startOfDay,
  startOfMonthGrid,
  startOfWeek,
  timeSlots,
  toDateInput,
} from "@/features/schedule/data";

export const Route = createFileRoute("/_authenticated/schedule")({
  component: SchedulePage,
});

type ViewMode = "day" | "week" | "month" | "list";

function SchedulePage() {
  const [view, setView] = React.useState<ViewMode>("week");
  const [cursor, setCursor] = React.useState<Date>(new Date());
  const [items, setItems] = React.useState<Appointment[]>(MOCK_APPOINTMENTS);
  const [contacts, setContacts] = React.useState<ContactCard[]>(MOCK_CONTACTS);
  const [services] = React.useState<Service[]>(SEED_SERVICES);
  const [agents] = React.useState<Agent[]>(MOCK_AGENTS);
  const [agentFilter, setAgentFilter] = React.useState<Set<string>>(
    new Set(MOCK_AGENTS.map((a) => a.id)),
  );
  const [filterOpen, setFilterOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<
    { mode: "create"; preset?: Partial<Appointment> } | { mode: "edit"; appt: Appointment } | null
  >(null);
  const [openId, setOpenId] = React.useState<string | null>(null);

  // Try hydrate from supabase
  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      const [{ data: appts }, { data: cts }] = await Promise.all([
        supabase
          .from("appointments")
          .select(
            "id,contact_id,service_id,agent_id,starts_at,ends_at,status,notes,notify_whatsapp",
          ),
        supabase.from("contacts").select("id,name,phone,tags,priority,kanban_column,last_message,last_message_at,is_unread,assigned_agent_id"),
      ]);
      if (cancelled) return;
      if (appts && appts.length > 0) {
        setItems(
          appts.map((r: any) => ({
            id: r.id,
            contact_id: r.contact_id ?? "",
            service_id: r.service_id ?? "",
            agent_id: r.agent_id ?? "",
            starts_at: new Date(r.starts_at),
            ends_at: new Date(r.ends_at),
            status: (r.status ?? "scheduled") as AppointmentStatus,
            notes: r.notes ?? "",
            notify_whatsapp: !!r.notify_whatsapp,
          })),
        );
      }
      if (cts && cts.length > 0) {
        setContacts(
          cts.map((r: any) => ({
            id: r.id,
            name: r.name,
            phone: r.phone,
            tags: Array.isArray(r.tags) ? r.tags : [],
            priority: (r.priority === "urgent" ? "urgent" : "normal"),
            kanban_column: (r.kanban_column ?? "waiting"),
            lastMessage: r.last_message ?? "",
            lastMessageAt: r.last_message_at ? new Date(r.last_message_at) : new Date(),
            assignedAgent: r.assigned_agent_id ?? null,
            isUnread: !!r.is_unread,
          })),
        );
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const filtered = React.useMemo(
    () => items.filter((a) => agentFilter.has(a.agent_id)),
    [items, agentFilter],
  );

  const open = openId ? items.find((i) => i.id === openId) ?? null : null;

  const upsert = async (draft: Appointment) => {
    // overlap detection
    const conflict = items.find(
      (a) => a.id !== draft.id && a.agent_id === draft.agent_id && overlap(a, draft),
    );
    if (conflict) {
      toast.error("Horário em conflito com outro agendamento desse agente.");
      return false;
    }
    const exists = items.some((a) => a.id === draft.id);
    setItems((prev) =>
      exists ? prev.map((a) => (a.id === draft.id ? draft : a)) : [...prev, draft],
    );
    setEditing(null);
    toast.success(exists ? "Agendamento atualizado." : "Agendamento criado.");

    const { error } = await supabase.from("appointments").upsert({
      id: draft.id,
      contact_id: draft.contact_id || null,
      service_id: draft.service_id || null,
      agent_id: draft.agent_id || null,
      starts_at: draft.starts_at.toISOString(),
      ends_at: draft.ends_at.toISOString(),
      status: draft.status,
      notes: draft.notes,
      notify_whatsapp: draft.notify_whatsapp,
    });
    if (error) console.warn("[schedule] persistência ignorada:", error.message);
    return true;
  };

  const setStatus = async (id: string, status: AppointmentStatus) => {
    setItems((prev) => prev.map((a) => (a.id === id ? { ...a, status } : a)));
    toast.success(`Status: ${STATUS_LABEL[status]}`);
    await supabase.from("appointments").update({ status }).eq("id", id);
  };

  const remove = async (id: string) => {
    setItems((prev) => prev.filter((a) => a.id !== id));
    setOpenId(null);
    toast.success("Agendamento removido.");
    await supabase.from("appointments").delete().eq("id", id);
  };

  /* nav */
  const shift = (dir: 1 | -1) => {
    if (view === "day") setCursor((d) => addDays(d, dir));
    else if (view === "week") setCursor((d) => addDays(d, 7 * dir));
    else if (view === "month")
      setCursor((d) => new Date(d.getFullYear(), d.getMonth() + dir, 1));
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

  const ctx = { contacts, services, agents };

  return (
    <div className="flex flex-col" style={{ gap: 16, height: "calc(100vh - 48px - 48px)" }}>
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between" style={{ gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 600, letterSpacing: "-0.015em" }}>
            Agenda
          </h1>
          <p style={{ marginTop: 2, fontSize: 12, color: "var(--text-muted)" }}>
            {filtered.length} agendamento{filtered.length === 1 ? "" : "s"} ·{" "}
            {agentFilter.size} de {agents.length} agentes
          </p>
        </div>

        <div className="flex flex-wrap items-center" style={{ gap: 8 }}>
          <ViewTabs view={view} onChange={setView} />
          <div className="relative">
            <button
              type="button"
              onClick={() => setFilterOpen((v) => !v)}
              className="inline-flex items-center"
              style={{
                gap: 4,
                height: 32,
                padding: "0 10px",
                borderRadius: 6,
                border: "1px solid var(--border-strong)",
                background: "transparent",
                color: "var(--text-primary)",
                fontSize: 13,
                fontWeight: 500,
              }}
            >
              <Filter size={14} />
              Agentes
            </button>
            {filterOpen && (
              <div
                onMouseLeave={() => setFilterOpen(false)}
                style={{
                  position: "absolute",
                  top: 36,
                  right: 0,
                  zIndex: 30,
                  width: 220,
                  background: "var(--bg-surface)",
                  border: "1px solid var(--border-strong)",
                  borderRadius: 8,
                  padding: 6,
                  boxShadow: "0 10px 30px rgba(0,0,0,0.18)",
                  animation: "fadeSlideIn 150ms ease-out",
                }}
              >
                {agents.map((a) => {
                  const on = agentFilter.has(a.id);
                  return (
                    <label
                      key={a.id}
                      className="flex items-center w-full"
                      style={{ gap: 8, padding: "6px 8px", borderRadius: 6, cursor: "pointer", fontSize: 13 }}
                      onMouseEnter={(e) => (e.currentTarget.style.background = "var(--bg-overlay)")}
                      onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                    >
                      <input
                        type="checkbox"
                        checked={on}
                        onChange={() =>
                          setAgentFilter((prev) => {
                            const next = new Set(prev);
                            if (next.has(a.id)) next.delete(a.id);
                            else next.add(a.id);
                            return next;
                          })
                        }
                      />
                      <span
                        style={{
                          width: 8,
                          height: 8,
                          borderRadius: 999,
                          background: a.color,
                        }}
                      />
                      <span style={{ flex: 1 }}>{a.name}</span>
                    </label>
                  );
                })}
              </div>
            )}
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
            onSlotClick={(starts) =>
              setEditing({ mode: "create", preset: { starts_at: starts } })
            }
          />
        )}
        {view === "week" && (
          <WeekView
            date={cursor}
            items={filtered}
            ctx={ctx}
            onOpen={(id) => setOpenId(id)}
            onSlotClick={(starts) =>
              setEditing({ mode: "create", preset: { starts_at: starts } })
            }
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
        {view === "list" && (
          <ListView items={filtered} ctx={ctx} onOpen={(id) => setOpenId(id)} />
        )}
      </div>

      {editing && (
        <AppointmentModal
          initial={editing.mode === "edit" ? editing.appt : null}
          preset={editing.mode === "create" ? editing.preset : undefined}
          contacts={contacts}
          services={services}
          agents={agents}
          onClose={() => setEditing(null)}
          onSubmit={upsert}
          onAddContact={(name, phone) => {
            const c: ContactCard = {
              id: `c-${Date.now()}`,
              name,
              phone,
              tags: [],
              priority: "normal",
              kanban_column: "waiting",
              lastMessage: "",
              lastMessageAt: new Date(),
              isUnread: false,
            };
            setContacts((prev) => [...prev, c]);
            return c;
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
}

function lookup(ctx: Ctx, a: Appointment) {
  const contact = ctx.contacts.find((c) => c.id === a.contact_id);
  const service = ctx.services.find((s) => s.id === a.service_id);
  const agent = ctx.agents.find((g) => g.id === a.agent_id);
  const cat = service ? SEED_CATEGORIES.find((c) => c.id === service.category_id) : null;
  return { contact, service, agent, color: cat?.color ?? service?.color ?? "#3B82F6" };
}

const HOURS = Array.from({ length: HOUR_END - HOUR_START + 1 }, (_, i) => HOUR_START + i);
const HOUR_HEIGHT = 60 * PX_PER_MIN; // 84px per hour
const TIME_COL_W = 56;

function HourGrid({ children, height }: { children: React.ReactNode; height: number }) {
  return (
    <div style={{ position: "relative", height }}>
      {HOURS.slice(0, -1).map((h, i) => (
        <div
          key={h}
          style={{
            position: "absolute",
            top: i * HOUR_HEIGHT,
            left: 0,
            right: 0,
            height: HOUR_HEIGHT,
            borderTop: "1px solid var(--border)",
          }}
        >
          <div
            style={{
              position: "absolute",
              top: HOUR_HEIGHT / 2,
              left: 0,
              right: 0,
              borderTop: "1px dashed var(--border)",
              opacity: 0.6,
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
      }}
    >
      {HOURS.slice(0, -1).map((h, i) => (
        <div
          key={h}
          style={{
            position: "absolute",
            top: i * HOUR_HEIGHT - 6,
            right: 8,
            fontSize: 10,
            color: "var(--text-muted)",
            fontFamily: "var(--font-mono, ui-monospace)",
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
          const minutes = Math.max(0, Math.round(y / PX_PER_MIN / SLOT_MIN) * SLOT_MIN);
          const starts = startOfDay(date);
          starts.setMinutes(minutes + HOUR_START * 60);
          onSlotClick(starts);
        }}
      >
        <HourGrid height={height}>
          {dayItems.map((a) => (
            <EventBlock
              key={a.id}
              a={a}
              ctx={ctx}
              onOpen={onOpen}
              left={8}
              right={8}
            />
          ))}
          <NowLine date={date} />
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
      {/* day header */}
      <div className="flex" style={{ borderBottom: "1px solid var(--border)" }}>
        <div style={{ width: TIME_COL_W, flexShrink: 0 }} />
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
                }}
              >
                {d.getDate()}
              </span>
            </div>
          );
        })}
      </div>
      {/* grid */}
      <div className="flex" style={{ flex: 1, overflow: "auto" }}>
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
                    Math.round(y / PX_PER_MIN / SLOT_MIN) * SLOT_MIN,
                  );
                  const starts = startOfDay(d);
                  starts.setMinutes(minutes + HOUR_START * 60);
                  onSlotClick(starts);
                }}
              >
                <HourGrid height={height}>
                  {dayItems.map((a) => (
                    <EventBlock key={a.id} a={a} ctx={ctx} onOpen={onOpen} left={3} right={3} compact />
                  ))}
                  <NowLine date={d} />
                </HourGrid>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function NowLine({ date }: { date: Date }) {
  if (!sameDay(date, new Date())) return null;
  const now = new Date();
  const minutes = now.getHours() * 60 + now.getMinutes() - HOUR_START * 60;
  if (minutes < 0 || minutes > (HOUR_END - HOUR_START) * 60) return null;
  return (
    <div
      style={{
        position: "absolute",
        top: minutes * PX_PER_MIN,
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
  const startMin =
    a.starts_at.getHours() * 60 + a.starts_at.getMinutes() - HOUR_START * 60;
  const dur = (a.ends_at.getTime() - a.starts_at.getTime()) / 60_000;
  const top = Math.max(0, startMin * PX_PER_MIN);
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
      <div
        className="truncate"
        style={{ fontSize: compact ? 11 : 12, fontWeight: 600 }}
      >
        {contact?.name ?? "Sem contato"}
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
            {service?.emoji} {service?.name?.slice(0, compact ? 14 : 24)}
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
                      {contact?.name ?? "Sem contato"}
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
      <div
        style={{
          padding: 48,
          textAlign: "center",
          color: "var(--text-muted)",
          fontSize: 13,
        }}
      >
        Nenhum agendamento próximo.
      </div>
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
                        <div
                          className="truncate"
                          style={{ fontSize: 13, fontWeight: 500 }}
                        >
                          {contact?.name ?? "Sem contato"}
                        </div>
                        <div
                          className="truncate"
                          style={{ fontSize: 11, color: "var(--text-muted)" }}
                        >
                          {service?.emoji} {service?.name} · {agent?.name}
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
            <div style={{ fontSize: 13, fontWeight: 600 }}>{contact?.name ?? "—"}</div>
            <div style={{ fontSize: 11, color: "var(--text-muted)" }}>
              {service?.emoji} {service?.name}
            </div>
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
          <DataRow label="Horário" value={`${formatHM(appt.starts_at)} – ${formatHM(appt.ends_at)}`} mono />
          <DataRow
            label="Duração"
            value={`${Math.round(
              (appt.ends_at.getTime() - appt.starts_at.getTime()) / 60_000,
            )} min`}
            mono
          />
          <DataRow label="Contato" value={contact?.name ?? "—"} />
          <DataRow label="Telefone" value={contact?.phone ?? "—"} mono />
          <DataRow label="Serviço" value={service ? `${service.emoji} ${service.name}` : "—"} />
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
            label="Agente"
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
            <ActionBtn icon={<CheckCircle2 size={13} />} onClick={() => onStatus(appt.id, "confirmed")}>
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
            <ActionBtn
              icon={<X size={13} />}
              danger
              onClick={() => onStatus(appt.id, "cancelled")}
            >
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

/* ============== sub: modal ============== */

function AppointmentModal({
  initial,
  preset,
  contacts,
  services,
  agents,
  onClose,
  onSubmit,
  onAddContact,
}: {
  initial: Appointment | null;
  preset?: Partial<Appointment>;
  contacts: ContactCard[];
  services: Service[];
  agents: Agent[];
  onClose: () => void;
  onSubmit: (a: Appointment) => Promise<boolean> | boolean;
  onAddContact: (name: string, phone: string) => ContactCard;
}) {
  const baseDate = initial?.starts_at ?? preset?.starts_at ?? new Date();
  const baseHM = `${String(baseDate.getHours()).padStart(2, "0")}:${String(
    Math.round(baseDate.getMinutes() / 15) * 15,
  ).padStart(2, "0")}`;

  const [contactQuery, setContactQuery] = React.useState(
    initial ? contacts.find((c) => c.id === initial.contact_id)?.name ?? "" : "",
  );
  const [contactId, setContactId] = React.useState(initial?.contact_id ?? "");
  const [showAdd, setShowAdd] = React.useState(false);
  const [newName, setNewName] = React.useState("");
  const [newPhone, setNewPhone] = React.useState("");

  const [serviceId, setServiceId] = React.useState(
    initial?.service_id ?? services[0]?.id ?? "",
  );
  const [agentId, setAgentId] = React.useState(initial?.agent_id ?? agents[0]?.id ?? "");
  const [date, setDate] = React.useState(toDateInput(baseDate));
  const [time, setTime] = React.useState(baseHM);
  const [notes, setNotes] = React.useState(initial?.notes ?? "");
  const [notify, setNotify] = React.useState(initial?.notify_whatsapp ?? true);
  const [status] = React.useState<AppointmentStatus>(initial?.status ?? "scheduled");

  const service = services.find((s) => s.id === serviceId);
  const dur = service?.duration_minutes ?? 30;
  const starts = fromDateTimeInput(date, time);
  const ends = addMinutes(starts, dur);

  // Lock scroll
  React.useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  // overlap warning (UI hint, real check in parent)
  const conflict = React.useMemo(() => {
    return false; // parent does final check
  }, []);

  const filteredContacts = React.useMemo(() => {
    if (!contactQuery) return contacts.slice(0, 6);
    const q = contactQuery.toLowerCase();
    return contacts
      .filter((c) => c.name.toLowerCase().includes(q) || c.phone.toLowerCase().includes(q))
      .slice(0, 8);
  }, [contactQuery, contacts]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    let cid = contactId;
    if (!cid && showAdd && newName.trim()) {
      const c = onAddContact(newName.trim(), newPhone.trim());
      cid = c.id;
    }
    if (!cid) {
      toast.error("Selecione ou crie um contato.");
      return;
    }
    if (!serviceId) {
      toast.error("Selecione um serviço.");
      return;
    }
    if (!agentId) {
      toast.error("Selecione um agente.");
      return;
    }
    const draft: Appointment = {
      id: initial?.id ?? `ap-${Date.now()}`,
      contact_id: cid,
      service_id: serviceId,
      agent_id: agentId,
      starts_at: starts,
      ends_at: ends,
      status,
      notes: notes.trim(),
      notify_whatsapp: notify,
    };
    await onSubmit(draft);
  };

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.45)",
        zIndex: 70,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
        animation: "fadeSlideIn 150ms ease-out",
      }}
    >
      <form
        onClick={(e) => e.stopPropagation()}
        onSubmit={submit}
        style={{
          width: "100%",
          maxWidth: 520,
          maxHeight: "calc(100vh - 32px)",
          background: "var(--bg-surface)",
          border: "1px solid var(--border)",
          borderRadius: 12,
          display: "flex",
          flexDirection: "column",
          boxShadow: "0 20px 50px rgba(0,0,0,0.25)",
          animation: "fadeSlideIn 200ms ease-out",
        }}
      >
        <div
          className="flex items-center justify-between"
          style={{ padding: "14px 16px", borderBottom: "1px solid var(--border)" }}
        >
          <div>
            <div style={{ fontSize: 14, fontWeight: 600 }}>
              {initial ? "Editar agendamento" : "Novo agendamento"}
            </div>
            <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 1 }}>
              Defina contato, serviço, data e responsável.
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar"
            className="inline-flex items-center justify-center"
            style={{ width: 30, height: 30, borderRadius: 6, color: "var(--text-muted)" }}
          >
            <X size={16} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto" style={{ padding: 16 }}>
          <div className="flex flex-col" style={{ gap: 12 }}>
            {/* Contact autocomplete */}
            <Field label="Contato" required>
              {!showAdd ? (
                <div style={{ position: "relative" }}>
                  <input
                    value={contactQuery}
                    onChange={(e) => {
                      setContactQuery(e.target.value);
                      setContactId("");
                    }}
                    placeholder="Buscar por nome ou telefone…"
                    style={inputStyle}
                  />
                  {contactQuery && !contactId && (
                    <div
                      style={{
                        position: "absolute",
                        top: 38,
                        left: 0,
                        right: 0,
                        zIndex: 5,
                        background: "var(--bg-surface)",
                        border: "1px solid var(--border-strong)",
                        borderRadius: 6,
                        maxHeight: 220,
                        overflow: "auto",
                        boxShadow: "0 10px 30px rgba(0,0,0,0.18)",
                      }}
                    >
                      {filteredContacts.map((c) => (
                        <button
                          key={c.id}
                          type="button"
                          onClick={() => {
                            setContactId(c.id);
                            setContactQuery(c.name);
                          }}
                          className="flex items-center w-full"
                          style={{
                            gap: 8,
                            padding: "8px 10px",
                            background: "transparent",
                            textAlign: "left",
                          }}
                          onMouseEnter={(e) => (e.currentTarget.style.background = "var(--bg-overlay)")}
                          onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                        >
                          <span style={{ fontSize: 13, fontWeight: 500 }}>{c.name}</span>
                          <span
                            className="font-mono"
                            style={{ fontSize: 11, color: "var(--text-muted)", marginLeft: "auto" }}
                          >
                            {c.phone}
                          </span>
                        </button>
                      ))}
                      <button
                        type="button"
                        onClick={() => {
                          setShowAdd(true);
                          setNewName(contactQuery);
                        }}
                        className="flex items-center w-full"
                        style={{
                          gap: 6,
                          padding: "8px 10px",
                          fontSize: 13,
                          color: "var(--brand-400)",
                          fontWeight: 500,
                          borderTop: "1px solid var(--border)",
                          background: "transparent",
                          textAlign: "left",
                        }}
                      >
                        <Plus size={13} /> Criar novo contato
                      </button>
                    </div>
                  )}
                </div>
              ) : (
                <div className="flex flex-col" style={{ gap: 6 }}>
                  <input
                    value={newName}
                    onChange={(e) => setNewName(e.target.value.slice(0, 100))}
                    placeholder="Nome completo"
                    style={inputStyle}
                  />
                  <input
                    value={newPhone}
                    onChange={(e) => setNewPhone(e.target.value.slice(0, 30))}
                    placeholder="Telefone com DDD"
                    style={inputStyle}
                  />
                  <button
                    type="button"
                    onClick={() => setShowAdd(false)}
                    style={{
                      alignSelf: "flex-start",
                      fontSize: 12,
                      color: "var(--text-muted)",
                      background: "transparent",
                    }}
                  >
                    ← Voltar para busca
                  </button>
                </div>
              )}
            </Field>

            <Field label="Serviço" required>
              <select
                value={serviceId}
                onChange={(e) => setServiceId(e.target.value)}
                style={inputStyle}
              >
                {services.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.emoji} {s.name} · {(s.price_cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })} · {s.duration_minutes}min
                  </option>
                ))}
              </select>
            </Field>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <Field label="Data" required>
                <input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  style={inputStyle}
                />
              </Field>
              <Field label="Horário" required>
                <select value={time} onChange={(e) => setTime(e.target.value)} style={inputStyle}>
                  {timeSlots(15).map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </Field>
            </div>

            <Field label="Agente" required>
              <select
                value={agentId}
                onChange={(e) => setAgentId(e.target.value)}
                style={inputStyle}
              >
                {agents.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="Observações">
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value.slice(0, 500))}
                rows={3}
                placeholder="Notas internas…"
                style={{
                  ...inputStyle,
                  height: "auto",
                  padding: "8px 10px",
                  resize: "vertical",
                  lineHeight: 1.4,
                }}
              />
            </Field>

            <label
              className="flex items-center justify-between"
              style={{
                padding: "10px 12px",
                borderRadius: 8,
                border: "1px solid var(--border)",
                background: "var(--bg-base)",
                cursor: "pointer",
              }}
            >
              <div>
                <div style={{ fontSize: 13, fontWeight: 500 }}>
                  Notificar cliente via WhatsApp
                </div>
                <div style={{ fontSize: 11, color: "var(--text-muted)" }}>
                  Envia mensagem de confirmação automática.
                </div>
              </div>
              <Toggle on={notify} onChange={setNotify} />
            </label>

            {/* preview line */}
            <div
              style={{
                padding: 10,
                borderRadius: 8,
                background: "var(--bg-overlay)",
                fontSize: 12,
                color: "var(--text-muted)",
                fontFamily: "var(--font-mono, ui-monospace)",
              }}
            >
              {starts.toLocaleString("pt-BR", { dateStyle: "medium", timeStyle: "short" })} → {formatHM(ends)} ({dur} min)
            </div>

            {conflict && (
              <div
                className="flex items-center"
                style={{
                  gap: 8,
                  padding: 10,
                  borderRadius: 8,
                  background: "color-mix(in oklab, #EF4444 15%, transparent)",
                  border: "1px solid color-mix(in oklab, #EF4444 35%, transparent)",
                  color: "#EF4444",
                  fontSize: 12,
                }}
              >
                <AlertTriangle size={14} />
                Esse horário já está ocupado para o agente selecionado.
              </div>
            )}
          </div>
        </div>

        <div
          className="flex items-center justify-end"
          style={{
            padding: "12px 16px",
            borderTop: "1px solid var(--border)",
            gap: 8,
          }}
        >
          <button
            type="button"
            onClick={onClose}
            style={{
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
            Cancelar
          </button>
          <button type="submit" className="btn-primary">
            <CheckCircle2 size={14} />
            {initial ? "Salvar alterações" : "Agendar"}
          </button>
        </div>
      </form>
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: "100%",
  height: 36,
  padding: "0 10px",
  fontSize: 13,
  color: "var(--text-primary)",
  background: "var(--bg-base)",
  border: "1px solid var(--border-strong)",
  borderRadius: 6,
  outline: "none",
  fontFamily: "inherit",
};

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col" style={{ gap: 4 }}>
      <span
        style={{
          fontSize: 11,
          color: "var(--text-muted)",
          textTransform: "uppercase",
          letterSpacing: "0.05em",
        }}
      >
        {label}
        {required && <span style={{ color: "#EF4444", marginLeft: 3 }}>*</span>}
      </span>
      {children}
    </label>
  );
}

function Toggle({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      onClick={(e) => {
        e.preventDefault();
        onChange(!on);
      }}
      style={{
        width: 36,
        height: 20,
        borderRadius: 999,
        background: on ? "var(--brand-400)" : "var(--bg-overlay)",
        border: "1px solid var(--border-strong)",
        position: "relative",
        transition: "background 150ms ease",
        flexShrink: 0,
      }}
    >
      <span
        style={{
          position: "absolute",
          top: 1,
          left: on ? 17 : 1,
          width: 16,
          height: 16,
          borderRadius: 999,
          background: "#fff",
          transition: "left 150ms ease",
          boxShadow: "0 1px 3px rgba(0,0,0,0.25)",
        }}
      />
    </button>
  );
}
