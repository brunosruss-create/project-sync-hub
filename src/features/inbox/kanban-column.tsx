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
      className="shrink-0 flex flex-col"
      style={{
        width: 280,
        background: "var(--bg-overlay)",
        borderRadius: 12,
        padding: 12,
        borderTop: `3px solid ${COLUMN_COLOR[id]}`,
        outline: isOver ? "2px dashed var(--brand-400)" : "none",
        outlineOffset: -2,
        boxShadow: pulse
          ? `0 0 0 2px color-mix(in oklab, ${COLUMN_COLOR[id]} 40%, transparent), 0 0 24px color-mix(in oklab, ${COLUMN_COLOR[id]} 30%, transparent)`
          : undefined,
        transition: "outline 120ms var(--ease-default), box-shadow 600ms ease-out",
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
            display: "inline-block",
            transform: bump ? "scale(1.3)" : "scale(1)",
            transition: "transform 300ms cubic-bezier(.34,1.56,.64,1)",
          }}
        >
          {contacts.length}
        </span>
      </div>

      <div
        className="flex-1 overflow-y-auto overflow-x-hidden flex flex-col"
        style={{ gap: 12, padding: "6px 2px" }}
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
