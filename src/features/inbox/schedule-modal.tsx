import * as React from "react";
import { X, Check, CalendarDays, Clock, User, MessageCircle } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { type ContactCard } from "./data";
import {
  SEED_SERVICES,
  formatCurrencyBRL,
  formatDuration,
  type Service,
} from "@/features/services/data";
import { MOCK_AGENTS, toDateInput, fromDateTimeInput } from "@/features/schedule/data";

interface Props {
  contact: ContactCard;
  open: boolean;
  onClose: () => void;
  preselectedServiceIds?: string[];
  onScheduled?: (info: { startsAt: Date; serviceIds: string[] }) => void;
}

const SLOTS: string[] = (() => {
  const out: string[] = [];
  for (let h = 8; h < 20; h++) {
    out.push(`${String(h).padStart(2, "0")}:00`);
    out.push(`${String(h).padStart(2, "0")}:30`);
  }
  return out;
})();

export function ScheduleModal({
  contact,
  open,
  onClose,
  preselectedServiceIds,
  onScheduled,
}: Props) {
  const { user } = useAuth();
  const [services] = React.useState<Service[]>(SEED_SERVICES.filter((s) => s.status === "active"));
  const [selected, setSelected] = React.useState<Set<string>>(new Set());
  const [date, setDate] = React.useState<string>(toDateInput(new Date()));
  const [time, setTime] = React.useState<string>("09:00");
  const [agentId, setAgentId] = React.useState<string>(MOCK_AGENTS[0]?.id ?? "");
  const [notes, setNotes] = React.useState("");
  const [notifyWa, setNotifyWa] = React.useState(true);
  const [submitting, setSubmitting] = React.useState(false);

  React.useEffect(() => {
    if (!open) return;
    setSelected(new Set(preselectedServiceIds ?? []));
    setDate(toDateInput(new Date()));
    setTime("09:00");
    setNotes("");
    setNotifyWa(true);
    setSubmitting(false);
  }, [open, preselectedServiceIds]);

  const selectedServices = services.filter((s) => selected.has(s.id));
  const totalMin = selectedServices.reduce((a, s) => a + s.duration_minutes, 0);
  const totalCents = selectedServices.reduce((a, s) => a + s.price_cents, 0);

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const previewMessage = React.useMemo(() => {
    const dt = fromDateTimeInput(date, time);
    const dateStr = dt.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
    const list = selectedServices.map((s) => s.name).join(", ") || "—";
    return `Olá ${contact.name.split(" ")[0]}! Seu agendamento foi confirmado para ${dateStr} às ${time}. Serviços: ${list}. Até lá! 👋`;
  }, [date, time, selectedServices, contact.name]);

  const canSubmit = selectedServices.length > 0 && !!date && !!time && !!agentId && !submitting;

  const submit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    const startsAt = fromDateTimeInput(date, time);
    const endsAt = new Date(startsAt.getTime() + Math.max(totalMin, 30) * 60_000);
    const dateStr = startsAt.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
    const sysContent = `Agendado para ${dateStr} às ${time} — ${selectedServices.map((s) => s.name).join(", ")}`;

    // 1. Insert appointment (RLS exige owner_user_id)
    if (!user?.id) {
      toast.error("Sessão expirada. Faça login novamente.");
      setSubmitting(false);
      return;
    }
    const { data: appt, error: apptErr } = await supabase
      .from("appointments")
      .insert({
        owner_user_id: user.id,
        contact_id: contact.id,
        agent_id: agentId,
        service_id: selectedServices[0]?.id ?? null,
        starts_at: startsAt.toISOString(),
        ends_at: endsAt.toISOString(),
        status: "scheduled",
        notes,
        notify_whatsapp: notifyWa,
      })
      .select("id")
      .single();

    if (apptErr || !appt) {
      console.error("[schedule-modal] erro ao criar appointment:", apptErr);
      toast.error(`Não foi possível agendar: ${apptErr?.message ?? "erro desconhecido"}`);
      setSubmitting(false);
      return;
    }

    // 2. Insert appointment_services snapshot
    const { error: svcErr } = await supabase.from("appointment_services").insert(
      selectedServices.map((s) => ({
        appointment_id: appt.id,
        owner_user_id: user.id,
        service_id: s.id,
        price_cents: s.price_cents,
        duration_minutes: s.duration_minutes,
      })),
    );
    if (svcErr) console.warn("[schedule-modal] services snapshot:", svcErr.message);

    // 3. Move kanban column
    const { error: updErr } = await supabase
      .from("contacts")
      .update({ kanban_column: "scheduled" })
      .eq("id", contact.id);
    if (updErr) console.warn("[schedule-modal] contact update ignorado:", updErr.message);

    // 4. System message in chat
    await supabase.from("messages").insert({
      owner_user_id: user?.id ?? null,
      contact_id: contact.id,
      direction: "system",
      content: sysContent,
      message_type: "system",
      status: "sent",
      sent_by: user?.id ?? null,
    });

    // 5. Outbound confirmation message (intent)
    if (notifyWa) {
      await supabase.from("messages").insert({
        owner_user_id: user?.id ?? null,
        contact_id: contact.id,
        direction: "outbound",
        content: previewMessage,
        message_type: "text",
        status: "sent",
        sent_by: user?.id ?? null,
      });
    }

    toast.success(`Agendamento criado! 📅 ${dateStr} às ${time}`);
    if (typeof window !== "undefined") {
      window.dispatchEvent(
        new CustomEvent("zf:appointment-created", {
          detail: {
            id: appt.id,
            contact_id: contact.id,
            agent_id: agentId,
            service_id: selectedServices[0]?.id ?? null,
            starts_at: startsAt.toISOString(),
            ends_at: endsAt.toISOString(),
            status: "scheduled",
            notes,
            notify_whatsapp: notifyWa,
          },
        }),
      );
    }
    onScheduled?.({ startsAt, serviceIds: selectedServices.map((s) => s.id) });
    onClose();
  };

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Agendar atendimento"
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.55)",
        zIndex: 70,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
        animation: "fadeSlideIn 150ms ease-out",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "100%",
          maxWidth: 480,
          maxHeight: "90vh",
          background: "var(--bg-surface)",
          border: "1px solid var(--border)",
          borderRadius: 12,
          boxShadow: "0 30px 80px rgba(0,0,0,0.5)",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between"
          style={{ padding: "14px 16px", borderBottom: "1px solid var(--border)" }}
        >
          <div>
            <div style={{ fontSize: 11, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.04em" }}>
              📅 Novo agendamento
            </div>
            <div style={{ fontSize: 14, fontWeight: 600, color: "var(--text-primary)", marginTop: 2 }}>
              {contact.name}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar"
            className="inline-flex items-center justify-center"
            style={{ width: 30, height: 30, borderRadius: 6, color: "var(--text-muted)", background: "transparent" }}
          >
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto" style={{ padding: 16, display: "flex", flexDirection: "column", gap: 16 }}>
          {/* Services */}
          <FieldGroup label="Serviços" hint={`${selectedServices.length} selecionado(s) · ${formatDuration(totalMin)} · ${formatCurrencyBRL(totalCents)}`}>
            <div className="flex flex-col" style={{ gap: 6, maxHeight: 200, overflowY: "auto" }}>
              {services.map((s) => {
                const on = selected.has(s.id);
                return (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => toggle(s.id)}
                    className="flex items-center w-full"
                    style={{
                      gap: 10,
                      padding: "8px 10px",
                      borderRadius: 6,
                      border: on
                        ? "1px solid color-mix(in oklab, var(--brand-400) 60%, transparent)"
                        : "1px solid var(--border)",
                      background: on
                        ? "color-mix(in oklab, var(--brand-400) 10%, var(--bg-surface))"
                        : "var(--bg-base)",
                      textAlign: "left",
                    }}
                  >
                    <span
                      className="inline-flex items-center justify-center shrink-0"
                      style={{
                        width: 16,
                        height: 16,
                        borderRadius: 4,
                        border: "1.5px solid",
                        borderColor: on ? "var(--brand-400)" : "var(--border-strong)",
                        background: on ? "var(--brand-400)" : "transparent",
                        color: "#fff",
                      }}
                    >
                      {on && <Check size={10} />}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div style={{ fontSize: 13, fontWeight: 500, color: "var(--text-primary)" }}>{s.name}</div>
                      <div style={{ fontSize: 11, color: "var(--text-muted)" }}>{formatDuration(s.duration_minutes)}</div>
                    </div>
                    <div className="font-mono" style={{ fontSize: 12, color: "var(--text-primary)" }}>
                      {formatCurrencyBRL(s.price_cents)}
                    </div>
                  </button>
                );
              })}
            </div>
          </FieldGroup>

          {/* Date */}
          <FieldGroup label="Data" icon={<CalendarDays size={12} />}>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              style={inputStyle}
            />
          </FieldGroup>

          {/* Time slots */}
          <FieldGroup label="Horário" icon={<Clock size={12} />}>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(6, 1fr)",
                gap: 4,
                maxHeight: 140,
                overflowY: "auto",
              }}
            >
              {SLOTS.map((slot) => {
                const on = slot === time;
                return (
                  <button
                    key={slot}
                    type="button"
                    onClick={() => setTime(slot)}
                    style={{
                      height: 28,
                      borderRadius: 4,
                      border: "1px solid",
                      borderColor: on ? "var(--brand-400)" : "var(--border)",
                      background: on
                        ? "color-mix(in oklab, var(--brand-400) 18%, var(--bg-surface))"
                        : "var(--bg-base)",
                      color: on ? "var(--brand-400)" : "var(--text-primary)",
                      fontSize: 11,
                      fontWeight: on ? 600 : 500,
                      fontFamily: "ui-monospace, monospace",
                    }}
                  >
                    {slot}
                  </button>
                );
              })}
            </div>
          </FieldGroup>

          {/* Agent */}
          <FieldGroup label="Profissional" icon={<User size={12} />}>
            <select value={agentId} onChange={(e) => setAgentId(e.target.value)} style={inputStyle}>
              {MOCK_AGENTS.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </FieldGroup>

          {/* Notes */}
          <FieldGroup label="Observações">
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              placeholder="Algum detalhe importante…"
              style={{ ...inputStyle, resize: "vertical", lineHeight: 1.4, fontFamily: "inherit" }}
            />
          </FieldGroup>

          {/* Notify WA */}
          <div className="flex flex-col" style={{ gap: 8 }}>
            <label
              className="flex items-center"
              style={{ gap: 8, cursor: "pointer", fontSize: 13, color: "var(--text-primary)" }}
            >
              <input type="checkbox" checked={notifyWa} onChange={(e) => setNotifyWa(e.target.checked)} />
              <MessageCircle size={14} style={{ color: "var(--brand-400)" }} />
              Notificar pelo WhatsApp
            </label>
            {notifyWa && (
              <div
                style={{
                  fontSize: 12,
                  color: "var(--text-muted)",
                  background: "var(--bg-overlay)",
                  border: "1px solid var(--border)",
                  borderRadius: 6,
                  padding: 10,
                  lineHeight: 1.5,
                  whiteSpace: "pre-wrap",
                }}
              >
                {previewMessage}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div
          className="flex items-center justify-end"
          style={{ gap: 8, padding: 12, borderTop: "1px solid var(--border)" }}
        >
          <button
            type="button"
            onClick={onClose}
            style={{
              height: 34,
              padding: "0 14px",
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
          <button
            type="button"
            onClick={submit}
            disabled={!canSubmit}
            className="inline-flex items-center"
            style={{
              gap: 6,
              height: 34,
              padding: "0 14px",
              borderRadius: 6,
              border: "none",
              background: "var(--brand-400)",
              color: "#fff",
              fontSize: 13,
              fontWeight: 600,
              opacity: canSubmit ? 1 : 0.5,
              cursor: canSubmit ? "pointer" : "not-allowed",
            }}
          >
            📅 Confirmar Agendamento
          </button>
        </div>
      </div>
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: "100%",
  height: 34,
  padding: "0 10px",
  background: "var(--bg-base)",
  border: "1px solid var(--border-strong)",
  borderRadius: 6,
  color: "var(--text-primary)",
  fontSize: 13,
  outline: "none",
};

function FieldGroup({
  label,
  hint,
  icon,
  children,
}: {
  label: string;
  hint?: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col" style={{ gap: 6 }}>
      <div className="flex items-center justify-between">
        <span
          className="inline-flex items-center"
          style={{
            gap: 4,
            fontSize: 11,
            color: "var(--text-muted)",
            textTransform: "uppercase",
            letterSpacing: "0.05em",
          }}
        >
          {icon}
          {label}
        </span>
        {hint && (
          <span style={{ fontSize: 11, color: "var(--text-muted)" }}>{hint}</span>
        )}
      </div>
      {children}
    </div>
  );
}
