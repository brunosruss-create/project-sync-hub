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
import { Search, Plus, MessageSquare, Columns3, Loader2, StickyNote } from "lucide-react";
import { notify } from "@/lib/notify";
import {
  MIN_SEARCH_LEN,
  SEARCH_LIMIT,
  escapeLike,
  snippet,
  type MessageHit,
} from "@/lib/message-search";
import { EmptyState as SharedEmptyState } from "@/components/empty-state";
import { ConfirmDialog } from "@/components/confirm-dialog";
import {
  DEFAULT_COLUMNS,
  MOCK_CONTACTS,
  type ContactCard as Contact,
  type KanbanColumnDef,
  type KanbanColumnId,
} from "@/features/inbox/data";
import {
  CONTACT_COLUMNS,
  CONTACT_COLUMNS_LEGACY,
  isMissingColumnError,
  mapContactRow,
} from "@/features/inbox/contact-row";
import { KanbanColumn, type ColumnMenuRequestDetail } from "@/features/inbox/kanban-column";
import { ContactCard, type CardMenuRequestDetail } from "@/features/inbox/contact-card";
import { CardMenu, type CardMenuAction } from "@/features/inbox/card-menu";
import { ColumnMenu, type ColumnMenuAction } from "@/features/inbox/column-menu";
import { ColumnEditModal } from "@/features/inbox/column-edit-modal";
import { ConversationPanel } from "@/features/inbox/conversation-panel";
import { NewContactModal } from "@/features/inbox/new-contact-modal";
import { EditContactModal } from "@/features/inbox/edit-contact-modal";
import { ScheduleModal } from "@/features/inbox/schedule-modal";
import { TransferConversationModal } from "@/features/inbox/transfer-conversation-modal";
import { supabase } from "@/integrations/supabase/client";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { listProfessionals } from "@/lib/professionals.functions";
import { useAuth } from "@/hooks/use-auth";
import { useWorkspaceOwnerId } from "@/hooks/use-workspace-owner";
import { useRole } from "@/hooks/use-role";
import { useContactActions } from "@/hooks/use-contact-actions";

export const Route = createFileRoute("/_authenticated/inbox")({
  component: InboxPage,
});

type Filter = "all" | "mine" | "unassigned";

