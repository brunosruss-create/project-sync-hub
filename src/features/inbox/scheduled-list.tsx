// Fase 9: Painel de mensagens agendadas de um contato.
// Aparece entre o histórico e o Composer. Compacto: só mostra a lista quando
// expandido; senão só a linha de resumo — "3 agendadas · próxima em 2h".

import * as React from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { CalendarClock, ChevronDown, ChevronUp, X } from "lucide-react";
import {
  listScheduledMessages,
  cancelScheduledMessage,
} from "@/lib/scheduled-messages.functions";

function fmt(d: Date): string {
  const now = new Date();
  const diff = d.getTime() - now.getTime();
  if (diff < 0) return "agora";
  const min = Math.round(diff / 60000);
  if (min < 60) return `em ${min}min`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `em ${hr}h`;
  const day = Math.round(hr / 24);
  if (day < 7) return `em ${day}d`;
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
}

function absoluteLabel(d: Date): string {
  return d.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function ScheduledList({ contactId }: { contactId: string }) {
  const listFn = useServerFn(listScheduledMessages);
  const cancelFn = useServerFn(cancelScheduledMessage);
  const qc = useQueryClient();
  const [expanded, setExpanded] = React.useState(false);

  const q = useQuery({
    queryKey: ["scheduled", contactId],
    queryFn: () => listFn({ data: { contactId } }),
    refetchInterval: 60_000,
    staleTime: 30_000,
  });

  // Invalidação por evento: o Composer dispara `zf:scheduled-changed` ao
  // agendar. Sem isso, o painel só renovaria no próximo refetchInterval.
  React.useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<{ contactId: string }>).detail;
      if (detail?.contactId === contactId) {
        qc.invalidateQueries({ queryKey: ["scheduled", contactId] });
      }
    };
    window.addEventListener("zf:scheduled-changed", handler);
    return () => window.removeEventListener("zf:scheduled-changed", handler);
  }, [contactId, qc]);

  const cancel = useMutation({
    mutationFn: (id: string) => cancelFn({ data: { id } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["scheduled", contactId] });
      toast.success("Agendamento cancelado.");
    },
    onError: (e: any) => toast.error(e?.message ?? "Falha ao cancelar."),
  });

  const items = q.data?.items ?? [];
  if (items.length === 0) return null;

  const nextItem = items[0];
  const nextDate = new Date(nextItem.scheduledAt);

  return (
    <div
      style={{
        borderTop: "1px solid var(--border)",
        background: "color-mix(in oklab, var(--brand-400) 6%, var(--bg-surface))",
        padding: "6px 12px",
        fontSize: 12,
      }}
    >
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex items-center"
        style={{
          width: "100%",
          gap: 6,
          background: "transparent",
          border: "none",
          color: "var(--text-primary)",
          cursor: "pointer",
          padding: 0,
          textAlign: "left",
        }}
        aria-expanded={expanded}
      >
        <CalendarClock size={14} style={{ color: "var(--brand-400)" }} />
        <span style={{ fontWeight: 500 }}>
          {items.length} agendada{items.length === 1 ? "" : "s"}
        </span>
        <span style={{ color: "var(--text-muted)" }}>
          · próxima {fmt(nextDate)}
        </span>
        <span style={{ marginLeft: "auto", color: "var(--text-muted)" }}>
          {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </span>
      </button>

      {expanded && (
        <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 6 }}>
          {items.map((it) => {
            const d = new Date(it.scheduledAt);
            return (
              <div
                key={it.id}
                className="flex items-start"
                style={{
                  gap: 8,
                  padding: "6px 8px",
                  background: "var(--bg-surface)",
                  border: "1px solid var(--border)",
                  borderRadius: "var(--radius-control)",
                }}
              >
                <div className="flex-1 min-w-0">
                  <div style={{ fontSize: 11, color: "var(--text-muted)" }}>
                    {absoluteLabel(d)} · {fmt(d)}
                  </div>
                  <div
                    style={{
                      fontSize: 12.5,
                      color: "var(--text-primary)",
                      whiteSpace: "pre-wrap",
                      overflow: "hidden",
                      display: "-webkit-box",
                      WebkitBoxOrient: "vertical",
                      WebkitLineClamp: 2,
                    }}
                  >
                    {it.text ?? (it.mediaUrl ? "[mídia agendada]" : "—")}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    if (confirm("Cancelar este agendamento?")) cancel.mutate(it.id);
                  }}
                  disabled={cancel.isPending}
                  title="Cancelar agendamento"
                  aria-label="Cancelar agendamento"
                  style={{
                    width: 26,
                    height: 26,
                    borderRadius: "var(--radius-pill)",
                    border: "none",
                    background: "transparent",
                    color: "var(--text-muted)",
                    cursor: "pointer",
                    flexShrink: 0,
                  }}
                >
                  <X size={14} />
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
