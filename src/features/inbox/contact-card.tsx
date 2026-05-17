import * as React from "react";
import { useDraggable } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { AlertTriangle, Lock, MoreVertical } from "lucide-react";
import {
  type ContactCard as Contact,
  formatRelative,
  formatPhone,
  formatMessagePreview,
} from "./data";
import { ContactAvatar } from "./contact-avatar";

// Evento global emitido ao clicar no ⋮ — escutado pelo /inbox
export type CardMenuRequestDetail = {
  contact: Contact;
  anchor: { top: number; left: number };
};

type Props = {
  contact: Contact;
  onClick: () => void;
  isOverlay?: boolean;
  isSelected?: boolean;
};

// Hash determinístico → cor do avatar
function avatarColor(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  const hue = h % 360;
  return `hsl(${hue}, 55%, 45%)`;
}

function useTick(ms = 60_000) {
  const [, setT] = React.useState(0);
  React.useEffect(() => {
    const id = window.setInterval(() => setT((v) => v + 1), ms);
    return () => window.clearInterval(id);
  }, [ms]);
}

export function ContactCard({ contact, onClick, isOverlay, isSelected }: Props) {
  useTick(60_000); // recalcula tempo relativo a cada 60s sem refetch
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: contact.id,
    data: { contact },
  });

  const unread = contact.unreadCount ?? 0;
  const showBadge = unread > 0;

  const style: React.CSSProperties = {
    width: "100%",
    background: isSelected ? "color-mix(in oklab, var(--brand-400) 6%, var(--bg-surface))" : "var(--bg-surface)",
    border: `1px solid ${isSelected ? "var(--brand-400)" : "var(--border)"}`,
    borderRadius: 8,
    padding: 12,
    position: "relative",
    cursor: isOverlay ? "grabbing" : "grab",
    opacity: isDragging && !isOverlay ? 0 : 1,
    transform: CSS.Translate.toString(transform),
    transition: isOverlay
      ? undefined
      : "transform 150ms var(--ease-default), border-color 150ms, background 150ms, box-shadow 150ms",
    ...(isOverlay
      ? {
          opacity: 0.92,
          transform: "rotate(1.5deg)",
          boxShadow: "0 12px 24px rgba(0,0,0,0.35), 0 2px 6px rgba(0,0,0,0.2)",
        }
      : {}),
  };

  

  return (
    <div
      ref={setNodeRef}
      data-contact-id={contact.id}
      className="zf-contact-card"
      style={style}
      {...listeners}
      {...attributes}
      onClick={(e) => {
        if (isDragging) return;
        e.stopPropagation();
        onClick();
      }}
      onMouseEnter={(e) => {
        if (isOverlay || isSelected) return;
        e.currentTarget.style.transform = "translateY(-1px)";
        e.currentTarget.style.borderColor = "var(--border-strong)";
        e.currentTarget.style.background = "var(--bg-overlay)";
        e.currentTarget.style.boxShadow = "0 6px 16px rgba(0,0,0,0.18)";
      }}
      onMouseLeave={(e) => {
        if (isOverlay || isSelected) return;
        e.currentTarget.style.transform = "";
        e.currentTarget.style.borderColor = "var(--border)";
        e.currentTarget.style.background = "var(--bg-surface)";
        e.currentTarget.style.boxShadow = "";
      }}
    >
      {/* Badge não lidas (canto superior direito) */}
      {showBadge && (
        <div
          aria-label={`${unread} não lida${unread === 1 ? "" : "s"}`}
          style={{
            position: "absolute",
            top: 6,
            right: 6,
            minWidth: unread > 9 ? 24 : 18,
            height: 18,
            padding: unread > 9 ? "0 5px" : 0,
            borderRadius: 9,
            background: "var(--brand-400, #25D366)",
            color: "#fff",
            fontSize: 10,
            fontWeight: 700,
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            border: "2px solid var(--bg-surface)",
            boxShadow: "0 2px 6px rgba(0,0,0,0.25)",
            animation: "zfBadgeIn 200ms cubic-bezier(.34,1.56,.64,1)",
            lineHeight: 1,
          }}
        >
          {unread > 99 ? "99+" : unread}
        </div>
      )}

      {/* Ícone ⋮ — aparece no hover */}
      {!isOverlay && (
        <button
          type="button"
          aria-label="Opções do contato"
          onPointerDown={(e) => e.stopPropagation()}
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
            const detail: CardMenuRequestDetail = {
              contact,
              anchor: { top: r.bottom + 4, left: r.right - 180 },
            };
            window.dispatchEvent(new CustomEvent("zf:card-menu", { detail }));
          }}
          className="zf-card-more"
          style={{
            position: "absolute",
            top: showBadge ? 30 : 6,
            right: 6,
            width: 22,
            height: 22,
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            background: "var(--bg-surface)",
            border: "1px solid var(--border)",
            borderRadius: 6,
            color: "var(--text-muted)",
            opacity: 0,
            transition: "opacity 100ms",
            cursor: "pointer",
            zIndex: 2,
          }}
        >
          <MoreVertical size={14} />
        </button>
      )}

      {/* Linha 1: avatar + nome */}
      <div className="flex items-center" style={{ gap: 8 }}>
        <ContactAvatar name={contact.name} avatarUrl={contact.avatar} size={32} />
        <div
          className="flex-1 min-w-0 truncate"
          style={{
            fontSize: 14,
            fontWeight: 600,
            letterSpacing: "-0.01em",
            color: "var(--text-primary)",
          }}
        >
          {contact.name}
        </div>
        {!showBadge && contact.priority === "urgent" && (
          <AlertTriangle size={13} style={{ color: "var(--danger)", flexShrink: 0 }} />
        )}
      </div>

      {/* Linha 2: telefone formatado */}
      <div
        className="font-mono"
        style={{ marginTop: 6, fontSize: 12, fontWeight: 400, color: "var(--text-muted)", opacity: 0.65 }}
      >
        {formatPhone(contact.phone)}
      </div>

      {/* Linha 3: preview da última mensagem */}
      <div
        className="truncate"
        style={{
          marginTop: 8,
          fontSize: 13,
          fontWeight: 400,
          color: "var(--text-muted)",
          opacity: 0.8,
          lineHeight: 1.45,
        }}
      >
        {formatMessagePreview(contact.lastMessage, contact.lastDirection ?? null)}
      </div>

      {/* Linha 4: tempo relativo + tags */}
      <div
        className="flex items-center justify-between"
        style={{ marginTop: 10, gap: 6 }}
      >
        <div className="flex items-center min-w-0" style={{ gap: 4 }}>
          {contact.tags.slice(0, 2).map((tag) => (
            <span
              key={tag}
              className="truncate"
              style={{
                fontSize: 10,
                fontWeight: 500,
                padding: "2px 6px",
                borderRadius: 4,
                background: "var(--bg-overlay)",
                color: "var(--text-muted)",
                border: "1px solid var(--border)",
              }}
            >
              {tag}
            </span>
          ))}
        </div>
        <div
          style={{ fontSize: 11, fontWeight: 400, color: "var(--text-muted)", opacity: 0.5, flexShrink: 0 }}
        >
          {formatRelative(contact.lastMessageAt)}
        </div>
      </div>
    </div>
  );
}