function InboxPage() {
  const { user } = useAuth();
  const { workspaceOwnerId } = useWorkspaceOwnerId();
  const { isAgent, loading: roleLoading } = useRole();
  const [contacts, setContacts] = React.useState<Contact[]>([]);
  const [isLoadingContacts, setIsLoadingContacts] = React.useState(true);
  const [loadError, setLoadError] = React.useState<string | null>(null);
  const [activeId, setActiveId] = React.useState<string | null>(null);
  const [filter, setFilter] = React.useState<Filter>("all");
  const filterInitialized = React.useRef(false);

  // Quando o role real carrega (manager/agent), define o filtro padrão UMA vez.
  // Sem isso, no refresh o useRole devolve "agent" enquanto carrega e o filter
  // cristaliza em "mine", escondendo conversas do manager.
  React.useEffect(() => {
    if (roleLoading || filterInitialized.current) return;
    filterInitialized.current = true;
    if (isAgent) setFilter("mine");
  }, [roleLoading, isAgent]);
  const [query, setQuery] = React.useState("");

  // Busca dentro do conteúdo das mensagens, complementando o filtro acima (que
  // só enxerga nome/telefone/última mensagem). Portado de ConversationList.tsx
  // — mesma lógica, aqui como dropdown por não haver uma lista para anexar.
  const [msgHits, setMsgHits] = React.useState<MessageHit[] | null>(null);
  const [searchingMsgs, setSearchingMsgs] = React.useState(false);
  // Separado de `query` de propósito: fechar o dropdown ao clicar fora não
  // pode limpar o filtro por nome/telefone que o mesmo campo aplica ao board.
  const [msgDropdownOpen, setMsgDropdownOpen] = React.useState(true);
  const searchBoxRef = React.useRef<HTMLDivElement | null>(null);

  React.useEffect(() => {
    setMsgDropdownOpen(true);
    const term = query.trim();
    if (term.length < MIN_SEARCH_LEN) {
      setMsgHits(null);
      setSearchingMsgs(false);
      return;
    }
    let cancelled = false;
    setSearchingMsgs(true);
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
        setMsgHits([]);
      } else {
        setMsgHits((data ?? []) as MessageHit[]);
      }
      setSearchingMsgs(false);
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [query]);

  React.useEffect(() => {
    if (query.trim().length < MIN_SEARCH_LEN || !msgDropdownOpen) return;
    const onDoc = (e: MouseEvent) => {
      if (searchBoxRef.current && !searchBoxRef.current.contains(e.target as Node)) {
        setMsgDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [query, msgDropdownOpen]);

  const contactsById = React.useMemo(() => {
    const m = new Map<string, Contact>();
    contacts.forEach((c) => m.set(c.id, c));
    return m;
  }, [contacts]);

  // Mensagem de contato fora da lista carregada (RLS já filtrou) não vira resultado.
  const visibleMsgHits = React.useMemo(() => {
    if (!msgHits) return [];
    return msgHits.filter((h) => contactsById.has(h.contact_id));
  }, [msgHits, contactsById]);

  // Filtro de VISUALIZAÇÃO por profissional. O vínculo conversa↔profissional é
  // derivado dos agendamentos (quem atende o cliente), não de `assignedAgent` —
  // esse aponta para membro da equipe com login, e profissional é outra entidade,
  // que pode nem ter acesso ao sistema.
  const [proFilter, setProFilter] = React.useState<string>(
    () => (typeof window !== "undefined" && localStorage.getItem("zf:inbox-pro-filter")) || "all",
  );
  React.useEffect(() => {
    localStorage.setItem("zf:inbox-pro-filter", proFilter);
  }, [proFilter]);

  const fetchProfessionals = useServerFn(listProfessionals);
  const profQ = useQuery({
    queryKey: ["professionals"],
    queryFn: () => fetchProfessionals(),
    staleTime: 30_000,
  });
  const professionals = React.useMemo(() => profQ.data ?? [], [profQ.data]);

  // contact_id → profissional do agendamento mais recente. Acompanha a agenda em
  // realtime para o filtro não ficar defasado depois de uma remarcação.
  const [proByContact, setProByContact] = React.useState<Map<string, string>>(new Map());
  React.useEffect(() => {
    if (!workspaceOwnerId) return;
    let cancelled = false;
    const load = async () => {
      const { data, error } = await supabase
        .from("appointments")
        .select("contact_id, professional_id, starts_at")
        .eq("owner_user_id", workspaceOwnerId)
        .neq("status", "cancelled")
        .order("starts_at", { ascending: false });
      if (cancelled) return;
      if (error) {
        console.warn("[inbox] mapa de profissionais:", error.message);
        return;
      }
      const map = new Map<string, string>();
      // Vem do mais recente para o mais antigo: o primeiro que aparece vence.
      for (const r of data ?? []) {
        if (!r.contact_id || !r.professional_id) continue;
        if (!map.has(r.contact_id)) map.set(r.contact_id, r.professional_id);
      }
      setProByContact(map);
    };
    void load();
    const ch = supabase
      .channel(`inbox-appointments-${workspaceOwnerId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "appointments" }, () =>
        load(),
      )
      .subscribe();
    return () => {
      cancelled = true;
      supabase.removeChannel(ch);
    };
  }, [workspaceOwnerId]);

  const [openContact, setOpenContact] = React.useState<Contact | null>(null);
  const [whatsappStatus, setWhatsappStatus] = React.useState<"connected" | "disconnected" | "loading">("loading");
  const [newContactOpen, setNewContactOpen] = React.useState(false);
  const [highlightId, setHighlightId] = React.useState<string | null>(null);
  const [menuState, setMenuState] = React.useState<CardMenuRequestDetail | null>(null);
  const [editTarget, setEditTarget] = React.useState<Contact | null>(null);
  const [scheduleTarget, setScheduleTarget] = React.useState<Contact | null>(null);
  const [transferTarget, setTransferTarget] = React.useState<Contact | null>(null);

  // Colunas dinâmicas
  const [columns, setColumns] = React.useState<KanbanColumnDef[]>(DEFAULT_COLUMNS);
  const [columnMenuState, setColumnMenuState] = React.useState<ColumnMenuRequestDetail | null>(null);
  const [columnEditTarget, setColumnEditTarget] = React.useState<KanbanColumnDef | null>(null);
  const [columnEditMode, setColumnEditMode] = React.useState<"create" | "edit" | null>(null);
  const [columnDeleteTarget, setColumnDeleteTarget] = React.useState<KanbanColumnDef | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
  );

  // Verifica status do WhatsApp
  React.useEffect(() => {
    if (!workspaceOwnerId) return;
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from("whatsapp_instances")
        .select("status")
        .eq("owner_user_id", workspaceOwnerId)
        .order("updated_at", { ascending: false })
        .limit(1);
      if (cancelled) return;
      const row = data?.[0];
      if (error || !row) {
        setWhatsappStatus("disconnected");
        return;
      }
      setWhatsappStatus(row.status === "connected" ? "connected" : "disconnected");
    })();
    return () => {
      cancelled = true;
    };
  }, [workspaceOwnerId]);

  // Carrega contatos reais do Supabase + realtime + refetch on focus.
  React.useEffect(() => {
    if (!workspaceOwnerId) return;
    let cancelled = false;

    const mapRow = mapContactRow;

    const load = async () => {
      let { data, error } = await supabase
        .from("contacts")
        .select(CONTACT_COLUMNS)
        .eq("is_archived", false)
        .order("last_message_at", { ascending: false, nullsFirst: false });
      // Fallback se as colunas novas ainda não existirem no banco
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
      .channel(`inbox-contacts-${workspaceOwnerId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "contacts", filter: `owner_user_id=eq.${workspaceOwnerId}` },
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
        { event: "UPDATE", schema: "public", table: "contacts", filter: `owner_user_id=eq.${workspaceOwnerId}` },
        (payload) => {
          const raw = payload.new as any;
          // Sem `replica identity full` aplicado, o payload vem só com o id.
          // Nesse caso, recarrega em vez de corromper o estado local.
          if (!raw || typeof raw.phone !== "string") {
            void load();
            return;
          }
          const row = mapRow(raw);
          setContacts((prev) => {
            if (row.is_archived) {
              return prev.filter((c) => c.id !== row.id);
            }
            const exists = prev.some((c) => c.id === row.id);
            const next = exists ? prev.map((c) => (c.id === row.id ? row : c)) : [row, ...prev];
            return next.sort((a, b) => b.lastMessageAt.getTime() - a.lastMessageAt.getTime());
          });
          setOpenContact((cur) => {
            if (!cur || cur.id !== row.id) return cur;
            if (row.is_archived) return null;
            return { ...cur, ...row };
          });
        },
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages", filter: `owner_user_id=eq.${workspaceOwnerId}` },
        () => {
          // Fallback: garante consistência mesmo se o UPDATE em contacts vier sem RLS visível
          void load();
        },
      )
      .subscribe();

    const onFocus = () => void load();
    window.addEventListener("focus", onFocus);

    // Sincroniza estado local quando useContactActions emite uma mudança
    const onContactUpdated = (e: Event) => {
      const detail = (e as CustomEvent<{ id: string; patch: Partial<Contact> & { is_archived?: boolean; is_blocked?: boolean } }>).detail;
      if (!detail?.id) return;
      const { id, patch } = detail;
      setContacts((prev) => {
        if (patch.is_archived) {
          return prev.filter((c) => c.id !== id);
        }
        return prev.map((c) => (c.id === id ? { ...c, ...patch } as Contact : c));
      });
      setOpenContact((cur) => {
        if (!cur || cur.id !== id) return cur;
        if (patch.is_archived) return null;
        return { ...cur, ...patch } as Contact;
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

  // Listener do menu ⋮ do card
  React.useEffect(() => {
    const onMenu = (e: Event) => {
      const detail = (e as CustomEvent<CardMenuRequestDetail>).detail;
      if (detail) setMenuState(detail);
    };
    const onColMenu = (e: Event) => {
      const detail = (e as CustomEvent<ColumnMenuRequestDetail>).detail;
      if (detail) setColumnMenuState(detail);
    };
    window.addEventListener("zf:card-menu", onMenu as EventListener);
    window.addEventListener("zf:column-menu", onColMenu as EventListener);
    return () => {
      window.removeEventListener("zf:card-menu", onMenu as EventListener);
      window.removeEventListener("zf:column-menu", onColMenu as EventListener);
    };
  }, []);

  // Carrega colunas do Kanban + realtime + seed automático
  React.useEffect(() => {
    if (!workspaceOwnerId) return;
    let cancelled = false;

    const mapCol = (r: any): KanbanColumnDef => ({
      id: r.id,
      slug: r.slug,
      label: r.label,
      emoji: r.emoji ?? "📌",
      color: r.color ?? "#6B7280",
      position: typeof r.position === "number" ? r.position : 0,
      is_system: !!r.is_system,
    });

    const seedDefaults = async () => {
      const rows = DEFAULT_COLUMNS.map((c) => ({
        owner_user_id: workspaceOwnerId,
        slug: c.slug,
        label: c.label,
        emoji: c.emoji,
        color: c.color,
        position: c.position,
        is_system: true,
      }));
      const { data, error } = await supabase
        .from("kanban_columns")
        .insert(rows)
        .select();
      if (error) {
        console.warn("[inbox] seed colunas falhou:", error.message);
        return null;
      }
      return (data ?? []).map(mapCol);
    };

    const load = async () => {
      const { data, error } = await supabase
        .from("kanban_columns")
        .select("id,slug,label,emoji,color,position,is_system")
        .order("position", { ascending: true });
      if (cancelled) return;
      if (error) {
        // Tabela inexistente → mantém defaults locais (read-only).
        if (!/relation .* does not exist/i.test(error.message ?? "")) {
          console.warn("[inbox] erro ao carregar colunas:", error.message);
        }
        setColumns(DEFAULT_COLUMNS);
        return;
      }
      if (!data || data.length === 0) {
        const seeded = await seedDefaults();
        if (cancelled) return;
        setColumns(seeded ?? DEFAULT_COLUMNS);
        return;
      }

      // Sincroniza colunas padrão que faltam (e.g., "resolved" foi adicionada depois)
      const existing = new Set(data.map((d) => d.slug));
      const missing = DEFAULT_COLUMNS.filter((dc) => !existing.has(dc.slug));
      if (missing.length > 0) {
        const toInsert = missing.map((c) => ({
          owner_user_id: workspaceOwnerId,
          slug: c.slug,
          label: c.label,
          emoji: c.emoji,
          color: c.color,
          position: c.position,
          is_system: true,
        }));
        const { data: inserted, error: insertError } = await supabase
          .from("kanban_columns")
          .insert(toInsert)
          .select();
        if (insertError) {
          console.warn("[inbox] sync colunas faltantes falhou:", insertError.message);
        } else if (inserted) {
          data.push(...inserted);
        }
      }

      setColumns(data.map(mapCol));
    };

    void load();

    const channel = supabase
      .channel(`inbox-columns-${workspaceOwnerId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "kanban_columns", filter: `owner_user_id=eq.${workspaceOwnerId}` },
        () => void load(),
      )
      .subscribe();

    return () => {
      cancelled = true;
      void supabase.removeChannel(channel);
    };
  }, [workspaceOwnerId]);

  const actions = useContactActions();

  const handleMenuAction = React.useCallback(async (a: CardMenuAction) => {
    const c = a.contact;
    if (a.type === "assign") {
      setTransferTarget(c);
      return;
    }
    if (a.type === "edit" || a.type === "add-tag") {
      setEditTarget(c);
      return;
    }
    if (a.type === "open-chat") {
      setOpenContact(c);
      return;
    }
    if (a.type === "schedule") {
      setScheduleTarget(c);
      return;
    }
    if (a.type === "toggle-urgent") {
      await actions.toggleUrgent(c.id, c.priority);
      return;
    }
    if (a.type === "resolve") {
      await actions.moveToColumn(c.id, "resolved");
      return;
    }
    if (a.type === "move") {
      await actions.moveToColumn(c.id, a.column);
      return;
    }
    if (a.type === "archive") {
      await actions.archiveContact(c.id);
      return;
    }
  }, [actions]);

  // Título da aba com total de não lidas
  React.useEffect(() => {
    const total = contacts.reduce((s, c) => s + (c.unreadCount ?? 0), 0);
    const base = "Atendimento | ZapFlow";
    const original = document.title;
    document.title = total > 0 ? `(${total > 99 ? "99+" : total}) ${base}` : base;
    return () => {
      document.title = original;
    };
  }, [contacts]);

  const filtered = React.useMemo(() => {
    return contacts.filter((c) => {
      if (filter === "mine" && c.assignedAgent !== (user?.id ?? ""))
        return false;
      if (filter === "unassigned" && c.assignedAgent) return false;
      if (proFilter !== "all") {
        const pro = proByContact.get(c.id);
        if (proFilter === "none" ? !!pro : pro !== proFilter) return false;
      }
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
  }, [contacts, filter, query, user, proFilter, proByContact]);

  const byColumn = React.useMemo(() => {
    const map: Record<string, Contact[]> = {};
    for (const col of columns) map[col.slug] = [];
    const fallbackSlug = columns[0]?.slug ?? "waiting";
    for (const c of filtered) {
      const slug = map[c.kanban_column] ? c.kanban_column : fallbackSlug;
      (map[slug] ||= []).push(c);
    }
    return map;
  }, [filtered, columns]);

  const urgentSlug = React.useMemo(
    () => columns.find((c) => c.slug === "urgent")?.slug ?? "urgent",
    [columns],
  );
  const urgentCount = byColumn[urgentSlug]?.length ?? 0;

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
      notify.success(`Movido para ${columns.find((c) => c.slug === col)?.label ?? col}`);
    }
  };

  // Ações do menu da coluna
  const handleColumnAction = React.useCallback(async (col: KanbanColumnDef, a: ColumnMenuAction) => {
    if (a.type === "edit") {
      setColumnEditTarget(col);
      setColumnEditMode("edit");
      return;
    }
    if (a.type === "delete") {
      setColumnDeleteTarget(col);
      return;
    }
    if (a.type === "move-left" || a.type === "move-right") {
      const idx = columns.findIndex((c) => c.id === col.id);
      const swap = a.type === "move-left" ? idx - 1 : idx + 1;
      if (idx < 0 || swap < 0 || swap >= columns.length) return;
      const next = [...columns];
      [next[idx], next[swap]] = [next[swap], next[idx]];
      const reIndexed = next.map((c, i) => ({ ...c, position: i }));
      setColumns(reIndexed);
      // Persiste posições (best-effort)
      await Promise.all(
        reIndexed.map((c) =>
          supabase.from("kanban_columns").update({ position: c.position }).eq("id", c.id),
        ),
      );
    }
  }, [columns]);

  const confirmDeleteColumn = React.useCallback(async () => {
    const col = columnDeleteTarget;
    if (!col || col.is_system) return;
    const fallback = columns.find((c) => c.is_system && c.slug === "waiting") ?? columns.find((c) => c.id !== col.id);
    const fallbackSlug = fallback?.slug ?? "waiting";
    // 1. Move contatos da coluna pra fallback
    await supabase
      .from("contacts")
      .update({ kanban_column: fallbackSlug })
      .eq("kanban_column", col.slug);
    setContacts((prev) =>
      prev.map((c) => (c.kanban_column === col.slug ? { ...c, kanban_column: fallbackSlug } : c)),
    );
    // 2. Deleta a coluna
    const { error } = await supabase.from("kanban_columns").delete().eq("id", col.id);
    if (error) {
      notify.error(error.message ?? "Falha ao excluir coluna.");
      return;
    }
    setColumns((prev) => prev.filter((c) => c.id !== col.id));
    notify.success(`Coluna "${col.label}" excluída`);
  }, [columnDeleteTarget, columns]);

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
            {urgentCount} urgente{urgentCount === 1 ? "" : "s"}
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
              borderRadius: "var(--radius-pill)",
              border: "1px solid var(--border)",
            }}
          >
            {(
              [
                { id: "all", label: "Todos" },
                { id: "mine", label: "Meus" },
                ...(isAgent ? [] : [{ id: "unassigned" as const, label: "Sem atendente" }]),
              ] as Array<{ id: Filter; label: string }>
            ).map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => setFilter(f.id)}
                style={{
                  height: 26,
                  padding: "0 12px",
                  borderRadius: "var(--radius-pill)",
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
          <div className="relative" ref={searchBoxRef}>
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
              placeholder="Buscar por nome, telefone ou mensagem…"
              style={{
                width: 240,
                height: 32,
                padding: "0 10px 0 30px",
                fontSize: 13,
                color: "var(--text-primary)",
                background: "var(--bg-base)",
                border: "1px solid var(--border-strong)",
                borderRadius: "var(--radius-control)",
                outline: "none",
              }}
            />

            {query.trim().length >= MIN_SEARCH_LEN && msgDropdownOpen && (
              <div
                style={{
                  position: "absolute",
                  top: "calc(100% + 4px)",
                  left: 0,
                  width: 340,
                  maxHeight: 360,
                  overflowY: "auto",
                  background: "var(--bg-surface)",
                  border: "1px solid var(--border)",
                  borderRadius: "var(--radius-card)",
                  boxShadow: "0 8px 24px rgba(0,0,0,0.14)",
                  zIndex: 30,
                }}
              >
                <div
                  className="flex items-center"
                  style={{
                    gap: 6,
                    padding: "8px 12px",
                    fontSize: 11,
                    fontWeight: 600,
                    textTransform: "uppercase",
                    letterSpacing: "0.05em",
                    color: "var(--text-muted)",
                    borderBottom: "1px solid var(--border)",
                  }}
                >
                  Nas mensagens
                  {searchingMsgs && <Loader2 size={11} className="animate-spin" />}
                  {!searchingMsgs && visibleMsgHits.length > 0 && (
                    <span style={{ fontWeight: 400 }}>
                      ({visibleMsgHits.length}
                      {visibleMsgHits.length === SEARCH_LIMIT ? "+" : ""})
                    </span>
                  )}
                </div>

                {!searchingMsgs && visibleMsgHits.length === 0 ? (
                  <div style={{ padding: "10px 12px", fontSize: 12, color: "var(--text-muted)" }}>
                    Nenhuma mensagem com "{query.trim()}".
                  </div>
                ) : (
                  visibleMsgHits.map((h) => {
                    const c = contactsById.get(h.contact_id)!;
                    const s = snippet(h.content ?? "", query.trim());
                    return (
                      <button
                        key={h.id}
                        type="button"
                        onClick={() => {
                          setOpenContact(c);
                          setQuery("");
                        }}
                        style={{
                          display: "block",
                          width: "100%",
                          textAlign: "left",
                          padding: "8px 12px",
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
              </div>
            )}
          </div>

          {/* Visualização por profissional — mesma lista e mesmos rótulos da Agenda. */}
          <select
            value={proFilter}
            onChange={(e) => setProFilter(e.target.value)}
            aria-label="Filtrar por profissional"
            style={{
              height: 32,
              padding: "0 28px 0 10px",
              borderRadius: "var(--radius-control)",
              border: "1px solid var(--border-strong)",
              background: "var(--bg-surface)",
              color: "var(--text-primary)",
              fontSize: 13,
              fontWeight: 500,
              cursor: "pointer",
            }}
          >
            <option value="all">Todos os profissionais</option>
            <option value="none">Sem profissional</option>
            {professionals.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>

          <button
            type="button"
            onClick={() => setNewContactOpen(true)}
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
          <SharedEmptyState
            icon={<MessageSquare size={48} style={{ color: "var(--brand-400)" }} aria-hidden="true" />}
            title="Não foi possível carregar o Inbox"
            description={`Supabase retornou: ${loadError}`}
          />
        </div>
      ) : whatsappStatus === "disconnected" ? (
        <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <SharedEmptyState
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
                borderRadius: "var(--radius-control)",
              }}
            >
              Seu WhatsApp está conectado. Aguardando a primeira mensagem dos clientes…
            </div>
          )}
          <div
            className="flex-1 overflow-x-auto overflow-y-hidden"
            style={{ display: "flex", gap: 12, paddingBottom: 8 }}
          >
            {columns.map((c) => (
              <KanbanColumn
                key={c.id}
                column={c}
                contacts={byColumn[c.slug] ?? []}
                onCardClick={setOpenContact}
              />
            ))}
            <button
              type="button"
              onClick={() => { setColumnEditTarget(null); setColumnEditMode("create"); }}
              className="shrink-0"
              style={{
                width: 200, alignSelf: "flex-start",
                padding: 12, borderRadius: "var(--radius-modal)",
                border: "1px dashed var(--border-strong)",
                background: "transparent", color: "var(--text-muted)",
                cursor: "pointer", fontSize: 12, fontWeight: 600,
                display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6,
              }}
            >
              <Plus size={14} /> Nova coluna
            </button>
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
        onContactUpdate={(id, patch) => {
          setContacts((prev) => prev.map((c) => (c.id === id ? { ...c, ...patch } : c)));
          setOpenContact((cur) => (cur && cur.id === id ? { ...cur, ...patch } as Contact : cur));
        }}
      />

      <NewContactModal
        open={newContactOpen}
        onClose={() => setNewContactOpen(false)}
        onCreated={(contact, opts) => {
          setContacts((prev) => {
            if (prev.some((c) => c.id === contact.id)) {
              return prev.map((c) => (c.id === contact.id ? { ...c, ...contact } : c));
            }
            return [contact, ...prev];
          });
          if (!opts.openExisting) {
            setHighlightId(contact.id);
            window.setTimeout(() => setHighlightId((cur) => (cur === contact.id ? null : cur)), 2200);
          }
          setOpenContact(contact);
        }}
      />

      {menuState && (
        <CardMenu
          contact={menuState.contact}
          columns={columns}
          anchor={menuState.anchor}
          onClose={() => setMenuState(null)}
          onAction={handleMenuAction}
        />
      )}

      {columnMenuState && (
        <ColumnMenu
          column={columnMenuState.column}
          anchor={columnMenuState.anchor}
          canMoveLeft={columns.findIndex((c) => c.id === columnMenuState.column.id) > 0}
          canMoveRight={columns.findIndex((c) => c.id === columnMenuState.column.id) < columns.length - 1}
          onClose={() => setColumnMenuState(null)}
          onAction={(a) => handleColumnAction(columnMenuState.column, a)}
        />
      )}

      <ColumnEditModal
        open={columnEditMode !== null}
        column={columnEditMode === "edit" ? columnEditTarget : null}
        existingSlugs={columns.map((c) => c.slug)}
        nextPosition={columns.length}
        onClose={() => { setColumnEditMode(null); setColumnEditTarget(null); }}
        onSaved={(saved) => {
          setColumns((prev) => {
            const exists = prev.some((c) => c.id === saved.id);
            return exists
              ? prev.map((c) => (c.id === saved.id ? saved : c))
              : [...prev, saved].sort((a, b) => a.position - b.position);
          });
        }}
      />

      <ConfirmDialog
        open={!!columnDeleteTarget}
        onClose={() => setColumnDeleteTarget(null)}
        onConfirm={confirmDeleteColumn}
        title={`Excluir coluna "${columnDeleteTarget?.label ?? ""}"?`}
        description={`Os cards desta coluna serão movidos para "Aguardando". Esta ação não pode ser desfeita.`}
        confirmLabel="Excluir"
      />

      <EditContactModal
        open={!!editTarget}
        contact={editTarget}
        onClose={() => setEditTarget(null)}
        onSaved={(patch) => {
          if (!editTarget) return;
          setContacts((prev) =>
            prev.map((c) => (c.id === editTarget.id ? { ...c, ...patch } : c)),
          );
        }}
      />

      {scheduleTarget && (
        <ScheduleModal
          contact={scheduleTarget}
          open={!!scheduleTarget}
          onClose={() => setScheduleTarget(null)}
          onScheduled={() => {
            setContacts((prev) =>
              prev.map((c) => (c.id === scheduleTarget.id ? { ...c, kanban_column: "scheduled" } : c)),
            );
            setScheduleTarget(null);
          }}
        />
      )}

      <TransferConversationModal
        open={!!transferTarget}
        contactId={transferTarget?.id ?? null}
        contactName={transferTarget?.name ?? null}
        currentAssignedAgentId={transferTarget?.assignedAgent ?? null}
        onClose={() => setTransferTarget(null)}
        onAssigned={(agentUserId) => {
          if (!transferTarget) return;
          setContacts((prev) =>
            prev.map((c) =>
              c.id === transferTarget.id ? { ...c, assignedAgent: agentUserId } : c,
            ),
          );
        }}
      />

      {highlightId && (
        <style>{`
          @keyframes zfPulseRing { 0%,100% { box-shadow: 0 0 0 0 var(--brand-400, #3654FF); } 50% { box-shadow: 0 0 0 4px color-mix(in oklab, var(--brand-400, #3654FF) 35%, transparent); } }
          [data-contact-id="${highlightId}"] { animation: zfPulseRing 1s ease-in-out 2; border-color: var(--brand-400, #3654FF) !important; }
        `}</style>
      )}
    </div>
  );
}
