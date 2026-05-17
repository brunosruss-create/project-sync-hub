import * as React from "react";
import { X, Check, CalendarDays, Clock, User, MessageCircle, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useWorkspaceOwnerId } from "@/hooks/use-workspace-owner";
import { type ContactCard } from "./data";
import {
  SEED_SERVICES,
  formatCurrencyBRL,
  formatDuration,
  type Service,
} from "@/features/services/data";
import {
  toDateInput,
  fromDateTimeInput,
  formatDateBR,
  formatHM,
  parseDateBR,
  type Appointment,
} from "@/features/schedule/data";
import { utcToZonedLocal, zonedLocalToUtc } from "@/features/schedule/tz";
import { useProfile } from "@/hooks/use-profile";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { listProfessionals } from "@/lib/professionals.functions";
import { notifyAppointmentChange } from "@/lib/appointments.functions";

interface BusyAppt {
  id: string;
  starts_at: string;
  ends_at: string;
  agent_id: string | null;
}

interface Props {
  /** Quando ausente, o modal mostra um picker de contato (uso pela Agenda). */
  contact?: ContactCard | null;
  open: boolean;
  onClose: () => void;
  preselectedServiceIds?: string[];
  /** Modo edição: pré-preenche com dados do agendamento existente. */
  initial?: Appointment | null;
  /** Pré-preenche data/hora/profissional ao criar a partir de clique em célula da agenda. */
  preset?: { starts_at?: Date; agent_id?: string };
  onScheduled?: (info: { startsAt: Date; serviceIds: string[] }) => void;
  /** Disparado após criar OU editar OU cancelar com sucesso. */
  onSubmitted?: () => void;
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
  initial,
  preset,
  onScheduled,
  onSubmitted,
}: Props) {
  const { user } = useAuth();
  const { workspaceOwnerId } = useWorkspaceOwnerId();
  const profileQ = useProfile();
  const tz =
    ((profileQ.data as unknown as { business_timezone?: string } | null)
      ?.business_timezone as string | undefined) || "America/Sao_Paulo";
  const notifyChangeFn = useServerFn(notifyAppointmentChange);

  const showContactPicker = !contact;

  const [services, setServices] = React.useState<Service[]>([]);

  // Carrega serviços reais do banco (fallback para SEED apenas se DB vazio).
  React.useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from("services")
        .select("id,category_id,name,description,price_cents,duration_minutes,emoji,color,status,created_at")
        .eq("status", "active")
        .order("created_at", { ascending: true });
      if (cancelled) return;
      if (error || !data || data.length === 0) {
        setServices(SEED_SERVICES.filter((s) => s.status === "active"));
        return;
      }
      setServices(
        data.map((s: any) => ({
          id: s.id,
          category_id: s.category_id ?? "",
          name: s.name,
          description: s.description ?? "",
          price_cents: s.price_cents ?? 0,
          duration_minutes: s.duration_minutes ?? 30,
          emoji: s.emoji ?? "🔧",
          color: s.color ?? "#25C880",
          status: (s.status ?? "active") as Service["status"],
          created_at: s.created_at ? new Date(s.created_at) : new Date(),
        })),
      );
    })();
    return () => { cancelled = true; };
  }, [open]);

  // Contact picker (quando aberto pela agenda sem contato fixo)
  const [contactList, setContactList] = React.useState<Array<{ id: string; name: string; phone: string }>>([]);
  const [contactQuery, setContactQuery] = React.useState("");
  const [pickedContactId, setPickedContactId] = React.useState<string>("");
  const [showAddContact, setShowAddContact] = React.useState(false);
  const [newContactName, setNewContactName] = React.useState("");
  const [newContactPhone, setNewContactPhone] = React.useState("");

  React.useEffect(() => {
    if (!open || !showContactPicker) return;
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("contacts")
        .select("id,name,phone")
        .order("name");
      if (cancelled) return;
      setContactList((data ?? []) as any);
    })();
    return () => { cancelled = true; };
  }, [open, showContactPicker]);

  const pickedContact = React.useMemo(() => {
    if (contact) return { id: contact.id, name: contact.name, phone: contact.phone };
    if (!pickedContactId) return null;
    return contactList.find((c) => c.id === pickedContactId) ?? null;
  }, [contact, contactList, pickedContactId]);

  const filteredContacts = React.useMemo(() => {
    if (!contactQuery) return contactList.slice(0, 6);
    const q = contactQuery.toLowerCase();
    return contactList
      .filter((c) => c.name.toLowerCase().includes(q) || c.phone.toLowerCase().includes(q))
      .slice(0, 8);
  }, [contactQuery, contactList]);

  const [selected, setSelected] = React.useState<Set<string>>(new Set());
  const [date, setDate] = React.useState<string>(toDateInput(new Date()));
  const [time, setTime] = React.useState<string>("09:00");
  const fetchProfessionals = useServerFn(listProfessionals);
  const profQ = useQuery({
    queryKey: ["professionals"],
    queryFn: () => fetchProfessionals(),
    enabled: open,
    staleTime: 30_000,
  });
  const professionals = profQ.data ?? [];
  const [agentId, setAgentId] = React.useState<string>("");
  React.useEffect(() => {
    if (!agentId && professionals.length > 0) setAgentId(professionals[0].id);
  }, [professionals, agentId]);
  const [notes, setNotes] = React.useState("");
  const [notifyWa, setNotifyWa] = React.useState(true);
  const [submitting, setSubmitting] = React.useState(false);
  const [dateInput, setDateInput] = React.useState<string>(formatDateBR(toDateInput(new Date())));
  const [dateError, setDateError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState<BusyAppt[]>([]);
  const [calendarOpen, setCalendarOpen] = React.useState(false);

  // Reset / prefill ao abrir
  React.useEffect(() => {
    if (!open) return;
    setSubmitting(false);
    setDateError(null);
    setNewContactName("");
    setNewContactPhone("");
    setShowAddContact(false);

    if (initial) {
      const iso = toDateInput(initial.starts_at);
      setDate(iso);
      setDateInput(formatDateBR(iso));
      setTime(formatHM(initial.starts_at));
      setAgentId(initial.agent_id || "");
      setNotes(initial.notes || "");
      setNotifyWa(!!initial.notify_whatsapp);
      setContactQuery("");
      setPickedContactId(initial.contact_id || "");
    } else {
      const baseDate = preset?.starts_at ?? new Date();
      const iso = toDateInput(baseDate);
      setDate(iso);
      setDateInput(formatDateBR(iso));
      if (preset?.starts_at) {
        const h = String(baseDate.getHours()).padStart(2, "0");
        const m = String(baseDate.getMinutes() < 30 ? 0 : 30).padStart(2, "0");
        setTime(`${h}:${m}`);
      } else {
        setTime("09:00");
      }
      setAgentId(preset?.agent_id || "");
      setNotes("");
      setNotifyWa(true);
      setContactQuery("");
      setPickedContactId("");
      setSelected(new Set(preselectedServiceIds ?? []));
    }
  }, [open, initial, preset, preselectedServiceIds]);

  // Em modo edição: carrega serviços vinculados via appointment_services.
  React.useEffect(() => {
    if (!open || !initial?.id) return;
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("appointment_services")
        .select("service_id")
        .eq("appointment_id", initial.id);
      if (cancelled) return;
      const ids = (data ?? []).map((r: any) => r.service_id).filter(Boolean);
      if (ids.length > 0) setSelected(new Set(ids));
      else if (initial.service_id) setSelected(new Set([initial.service_id]));
    })();
    return () => { cancelled = true; };
  }, [open, initial?.id, initial?.service_id]);

  React.useEffect(() => {
    if (!open || !user?.id || !date) return;
    const [y, mo, da] = date.split("-").map(Number);
    const dayStart = new Date(y, (mo ?? 1) - 1, da ?? 1, 0, 0, 0, 0);
    const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60_000);
    let cancelled = false;
    const load = async () => {
      const { data, error } = await supabase
        .from("appointments")
        .select("id, starts_at, ends_at, agent_id, status")
        .eq("owner_user_id", workspaceOwnerId)
        .gte("starts_at", dayStart.toISOString())
        .lt("starts_at", dayEnd.toISOString())
        .neq("status", "cancelled");
      if (cancelled) return;
      if (error) {
        console.warn("[schedule-modal] busy fetch:", error.message);
        setBusy([]);
        return;
      }
      setBusy((data ?? []) as BusyAppt[]);
    };
    load();
    const ch = supabase
      .channel(`schedule-modal-busy-${date}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "appointments" }, () => load())
      .subscribe();
    return () => {
      cancelled = true;
      supabase.removeChannel(ch);
    };
  }, [open, user?.id, date, workspaceOwnerId]);

  const selectedServices = services.filter((s) => selected.has(s.id));
  const totalMin = selectedServices.reduce((a, s) => a + s.duration_minutes, 0);
  const totalCents = selectedServices.reduce((a, s) => a + s.price_cents, 0);
  const blockMin = Math.max(totalMin, 30);

  const slotState = React.useMemo(() => {
    const map = new Map<string, { busy: boolean; past: boolean }>();
    const now = Date.now();
    for (const slot of SLOTS) {
      const start = fromDateTimeInput(date, slot);
      const end = new Date(start.getTime() + blockMin * 60_000);
      const past = start.getTime() < now;
      const isBusy = busy.some((b) => {
        if (b.id === initial?.id) return false;
        if (b.agent_id !== agentId) return false;
        const bs = new Date(b.starts_at).getTime();
        const be = new Date(b.ends_at).getTime();
        return start.getTime() < be && bs < end.getTime();
      });
      map.set(slot, { busy: isBusy, past });
    }
    return map;
  }, [busy, agentId, date, blockMin, initial?.id]);

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
    const firstName = (pickedContact?.name ?? "cliente").split(" ")[0];
    return `Olá ${firstName}! Seu agendamento foi confirmado para ${dateStr} às ${time}. Serviços: ${list}. Até lá! 👋`;
  }, [date, time, selectedServices, pickedContact]);

  const currentSlotState = slotState.get(time);
  const slotUnavailable = !!(currentSlotState?.busy || currentSlotState?.past);
  const canSubmit =
    selectedServices.length > 0 &&
    !!date &&
    !!time &&
    !!agentId &&
    (!!pickedContact || (showAddContact && !!newContactName.trim())) &&
    !submitting &&
    !dateError &&
    !slotUnavailable;

  const ensureContact = async (): Promise<{ id: string; name: string; phone: string } | null> => {
    if (pickedContact) return pickedContact;
    if (showAddContact && newContactName.trim()) {
      const { data, error } = await supabase
        .from("contacts")
        .insert({
          owner_user_id: workspaceOwnerId,
          name: newContactName.trim(),
          phone: newContactPhone.trim(),
          kanban_column: "scheduled",
        })
        .select("id,name,phone")
        .single();
      if (error || !data) {
        toast.error(`Não foi possível criar contato: ${error?.message ?? "erro desconhecido"}`);
        return null;
      }
      return data as any;
    }
    return null;
  };

  const submit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);

    if (!user?.id) {
      toast.error("Sessão expirada. Faça login novamente.");
      setSubmitting(false);
      return;
    }

    const ctc = await ensureContact();
    if (!ctc) {
      setSubmitting(false);
      return;
    }

    const localStart = fromDateTimeInput(date, time);
    const localEnd = new Date(localStart.getTime() + Math.max(totalMin, 30) * 60_000);
    const startsAtUtc = zonedLocalToUtc(localStart, tz);
    const endsAtUtc = zonedLocalToUtc(localEnd, tz);
    const dateStr = localStart.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
    const sysContent = `Agendado para ${dateStr} às ${time} — ${selectedServices.map((s) => s.name).join(", ")}`;

    let conflictQ = supabase
      .from("appointments")
      .select("id, starts_at, ends_at")
      .eq("owner_user_id", workspaceOwnerId)
      .eq("agent_id", agentId)
      .neq("status", "cancelled")
      .lt("starts_at", endsAtUtc.toISOString())
      .gt("ends_at", startsAtUtc.toISOString());
    if (initial?.id) conflictQ = conflictQ.neq("id", initial.id);
    const { data: conflictRows } = await conflictQ;
    if (conflictRows && conflictRows.length > 0) {
      toast.error("Esse horário ficou indisponível, escolha outro.");
      setSubmitting(false);
      return;
    }

    const selectedIds = selectedServices.map((s) => s.id);
    if (selectedIds.length) {
      const { data: existing } = await supabase
        .from("services")
        .select("id")
        .in("id", selectedIds);
      const existingIds = new Set((existing ?? []).map((r: any) => r.id));
      const missing = selectedIds.filter((id) => !existingIds.has(id));
      if (missing.length) {
        toast.error("Cadastre serviços em /servicos antes de agendar.");
        setSubmitting(false);
        return;
      }
    }

    let apptId: string;
    let previousStartsAtUtcIso: string | null = null;

    if (initial?.id) {
      previousStartsAtUtcIso = zonedLocalToUtc(initial.starts_at, tz).toISOString();
      const { error: updErr } = await supabase
        .from("appointments")
        .update({
          contact_id: ctc.id,
          agent_id: agentId,
          professional_id: agentId,
          service_id: selectedServices[0]?.id ?? null,
          starts_at: startsAtUtc.toISOString(),
          ends_at: endsAtUtc.toISOString(),
          notes,
          notify_whatsapp: notifyWa,
        })
        .eq("id", initial.id);
      if (updErr) {
        console.error("[schedule-modal] update falhou:", updErr);
        toast.error(`Não foi possível atualizar: ${updErr.message}`);
        setSubmitting(false);
        return;
      }
      apptId = initial.id;

      await supabase.from("appointment_services").delete().eq("appointment_id", apptId);
      if (selectedServices.length) {
        await supabase.from("appointment_services").insert(
          selectedServices.map((s) => ({
            appointment_id: apptId,
            owner_user_id: workspaceOwnerId,
            service_id: s.id,
            price_cents: s.price_cents,
            duration_minutes: s.duration_minutes,
          })),
        );
      }
    } else {
      const { data: appt, error: apptErr } = await supabase
        .from("appointments")
        .insert({
          owner_user_id: workspaceOwnerId,
          contact_id: ctc.id,
          agent_id: agentId,
          professional_id: agentId,
          service_id: selectedServices[0]?.id ?? null,
          starts_at: startsAtUtc.toISOString(),
          ends_at: endsAtUtc.toISOString(),
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
      apptId = appt.id;

      if (selectedServices.length) {
        const { error: svcErr } = await supabase.from("appointment_services").insert(
          selectedServices.map((s) => ({
            appointment_id: apptId,
            owner_user_id: workspaceOwnerId,
            service_id: s.id,
            price_cents: s.price_cents,
            duration_minutes: s.duration_minutes,
          })),
        );
        if (svcErr) {
          console.error("[schedule-modal] services snapshot falhou:", svcErr);
          await supabase.from("appointments").delete().eq("id", apptId);
          toast.error(`Não foi possível salvar os serviços: ${svcErr.message}`);
          setSubmitting(false);
          return;
        }
      }

      await supabase
        .from("contacts")
        .update({ kanban_column: "scheduled" })
        .eq("id", ctc.id);

      await supabase.from("messages").insert({
        owner_user_id: workspaceOwnerId,
        contact_id: ctc.id,
        direction: "system",
        content: sysContent,
        message_type: "system",
        status: "sent",
        sent_by: user?.id ?? null,
      });
    }

    const kind: "created" | "rescheduled" = initial?.id
      ? previousStartsAtUtcIso && previousStartsAtUtcIso !== startsAtUtc.toISOString()
        ? "rescheduled"
        : "created"
      : "created";
    const shouldNotify = !initial?.id || kind === "rescheduled";
    if (shouldNotify) {
      void notifyChangeFn({
        data: {
          appointmentId: apptId,
          kind,
          ...(kind === "rescheduled" && previousStartsAtUtcIso
            ? { previousStartsAt: previousStartsAtUtcIso }
            : {}),
        },
      }).catch((e) => console.warn("[schedule-modal] notify falhou:", e));
    }

    toast.success(
      initial?.id
        ? `Agendamento atualizado! 📅 ${dateStr} às ${time}`
        : `Agendamento criado! 📅 ${dateStr} às ${time}`,
    );
    if (typeof window !== "undefined") {
      window.dispatchEvent(
        new CustomEvent("zf:appointment-created", {
          detail: {
            id: apptId,
            contact_id: ctc.id,
            agent_id: agentId,
            professional_id: agentId,
            service_id: selectedServices[0]?.id ?? null,
            starts_at: startsAtUtc.toISOString(),
            ends_at: endsAtUtc.toISOString(),
            status: "scheduled",
            notes,
            notify_whatsapp: notifyWa,
          },
        }),
      );
    }
    onScheduled?.({ startsAt: localStart, serviceIds: selectedServices.map((s) => s.id) });
    onSubmitted?.();
    onClose();
  };

  const handleCancelAppointment = async () => {
    if (!initial?.id) return;
    if (!confirm("Cancelar este agendamento? O horário voltará a ficar disponível.")) return;
    setSubmitting(true);
    const { error } = await supabase
      .from("appointments")
      .update({ status: "cancelled" })
      .eq("id", initial.id);
    if (error) {
      toast.error(`Falha ao cancelar: ${error.message}`);
      setSubmitting(false);
      return;
    }
    void notifyChangeFn({ data: { appointmentId: initial.id, kind: "cancelled" } }).catch(
      (e) => console.warn("[schedule-modal] notify cancel falhou:", e),
    );
    toast.success("Agendamento cancelado.");
    onSubmitted?.();
    onClose();
  };

  const handleDeleteAppointment = async () => {
    if (!initial?.id) return;
    if (!confirm("Excluir este agendamento permanentemente?")) return;
    setSubmitting(true);
    await supabase.from("appointment_services").delete().eq("appointment_id", initial.id);
    const { error } = await supabase.from("appointments").delete().eq("id", initial.id);
    if (error) {
      toast.error(`Falha ao excluir: ${error.message}`);
      setSubmitting(false);
      return;
    }
    toast.success("Agendamento excluído.");
    onSubmitted?.();
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
          <FieldGroup label="Data (DD/MM/AAAA)" icon={<CalendarDays size={12} />}>
            <div style={{ position: "relative" }}>
              <input
                type="text"
                inputMode="numeric"
                placeholder="DD/MM/AAAA"
                value={dateInput}
                onChange={(e) => {
                  let v = e.target.value.replace(/[^\d/]/g, "");
                  const digits = v.replace(/\D/g, "").slice(0, 8);
                  if (digits.length >= 5) v = `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
                  else if (digits.length >= 3) v = `${digits.slice(0, 2)}/${digits.slice(2)}`;
                  else v = digits;
                  setDateInput(v);
                  const iso = parseDateBR(v);
                  if (iso) {
                    setDate(iso);
                    setDateError(null);
                  } else if (v.length === 10) {
                    setDateError("Data inválida");
                  } else {
                    setDateError(null);
                  }
                }}
                style={{
                  ...inputStyle,
                  paddingRight: 36,
                  borderColor: dateError ? "var(--danger, #EF4444)" : "var(--border-strong)",
                }}
              />
              <button
                type="button"
                aria-label="Abrir calendário"
                onClick={() => setCalendarOpen((v) => !v)}
                style={{
                  position: "absolute",
                  right: 4,
                  top: 4,
                  width: 26,
                  height: 26,
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  borderRadius: 4,
                  border: "none",
                  background: "transparent",
                  color: "var(--text-muted)",
                  cursor: "pointer",
                }}
              >
                <CalendarDays size={14} />
              </button>
              {calendarOpen && (
                <MiniCalendar
                  valueIso={date}
                  onSelect={(iso) => {
                    setDate(iso);
                    setDateInput(formatDateBR(iso));
                    setDateError(null);
                    setCalendarOpen(false);
                  }}
                  onClose={() => setCalendarOpen(false)}
                />
              )}
            </div>
            {dateError && (
              <span style={{ fontSize: 11, color: "var(--danger, #EF4444)" }}>{dateError}</span>
            )}
          </FieldGroup>


          {/* Time slots */}
          <FieldGroup
            label="Horário"
            icon={<Clock size={12} />}
            hint={busy.filter((b) => b.agent_id === agentId).length > 0 ? "Riscado = ocupado" : undefined}
          >
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
                const st = slotState.get(slot);
                const disabled = !!(st?.busy || st?.past);
                return (
                  <button
                    key={slot}
                    type="button"
                    onClick={() => !disabled && setTime(slot)}
                    disabled={disabled}
                    title={
                      st?.busy ? "Ocupado" : st?.past ? "Horário passado" : undefined
                    }
                    style={{
                      height: 28,
                      borderRadius: 4,
                      border: "1px solid",
                      borderColor: on ? "var(--brand-400)" : "var(--border)",
                      background: on
                        ? "color-mix(in oklab, var(--brand-400) 18%, var(--bg-surface))"
                        : disabled
                          ? "var(--bg-overlay)"
                          : "var(--bg-base)",
                      color: on
                        ? "var(--brand-400)"
                        : disabled
                          ? "var(--text-muted)"
                          : "var(--text-primary)",
                      fontSize: 11,
                      fontWeight: on ? 600 : 500,
                      fontFamily: "ui-monospace, monospace",
                      textDecoration: disabled ? "line-through" : "none",
                      cursor: disabled ? "not-allowed" : "pointer",
                      opacity: disabled ? 0.6 : 1,
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
              {professionals.length === 0 ? (
                <option value="">Nenhum profissional cadastrado</option>
              ) : (
                professionals.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))
              )}
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

function MiniCalendar({
  valueIso,
  onSelect,
  onClose,
}: {
  valueIso: string;
  onSelect: (iso: string) => void;
  onClose: () => void;
}) {
  const ref = React.useRef<HTMLDivElement>(null);
  const initial = React.useMemo(() => {
    const m = valueIso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (m) return new Date(parseInt(m[1]), parseInt(m[2]) - 1, parseInt(m[3]));
    return new Date();
  }, [valueIso]);
  const [view, setView] = React.useState<{ y: number; m: number }>({
    y: initial.getFullYear(),
    m: initial.getMonth(),
  });

  React.useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  const first = new Date(view.y, view.m, 1);
  const startDow = (first.getDay() + 6) % 7; // Monday-first
  const daysInMonth = new Date(view.y, view.m + 1, 0).getDate();
  const today = new Date();
  const todayIso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
  const cells: Array<number | null> = [];
  for (let i = 0; i < startDow; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);

  const monthLabel = new Date(view.y, view.m, 1).toLocaleDateString("pt-BR", {
    month: "long",
    year: "numeric",
  });
  const dows = ["S", "T", "Q", "Q", "S", "S", "D"];

  const navMonth = (delta: number) => {
    setView((v) => {
      const nm = v.m + delta;
      const ny = v.y + Math.floor(nm / 12);
      const nmm = ((nm % 12) + 12) % 12;
      return { y: ny, m: nmm };
    });
  };

  return (
    <div
      ref={ref}
      style={{
        position: "absolute",
        top: 40,
        right: 0,
        zIndex: 80,
        background: "var(--bg-surface)",
        border: "1px solid var(--border)",
        borderRadius: 8,
        boxShadow: "0 12px 30px rgba(0,0,0,0.4)",
        padding: 10,
        width: 240,
      }}
    >
      <div className="flex items-center justify-between" style={{ marginBottom: 6 }}>
        <button
          type="button"
          onClick={() => navMonth(-1)}
          style={{ width: 24, height: 24, borderRadius: 4, border: "none", background: "transparent", color: "var(--text-primary)", cursor: "pointer" }}
        >
          ‹
        </button>
        <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text-primary)", textTransform: "capitalize" }}>
          {monthLabel}
        </span>
        <button
          type="button"
          onClick={() => navMonth(1)}
          style={{ width: 24, height: 24, borderRadius: 4, border: "none", background: "transparent", color: "var(--text-primary)", cursor: "pointer" }}
        >
          ›
        </button>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 2 }}>
        {dows.map((d, i) => (
          <span key={i} style={{ fontSize: 10, color: "var(--text-muted)", textAlign: "center", padding: "2px 0" }}>
            {d}
          </span>
        ))}
        {cells.map((d, i) => {
          if (d === null) return <span key={i} />;
          const iso = `${view.y}-${String(view.m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
          const isSelected = iso === valueIso;
          const isToday = iso === todayIso;
          return (
            <button
              key={i}
              type="button"
              onClick={() => onSelect(iso)}
              style={{
                height: 26,
                borderRadius: 4,
                border: isToday ? "1px solid var(--brand-400)" : "1px solid transparent",
                background: isSelected ? "var(--brand-400)" : "transparent",
                color: isSelected ? "#fff" : "var(--text-primary)",
                fontSize: 11,
                fontWeight: isSelected ? 600 : 500,
                cursor: "pointer",
              }}
            >
              {d}
            </button>
          );
        })}
      </div>
    </div>
  );
}
