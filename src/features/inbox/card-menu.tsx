import * as React from "react";
import {
  Edit3, Tag, UserPlus, AlertOctagon, Move, CalendarPlus,
  MessageSquare, Archive, ShieldOff, ChevronRight,
} from "lucide-react";
import { COLUMNS, type ContactCard as Contact, type KanbanColumnId } from "./data";

type ActionId =
  | "edit"
  | "add-tag"
  | "assign"
  | "toggle-urgent"
  | "open-chat"
  | "schedule"
  | "archive";

export type CardMenuAction =
  | { type: ActionId; contact: Contact }
  | { type: "move"; contact: Contact; column: KanbanColumnId };

type Props = {
  contact: Contact;
  anchor: { top: number; left: number };
  onClose: () => void;
  onAction: (a: CardMenuAction) => void;
};

export function CardMenu({ contact, anchor, onClose, onAction }: Props) {
  const ref = React.useRef<HTMLDivElement | null>(null);
  const [showMove, setShowMove] = React.useState(false);

  React.useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (!ref.current) return;
      if (!ref.current.contains(e.target as Node)) onClose();
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  // Mantém o menu dentro da viewport
  const top = Math.min(anchor.top, window.innerHeight - 360);
  const left = Math.min(anchor.left, window.innerWidth - 200);

  const isUrgent = contact.priority === "urgent";

  return (
    <div
      ref={ref}
      role="menu"
      style={{
        position: "fixed",
        top, left,
        width: 200,
        background: "var(--bg-surface)",
        border: "1px solid var(--border-strong)",
        borderRadius: 8,
        boxShadow: "0 12px 28px rgba(0,0,0,0.32)",
        padding: 4,
        zIndex: 70,
        animation: "zfMenuIn 130ms ease-out",
        fontSize: 13,
      }}
      onClick={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <style>{`@keyframes zfMenuIn { from { opacity:0; transform: translateY(-4px);} to { opacity:1; transform: translateY(0);} }`}</style>

      <SectionLabel>Contato</SectionLabel>
      <Item icon={<Edit3 size={14} />} onClick={() => { onAction({ type: "edit", contact }); onClose(); }}>
        Editar contato
      </Item>
      <Item icon={<Tag size={14} />} onClick={() => { onAction({ type: "add-tag", contact }); onClose(); }}>
        Adicionar tag
      </Item>
      <Item icon={<UserPlus size={14} />} onClick={() => { onAction({ type: "assign", contact }); onClose(); }}>
        Atribuir agente
      </Item>

      <Sep />
      <SectionLabel>Kanban</SectionLabel>
      <Item
        icon={<AlertOctagon size={14} style={{ color: isUrgent ? "var(--text-muted)" : "#EF4444" }} />}
        onClick={() => { onAction({ type: "toggle-urgent", contact }); onClose(); }}
      >
        {isUrgent ? "Remover urgência" : "Marcar como urgente"}
      </Item>

      {/* Move com submenu */}
      <div
        onMouseEnter={() => setShowMove(true)}
        onMouseLeave={() => setShowMove(false)}
        style={{ position: "relative" }}
      >
        <Item
          icon={<Move size={14} />}
          onClick={() => setShowMove((v) => !v)}
          rightSlot={<ChevronRight size={12} style={{ color: "var(--text-muted)" }} />}
        >
          Mover para coluna
        </Item>
        {showMove && (
          <div
            style={{
              position: "absolute",
              top: 0, left: "100%", marginLeft: 4,
              width: 180,
              background: "var(--bg-surface)",
              border: "1px solid var(--border-strong)",
              borderRadius: 8,
              boxShadow: "0 12px 28px rgba(0,0,0,0.32)",
              padding: 4,
              zIndex: 71,
            }}
          >
            {COLUMNS.map((c) => (
              <Item
                key={c.id}
                icon={<span aria-hidden>{c.emoji}</span>}
                disabled={c.id === contact.kanban_column}
                onClick={() => {
                  if (c.id === contact.kanban_column) return;
                  onAction({ type: "move", contact, column: c.id });
                  onClose();
                }}
              >
                {c.label}
              </Item>
            ))}
          </div>
        )}
      </div>

      <Sep />
      <SectionLabel>Ações</SectionLabel>
      <Item icon={<CalendarPlus size={14} />} onClick={() => { onAction({ type: "schedule", contact }); onClose(); }}>
        Agendar horário
      </Item>
      <Item icon={<MessageSquare size={14} />} onClick={() => { onAction({ type: "open-chat", contact }); onClose(); }}>
        Abrir conversa
      </Item>

      <Sep />
      <Item
        icon={<Archive size={14} style={{ color: "#EF4444" }} />}
        danger
        onClick={() => {
          if (confirm(`Arquivar o contato "${contact.name}"? Ele sairá do Kanban.`)) {
            onAction({ type: "archive", contact });
            onClose();
          }
        }}
      >
        Arquivar contato
      </Item>
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      padding: "6px 8px 4px", fontSize: 10, fontWeight: 600,
      color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: ".06em",
    }}>
      {children}
    </div>
  );
}

function Sep() {
  return <div style={{ height: 1, background: "var(--border)", margin: "4px 0" }} />;
}

function Item({
  icon, children, onClick, danger, disabled, rightSlot,
}: {
  icon: React.ReactNode;
  children: React.ReactNode;
  onClick?: () => void;
  danger?: boolean;
  disabled?: boolean;
  rightSlot?: React.ReactNode;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      disabled={disabled}
      style={{
        display: "flex", alignItems: "center", gap: 8,
        width: "100%", padding: "7px 8px",
        background: "transparent", border: 0, borderRadius: 6,
        color: disabled ? "var(--text-muted)" : danger ? "#EF4444" : "var(--text-primary)",
        fontSize: 12, textAlign: "left",
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.5 : 1,
      }}
      onMouseEnter={(e) => {
        if (disabled) return;
        e.currentTarget.style.background = "var(--bg-overlay)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = "transparent";
      }}
    >
      <span style={{ width: 16, display: "inline-flex", justifyContent: "center" }}>{icon}</span>
      <span style={{ flex: 1 }}>{children}</span>
      {rightSlot}
    </button>
  );
}

// Re-export para evitar import não-usado
export const _unused = ShieldOff;
