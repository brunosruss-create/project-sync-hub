import * as React from "react";
import { useNavigate } from "@tanstack/react-router";
import {
  Search,
  LayoutDashboard,
  MessageSquare,
  Calendar,
  Tag,
  Bot,
  Settings,
  Plus,
  Users,
  BarChart3,
  Columns3,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspaceOwnerId } from "@/hooks/use-workspace-owner";
import {
  MIN_SEARCH_LEN,
  SEARCH_LIMIT,
  escapeLike,
  snippet,
} from "@/lib/message-search";

type Action = {
  id: string;
  label: string;
  group: "Navegar" | "Ações" | "Ajustes" | "Mensagens";
  icon: React.ComponentType<{ size?: number }>;
  perform: () => void;
  keywords?: string;
  /** Snippet secundário (só usado no grupo "Mensagens"). */
  subLabel?: React.ReactNode;
};

type MessageSearchHit = {
  id: string;
  contact_id: string;
  content: string;
  contact_name: string | null;
};

export function CommandPalette() {
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const [activeIdx, setActiveIdx] = React.useState(0);
  const [messageHits, setMessageHits] = React.useState<MessageSearchHit[]>([]);
  const [searchingMessages, setSearchingMessages] = React.useState(false);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const navigate = useNavigate();
  const { workspaceOwnerId } = useWorkspaceOwnerId();

  const close = React.useCallback(() => {
    setOpen(false);
    setQuery("");
    setActiveIdx(0);
  }, []);

  const actions = React.useMemo<Action[]>(
    () => [
      { id: "go-dashboard", group: "Navegar", label: "Ir para Dashboard", icon: LayoutDashboard, perform: () => navigate({ to: "/dashboard" }) },
      { id: "go-inbox", group: "Navegar", label: "Ir para Conversas", icon: MessageSquare, perform: () => navigate({ to: "/conversations-chat" }) },
      { id: "go-kanban", group: "Navegar", label: "Ir para Kanban", icon: Columns3, perform: () => navigate({ to: "/inbox" }) },
      { id: "go-schedule", group: "Navegar", label: "Ir para Agenda", icon: Calendar, perform: () => navigate({ to: "/schedule" }) },
      { id: "go-services", group: "Navegar", label: "Ir para Serviços", icon: Tag, perform: () => navigate({ to: "/services" }) },
      { id: "go-ai", group: "Navegar", label: "Ir para Agente IA", icon: Bot, perform: () => navigate({ to: "/ai-agent" }) },
      { id: "go-contacts", group: "Navegar", label: "Ir para Clientes", icon: Users, keywords: "contatos clientes crm cadastro", perform: () => navigate({ to: "/contacts" }) },
      { id: "go-reports", group: "Navegar", label: "Ir para Relatórios", icon: BarChart3, perform: () => navigate({ to: "/reports" }) },
      { id: "go-settings", group: "Ajustes", label: "Configurações do perfil", icon: Settings, perform: () => navigate({ to: "/settings/profile" }) },
      { id: "go-whatsapp", group: "Ajustes", label: "Conectar WhatsApp", icon: Settings, perform: () => navigate({ to: "/settings/whatsapp" }) },
      { id: "new-contact", group: "Ações", label: "Novo contato", icon: Plus, keywords: "criar adicionar", perform: () => { navigate({ to: "/inbox" }); window.dispatchEvent(new CustomEvent("zf:new-contact")); } },
      { id: "new-appointment", group: "Ações", label: "Novo agendamento", icon: Plus, keywords: "criar agendar", perform: () => { navigate({ to: "/schedule" }); window.dispatchEvent(new CustomEvent("zf:new-appointment")); } },
      { id: "new-service", group: "Ações", label: "Novo serviço", icon: Plus, perform: () => { navigate({ to: "/services" }); window.dispatchEvent(new CustomEvent("zf:new-service")); } },
    ],
    [navigate],
  );

  /**
   * Busca de mensagens com debounce — só dispara depois de 220ms parado.
   * Sem debounce a cada tecla dispararia uma query, mesmo entre "olá" e
   * "olá tudo bem". RLS filtra pelo workspace; ainda filtro explícito por
   * owner_user_id como defesa em profundidade.
   *
   * `is_internal=false` obrigatório: nota interna vazaria conteúdo privado
   * da equipe pra qualquer atendente que a busca alcance.
   */
  React.useEffect(() => {
    const term = query.trim();
    if (!open || term.length < MIN_SEARCH_LEN) {
      setMessageHits([]);
      setSearchingMessages(false);
      return;
    }
    if (!workspaceOwnerId) return;
    setSearchingMessages(true);
    let cancelled = false;
    const t = window.setTimeout(async () => {
      const { data, error } = await supabase
        .from("messages")
        .select("id,contact_id,content,contact:contacts(name)")
        .eq("owner_user_id", workspaceOwnerId)
        .eq("is_internal", false)
        .ilike("content", `%${escapeLike(term)}%`)
        .order("created_at", { ascending: false })
        .limit(SEARCH_LIMIT);
      if (cancelled) return;
      if (error) {
        // is_internal pode não existir em bancos antigos — tenta sem o filtro
        // mas apenas se o erro for exatamente esse. Nunca vazar nota interna
        // silenciosamente por outro tipo de erro.
        if (/is_internal/i.test(error.message)) {
          const retry = await supabase
            .from("messages")
            .select("id,contact_id,content,contact:contacts(name)")
            .eq("owner_user_id", workspaceOwnerId)
            .ilike("content", `%${escapeLike(term)}%`)
            .order("created_at", { ascending: false })
            .limit(SEARCH_LIMIT);
          if (!cancelled && !retry.error) {
            setMessageHits(
              (retry.data ?? []).map((r: any) => ({
                id: r.id,
                contact_id: r.contact_id,
                content: r.content ?? "",
                contact_name: r.contact?.name ?? null,
              })),
            );
          }
        } else {
          console.warn("[cmd-palette] busca falhou:", error.message);
          setMessageHits([]);
        }
      } else {
        setMessageHits(
          (data ?? []).map((r: any) => ({
            id: r.id,
            contact_id: r.contact_id,
            content: r.content ?? "",
            contact_name: r.contact?.name ?? null,
          })),
        );
      }
      setSearchingMessages(false);
    }, 220);
    return () => {
      cancelled = true;
      window.clearTimeout(t);
    };
  }, [query, open, workspaceOwnerId]);

  // Monta as actions dinâmicas de mensagem — mesmo shape das actions estáticas.
  const messageActions = React.useMemo<Action[]>(() => {
    const term = query.trim();
    if (term.length < MIN_SEARCH_LEN) return [];
    return messageHits.map((h) => {
      const s = snippet(h.content, term);
      return {
        id: `msg:${h.id}`,
        group: "Mensagens" as const,
        label: h.contact_name ?? "Contato",
        icon: MessageSquare,
        subLabel: (
          <span
            style={{
              fontSize: 12,
              color: "var(--text-muted)",
              display: "block",
              marginTop: 2,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {s.before}
            <mark
              style={{
                background: "color-mix(in oklab, var(--brand-400) 25%, transparent)",
                color: "inherit",
                padding: "0 1px",
                borderRadius: 2,
              }}
            >
              {s.hit}
            </mark>
            {s.after}
          </span>
        ),
        perform: () => navigate({ to: "/conversations-chat", search: { id: h.contact_id } }),
      };
    });
  }, [messageHits, query, navigate]);

  const filtered = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    const actionMatches = q
      ? actions.filter(
          (a) =>
            a.label.toLowerCase().includes(q) ||
            a.keywords?.toLowerCase().includes(q) ||
            a.group.toLowerCase().includes(q),
        )
      : actions;
    // Mensagens aparecem depois das ações estáticas — priorizamos navegação
    // por rota (mais previsível) e deixamos a busca em conteúdo como extra.
    return [...actionMatches, ...messageActions];
  }, [query, actions, messageActions]);

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((v) => !v);
        return;
      }
      if (!open) return;
      if (e.key === "Escape") {
        e.preventDefault();
        close();
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        setActiveIdx((i) => Math.min(i + 1, filtered.length - 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setActiveIdx((i) => Math.max(i - 1, 0));
      } else if (e.key === "Enter") {
        e.preventDefault();
        const a = filtered[activeIdx];
        if (a) {
          a.perform();
          close();
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, filtered, activeIdx, close]);

  React.useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 30);
  }, [open]);

  React.useEffect(() => {
    setActiveIdx(0);
  }, [query]);

  if (!open) return null;

  // group
  const groups = filtered.reduce<Record<string, Action[]>>((acc, a) => {
    (acc[a.group] ||= []).push(a);
    return acc;
  }, {});

  let runningIdx = -1;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Paleta de comandos"
      className="fixed inset-0 z-50 flex items-start justify-center"
      style={{ background: "rgba(0,0,0,0.55)", padding: "10vh 16px" }}
      onClick={close}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "100%",
          maxWidth: 560,
          background: "var(--bg-surface)",
          border: "1px solid var(--border)",
          borderRadius: "var(--radius-modal)",
          boxShadow: "0 30px 80px rgba(0,0,0,0.5)",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            padding: "12px 14px",
            borderBottom: "1px solid var(--border)",
          }}
        >
          <Search size={16} style={{ color: "var(--text-muted)" }} aria-hidden="true" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar páginas, ações ou contatos…"
            aria-label="Buscar"
            style={{
              flex: 1,
              background: "transparent",
              border: "none",
              outline: "none",
              fontSize: 14,
              color: "var(--text-primary)",
            }}
          />
          <kbd
            style={{
              fontSize: 11,
              color: "var(--text-muted)",
              border: "1px solid var(--border)",
              borderRadius: "var(--radius-sm)",
              padding: "2px 6px",
            }}
          >
            ESC
          </kbd>
        </div>
        <div style={{ maxHeight: 360, overflowY: "auto", padding: 6 }}>
          {filtered.length === 0 && (
            <p style={{ padding: 24, textAlign: "center", fontSize: 13, color: "var(--text-muted)" }}>
              {searchingMessages
                ? "Buscando…"
                : query.trim().length > 0 && query.trim().length < MIN_SEARCH_LEN
                  ? `Digite pelo menos ${MIN_SEARCH_LEN} letras.`
                  : "Nada encontrado."}
            </p>
          )}
          {Object.entries(groups).map(([group, items]) => (
            <div key={group} style={{ padding: "6px 4px" }}>
              <div
                style={{
                  fontSize: 11,
                  fontWeight: 600,
                  color: "var(--text-muted)",
                  textTransform: "uppercase",
                  letterSpacing: "0.04em",
                  padding: "4px 8px",
                }}
              >
                {group}
              </div>
              {items.map((a) => {
                runningIdx += 1;
                const idx = runningIdx;
                const active = idx === activeIdx;
                const Icon = a.icon;
                return (
                  <button
                    key={a.id}
                    type="button"
                    onMouseEnter={() => setActiveIdx(idx)}
                    onClick={() => {
                      a.perform();
                      close();
                    }}
                    className="w-full flex items-start gap-3"
                    style={{
                      padding: "8px 10px",
                      borderRadius: "var(--radius-control)",
                      background: active ? "var(--bg-overlay)" : "transparent",
                      color: "var(--text-primary)",
                      fontSize: 13,
                      textAlign: "left",
                      border: "none",
                      cursor: "pointer",
                    }}
                  >
                    <Icon size={16} />
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <span style={{ display: "block" }}>{a.label}</span>
                      {a.subLabel}
                    </span>
                  </button>
                );
              })}
            </div>
          ))}
        </div>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            padding: "8px 12px",
            borderTop: "1px solid var(--border)",
            fontSize: 11,
            color: "var(--text-muted)",
          }}
        >
          <span>↑↓ navegar · ↵ executar</span>
          <span>⌘K para abrir</span>
        </div>
      </div>
    </div>
  );
}
