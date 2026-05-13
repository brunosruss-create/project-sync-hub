import * as React from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Search, Plus, Users, MessageSquare } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import {
  COLUMNS,
  COLUMN_COLOR,
  MOCK_CONTACTS,
  formatRelative,
  initials,
  type ContactCard,
  type KanbanColumnId,
} from "@/features/inbox/data";
import { ConversationPanel } from "@/features/inbox/conversation-panel";
import { EmptyState } from "@/components/empty-state";
import { SkeletonCard } from "@/components/skeleton";
import { notify } from "@/lib/notify";

export const Route = createFileRoute("/_authenticated/contacts")({
  head: () => ({
    meta: [
      { title: "Contatos | ZapFlow" },
      { name: "description", content: "Lista completa de contatos do seu CRM." },
    ],
  }),
  component: ContactsPage,
});

type ColumnFilter = "all" | KanbanColumnId;

function ContactsPage() {
  const [contacts, setContacts] = React.useState<ContactCard[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [query, setQuery] = React.useState("");
  const [debouncedQuery, setDebouncedQuery] = React.useState("");
  const [colFilter, setColFilter] = React.useState<ColumnFilter>("all");
  const [tagFilter, setTagFilter] = React.useState<string | null>(null);
  const [openContact, setOpenContact] = React.useState<ContactCard | null>(null);

  // Debounce 300ms
  React.useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(query.trim().toLowerCase()), 300);
    return () => clearTimeout(t);
  }, [query]);

  // Hydrate from Supabase, fallback to mocks
  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from("contacts")
        .select(
          "id,name,phone,avatar_url,kanban_column,assigned_agent_id,tags,priority,is_unread,last_message,last_message_at",
        )
        .order("last_message_at", { ascending: false });
      if (cancelled) return;
      if (error || !data || data.length === 0) {
        setContacts(MOCK_CONTACTS);
      } else {
        setContacts(
          data.map((r: any) => ({
            id: r.id,
            name: r.name,
            phone: r.phone,
            avatar: r.avatar_url,
            lastMessage: r.last_message ?? "",
            lastMessageAt: r.last_message_at ? new Date(r.last_message_at) : new Date(),
            assignedAgent: r.assigned_agent_id ?? null,
            tags: Array.isArray(r.tags) ? r.tags : [],
            isUnread: !!r.is_unread,
            priority: r.priority === "urgent" ? "urgent" : "normal",
            kanban_column: (r.kanban_column ?? "waiting") as KanbanColumnId,
          })),
        );
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Cmd+K → "Novo contato"
  React.useEffect(() => {
    const onNew = () => notify.info("Em breve: criar contato manualmente.");
    window.addEventListener("zf:new-contact", onNew);
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() !== "n" || e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      const tag = t?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || t?.isContentEditable) return;
      onNew();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("zf:new-contact", onNew);
      window.removeEventListener("keydown", onKey);
    };
  }, []);

  const allTags = React.useMemo(() => {
    const s = new Set<string>();
    contacts.forEach((c) => c.tags.forEach((t) => s.add(t)));
    return Array.from(s).sort();
  }, [contacts]);

  const filtered = React.useMemo(() => {
    return contacts.filter((c) => {
      if (colFilter !== "all" && c.kanban_column !== colFilter) return false;
      if (tagFilter && !c.tags.includes(tagFilter)) return false;
      if (debouncedQuery) {
        const q = debouncedQuery;
        if (
          !c.name.toLowerCase().includes(q) &&
          !c.phone.toLowerCase().includes(q) &&
          !c.lastMessage.toLowerCase().includes(q)
        )
          return false;
      }
      return true;
    });
  }, [contacts, colFilter, tagFilter, debouncedQuery]);

  return (
    <div className="flex flex-col" style={{ gap: 16 }}>
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between" style={{ gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 600, letterSpacing: "-0.015em" }}>
            Contatos
          </h1>
          <p style={{ marginTop: 2, fontSize: 12, color: "var(--text-muted)" }}>
            {loading ? "Carregando…" : `${filtered.length} contato${filtered.length === 1 ? "" : "s"}`}
          </p>
        </div>

        <div className="flex flex-wrap items-center" style={{ gap: 8 }}>
          <div
            className="flex items-center"
            style={{
              gap: 6,
              height: 32,
              padding: "0 10px",
              borderRadius: 6,
              border: "1px solid var(--border-strong)",
              background: "var(--bg-surface)",
              minWidth: 240,
            }}
          >
            <Search size={14} style={{ color: "var(--text-muted)" }} aria-hidden="true" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar por nome, telefone ou mensagem…"
              aria-label="Buscar contatos"
              style={{
                flex: 1,
                background: "transparent",
                border: "none",
                outline: "none",
                fontSize: 13,
                color: "var(--text-primary)",
              }}
            />
          </div>

          <button
            type="button"
            onClick={() => notify.info("Em breve: criar contato manualmente.")}
            className="btn-primary"
          >
            <Plus size={14} />
            Novo Contato
          </button>
        </div>
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap items-center" style={{ gap: 8 }}>
        <FilterPill active={colFilter === "all"} onClick={() => setColFilter("all")}>
          Todos
        </FilterPill>
        {COLUMNS.map((c) => (
          <FilterPill
            key={c.id}
            active={colFilter === c.id}
            color={c.color}
            onClick={() => setColFilter(c.id)}
          >
            {c.emoji} {c.label}
          </FilterPill>
        ))}
        {allTags.length > 0 && (
          <span
            style={{
              marginLeft: 8,
              paddingLeft: 8,
              borderLeft: "1px solid var(--border)",
              display: "flex",
              gap: 6,
              flexWrap: "wrap",
            }}
          >
            {allTags.slice(0, 8).map((t) => (
              <FilterPill key={t} active={tagFilter === t} onClick={() => setTagFilter(tagFilter === t ? null : t)}>
                #{t}
              </FilterPill>
            ))}
          </span>
        )}
      </div>

      {/* Conteúdo */}
      {loading ? (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
            gap: 12,
          }}
        >
          {Array.from({ length: 6 }).map((_, i) => (
            <SkeletonCard key={i} />
          ))}
        </div>
      ) : contacts.length === 0 ? (
        <EmptyState
          icon={<Users size={48} style={{ color: "var(--brand-400)" }} aria-hidden="true" />}
          title="Sua lista de contatos está vazia"
          description="Conecte seu WhatsApp para começar a receber e organizar conversas com seus clientes."
          action={{
            label: "Conectar WhatsApp",
            onClick: () => (window.location.href = "/settings/whatsapp"),
          }}
        />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={<Search size={48} style={{ color: "var(--text-muted)" }} aria-hidden="true" />}
          title="Nenhum contato encontrado"
          description="Tente ajustar os filtros ou a busca."
        />
      ) : (
        <ContactTable rows={filtered} onOpen={setOpenContact} />
      )}

      <ConversationPanel
        contact={openContact}
        onClose={() => setOpenContact(null)}
        onContactUpdate={(id, patch) =>
          setContacts((prev) => prev.map((c) => (c.id === id ? { ...c, ...patch } : c)))
        }
      />
    </div>
  );
}

