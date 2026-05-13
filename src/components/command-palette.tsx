import * as React from "react";
import { useNavigate } from "@tanstack/react-router";
import {
  Search,
  LayoutDashboard,
  MessageSquare,
  Calendar,
  Wrench,
  Bot,
  Settings,
  Plus,
} from "lucide-react";

type Action = {
  id: string;
  label: string;
  group: "Navegar" | "Ações" | "Ajustes";
  icon: React.ComponentType<{ size?: number }>;
  perform: () => void;
  keywords?: string;
};

export function CommandPalette() {
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const [activeIdx, setActiveIdx] = React.useState(0);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const navigate = useNavigate();

  const close = React.useCallback(() => {
    setOpen(false);
    setQuery("");
    setActiveIdx(0);
  }, []);

  const actions = React.useMemo<Action[]>(
    () => [
      { id: "go-dashboard", group: "Navegar", label: "Ir para Dashboard", icon: LayoutDashboard, perform: () => navigate({ to: "/dashboard" }) },
      { id: "go-inbox", group: "Navegar", label: "Ir para Conversas (Kanban)", icon: MessageSquare, perform: () => navigate({ to: "/inbox" }) },
      { id: "go-schedule", group: "Navegar", label: "Ir para Agenda", icon: Calendar, perform: () => navigate({ to: "/schedule" }) },
      { id: "go-services", group: "Navegar", label: "Ir para Serviços", icon: Wrench, perform: () => navigate({ to: "/services" }) },
      { id: "go-ai", group: "Navegar", label: "Ir para Agente IA", icon: Bot, perform: () => navigate({ to: "/ai-agent" }) },
      { id: "go-settings", group: "Ajustes", label: "Configurações do perfil", icon: Settings, perform: () => navigate({ to: "/settings/profile" }) },
      { id: "go-whatsapp", group: "Ajustes", label: "Conectar WhatsApp", icon: Settings, perform: () => navigate({ to: "/settings/whatsapp" }) },
      { id: "new-contact", group: "Ações", label: "Novo contato", icon: Plus, keywords: "criar adicionar", perform: () => { navigate({ to: "/inbox" }); window.dispatchEvent(new CustomEvent("zf:new-contact")); } },
      { id: "new-appointment", group: "Ações", label: "Novo agendamento", icon: Plus, keywords: "criar agendar", perform: () => { navigate({ to: "/schedule" }); window.dispatchEvent(new CustomEvent("zf:new-appointment")); } },
      { id: "new-service", group: "Ações", label: "Novo serviço", icon: Plus, perform: () => { navigate({ to: "/services" }); window.dispatchEvent(new CustomEvent("zf:new-service")); } },
    ],
    [navigate],
  );

  const filtered = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return actions;
    return actions.filter(
      (a) => a.label.toLowerCase().includes(q) || a.keywords?.toLowerCase().includes(q) || a.group.toLowerCase().includes(q),
    );
  }, [query, actions]);

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
          borderRadius: 12,
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
              borderRadius: 4,
              padding: "2px 6px",
            }}
          >
            ESC
          </kbd>
        </div>
        <div style={{ maxHeight: 360, overflowY: "auto", padding: 6 }}>
          {filtered.length === 0 && (
            <p style={{ padding: 24, textAlign: "center", fontSize: 13, color: "var(--text-muted)" }}>
              Nada encontrado.
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
                    className="w-full flex items-center gap-3"
                    style={{
                      padding: "8px 10px",
                      borderRadius: 6,
                      background: active ? "var(--bg-overlay)" : "transparent",
                      color: "var(--text-primary)",
                      fontSize: 13,
                      textAlign: "left",
                      border: "none",
                      cursor: "pointer",
                    }}
                  >
                    <Icon size={16} />
                    <span>{a.label}</span>
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
