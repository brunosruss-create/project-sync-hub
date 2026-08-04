import * as React from "react";
import { Search, Plus, StickyNote, Loader2 } from "lucide-react";
import {
  type ContactCard as Contact,
  type KanbanColumnDef,
  formatRelative,
} from "@/features/inbox/data";
import { supabase } from "@/integrations/supabase/client";
import {
  MIN_SEARCH_LEN,
  SEARCH_LIMIT,
  escapeLike,
  snippet,
  type MessageHit,
} from "@/lib/message-search";
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
  const [hits, setHits] = React.useState<MessageHit[] | null>(null);
  const [searching, setSearching] = React.useState(false);

  /**
   * Busca no conteúdo das mensagens, complementando o filtro local acima —
   * que só enxerga nome, telefone e a ÚLTIMA mensagem.
   *
   * Server-side com `.ilike`, que parametriza o valor. Nunca interpolar o
   * termo numa string de `.or()`: é input livre do usuário.
   *
   * O escopo vem da RLS, não de filtro daqui: um atendente só encontra nas
   * conversas atribuídas a ele, sem código extra.
   */
  React.useEffect(() => {
    const term = query.trim();
    if (term.length < MIN_SEARCH_LEN) {
      setHits(null);
      setSearching(false);
      return;
    }
    let cancelled = false;
    setSearching(true);
    const t = setTimeout(async () => {
      const { data, error } = await supabase
        .from("messages")
        .select("id,contact_id,content,created_at,is_internal")
        .ilike("content", `%${escapeLike(term)}%`)
        .order("created_at", { ascending: false })
        .limit(SEARCH_LIMIT);
      if (cancelled) return;
      if (error) {
        console.warn("[busca] falha ao buscar mensagens:", error.message);
        setHits([]);
      } else {
        setHits((data ?? []) as MessageHit[]);
      }
      setSearching(false);
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [query]);

  const contactsById = React.useMemo(() => {
    const m = new Map<string, Contact>();
    contacts.forEach((c) => m.set(c.id, c));
    return m;
  }, [contacts]);

  // Mensagem de contato que já apareceu na lista de cima seria resultado
  // duplicado — o valor da busca está em achar o que o filtro local não acha.
  const visibleHits = React.useMemo(() => {
    if (!hits) return [];
    return hits.filter((h) => contactsById.has(h.contact_id));
  }, [hits, contactsById]);

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
      {/* Header — sem borda embaixo de propósito, pra emendar com a busca
          como uma superfície só (padrão do WhatsApp Web). */}
      <div
        className="flex items-center justify-between"
        style={{
          padding: "12px 14px",
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
            borderRadius: "var(--radius-pill)",
            background: "var(--brand-400)",
            color: "#fff",
            border: "none",
            cursor: "pointer",
            flexShrink: 0,
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
            borderRadius: "var(--radius-control)",
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

      {/* Filtros — mesma lógica: sem borda embaixo, a lista já tem o próprio
          espaçamento entre linhas pra separar visualmente. */}
      <div
        className="flex items-center"
        style={{
          gap: 4,
          padding: "0 10px 8px",
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
                borderRadius: "var(--radius-pill)",
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
        {filtered.length === 0 && visibleHits.length === 0 && !searching ? (
          <div
            style={{
              padding: 24,
              textAlign: "center",
              fontSize: 12.5,
              color: "var(--text-muted)",
            }}
          >
            {query.trim().length > 0 && query.trim().length < MIN_SEARCH_LEN
              ? `Digite ao menos ${MIN_SEARCH_LEN} letras para buscar nas mensagens.`
              : "Nenhuma conversa encontrada."}
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

        {/* Resultados dentro das mensagens — o que o filtro acima não alcança */}
        {query.trim().length >= MIN_SEARCH_LEN && (
          <>
            <div
              className="flex items-center"
              style={{
                gap: 6,
                padding: "10px 14px 6px",
                fontSize: 11,
                fontWeight: 600,
                textTransform: "uppercase",
                letterSpacing: "0.05em",
                color: "var(--text-muted)",
                borderTop: filtered.length > 0 ? "1px solid var(--border)" : "none",
              }}
            >
              Nas mensagens
              {searching && <Loader2 size={11} className="animate-spin" />}
              {!searching && visibleHits.length > 0 && (
                <span style={{ fontWeight: 400 }}>
                  ({visibleHits.length}
                  {visibleHits.length === SEARCH_LIMIT ? "+" : ""})
                </span>
              )}
            </div>

            {!searching && visibleHits.length === 0 ? (
              <div style={{ padding: "4px 14px 14px", fontSize: 12, color: "var(--text-muted)" }}>
                Nenhuma mensagem com “{query.trim()}”.
              </div>
            ) : (
              visibleHits.map((h) => {
                const c = contactsById.get(h.contact_id)!;
                const s = snippet(h.content ?? "", query.trim());
                return (
                  <button
                    key={h.id}
                    type="button"
                    onClick={() => onSelect(h.contact_id)}
                    style={{
                      display: "block",
                      width: "100%",
                      textAlign: "left",
                      padding: "8px 14px",
                      border: "none",
                      borderBottom: "1px solid var(--border)",
                      background: "transparent",
                      cursor: "pointer",
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = "var(--bg-overlay)")}
                    onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                  >
                    <div className="flex items-center" style={{ gap: 6 }}>
                      <span
                        className="truncate"
                        style={{ fontSize: 12.5, fontWeight: 600, color: "var(--text-primary)" }}
                      >
                        {c.name}
                      </span>
                      {/* Nota interna aparece na busca — o atendente deve achar
                          as próprias anotações — mas marcada, para ninguém
                          citar uma delas para o cliente por engano. */}
                      {h.is_internal && (
                        <span
                          className="flex items-center"
                          style={{
                            gap: 3,
                            fontSize: 9.5,
                            fontWeight: 600,
                            padding: "1px 5px",
                            borderRadius: "var(--radius-pill)",
                            background: "color-mix(in oklab, #F59E0B 18%, transparent)",
                            color: "#B45309",
                            flexShrink: 0,
                          }}
                        >
                          <StickyNote size={9} aria-hidden />
                          Nota
                        </span>
                      )}
                      <span style={{ marginLeft: "auto", fontSize: 10.5, color: "var(--text-muted)", flexShrink: 0 }}>
                        {formatRelative(new Date(h.created_at))}
                      </span>
                    </div>
                    <div
                      className="truncate"
                      style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 1 }}
                    >
                      {s.before}
                      <mark
                        style={{
                          background: "color-mix(in oklab, var(--brand-400) 28%, transparent)",
                          color: "var(--text-primary)",
                          borderRadius: 2,
                          padding: "0 1px",
                        }}
                      >
                        {s.hit}
                      </mark>
                      {s.after}
                    </div>
                  </button>
                );
              })
            )}
          </>
        )}
      </div>
    </div>
  );
}

