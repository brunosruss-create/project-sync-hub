import * as React from "react";
import { useDroppable } from "@dnd-kit/core";
import { ContactCard } from "./contact-card";
import { type ContactCard as Contact, type KanbanColumnId, COLUMN_COLOR } from "./data";

type Props = {
  id: KanbanColumnId;
  label: string;
  emoji: string;
  contacts: Contact[];
  onCardClick: (contact: Contact) => void;
};

export function KanbanColumn({ id, label, emoji, contacts, onCardClick }: Props) {
  const { setNodeRef, isOver } = useDroppable({ id });

  return (
    <div
      ref={setNodeRef}
      className="shrink-0 flex flex-col"
      style={{
        width: 280,
        background: "var(--bg-overlay)",
        borderRadius: 12,
        padding: 12,
        borderTop: `3px solid ${COLUMN_COLOR[id]}`,
        outline: isOver ? "2px dashed var(--brand-400)" : "none",
        outlineOffset: -2,
        transition: "outline 120ms var(--ease-default)",
        maxHeight: "100%",
      }}
    >
      <div className="flex items-center justify-between" style={{ padding: "0 4px 10px" }}>
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
        <span
          style={{
            fontSize: 11,
            fontWeight: 600,
            padding: "2px 8px",
            borderRadius: 999,
            background: "var(--bg-surface)",
            color: "var(--text-muted)",
            border: "1px solid var(--border)",
          }}
        >
          {contacts.length}
        </span>
      </div>

      <div
        className="flex-1 overflow-y-auto flex flex-col"
        style={{ gap: 8, padding: 2 }}
      >
        {contacts.map((c) => (
          <ContactCard key={c.id} contact={c} onClick={() => onCardClick(c)} />
        ))}
        {contacts.length === 0 && (
          <div
            style={{
              fontSize: 12,
              color: "var(--text-muted)",
              textAlign: "center",
              padding: "32px 8px",
              border: "1px dashed var(--border)",
              borderRadius: 8,
            }}
          >
            Solte um card aqui
          </div>
        )}
      </div>
    </div>
  );
}
