import * as React from "react";
import { useNavigate } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useWorkspaceOwnerId } from "@/hooks/use-workspace-owner";
import {
  DEFAULT_COLUMNS,
  type ContactCard as Contact,
  type KanbanColumnDef,
  type KanbanColumnId,
} from "@/features/inbox/data";
import { NewContactModal } from "@/features/inbox/new-contact-modal";
import { Route as ChatRoute } from "@/routes/_authenticated.conversations-chat";
import { ConversationList } from "./ConversationList";
import { MessageThread } from "./MessageThread";
import { ChatEmptyState } from "./EmptyState";

const SELECT_FULL =
  "id,name,phone,avatar_url,kanban_column,assigned_agent_id,tags,priority,is_unread,unread_count,last_direction,last_message,last_message_at,email,notes,is_blocked,is_archived";

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
  unreadCount: typeof r.unread_count === "number" ? r.unread_count : (r.is_unread ? 1 : 0),
  lastDirection: r.last_direction ?? null,
  priority: r.priority === "urgent" ? "urgent" : "normal",
  kanban_column: (r.kanban_column ?? "waiting") as KanbanColumnId,
  email: r.email ?? null,
  notes: r.notes ?? null,
  is_blocked: !!r.is_blocked,
  is_archived: !!r.is_archived,
});

export function ChatView() {
  const { user } = useAuth();
  const { workspaceOwnerId } = useWorkspaceOwnerId();
  const navigate = useNavigate({ from: "/conversations-chat" });
  const search = ChatRoute.useSearch();
  const activeId = search.id || null;

  const [contacts, setContacts] = React.useState<Contact[]>([]);
  const [columns, setColumns] = React.useState<KanbanColumnDef[]>(DEFAULT_COLUMNS);
  const [newContactOpen, setNewContactOpen] = React.useState(false);
  const [isMobile, setIsMobile] = React.useState(false);

  React.useEffect(() => {
    const mq = window.matchMedia("(max-width: 767px)");
    const apply = () => setIsMobile(mq.matches);
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);

  // Carrega contatos + realtime + zf:contact-updated
  React.useEffect(() => {
    if (!workspaceOwnerId) return;
    let cancelled = false;

    const load = async () => {
      const { data, error } = await supabase
        .from("contacts")
        .select(SELECT_FULL)
        .eq("is_archived", false)
        .order("last_message_at", { ascending: false, nullsFirst: false });
      if (cancelled) return;
      if (error) {
        console.warn("[chat] erro ao carregar contatos:", error.message);
        return;
      }
      setContacts((data ?? []).map(mapRow));
    };

    void load();

    const channel = supabase
      .channel(`chat-contacts-${workspaceOwnerId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "contacts", filter: `owner_user_id=eq.${workspaceOwnerId}` },
        (payload) => {
          const row = mapRow(payload.new as any);
          setContacts((prev) =>
            prev.some((c) => c.id === row.id)
              ? prev
              : [row, ...prev].sort((a, b) => b.lastMessageAt.getTime() - a.lastMessageAt.getTime()),
          );
        },
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "contacts", filter: `owner_user_id=eq.${workspaceOwnerId}` },
        (payload) => {
          const raw = payload.new as any;
          if (!raw || typeof raw.phone !== "string") {
            void load();
            return;
          }
          const row = mapRow(raw);
          setContacts((prev) => {
            if (row.is_archived) return prev.filter((c) => c.id !== row.id);
            const exists = prev.some((c) => c.id === row.id);
            const next = exists ? prev.map((c) => (c.id === row.id ? row : c)) : [row, ...prev];
            return next.sort((a, b) => b.lastMessageAt.getTime() - a.lastMessageAt.getTime());
          });
        },
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages", filter: `owner_user_id=eq.${workspaceOwnerId}` },
        () => void load(),
      )
      .subscribe();

    const onFocus = () => void load();
    window.addEventListener("focus", onFocus);

    const onContactUpdated = (e: Event) => {
      const detail = (e as CustomEvent<{ id: string; patch: Partial<Contact> & { is_archived?: boolean } }>).detail;
      if (!detail?.id) return;
      const { id, patch } = detail;
      setContacts((prev) => {
        if (patch.is_archived) return prev.filter((c) => c.id !== id);
        return prev.map((c) => (c.id === id ? ({ ...c, ...patch } as Contact) : c));
      });
    };
    window.addEventListener("zf:contact-updated", onContactUpdated as EventListener);

    return () => {
      cancelled = true;
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("zf:contact-updated", onContactUpdated as EventListener);
      void supabase.removeChannel(channel);
    };
  }, [workspaceOwnerId]);

  // Carrega colunas (apenas para cor do indicador de status)
  React.useEffect(() => {
    if (!workspaceOwnerId) return;
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from("kanban_columns")
        .select("id,slug,label,emoji,color,position,is_system")
        .order("position", { ascending: true });
      if (cancelled || error || !data || data.length === 0) return;
      setColumns(
        data.map((r: any) => ({
          id: r.id,
          slug: r.slug,
          label: r.label,
          emoji: r.emoji ?? "📌",
          color: r.color ?? "#6B7280",
          position: typeof r.position === "number" ? r.position : 0,
          is_system: !!r.is_system,
        })),
      );
    })();
    return () => {
      cancelled = true;
    };
  }, [workspaceOwnerId]);

  const activeContact = React.useMemo(
    () => (activeId ? contacts.find((c) => c.id === activeId) ?? null : null),
    [contacts, activeId],
  );

  const handleSelect = (id: string) => {
    void navigate({ search: { id } });
  };

  const handleBack = () => {
    void navigate({ search: { id: undefined } });
  };

  const showList = !isMobile || !activeId;
  const showThread = !isMobile || !!activeId;

  return (
    <div
      style={{
        display: "flex",
        height: "100%",
        overflow: "hidden",
        background: "var(--bg-base)",
      }}
    >
      {showList && (
        <div
          style={{
            width: isMobile ? "100%" : 360,
            flexShrink: 0,
            borderRight: isMobile ? "none" : "1px solid var(--border)",
            height: "100%",
            overflow: "hidden",
          }}
        >
          <ConversationList
            contacts={contacts}
            columns={columns}
            activeId={activeId}
            currentUserId={user?.id ?? null}
            onSelect={handleSelect}
            onNewContact={() => setNewContactOpen(true)}
          />
        </div>
      )}

      {showThread && (
        <div
          style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            minWidth: 0,
            height: "100%",
          }}
        >
          {activeContact ? (
            <MessageThread contact={activeContact} onBack={handleBack} />
          ) : (
            <ChatEmptyState />
          )}
        </div>
      )}

      <NewContactModal
        open={newContactOpen}
        onClose={() => setNewContactOpen(false)}
        onCreated={(c) => {
          setNewContactOpen(false);
          void navigate({ search: { id: c.id } });
        }}
      />
    </div>
  );
}
