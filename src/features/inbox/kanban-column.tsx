import * as React from "react";
import { useDroppable } from "@dnd-kit/core";
import { MoreVertical } from "lucide-react";
import { ContactCard } from "./contact-card";
import type { ContactCard as Contact, KanbanColumnDef } from "./data";

const EMPTY_STATES: Record<string, { icon: string; title: string; subtitle: string }> = {
  waiting: {
    icon: "💬",
    title: "Nenhuma conversa aguardando",
    subtitle: "Mensagens novas do WhatsApp aparecem aqui automaticamente.",
  },
  in_progress: {
    icon: "🎧",
    title: "Sem atendimentos em andamento",
    subtitle: "Mova uma conversa para cá quando começar a atender.",
  },
  scheduled: {
    icon: "📅",
    title: "Nenhum agendamento confirmado",
    subtitle: "Contatos com horário marcado aparecem aqui.",
  },
  urgent: {
    icon: "✅",
    title: "Nenhuma urgência no momento",
    subtitle: "Marque conversas críticas como urgente quando necessário.",
  },
};

function ColumnEmptyState({ slug }: { slug: string }) {
  const state = EMPTY_STATES[slug] ?? {
    icon: "📭",
    title: "Nenhum card aqui",
    subtitle: "Arraste conversas para esta coluna.",
  };
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "40px 20px",
        textAlign: "center",
        gap: 4,
        opacity: 0.5,
      }}
    >
      <span style={{ fontSize: 28, lineHeight: 1 }}>{state.icon}</span>
      <p style={{ fontSize: 13, fontWeight: 500, marginTop: 4, color: "var(--text-primary)" }}>
        {state.title}
      </p>
      <p style={{ fontSize: 12, fontWeight: 400, color: "var(--text-muted)" }}>
        {state.subtitle}
      </p>
    </div>
  );
}

export type ColumnMenuRequestDetail = {
  column: KanbanColumnDef;
  anchor: { top: number; left: number };
};

type Props = {
  column: KanbanColumnDef;
  contacts: Contact[];
  onCardClick: (contact: Contact) => void;
};

export function KanbanColumn({ column, contacts, onCardClick }: Props) {
  const { id, slug, label, emoji, color } = column;
  const { setNodeRef, isOver } = useDroppable({ id: slug });
  const prevCount = React.useRef(contacts.length);
  const [bump, setBump] = React.useState(false);
  const [pulse, setPulse] = React.useState(false);

  React.useEffect(() => {
    if (contacts.length > prevCount.current) {
      setBump(true);
      setPulse(true);
      const t1 = window.setTimeout(() => setBump(false), 320);
      const t2 = window.setTimeout(() => setPulse(false), 2000);
      prevCount.current = contacts.length;
      return () => {
        window.clearTimeout(t1);
        window.clearTimeout(t2);
      };
    }
    prevCount.current = contacts.length;
  }, [contacts.length]);

  return (
    <div
      ref={setNodeRef}
      data-column-slug={slug}
      data-column-id={id}
      className="shrink-0 flex flex-col zf-kanban-column"
      style={{
        width: 280,
        background: "var(--bg-overlay)",
        borderRadius: 12,
        padding: 12,
        borderTop: `3px solid ${color}`,
        outline: isOver ? "2px dashed var(--brand-400)" : "none",
        outlineOffset: -2,
        boxShadow: pulse
          ? `0 0 0 2px color-mix(in oklab, ${color} 40%, transparent), 0 0 24px color-mix(in oklab, ${color} 30%, transparent)`
          : undefined,
        transition: "outline 120ms var(--ease-default), box-shadow 600ms ease-out",
        maxHeight: "100%",
      }}
    >
      <div
        className="flex items-center justify-between zf-column-header"
        style={{ padding: "0 4px 10px", position: "relative" }}
      >
        <div
          className="flex items-center gap-1.5"
          style={{
            fontSize: 12,
            fontWeight: 600,
            textTransform: "uppercase",
            letterSpacing: "0.06em",
            color: "var(--text-primary)",
          }}
        >
          <span>{emoji}</span>
          {label}
        </div>
        <div className="flex items-center" style={{ gap: 6 }}>
          <span
            style={{
              fontSize: 11,
              fontWeight: 600,
              padding: "2px 8px",
              borderRadius: 999,
              background: "var(--bg-surface)",
              color: "var(--text-muted)",
              border: "1px solid var(--border)",
              display: "inline-block",
              transform: bump ? "scale(1.3)" : "scale(1)",
              transition: "transform 300ms cubic-bezier(.34,1.56,.64,1)",
            }}
          >
            {contacts.length}
          </span>
          <button
            type="button"
            aria-label="Opções da coluna"
            className="zf-column-more"
            onPointerDown={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation();
              const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
              const detail: ColumnMenuRequestDetail = {
                column,
                anchor: { top: r.bottom + 4, left: r.right - 200 },
              };
              window.dispatchEvent(new CustomEvent("zf:column-menu", { detail }));
            }}
            style={{
              width: 22, height: 22,
              display: "inline-flex", alignItems: "center", justifyContent: "center",
              background: "transparent",
              border: "1px solid transparent",
              borderRadius: 6,
              color: "var(--text-muted)",
              opacity: 0,
              transition: "opacity 100ms, background 100ms",
              cursor: "pointer",
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = "var(--bg-surface)"; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
          >
            <MoreVertical size={14} />
          </button>
        </div>
      </div>

      <div
        className="flex-1 overflow-y-auto overflow-x-hidden flex flex-col"
        style={{ gap: 12, padding: "6px 2px" }}
      >
        {contacts.map((c) => (
          <ContactCard key={c.id} contact={c} onClick={() => onCardClick(c)} />
        ))}
        {contacts.length === 0 && <ColumnEmptyState slug={slug} />}
      </div>
    </div>
  );
}
