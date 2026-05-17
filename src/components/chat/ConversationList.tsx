import * as React from "react";
import { Search, Plus } from "lucide-react";
import {
  type ContactCard as Contact,
  type KanbanColumnDef,
} from "@/features/inbox/data";
import { ConversationListItem } from "./ConversationListItem";

type Filter = "all" | "mine" | "unassigned";

export function ConversationList({
  contacts,
  columns,
  activeId,
  currentUserId,
  onSelect,
  onNewContact,
}: {
  contacts: Contact[];
  columns: KanbanColumnDef[];
  activeId: string | null;
  currentUserId: string | null;
  onSelect: (id: string) => void;
  onNewContact: () => void;
}) {
  const [query, setQuery] = React.useState("");
  const [filter, setFilter] = React.useState<Filter>("all");

  const filtered = React.useMemo(() => {
    return contacts.filter((c) => {
      if (filter === "mine" && c.assignedAgent !== (currentUserId ?? "")) return false;
      if (filter === "unassigned" && c.assignedAgent) return false;
      if (query) {
        const q = query.toLowerCase();
        if (
          !c.name.toLowerCase().includes(q) &&
          !c.phone.toLowerCase().includes(q) &&
          !c.lastMessage.toLowerCase().includes(q)
        )
          return false;
      }
      return true;
    });
  }, [contacts, filter, query, currentUserId]);

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        background: "var(--bg-surface)",
        overflow: "hidden",
      }}
    >
      {/* Header */}
      <div
        className="flex items-center justify-between"
        style={{
          padding: "12px 14px",
          borderBottom: "1px solid var(--border)",
          gap: 8,
        }}
      >
        <h2
          style={{
            fontSize: 15,
            fontWeight: 700,
            letterSpacing: "-0.01em",
            color: "var(--text-primary)",
            margin: 0,
          }}
        >
          Conversas
        </h2>
        <button
          type="button"
          onClick={onNewContact}
          aria-label="Novo contato"
          title="Novo contato"
          className="inline-flex items-center justify-center"
          style={{
            width: 30,
            height: 30,
            borderRadius: 8,
            background: "var(--brand-400)",
            color: "#fff",
            border: "none",
            cursor: "pointer",
          }}
        >
          <Plus size={16} />
        </button>
      </div>

      {/* Busca */}
      <div style={{ padding: "8px 10px" }}>
        <div
          className="flex items-center"
          style={{
            gap: 6,
            background: "var(--bg-base)",
            border: "1px solid var(--border)",
            borderRadius: 8,
            padding: "6px 10px",
          }}
        >
          <Search size={14} style={{ color: "var(--text-muted)" }} />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar conversa..."
            style={{
              flex: 1,
              border: "none",
              background: "transparent",
              outline: "none",
              fontSize: 13,
              color: "var(--text-primary)",
            }}
          />
        </div>
      </div>

      {/* Filtros */}
      <div
        className="flex items-center"
        style={{
          gap: 4,
          padding: "0 10px 8px",
          borderBottom: "1px solid var(--border)",
        }}
      >
        {([
          { id: "all", label: "Todos" },
          { id: "mine", label: "Meus" },
          { id: "unassigned", label: "Sem atend." },
        ] as const).map((f) => {
          const active = filter === f.id;
          return (
            <button
              key={f.id}
              type="button"
              onClick={() => setFilter(f.id)}
              style={{
                fontSize: 12,
                fontWeight: 500,
                padding: "4px 10px",
                borderRadius: 999,
                border: "1px solid",
                borderColor: active ? "var(--brand-400)" : "var(--border)",
                background: active
                  ? "color-mix(in oklab, var(--brand-400) 14%, transparent)"
                  : "transparent",
                color: active ? "var(--brand-400)" : "var(--text-muted)",
                cursor: "pointer",
              }}
            >
              {f.label}
            </button>
          );
        })}
      </div>

      {/* Lista */}
      <div style={{ flex: 1, overflowY: "auto" }}>
        {filtered.length === 0 ? (
          <div
            style={{
              padding: 24,
              textAlign: "center",
              fontSize: 12.5,
              color: "var(--text-muted)",
            }}
          >
            Nenhuma conversa encontrada.
          </div>
        ) : (
          filtered.map((c) => (
            <ConversationListItem
              key={c.id}
              contact={c}
              columns={columns}
              active={c.id === activeId}
              onClick={() => onSelect(c.id)}
            />
          ))
        )}
      </div>
    </div>
  );
}
