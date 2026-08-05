// Fase 9: Modal de agendamento de envio.
// Recebe o texto que já está no Composer e um contato; pergunta quando enviar.
// Ao confirmar, chama scheduleMessage (que enfileira no job-worker).

import * as React from "react";
import { X, Clock, CalendarClock } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { scheduleMessage } from "@/lib/scheduled-messages.functions";

type Props = {
  open: boolean;
  onClose: () => void;
  contactId: string;
  contactName: string;
  text: string;
  onScheduled: () => void;
};

function formatLocalDatetime(d: Date): string {
  // Formato exigido por <input type="datetime-local">: YYYY-MM-DDTHH:mm
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

/** Sugestões rápidas — 90% dos casos de uso. */
function presets(): Array<{ label: string; date: Date }> {
  const now = new Date();
  const later = new Date(now.getTime() + 60 * 60 * 1000); // +1h
  const tomorrow9 = new Date(now);
  tomorrow9.setDate(tomorrow9.getDate() + 1);
  tomorrow9.setHours(9, 0, 0, 0);
  const monday9 = new Date(now);
  const daysToMon = (8 - monday9.getDay()) % 7 || 7;
  monday9.setDate(monday9.getDate() + daysToMon);
  monday9.setHours(9, 0, 0, 0);
  return [
    { label: "Em 1 hora", date: later },
    { label: "Amanhã às 9h", date: tomorrow9 },
    { label: "Próxima segunda 9h", date: monday9 },
  ];
}

export function ScheduleSendModal({
  open,
  onClose,
  contactId,
  contactName,
  text,
  onScheduled,
}: Props) {
  const scheduleFn = useServerFn(scheduleMessage);
  const [when, setWhen] = React.useState(() =>
    formatLocalDatetime(new Date(Date.now() + 60 * 60 * 1000)),
  );
  const [submitting, setSubmitting] = React.useState(false);

  React.useEffect(() => {
    if (open) {
      setWhen(formatLocalDatetime(new Date(Date.now() + 60 * 60 * 1000)));
    }
  }, [open]);

  if (!open) return null;

  const submit = async () => {
    if (submitting) return;
    const localDate = new Date(when);
    if (Number.isNaN(localDate.getTime())) {
      toast.error("Data inválida.");
      return;
    }
    if (localDate.getTime() < Date.now() + 30_000) {
      toast.error("Escolha um horário pelo menos 30 segundos no futuro.");
      return;
    }
    setSubmitting(true);
    try {
      await scheduleFn({
        data: {
          contactId,
          scheduledAt: localDate.toISOString(),
          text,
        },
      });
      toast.success("Mensagem agendada.");
      onScheduled();
      onClose();
    } catch (e: any) {
      toast.error(e?.message ?? "Falha ao agendar.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Agendar envio"
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.4)",
        zIndex: 200,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 20,
      }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "100%",
          maxWidth: 460,
          background: "var(--bg-surface)",
          border: "1px solid var(--border)",
          borderRadius: "var(--radius-card, 12px)",
          boxShadow: "0 20px 40px rgba(0,0,0,0.2)",
          overflow: "hidden",
        }}
      >
        <div
          className="flex items-center justify-between"
          style={{ padding: "14px 16px", borderBottom: "1px solid var(--border)" }}
        >
          <div className="flex items-center" style={{ gap: 8 }}>
            <CalendarClock size={18} style={{ color: "var(--brand-400)" }} />
            <h3 style={{ margin: 0, fontSize: 15, fontWeight: 600 }}>Agendar envio</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar"
            style={{
              width: 28,
              height: 28,
              borderRadius: "var(--radius-pill)",
              border: "none",
              background: "transparent",
              color: "var(--text-muted)",
              cursor: "pointer",
            }}
          >
            <X size={16} />
          </button>
        </div>

        <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 14 }}>
          <div>
            <div
              style={{
                fontSize: 11,
                fontWeight: 600,
                textTransform: "uppercase",
                letterSpacing: "0.05em",
                color: "var(--text-muted)",
                marginBottom: 6,
              }}
            >
              Para
            </div>
            <div style={{ fontSize: 14 }}>{contactName}</div>
          </div>

          <div>
            <div
              style={{
                fontSize: 11,
                fontWeight: 600,
                textTransform: "uppercase",
                letterSpacing: "0.05em",
                color: "var(--text-muted)",
                marginBottom: 6,
              }}
            >
              Mensagem
            </div>
            <div
              style={{
                fontSize: 13,
                lineHeight: 1.4,
                padding: 10,
                borderRadius: "var(--radius-control)",
                background: "var(--bg-base)",
                border: "1px solid var(--border)",
                maxHeight: 100,
                overflow: "auto",
                whiteSpace: "pre-wrap",
                wordBreak: "break-word",
              }}
            >
              {text}
            </div>
          </div>

          <div>
            <div
              style={{
                fontSize: 11,
                fontWeight: 600,
                textTransform: "uppercase",
                letterSpacing: "0.05em",
                color: "var(--text-muted)",
                marginBottom: 6,
              }}
            >
              Sugestões rápidas
            </div>
            <div className="flex" style={{ gap: 6, flexWrap: "wrap" }}>
              {presets().map((p) => (
                <button
                  key={p.label}
                  type="button"
                  onClick={() => setWhen(formatLocalDatetime(p.date))}
                  style={{
                    fontSize: 12,
                    fontWeight: 500,
                    padding: "4px 10px",
                    borderRadius: "var(--radius-pill)",
                    border: "1px solid var(--border)",
                    background: "transparent",
                    color: "var(--text-primary)",
                    cursor: "pointer",
                  }}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <div
              style={{
                fontSize: 11,
                fontWeight: 600,
                textTransform: "uppercase",
                letterSpacing: "0.05em",
                color: "var(--text-muted)",
                marginBottom: 6,
              }}
            >
              Data e hora
            </div>
            <input
              type="datetime-local"
              value={when}
              onChange={(e) => setWhen(e.target.value)}
              style={{
                width: "100%",
                fontSize: 13,
                padding: "8px 10px",
                border: "1px solid var(--border-strong)",
                borderRadius: "var(--radius-control)",
                background: "var(--bg-surface)",
                color: "var(--text-primary)",
              }}
            />
          </div>
        </div>

        <div
          className="flex items-center justify-end"
          style={{
            padding: 12,
            gap: 8,
            borderTop: "1px solid var(--border)",
            background: "var(--bg-base)",
          }}
        >
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            style={{
              fontSize: 13,
              fontWeight: 500,
              padding: "8px 14px",
              borderRadius: "var(--radius-pill)",
              border: "1px solid var(--border-strong)",
              background: "transparent",
              color: "var(--text-primary)",
              cursor: submitting ? "not-allowed" : "pointer",
            }}
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={submitting || text.trim().length === 0}
            className="inline-flex items-center"
            style={{
              gap: 6,
              fontSize: 13,
              fontWeight: 500,
              padding: "8px 14px",
              borderRadius: "var(--radius-pill)",
              border: "none",
              background: "var(--brand-400)",
              color: "#fff",
              cursor: submitting ? "wait" : "pointer",
              opacity: submitting || text.trim().length === 0 ? 0.6 : 1,
            }}
          >
            <Clock size={14} />
            {submitting ? "Agendando…" : "Agendar"}
          </button>
        </div>
      </div>
    </div>
  );
}
