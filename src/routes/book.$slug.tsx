import * as React from "react";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/book/$slug")({
  component: BookPage,
  head: () => ({
    meta: [
      { title: "Agendar horário" },
      { name: "description", content: "Agende seu horário online." },
      { name: "viewport", content: "width=device-width, initial-scale=1, maximum-scale=1" },
    ],
  }),
});

type Service = {
  id: string;
  name: string;
  description: string | null;
  price_cents: number;
  duration_minutes: number;
  color: string | null;
};
type Professional = {
  id: string;
  name: string;
  role: string | null;
  avatar_url: string | null;
  avatar_color: string | null;
};
type Info = {
  profile: {
    business_name: string | null;
    business_description: string | null;
    business_logo_url: string | null;
    booking_title: string | null;
    booking_description: string | null;
    has_multiple_professionals: boolean;
    business_timezone: string;
    working_hours: Record<string, { active?: boolean; enabled?: boolean; start: string; end: string }> | null;
  };
  services: Service[];
  professionals: Professional[];
};
type Slot = { time: string; available: boolean };

const DAY_KEYS_TO_IDX: Record<string, number> = {
  sun: 0, sunday: 0, dom: 0, domingo: 0,
  mon: 1, monday: 1, seg: 1, segunda: 1,
  tue: 2, tuesday: 2, ter: 2, terca: 2, "terça": 2,
  wed: 3, wednesday: 3, qua: 3, quarta: 3,
  thu: 4, thursday: 4, qui: 4, quinta: 4,
  fri: 5, friday: 5, sex: 5, sexta: 5,
  sat: 6, saturday: 6, sab: 6, "sábado": 6, sabado: 6,
};

