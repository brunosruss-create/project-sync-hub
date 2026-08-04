import * as React from "react";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { Moon, Sun, LogOut, Search } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useTheme } from "@/hooks/use-theme";
import { MobileSidebarTrigger } from "@/components/mobile-sidebar";

const TITLES: Record<string, string> = {
  dashboard: "Dashboard",
  inbox: "Kanban",
  "conversations-chat": "Conversas",
  contacts: "Clientes",
  reports: "Relatórios",
  schedule: "Agenda",
  services: "Serviços",
  "ai-agent": "Agente IA",
  settings: "Configurações",
  "super-admin": "Super Admin",
  profile: "Perfil",
  workspace: "Workspace",
  team: "Equipe",
  departments: "Departamentos",
  whatsapp: "WhatsApp",
  billing: "Cobrança",
  health: "Saúde",
  users: "Usuários",
  workspaces: "Workspaces",
  messages: "Mensagens",
  "quick-replies": "Respostas rápidas",
  professionals: "Profissionais",
  ia: "IA",
};

export function AppTopbar() {
  const { theme, toggle } = useTheme();
  const { signOut } = useAuth();
  const navigate = useNavigate();
  const path = useRouterState({ select: (s) => s.location.pathname });

  const segments = path.split("/").filter(Boolean);
  /**
   * A tela de Conversas monta o próprio cabeçalho: o título fica sobre a lista
   * e as ações (buscar/tema/sair) na linha do contato, como no WhatsApp Web.
   * Manter esta barra ali criaria uma fileira quase vazia por cima de tudo.
   * Só o desktop — no mobile ela ainda carrega o botão do menu.
   */
  const ownHeader = segments.length === 1 && segments[0] === "conversations-chat";

  // Per-page <title>
  React.useEffect(() => {
    const last = segments[segments.length - 1] ?? "";
    const label = TITLES[last] ?? last.charAt(0).toUpperCase() + last.slice(1);
    document.title = label ? `${label} | ZapFlow` : "ZapFlow";
  }, [path, segments]);

  const openPalette = () =>
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "k", metaKey: true }));

  if (ownHeader) {
    // No mobile o gatilho do menu ainda precisa de um lugar; no desktop a
    // barra desaparece por completo.
    return (
      <header
        className="md:hidden flex items-center"
        style={{
          height: 48,
          padding: "0 12px",
          background: "var(--bg-surface)",
          borderBottom: "1px solid var(--border)",
        }}
      >
        <MobileSidebarTrigger />
      </header>
    );
  }

  return (
    <header
      className="flex items-center justify-between"
      style={{
        height: 48,
        padding: "0 12px",
        background: "var(--bg-surface)",
        borderBottom: "1px solid var(--border)",
        gap: 8,
      }}
    >
      <div className="flex items-center" style={{ gap: 4, minWidth: 0 }}>
        <MobileSidebarTrigger />
        <nav className="flex items-center gap-1 min-w-0" style={{ fontSize: 13 }}>
        {segments.map((s, i) => (
          <React.Fragment key={i}>
            {i > 0 && (
              <span style={{ color: "var(--text-muted)" }}>/</span>
            )}
            <span
              style={{
                color: i === segments.length - 1 ? "var(--text-primary)" : "var(--text-muted)",
              }}
            >
              {TITLES[s] ?? s.charAt(0).toUpperCase() + s.slice(1)}
            </span>
          </React.Fragment>
        ))}
        </nav>
      </div>

      <div className="flex items-center" style={{ gap: 4 }}>
        <button
          type="button"
          onClick={openPalette}
          aria-label="Buscar (Cmd+K)"
          className="hidden sm:inline-flex items-center transition-colors"
          style={{
            height: 32,
            padding: "0 10px",
            gap: 8,
            borderRadius: "var(--radius-control)",
            border: "1px solid var(--border)",
            color: "var(--text-muted)",
            background: "transparent",
            fontSize: 12,
          }}
        >
          <Search size={14} />
          <span>Buscar</span>
          <kbd style={{ fontSize: 10, padding: "1px 5px", border: "1px solid var(--border)", borderRadius: 3 }}>
            ⌘K
          </kbd>
        </button>
        <button
          type="button"
          onClick={openPalette}
          aria-label="Buscar"
          className="sm:hidden inline-flex items-center justify-center"
          style={{ width: 32, height: 32, borderRadius: "var(--radius-pill)", color: "var(--text-muted)", background: "transparent" }}
        >
          <Search size={16} />
        </button>
        <button
          type="button"
          onClick={toggle}
          aria-label="Alternar tema"
          className="inline-flex items-center justify-center transition-colors"
          style={{
            width: 32,
            height: 32,
            borderRadius: "var(--radius-pill)",
            color: "var(--text-muted)",
            background: "transparent",
          }}
          onMouseEnter={(e) => (e.currentTarget.style.background = "var(--bg-overlay)")}
          onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
        >
          {theme === "dark" ? <Sun size={16} /> : <Moon size={16} />}
        </button>
        <button
          type="button"
          aria-label="Sair"
          onClick={async () => {
            await signOut();
            navigate({ to: "/login" });
          }}
          className="inline-flex items-center justify-center transition-colors"
          style={{
            width: 32,
            height: 32,
            borderRadius: "var(--radius-pill)",
            color: "var(--text-muted)",
            background: "transparent",
          }}
          onMouseEnter={(e) => (e.currentTarget.style.background = "var(--bg-overlay)")}
          onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
        >
          <LogOut size={16} />
        </button>
      </div>
    </header>
  );
}
