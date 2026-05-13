import * as React from "react";
import { useDraggable } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { AlertTriangle, User as UserIcon } from "lucide-react";
import { type ContactCard as Contact, COLUMN_COLOR, formatRelative, initials } from "./data";

type Props = {
  contact: Contact;
  onClick: () => void;
  isOverlay?: boolean;
};

export function ContactCard({ contact, onClick, isOverlay }: Props) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: contact.id,
    data: { contact },
  });

  const style: React.CSSProperties = {
    width: 260,
    background: "var(--bg-surface)",
    border: "1px solid var(--border)",
    borderLeft: `3px solid ${COLUMN_COLOR[contact.kanban_column]}`,
    borderRadius: 8,
    padding: 12,
    cursor: isOverlay ? "grabbing" : "grab",
    opacity: isDragging && !isOverlay ? 0 : 1,
    transform: CSS.Translate.toString(transform),
    transition: isOverlay ? undefined : "transform 150ms var(--ease-default), border-color 150ms",
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
      style={style}
      {...listeners}
      {...attributes}
      onClick={(e) => {
        // dnd-kit fires click only when not dragging — guard anyway
        if (isDragging) return;
        e.stopPropagation();
        onClick();
      }}
      onMouseEnter={(e) => {
        if (isOverlay) return;
        e.currentTarget.style.transform = "translateY(-1px)";
        e.currentTarget.style.borderColor = "var(--border-strong)";
        e.currentTarget.style.boxShadow = "0 6px 16px rgba(0,0,0,0.18)";
      }}
      onMouseLeave={(e) => {
        if (isOverlay) return;
        e.currentTarget.style.transform = "";
        e.currentTarget.style.borderColor = "var(--border)";
        e.currentTarget.style.boxShadow = "";
      }}
    >
      {/* Row 1: avatar + name + unread */}
      <div className="flex items-center gap-2">
        {contact.avatar ? (
          <img
            src={contact.avatar}
            alt={contact.name}
            style={{ width: 28, height: 28, borderRadius: 999, objectFit: "cover" }}
          />
        ) : (
          <div
            className="inline-flex items-center justify-center"
            style={{
              width: 28,
              height: 28,
              borderRadius: 999,
              background: "var(--bg-overlay)",
              color: "var(--text-primary)",
              fontSize: 11,
              fontWeight: 600,
            }}
          >
            {initials(contact.name) || <UserIcon size={12} />}
          </div>
        )}
        <div
          className="flex-1 min-w-0 truncate"
          style={{ fontSize: 13, fontWeight: 500, color: "var(--text-primary)" }}
        >
          {contact.name}
        </div>
        {contact.isUnread && (
          <span
            aria-label="não lido"
            style={{
              width: 8,
              height: 8,
              borderRadius: 999,
              background: "var(--success)",
              boxShadow: "0 0 0 3px color-mix(in oklab, var(--success) 25%, transparent)",
            }}
          />
        )}
      </div>

      {/* Row 2: phone */}
      <div
        className="font-mono"
        style={{ marginTop: 4, fontSize: 11, color: "var(--text-muted)" }}
      >
        {contact.phone}
      </div>

      {/* Row 3: last message */}
      <div
        className="truncate"
        style={{
          marginTop: 8,
          fontSize: 12,
          color: "var(--text-muted)",
          lineHeight: 1.45,
        }}
      >
        {contact.lastMessage}
      </div>

      {/* Footer */}
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
          className="flex items-center shrink-0"
          style={{ gap: 4, fontSize: 11, color: "var(--text-muted)" }}
        >
          {contact.priority === "urgent" && (
            <AlertTriangle size={11} style={{ color: "var(--danger)" }} />
          )}
          {formatRelative(contact.lastMessageAt)}
        </div>
      </div>
    </div>
  );
}