function formatBRL(cents: number): string {
  return (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function formatDateLong(date: Date): string {
  return date.toLocaleDateString("pt-BR", {
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
}

function pad(n: number) { return String(n).padStart(2, "0"); }
function toYmd(d: Date) { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }

function BookPage() {
  const { slug } = Route.useParams();
  const [info, setInfo] = React.useState<Info | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [notFound, setNotFound] = React.useState(false);

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch(`/api/public/book/${slug}?action=info`);
        if (r.status === 404) { if (!cancelled) setNotFound(true); return; }
        const data = await r.json();
        if (!cancelled) setInfo(data);
      } catch {
        if (!cancelled) setNotFound(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [slug]);

  if (loading) {
    return <Shell><div style={{ padding: 40, textAlign: "center", color: "var(--text-muted)" }}>Carregando…</div></Shell>;
  }
  if (notFound || !info) {
    return (
      <Shell>
        <div style={{ padding: 48, textAlign: "center" }}>
          <h1 style={{ fontSize: 22, marginBottom: 8 }}>Página não encontrada</h1>
          <p style={{ color: "var(--text-muted)" }}>O link de agendamento que você acessou não existe ou está desativado.</p>
        </div>
      </Shell>
    );
  }
  return <Wizard slug={slug} info={info} />;
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ minHeight: "100vh", background: "var(--bg-base)", color: "var(--text-primary)" }}>
      <div style={{ maxWidth: 560, margin: "0 auto", padding: "24px 16px 64px" }}>
        {children}
      </div>
    </div>
  );
}

function Wizard({ slug, info }: { slug: string; info: Info }) {
  const visibleProfessionals = info.professionals;
  const askProfessional =
    info.profile.has_multiple_professionals && visibleProfessionals.length > 1;
  const totalSteps = askProfessional ? 4 : 3;

  const [step, setStep] = React.useState(1);
  const [serviceId, setServiceId] = React.useState<string>("");
  const [professionalId, setProfessionalId] = React.useState<string>(
    askProfessional ? "" : (visibleProfessionals[0]?.id ?? ""),
  );
  const [date, setDate] = React.useState<string>("");
  const [time, setTime] = React.useState<string>("");
  const [clientName, setClientName] = React.useState("");
  const [clientPhone, setClientPhone] = React.useState("");
  const [notes, setNotes] = React.useState("");
  const [submitting, setSubmitting] = React.useState(false);
  const [success, setSuccess] = React.useState<{ appointmentId: string } | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  const service = info.services.find((s) => s.id === serviceId) ?? null;
  const professional = visibleProfessionals.find((p) => p.id === professionalId) ?? null;

  // Mapeia step (1..totalSteps) → conteúdo. Quando askProfessional=false, etapa "Profissional" é pulada.
  const stepKey = (() => {
    if (step === 1) return "service" as const;
    if (askProfessional && step === 2) return "professional" as const;
    if (step === (askProfessional ? 3 : 2)) return "datetime" as const;
    return "client" as const;
  })();

  const canNext = (() => {
    if (stepKey === "service") return !!serviceId;
    if (stepKey === "professional") return !!professionalId;
    if (stepKey === "datetime") return !!date && !!time;
    return clientName.trim().length > 0 && clientPhone.replace(/\D/g, "").length >= 10;
  })();

  if (success) {
    return (
      <Shell>
        <Header info={info} />
        <div style={card}>
          <div style={{ fontSize: 42, textAlign: "center" }}>✅</div>
          <h2 style={{ fontSize: 20, textAlign: "center", margin: "8px 0 16px" }}>Agendamento confirmado!</h2>
          <p style={{ textAlign: "center", color: "var(--text-muted)", marginBottom: 16 }}>
            {info.profile.business_name ?? "Estabelecimento"} aguarda você em:
          </p>
          <Summary
            service={service}
            professional={professional}
            date={date}
            time={time}
          />
          <p style={{ textAlign: "center", color: "var(--text-muted)", fontSize: 13, marginTop: 16 }}>
            Uma confirmação foi enviada para o seu WhatsApp.
          </p>
        </div>
      </Shell>
    );
  }

  async function handleSubmit() {
    setSubmitting(true);
    setError(null);
    try {
      const r = await fetch(`/api/public/book/${slug}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          service_id: serviceId,
          professional_id: professionalId || null,
          date,
          time,
          client_name: clientName.trim(),
          client_phone: clientPhone.replace(/\D/g, ""),
          notes: notes.trim() || undefined,
        }),
      });
      const data = await r.json();
      if (r.status === 409) {
        setError("Este horário acabou de ser ocupado. Escolha outro.");
        setTime("");
        setStep(askProfessional ? 3 : 2);
        return;
      }
      if (!r.ok) {
        setError("Não foi possível concluir o agendamento. Tente novamente.");
        return;
      }
      setSuccess({ appointmentId: data.appointment_id });
    } catch {
      setError("Erro de conexão. Tente novamente.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Shell>
      <Header info={info} />
      <StepIndicator current={step} total={totalSteps} />
      <div style={card}>
        {stepKey === "service" && (
          <ServiceStep services={info.services} selected={serviceId} onSelect={setServiceId} />
        )}
        {stepKey === "professional" && (
          <ProfessionalStep professionals={visibleProfessionals} selected={professionalId} onSelect={setProfessionalId} />
        )}
        {stepKey === "datetime" && service && (
          <DateTimeStep
            slug={slug}
            info={info}
            service={service}
            professionalId={professionalId}
            date={date}
            time={time}
            setDate={(d) => { setDate(d); setTime(""); }}
            setTime={setTime}
          />
        )}
        {stepKey === "client" && (
          <ClientStep
            clientName={clientName}
            setClientName={setClientName}
            clientPhone={clientPhone}
            setClientPhone={setClientPhone}
            notes={notes}
            setNotes={setNotes}
            service={service}
            professional={professional}
            date={date}
            time={time}
            error={error}
          />
        )}
      </div>
      <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
        <button
          type="button"
          onClick={() => setStep((s) => Math.max(1, s - 1))}
          disabled={step === 1 || submitting}
          style={{ ...btnSecondary, flex: 1, opacity: step === 1 ? 0.4 : 1 }}
        >
          Voltar
        </button>
        {step < totalSteps ? (
          <button
            type="button"
            onClick={() => setStep((s) => s + 1)}
            disabled={!canNext}
            style={{ ...btnPrimary, flex: 2, opacity: canNext ? 1 : 0.5 }}
          >
            Continuar
          </button>
        ) : (
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!canNext || submitting}
            style={{ ...btnPrimary, flex: 2, opacity: canNext && !submitting ? 1 : 0.5 }}
          >
            {submitting ? "Confirmando…" : "Confirmar agendamento"}
          </button>
        )}
      </div>
    </Shell>
  );
}

function Header({ info }: { info: Info }) {
  return (
    <header style={{ marginBottom: 16, textAlign: "center" }}>
      {info.profile.business_logo_url ? (
        <img src={info.profile.business_logo_url} alt="" style={{ height: 48, marginBottom: 8 }} />
      ) : null}
      <div style={{ fontSize: 14, color: "var(--text-muted)", marginBottom: 4 }}>
        {info.profile.business_name}
      </div>
      <h1 style={{ fontSize: 22, fontWeight: 600, margin: 0 }}>
        {info.profile.booking_title || "Agende seu horário"}
      </h1>
      {info.profile.booking_description ? (
        <p style={{ color: "var(--text-muted)", fontSize: 13, marginTop: 6 }}>
          {info.profile.booking_description}
        </p>
      ) : null}
    </header>
  );
}

function StepIndicator({ current, total }: { current: number; total: number }) {
  return (
    <div style={{ display: "flex", gap: 6, marginBottom: 16, justifyContent: "center" }}>
      {Array.from({ length: total }).map((_, i) => (
        <div
          key={i}
          style={{
            height: 4,
            width: 32,
            borderRadius: 999,
            background: i < current ? "var(--brand-400)" : "var(--bg-overlay)",
          }}
        />
      ))}
    </div>
  );
}

function ServiceStep({ services, selected, onSelect }: { services: Service[]; selected: string; onSelect: (id: string) => void }) {
  if (services.length === 0) {
    return <p style={{ color: "var(--text-muted)" }}>Este estabelecimento ainda não cadastrou serviços ativos para agendamento online. Volte mais tarde ou entre em contato pelo WhatsApp.</p>;
  }
  return (
    <div>
      <h2 style={stepTitle}>Escolha o serviço</h2>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {services.map((s) => {
          const active = selected === s.id;
          return (
            <button
              key={s.id}
              type="button"
              onClick={() => onSelect(s.id)}
              style={{
                ...optionCard,
                borderColor: active ? "var(--brand-400)" : "var(--border)",
                background: active ? "color-mix(in oklab, var(--brand-400) 8%, var(--bg-surface))" : "var(--bg-surface)",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                
                <div style={{ flex: 1, textAlign: "left" }}>
                  <div style={{ fontWeight: 600, fontSize: 14 }}>{s.name}</div>
                  <div style={{ fontSize: 12, color: "var(--text-muted)" }}>
                    {s.duration_minutes} min · {formatBRL(s.price_cents)}
                  </div>
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function ProfessionalStep({ professionals, selected, onSelect }: { professionals: Professional[]; selected: string; onSelect: (id: string) => void }) {
  return (
    <div>
      <h2 style={stepTitle}>Escolha o profissional</h2>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {professionals.map((p) => {
          const active = selected === p.id;
          return (
            <button
              key={p.id}
              type="button"
              onClick={() => onSelect(p.id)}
              style={{
                ...optionCard,
                borderColor: active ? "var(--brand-400)" : "var(--border)",
                background: active ? "color-mix(in oklab, var(--brand-400) 8%, var(--bg-surface))" : "var(--bg-surface)",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                {p.avatar_url ? (
                  <img src={p.avatar_url} alt="" style={{ width: 36, height: 36, borderRadius: 999, objectFit: "cover" }} />
                ) : (
                  <div style={{
                    width: 36, height: 36, borderRadius: 999,
                    background: p.avatar_color ?? "var(--brand-400)",
                    color: "#fff", display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 14, fontWeight: 600,
                  }}>
                    {p.name.charAt(0).toUpperCase()}
                  </div>
                )}
                <div style={{ flex: 1, textAlign: "left" }}>
                  <div style={{ fontWeight: 600, fontSize: 14 }}>{p.name}</div>
                  {p.role ? <div style={{ fontSize: 12, color: "var(--text-muted)" }}>{p.role}</div> : null}
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function DateTimeStep({
  slug, info, service, professionalId, date, time, setDate, setTime,
}: {
  slug: string;
  info: Info;
  service: Service;
  professionalId: string;
  date: string;
  time: string;
  setDate: (d: string) => void;
  setTime: (t: string) => void;
}) {
  const [slots, setSlots] = React.useState<Slot[]>([]);
  const [loadingSlots, setLoadingSlots] = React.useState(false);

  // dias disponíveis nos próximos 60 dias
  const availableDates = React.useMemo(() => {
    const hours = info.profile.working_hours ?? {};
    const enabledDayIdx = new Set<number>();
    for (const key of Object.keys(hours)) {
      const cfg = (hours as any)[key];
      const enabled = cfg?.enabled ?? cfg?.active ?? false;
      const idx = DAY_KEYS_TO_IDX[key.toLowerCase()];
      if (enabled && typeof idx === "number") enabledDayIdx.add(idx);
    }
    const out: { value: string; label: string; idx: number }[] = [];
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    for (let i = 0; i < 60; i++) {
      const d = new Date(today);
      d.setDate(today.getDate() + i);
      if (enabledDayIdx.size === 0 || enabledDayIdx.has(d.getDay())) {
        out.push({ value: toYmd(d), label: formatDateLong(d), idx: i });
      }
    }
    return out;
  }, [info]);

  React.useEffect(() => {
    if (!date) { setSlots([]); return; }
    let cancelled = false;
    setLoadingSlots(true);
    const qs = new URLSearchParams({
      action: "slots",
      date,
      service_id: service.id,
    });
    if (professionalId) qs.set("professional_id", professionalId);
    fetch(`/api/public/book/${slug}?${qs.toString()}`)
      .then((r) => r.json())
      .then((data) => { if (!cancelled) setSlots(data.slots ?? []); })
      .catch(() => { if (!cancelled) setSlots([]); })
      .finally(() => { if (!cancelled) setLoadingSlots(false); });
    return () => { cancelled = true; };
  }, [slug, date, service.id, professionalId]);

  return (
    <div>
      <h2 style={stepTitle}>Escolha data e horário</h2>
      <div style={{ marginBottom: 12 }}>
        <label style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 4, display: "block" }}>Data</label>
        <select
          value={date}
          onChange={(e) => setDate(e.target.value)}
          style={inputStyle}
        >
          <option value="">Selecione uma data…</option>
          {availableDates.map((d) => (
            <option key={d.value} value={d.value}>{d.label}</option>
          ))}
        </select>
      </div>
      {date ? (
        <div>
          <label style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 6, display: "block" }}>Horário</label>
          {loadingSlots ? (
            <div style={{ color: "var(--text-muted)", fontSize: 13 }}>Carregando horários…</div>
          ) : slots.length === 0 ? (
            <div style={{ color: "var(--text-muted)", fontSize: 13 }}>Nenhum horário disponível neste dia.</div>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(72px, 1fr))", gap: 8 }}>
              {slots.map((s) => {
                const active = time === s.time;
                return (
                  <button
                    key={s.time}
                    type="button"
                    disabled={!s.available}
                    onClick={() => setTime(s.time)}
                    style={{
                      height: 36,
                      borderRadius: 8,
                      border: `1px solid ${active ? "var(--brand-400)" : "var(--border)"}`,
                      background: !s.available
                        ? "var(--bg-overlay)"
                        : active
                          ? "var(--brand-400)"
                          : "var(--bg-surface)",
                      color: !s.available
                        ? "var(--text-muted)"
                        : active
                          ? "#fff"
                          : "var(--text-primary)",
                      fontSize: 13,
                      cursor: s.available ? "pointer" : "not-allowed",
                    }}
                  >
                    {s.time}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}

function ClientStep({
  clientName, setClientName, clientPhone, setClientPhone, notes, setNotes,
  service, professional, date, time, error,
}: {
  clientName: string; setClientName: (v: string) => void;
  clientPhone: string; setClientPhone: (v: string) => void;
  notes: string; setNotes: (v: string) => void;
  service: Service | null; professional: Professional | null;
  date: string; time: string; error: string | null;
}) {
  return (
    <div>
      <h2 style={stepTitle}>Seus dados</h2>
      <Summary service={service} professional={professional} date={date} time={time} />
      <div style={{ marginTop: 16, display: "flex", flexDirection: "column", gap: 12 }}>
        <label>
          <div style={fieldLabel}>Nome completo</div>
          <input value={clientName} onChange={(e) => setClientName(e.target.value)} style={inputStyle} placeholder="Seu nome" />
        </label>
        <label>
          <div style={fieldLabel}>WhatsApp (com DDD)</div>
          <input
            value={clientPhone}
            onChange={(e) => setClientPhone(e.target.value)}
            style={inputStyle}
            placeholder="(11) 99999-9999"
            inputMode="tel"
          />
        </label>
        <label>
          <div style={fieldLabel}>Observações (opcional)</div>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            style={{ ...inputStyle, minHeight: 60, padding: 8, resize: "vertical" }}
          />
        </label>
        {error ? (
          <div style={{ background: "color-mix(in oklab, #EF4444 12%, transparent)", color: "#EF4444", padding: 8, borderRadius: 8, fontSize: 13 }}>
            {error}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function Summary({ service, professional, date, time }: {
  service: Service | null; professional: Professional | null; date: string; time: string;
}) {
  if (!service || !date || !time) return null;
  const d = new Date(`${date}T${time}:00`);
  return (
    <div style={{ background: "var(--bg-overlay)", borderRadius: 8, padding: 12, fontSize: 13, lineHeight: 1.7 }}>
      <div>✓ Serviço: <strong>{service.name}</strong> ({service.duration_minutes} min — {formatBRL(service.price_cents)})</div>
      {professional ? <div>✓ Profissional: <strong>{professional.name}</strong></div> : null}
      <div>✓ Data: <strong>{formatDateLong(d)}</strong></div>
      <div>✓ Horário: <strong>{time}</strong></div>
    </div>
  );
}

// ───── styles
const card: React.CSSProperties = {
  background: "var(--bg-surface)",
  border: "1px solid var(--border)",
  borderRadius: 12,
  padding: 16,
};
const stepTitle: React.CSSProperties = { fontSize: 16, fontWeight: 600, marginBottom: 12 };
const optionCard: React.CSSProperties = {
  width: "100%",
  padding: 12,
  borderRadius: 10,
  border: "1px solid var(--border)",
  background: "var(--bg-surface)",
  cursor: "pointer",
  transition: "background 120ms, border-color 120ms",
};
const inputStyle: React.CSSProperties = {
  width: "100%",
  height: 40,
  padding: "0 12px",
  borderRadius: 8,
  border: "1px solid var(--border)",
  background: "var(--bg-base)",
  color: "var(--text-primary)",
  fontSize: 14,
  outline: "none",
};
const fieldLabel: React.CSSProperties = { fontSize: 12, color: "var(--text-muted)", marginBottom: 4 };
const btnPrimary: React.CSSProperties = {
  height: 44,
  borderRadius: 10,
  background: "var(--brand-400)",
  color: "#fff",
  border: "none",
  fontSize: 14,
  fontWeight: 600,
  cursor: "pointer",
};
const btnSecondary: React.CSSProperties = {
  height: 44,
  borderRadius: 10,
  background: "var(--bg-surface)",
  color: "var(--text-primary)",
  border: "1px solid var(--border)",
  fontSize: 14,
  fontWeight: 500,
  cursor: "pointer",
};
