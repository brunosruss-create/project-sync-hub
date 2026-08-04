import * as React from "react";
import { useNavigate } from "@tanstack/react-router";
import { MessageSquare, Search, Moon, Sun, LogOut } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useTheme } from "@/hooks/use-theme";
import { useWorkspaceOwnerId } from "@/hooks/use-workspace-owner";
import {
  DEFAULT_COLUMNS,
  type ContactCard as Contact,
  type KanbanColumnDef,
} from "@/features/inbox/data";
import {
  CONTACT_COLUMNS,
  CONTACT_COLUMNS_LEGACY,
  isMissingColumnError,
  mapContactRow,
} from "@/features/inbox/contact-row";
import { NewContactModal } from "@/features/inbox/new-contact-modal";
import { Route as ChatRoute } from "@/routes/_authenticated.conversations-chat";
import { EmptyState as SharedEmptyState } from "@/components/empty-state";
import { ConversationList } from "./ConversationList";
import { ConversationPanel } from "@/features/inbox/conversation-panel";

const mapRow = mapContactRow;

export function ChatView() {
  const { user, signOut } = useAuth();
  const { theme, toggle } = useTheme();
  const { workspaceOwnerId } = useWorkspaceOwnerId();
  const navigate = useNavigate({ from: "/conversations-chat" });
  const rootNavigate = useNavigate();
  const search = ChatRoute.useSearch();
  const activeId = search.id || null;

  // Ações que nas outras telas moram na topbar. Aqui a topbar é escondida
  // (app-topbar.tsx), então elas viajam junto com o cabeçalho do contato.
  const headerActions = (
    <div className="flex items-center" style={{ gap: 2, flexShrink: 0 }}>
      <IconAction
        label="Buscar (Cmd+K)"
        onClick={() =>
          window.dispatchEvent(new KeyboardEvent("keydown", { key: "k", metaKey: true }))
        }
      >
        <Search size={16} />
      </IconAction>
      <IconAction label="Alternar tema" onClick={toggle}>
        {theme === "dark" ? <Sun size={16} /> : <Moon size={16} />}
      </IconAction>
      <IconAction
        label="Sair"
        onClick={() => {
          void signOut().then(() => rootNavigate({ to: "/login" }));
        }}
      >
        <LogOut size={16} />
      </IconAction>
    </div>
  );

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
      let { data, error } = await supabase
        .from("contacts")
        .select(CONTACT_COLUMNS)
        .eq("is_archived", false)
        .order("last_message_at", { ascending: false, nullsFirst: false });
      if (isMissingColumnError(error)) {
        const r = await supabase
          .from("contacts")
          .select(CONTACT_COLUMNS_LEGACY)
          .order("last_message_at", { ascending: false, nullsFirst: false });
        data = r.data as any;
        error = r.error;
      }
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
            /* Mesmo painel do Kanban, embutido em vez de gaveta. Um só chat
               para as duas telas — antes eram dois, e respostas rápidas
               existiram só de um lado por semanas sem ninguém notar. */
            <ConversationPanel
              variant="inline"
              contact={activeContact}
              onClose={handleBack}
              headerExtra={headerActions}
              onContactUpdate={(id, patch) =>
                setContacts((prev) =>
                  prev.map((c) => (c.id === id ? { ...c, ...patch } : c)),
                )
              }
            />
          ) : (
            <div className="flex flex-1 flex-col" style={{ background: "var(--bg-base)" }}>
              {/* Sem conversa aberta não há cabeçalho de contato — as ações
                  precisam de uma linha própria, senão sumiriam da tela. */}
              <div
                className="flex items-center justify-end"
                style={{ height: 44, padding: "0 10px", flexShrink: 0 }}
              >
                {headerActions}
              </div>
              <div className="flex flex-1 items-center justify-center">
                <SharedEmptyState
                  icon={<MessageSquare size={40} style={{ color: "var(--brand-400)" }} aria-hidden />}
                  title="Selecione uma conversa"
                  description="Escolha um contato à esquerda para começar a atender"
                />
              </div>
            </div>
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

function IconAction({
  children,
  onClick,
  label,
}: {
  children: React.ReactNode;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className="inline-flex items-center justify-center transition-colors"
      style={{
        width: 30,
        height: 30,
        borderRadius: "var(--radius-pill)",
        color: "var(--text-muted)",
        background: "transparent",
        flexShrink: 0,
      }}
      onMouseEnter={(e) => (e.currentTarget.style.background = "var(--bg-overlay)")}
      onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
    >
      {children}
    </button>
  );
}