/* -------------- Filter pill -------------- */

function FilterPill({
  active,
  color,
  onClick,
  children,
}: {
  active: boolean;
  color?: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        height: 28,
        padding: "0 10px",
        borderRadius: 999,
        fontSize: 12,
        fontWeight: 500,
        border: `1px solid ${active ? color ?? "var(--brand-400)" : "var(--border)"}`,
        background: active
          ? `color-mix(in oklab, ${color ?? "var(--brand-400)"} 14%, transparent)`
          : "transparent",
        color: active ? color ?? "var(--brand-400)" : "var(--text-primary)",
        cursor: "pointer",
      }}
    >
      {children}
    </button>
  );
}

/* -------------- Tabela / Lista -------------- */

function ContactTable({
  rows,
  onOpen,
}: {
  rows: ContactCard[];
  onOpen: (c: ContactCard) => void;
}) {
  return (
    <div
      style={{
        border: "1px solid var(--border)",
        borderRadius: 8,
        background: "var(--bg-surface)",
        overflow: "hidden",
      }}
    >
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, minWidth: 720 }}>
          <thead>
            <tr style={{ background: "var(--bg-overlay)" }}>
              <Th sticky>Contato</Th>
              <Th>Telefone</Th>
              <Th>Última mensagem</Th>
              <Th>Etiquetas</Th>
              <Th>Atendente</Th>
              <Th>Coluna</Th>
              <Th align="right">Última interação</Th>
            </tr>
          </thead>
          <tbody>
            {rows.map((c) => (
              <tr
                key={c.id}
                onClick={() => onOpen(c)}
                style={{
                  borderTop: "1px solid var(--border)",
                  cursor: "pointer",
                  background: c.isUnread ? "color-mix(in oklab, var(--brand-400) 4%, transparent)" : "transparent",
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = "var(--bg-overlay)")}
                onMouseLeave={(e) =>
                  (e.currentTarget.style.background = c.isUnread
                    ? "color-mix(in oklab, var(--brand-400) 4%, transparent)"
                    : "transparent")
                }
              >
                <Td sticky>
                  <div className="flex items-center" style={{ gap: 10 }}>
                    <Avatar contact={c} />
                    <div className="min-w-0">
                      <div
                        className="truncate"
                        style={{ fontWeight: c.isUnread ? 600 : 500, color: "var(--text-primary)" }}
                      >
                        {c.name}
                      </div>
                      {c.priority === "urgent" && (
                        <div style={{ fontSize: 10, color: "#EF4444", fontWeight: 600 }}>URGENTE</div>
                      )}
                    </div>
                  </div>
                </Td>
                <Td muted>{c.phone}</Td>
                <Td>
                  <span
                    className="truncate inline-block"
                    style={{
                      maxWidth: 280,
                      color: c.isUnread ? "var(--text-primary)" : "var(--text-muted)",
                      verticalAlign: "middle",
                    }}
                  >
                    {c.lastMessage || "—"}
                  </span>
                </Td>
                <Td>
                  <div className="flex flex-wrap" style={{ gap: 4 }}>
                    {c.tags.slice(0, 2).map((t) => (
                      <span
                        key={t}
                        style={{
                          fontSize: 10,
                          padding: "2px 6px",
                          borderRadius: 999,
                          background: "var(--bg-overlay)",
                          color: "var(--text-muted)",
                        }}
                      >
                        {t}
                      </span>
                    ))}
                    {c.tags.length > 2 && (
                      <span style={{ fontSize: 10, color: "var(--text-muted)" }}>
                        +{c.tags.length - 2}
                      </span>
                    )}
                  </div>
                </Td>
                <Td muted>{c.assignedAgent ?? "—"}</Td>
                <Td>
                  <span
                    style={{
                      fontSize: 11,
                      padding: "2px 8px",
                      borderRadius: 999,
                      border: `1px solid ${COLUMN_COLOR[c.kanban_column]}`,
                      color: COLUMN_COLOR[c.kanban_column],
                    }}
                  >
                    {COLUMNS.find((x) => x.id === c.kanban_column)?.label}
                  </span>
                </Td>
                <Td align="right" muted>
                  {formatRelative(c.lastMessageAt)}
                </Td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Th({
  children,
  align,
  sticky,
}: {
  children: React.ReactNode;
  align?: "right";
  sticky?: boolean;
}) {
  return (
    <th
      style={{
        padding: "10px 12px",
        textAlign: align ?? "left",
        fontSize: 11,
        fontWeight: 600,
        color: "var(--text-muted)",
        textTransform: "uppercase",
        letterSpacing: "0.04em",
        position: sticky ? "sticky" : undefined,
        left: sticky ? 0 : undefined,
        background: sticky ? "var(--bg-overlay)" : undefined,
        zIndex: sticky ? 1 : undefined,
      }}
    >
      {children}
    </th>
  );
}

function Td({
  children,
  align,
  muted,
  sticky,
}: {
  children: React.ReactNode;
  align?: "right";
  muted?: boolean;
  sticky?: boolean;
}) {
  return (
    <td
      style={{
        padding: "10px 12px",
        textAlign: align ?? "left",
        color: muted ? "var(--text-muted)" : "var(--text-primary)",
        whiteSpace: "nowrap",
        position: sticky ? "sticky" : undefined,
        left: sticky ? 0 : undefined,
        background: sticky ? "var(--bg-surface)" : undefined,
      }}
    >
      {children}
    </td>
  );
}

function Avatar({ contact }: { contact: ContactCard }) {
  return <ContactAvatar name={contact.name} avatarUrl={contact.avatar} size={32} />;
}
