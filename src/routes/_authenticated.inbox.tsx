import * as React from "react";
import { createFileRoute } from "@tanstack/react-router";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { Search, Plus, Filter, MessageSquare } from "lucide-react";
import { notify } from "@/lib/notify";
import { EmptyState } from "@/components/empty-state";
import {
  COLUMNS,
  MOCK_CONTACTS,
  type ContactCard as Contact,
  type KanbanColumnId,
} from "@/features/inbox/data";
import { KanbanColumn } from "@/features/inbox/kanban-column";
import { ContactCard } from "@/features/inbox/contact-card";
import { ConversationPanel } from "@/features/inbox/conversation-panel";
import { NewContactModal } from "@/features/inbox/new-contact-modal";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";

export const Route = createFileRoute("/_authenticated/inbox")({
  component: InboxPage,
});

type Filter = "all" | "mine" | "unassigned";

function InboxPage() {
  const { user } = useAuth();
  const [contacts, setContacts] = React.useState<Contact[]>([]);
  const [isLoadingContacts, setIsLoadingContacts] = React.useState(true);
  const [loadError, setLoadError] = React.useState<string | null>(null);
  const [activeId, setActiveId] = React.useState<string | null>(null);
  const [filter, setFilter] = React.useState<Filter>("all");
  const [query, setQuery] = React.useState("");
  const [openContact, setOpenContact] = React.useState<Contact | null>(null);
  const [whatsappStatus, setWhatsappStatus] = React.useState<"connected" | "disconnected" | "loading">("loading");
  const [newContactOpen, setNewContactOpen] = React.useState(false);
  const [highlightId, setHighlightId] = React.useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
  );

  // Verifica status do WhatsApp
  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from("whatsapp_instances")
        .select("status")
        .eq("owner_user_id", user?.id)
        .maybeSingle();
      if (cancelled) return;
      if (error || !data) {
        setWhatsappStatus("disconnected");
        return;
      }
      setWhatsappStatus(data.status === "connected" ? "connected" : "disconnected");
    })();
    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  // Carrega contatos reais do Supabase + realtime + refetch on focus.
  React.useEffect(() => {
    if (!user?.id) return;
    let cancelled = false;

    const mapRow = (r: any): Contact => ({
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
    });

    const load = async () => {
      const { data, error } = await supabase
        .from("contacts")
        .select(
          "id,name,phone,avatar_url,kanban_column,assigned_agent_id,tags,priority,is_unread,last_message,last_message_at",
        )
        .order("last_message_at", { ascending: false });
      if (cancelled) return;
      if (error) {
        console.warn("[inbox] erro ao carregar contatos:", error.message);
        setLoadError(error.message);
        if (import.meta.env.DEV) setContacts(MOCK_CONTACTS);
        setIsLoadingContacts(false);
        return;
      }
      setLoadError(null);
      setContacts((data ?? []).map(mapRow));
      setIsLoadingContacts(false);
    };

    void load();

    // Realtime: novas mensagens chegando via webhook atualizam o inbox sem refresh
    const channel = supabase
      .channel(`inbox-contacts-${user.id}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "contacts", filter: `owner_user_id=eq.${user.id}` },
        (payload) => {
          const row = mapRow(payload.new as any);
          setContacts((prev) =>
            prev.some((c) => c.id === row.id)
              ? prev
              : [row, ...prev].sort(
                  (a, b) => b.lastMessageAt.getTime() - a.lastMessageAt.getTime(),
                ),
          );
        },
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "contacts", filter: `owner_user_id=eq.${user.id}` },
        (payload) => {
          const row = mapRow(payload.new as any);
          setContacts((prev) => {
            const exists = prev.some((c) => c.id === row.id);
            const next = exists ? prev.map((c) => (c.id === row.id ? row : c)) : [row, ...prev];
            return next.sort((a, b) => b.lastMessageAt.getTime() - a.lastMessageAt.getTime());
          });
        },
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages", filter: `owner_user_id=eq.${user.id}` },
        () => {
          // Fallback: garante consistência mesmo se o UPDATE em contacts vier sem RLS visível
          void load();
        },
      )
      .subscribe();

    const onFocus = () => void load();
    window.addEventListener("focus", onFocus);

    return () => {
      cancelled = true;
      window.removeEventListener("focus", onFocus);
      void supabase.removeChannel(channel);
    };
  }, [user?.id]);

  // Listener para Cmd+K → "Novo contato" + tecla "N"
  React.useEffect(() => {
    const onNew = () => setNewContactOpen(true);
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

  const filtered = React.useMemo(() => {
    return contacts.filter((c) => {
      if (filter === "mine" && c.assignedAgent !== (user?.email?.split("@")[0] ?? ""))
        return false;
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
  }, [contacts, filter, query, user]);

  const byColumn = React.useMemo(() => {
    const map: Record<KanbanColumnId, Contact[]> = {
      waiting: [],
      in_progress: [],
      scheduled: [],
      urgent: [],
    };
    for (const c of filtered) map[c.kanban_column].push(c);
    return map;
  }, [filtered]);

  const onDragStart = (e: DragStartEvent) => setActiveId(String(e.active.id));

  const onDragEnd = async (e: DragEndEvent) => {
    setActiveId(null);
    if (!e.over) return;
    const cardId = String(e.active.id);
    const col = e.over.id as KanbanColumnId;
    const current = contacts.find((c) => c.id === cardId);
    if (!current || current.kanban_column === col) return;

    setContacts((prev) =>
      prev.map((c) => (c.id === cardId ? { ...c, kanban_column: col } : c)),
    );

    const { error } = await supabase
      .from("contacts")
      .update({ kanban_column: col })
      .eq("id", cardId);
    if (error) {
      // silent — likely table missing in dev. Don't spam.
      console.warn("[inbox] persistência ignorada:", error.message);
    } else {
      notify.success(`Movido para ${COLUMNS.find((c) => c.id === col)?.label}`);
    }
  };

  const activeContact = activeId ? contacts.find((c) => c.id === activeId) : null;

  return (
    <div className="flex flex-col" style={{ gap: 16, height: "calc(100vh - 48px - 48px)" }}>
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between" style={{ gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 600, letterSpacing: "-0.015em" }}>
            Atendimento
          </h1>
          <p style={{ marginTop: 2, fontSize: 12, color: "var(--text-muted)" }}>
            {filtered.length} conversa{filtered.length === 1 ? "" : "s"} ·{" "}
            {byColumn.urgent.length} urgente{byColumn.urgent.length === 1 ? "" : "s"}
          </p>
        </div>

        <div className="flex flex-wrap items-center" style={{ gap: 8 }}>
          {/* Filter pills */}
          <div
            className="flex items-center"
            style={{
              gap: 2,
              padding: 2,
              background: "var(--bg-overlay)",
              borderRadius: 6,
              border: "1px solid var(--border)",
            }}
          >
            {(
              [
                { id: "all", label: "Todos" },
                { id: "mine", label: "Meus" },
                { id: "unassigned", label: "Sem atendente" },
              ] as Array<{ id: Filter; label: string }>
            ).map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => setFilter(f.id)}
                style={{
                  height: 26,
                  padding: "0 10px",
                  borderRadius: 4,
                  fontSize: 12,
                  fontWeight: 500,
                  background: filter === f.id ? "var(--bg-surface)" : "transparent",
                  color:
                    filter === f.id ? "var(--text-primary)" : "var(--text-muted)",
                  border: filter === f.id ? "1px solid var(--border)" : "1px solid transparent",
                }}
              >
                {f.label}
              </button>
            ))}
          </div>

          {/* Search */}
          <div className="relative">
            <Search
              size={14}
              style={{
                position: "absolute",
                left: 10,
                top: "50%",
                transform: "translateY(-50%)",
                color: "var(--text-muted)",
              }}
            />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar por nome, telefone…"
              style={{
                width: 240,
                height: 32,
                padding: "0 10px 0 30px",
                fontSize: 13,
                color: "var(--text-primary)",
                background: "var(--bg-base)",
                border: "1px solid var(--border-strong)",
                borderRadius: 6,
                outline: "none",
              }}
            />
          </div>

          <button
            type="button"
            className="inline-flex items-center"
            style={{
              gap: 4,
              height: 32,
              padding: "0 10px",
              borderRadius: 6,
              border: "1px solid var(--border-strong)",
              background: "transparent",
              color: "var(--text-primary)",
              fontSize: 13,
              fontWeight: 500,
            }}
          >
            <Filter size={14} />
            Filtros
          </button>

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

      {/* Kanban */}
      {isLoadingContacts || whatsappStatus === "loading" ? (
        <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--text-muted)", fontSize: 13 }}>
          Carregando atendimentos…
        </div>
      ) : loadError ? (
        <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <EmptyState
            icon={<MessageSquare size={48} style={{ color: "var(--brand-400)" }} aria-hidden="true" />}
            title="Não foi possível carregar o Inbox"
            description={`Supabase retornou: ${loadError}`}
          />
        </div>
      ) : whatsappStatus === "disconnected" ? (
        <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <EmptyState
            icon={<MessageSquare size={48} style={{ color: "var(--brand-400)" }} aria-hidden="true" />}
            title="WhatsApp não conectado"
            description="Conecte seu WhatsApp para começar a receber conversas dos seus clientes."
            action={{ label: "Conectar WhatsApp", onClick: () => (window.location.href = "/settings/whatsapp") }}
          />
        </div>
      ) : (
        <DndContext sensors={sensors} onDragStart={onDragStart} onDragEnd={onDragEnd}>
          {contacts.length === 0 && (
            <div
              style={{
                padding: "8px 12px",
                fontSize: 12,
                color: "var(--text-muted)",
                background: "var(--bg-overlay)",
                border: "1px solid var(--border)",
                borderRadius: 6,
              }}
            >
              Seu WhatsApp está conectado. Aguardando a primeira mensagem dos clientes…
            </div>
          )}
          <div
            className="flex-1 overflow-x-auto overflow-y-hidden"
            style={{ display: "flex", gap: 12, paddingBottom: 8 }}
          >
            {COLUMNS.map((c) => (
              <KanbanColumn
                key={c.id}
                id={c.id}
                label={c.label}
                emoji={c.emoji}
                contacts={byColumn[c.id]}
                onCardClick={setOpenContact}
              />
            ))}
          </div>

          <DragOverlay dropAnimation={null}>
            {activeContact && (
              <ContactCard contact={activeContact} onClick={() => {}} isOverlay />
            )}
          </DragOverlay>
        </DndContext>
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
