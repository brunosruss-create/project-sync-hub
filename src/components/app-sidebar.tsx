import * as React from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  LayoutDashboard,
  MessageSquare,
  Users,
  BarChart3,
  Settings,
  Tag,
  Calendar,
  Shield,
  Columns3,
} from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useProfile } from "@/hooks/use-profile";
import { useRole } from "@/hooks/use-role";
import { useIsSuperAdmin } from "@/hooks/use-is-super-admin";
import { getWorkspaceProfile } from "@/lib/onboarding.functions";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { SETTINGS_ITEMS, isSettingsPath } from "@/features/settings/nav-items";

/** Largura do rail. Fixa de propósito — não há alternador. */
const RAIL_WIDTH = 64;

/**
 * Conversas e Kanban são telas distintas de propósito: uma é lista+conversa
 * lado a lado (fluxo de atendimento), a outra é board por etapa (gestão).
 * As duas usam o MESMO ConversationPanel — o que não pode voltar a existir
 * são dois componentes de chat, que foi como respostas rápidas ficaram só
 * de um lado sem ninguém notar.
 */
type NavItem = {
  label: string;
  to: string;
  icon: React.ComponentType<{ size?: number }>;
  agentVisible: boolean;
};

const ALL_ITEMS: NavItem[] = [
  { label: "Dashboard", to: "/dashboard", icon: LayoutDashboard, agentVisible: false },
  { label: "Conversas", to: "/conversations-chat", icon: MessageSquare, agentVisible: true },
  { label: "Kanban", to: "/inbox", icon: Columns3, agentVisible: true },
  { label: "Agenda", to: "/schedule", icon: Calendar, agentVisible: true },
  { label: "Serviços", to: "/services", icon: Tag, agentVisible: false },
  { label: "Clientes", to: "/contacts", icon: Users, agentVisible: true },
  { label: "Relatórios", to: "/reports", icon: BarChart3, agentVisible: false },
  { label: "Configurações", to: "/settings/profile", icon: Settings, agentVisible: true },
  { label: "Super Admin", to: "/super-admin/workspaces", icon: Shield, agentVisible: false },
];

export function AppSidebar() {
  const path = useRouterState({ select: (s) => s.location.pathname });
  const { user } = useAuth();
  const { data: profile } = useProfile();
  const { isAgent } = useRole();
  const { isSuperAdmin } = useIsSuperAdmin();
  const getWorkspaceProfileFn = useServerFn(getWorkspaceProfile);
  const { data: workspaceProfile } = useQuery({
    queryKey: ["workspace-profile"],
    queryFn: () => getWorkspaceProfileFn(),
  });
  const items = (isAgent ? ALL_ITEMS.filter((i) => i.agentVisible) : ALL_ITEMS).filter(
    (i) => i.label !== "Super Admin" || isSuperAdmin,
  );

  /**
   * O rail é fixo — largura de ícone, sem alternador. Quem tem sub-itens
   * (só Configurações hoje) abre um flyout no hover, em vez de empurrar a
   * página inteira para o lado.
   */
  const [flyoutOpen, setFlyoutOpen] = React.useState(false);
  const closeTimer = React.useRef<number | null>(null);

  const openFlyout = React.useCallback(() => {
    if (closeTimer.current !== null) {
      window.clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
    setFlyoutOpen(true);
  }, []);

  /**
   * Fechar com atraso é o que torna menu de hover usável: sair da engrenagem
   * em direção ao painel passa por um vão de alguns pixels, e fechar na hora
   * mataria o menu no meio do caminho do mouse.
   */
  const scheduleClose = React.useCallback(() => {
    if (closeTimer.current !== null) window.clearTimeout(closeTimer.current);
    closeTimer.current = window.setTimeout(() => setFlyoutOpen(false), 180);
  }, []);

  React.useEffect(
    () => () => {
      if (closeTimer.current !== null) window.clearTimeout(closeTimer.current);
    },
    [],
  );

  // Navegar fecha o flyout: sem isto ele fica aberto sobre a página nova até
  // o mouse sair, escondendo justamente o conteúdo que acabou de ser aberto.
  React.useEffect(() => {
    setFlyoutOpen(false);
  }, [path]);

  const name =
    profile?.full_name ||
    (user?.user_metadata?.full_name as string | undefined) ||
    user?.email?.split("@")[0] ||
    "Usuário";
  const avatar =
    profile?.avatar_url || (user?.user_metadata?.avatar_url as string | undefined);
  const businessName = workspaceProfile?.business_name || "Meu Negócio";

  return (
    <TooltipProvider delayDuration={0}>
      <div className="hidden md:block shrink-0" style={{ position: "relative" }}>
      <aside
        className="flex flex-col"
        style={{
          width: RAIL_WIDTH,
          height: "100vh",
          background: "var(--bg-surface)",
          borderRight: "1px solid var(--border)",
          overflow: "hidden",
        }}
      >
        {/* Logo */}
        <div
          className="flex items-center justify-center"
          style={{
            height: 48,
            borderBottom: "1px solid var(--border)",
          }}
        >
          <div
            className="flex items-center justify-center"
            style={{
              width: 24,
              height: 24,
              borderRadius: "var(--radius-pill)",
              background: "var(--brand-400)",
              color: "#fff",
              fontSize: 13,
              fontWeight: 600,
              flexShrink: 0,
            }}
          >
            Z
          </div>
        </div>

        {/* Workspace */}
        <div style={{ padding: "8px" }}>
          <Tooltip>
            <TooltipTrigger asChild>
              <div
                className="flex items-center justify-center"
                style={{
                  width: 36,
                  height: 36,
                  margin: "0 auto",
                  borderRadius: "var(--radius-pill)",
                  border: "1px solid var(--border)",
                  fontSize: 12,
                  fontWeight: 600,
                }}
              >
                {businessName.charAt(0).toUpperCase()}
              </div>
            </TooltipTrigger>
            <TooltipContent side="right">{businessName}</TooltipContent>
          </Tooltip>
        </div>

        {/* Nav */}
        <nav className="flex-1" style={{ padding: "8px" }}>
          <ul className="flex flex-col" style={{ gap: 2 }}>
            {items.map((item) => {
              const hasFlyout = item.label === "Configurações";
              const active = hasFlyout
                ? isSettingsPath(path)
                : item.to === "/dashboard"
                  ? path === "/dashboard"
                  : path.startsWith(item.to);
              const Icon = item.icon;
              const highlighted = active || (hasFlyout && flyoutOpen);
              const linkEl = (
                <Link
                  to={item.to}
                  className="flex items-center justify-center transition-colors"
                  style={{
                    height: 40,
                    width: 40,
                    margin: "0 auto",
                    borderRadius: "var(--radius-pill)",
                    color: highlighted ? "var(--brand-400)" : "var(--text-primary)",
                    background: highlighted
                      ? "color-mix(in oklab, var(--brand-400) 10%, transparent)"
                      : "transparent",
                  }}
                  onMouseEnter={(e) => {
                    if (!highlighted) e.currentTarget.style.background = "var(--bg-overlay)";
                  }}
                  onMouseLeave={(e) => {
                    if (!highlighted) e.currentTarget.style.background = "transparent";
                  }}
                >
                  <Icon size={18} />
                </Link>
              );
              return (
                <li
                  key={item.label}
                  onMouseEnter={hasFlyout ? openFlyout : undefined}
                  onMouseLeave={hasFlyout ? scheduleClose : undefined}
                >
                  {/* O item com flyout dispensa tooltip — o próprio painel já
                      diz o nome, e os dois juntos brigariam pelo mesmo canto. */}
                  {hasFlyout ? (
                    linkEl
                  ) : (
                    <Tooltip>
                      <TooltipTrigger asChild>{linkEl}</TooltipTrigger>
                      <TooltipContent side="right">{item.label}</TooltipContent>
                    </Tooltip>
                  )}
                </li>
              );
            })}
          </ul>
        </nav>

        {/* User */}
        <div
          style={{
            padding: "12px 8px",
            borderTop: "1px solid var(--border)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Tooltip>
            <TooltipTrigger asChild>
              {avatar ? (
                <img
                  src={avatar}
                  alt={name}
                  style={{
                    width: 28,
                    height: 28,
                    borderRadius: "var(--radius-pill)",
                    objectFit: "cover",
                    border: "1px solid var(--border)",
                    flexShrink: 0,
                  }}
                />
              ) : (
                <div
                  style={{
                    width: 28,
                    height: 28,
                    borderRadius: "var(--radius-pill)",
                    background: "var(--bg-overlay)",
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 12,
                    fontWeight: 600,
                    flexShrink: 0,
                  }}
                >
                  {name.charAt(0).toUpperCase()}
                </div>
              )}
            </TooltipTrigger>
            <TooltipContent side="right">
              {name}
              {user?.email ? ` · ${user.email}` : ""}
            </TooltipContent>
          </Tooltip>
        </div>
      </aside>

      {/* Flyout de Configurações */}
      {flyoutOpen && (
        <div
          onMouseEnter={openFlyout}
          onMouseLeave={scheduleClose}
          style={{
            position: "absolute",
            top: 0,
            bottom: 0,
            left: RAIL_WIDTH,
            width: 216,
            background: "var(--bg-surface)",
            borderRight: "1px solid var(--border)",
            boxShadow: "8px 0 24px rgba(0,0,0,0.18)",
            padding: "14px 10px",
            overflowY: "auto",
            zIndex: 45,
            animation: "slideInLeft 140ms ease-out",
          }}
        >
          <div
            style={{
              fontSize: 13,
              fontWeight: 500,
              color: "var(--text-primary)",
              padding: "0 8px 12px",
            }}
          >
            Configurações
          </div>
          <ul className="flex flex-col" style={{ gap: 2 }}>
            {SETTINGS_ITEMS.map((it, idx) => {
              if (it.kind === "section") {
                return (
                  <li
                    key={`sec-${idx}`}
                    style={{
                      fontSize: 12,
                      fontWeight: 500,
                      color: "var(--text-muted)",
                      padding: idx === 0 ? "2px 8px 6px" : "10px 8px 6px",
                    }}
                  >
                    {it.label}
                  </li>
                );
              }
              const itemActive = path === it.to;
              const ItemIcon = it.icon;
              return (
                <li key={it.to}>
                  <Link
                    to={it.to}
                    className="flex items-center gap-2 transition-colors"
                    style={{
                      height: 32,
                      padding: "0 12px",
                      borderRadius: "var(--radius-pill)",
                      fontSize: 13,
                      fontWeight: 500,
                      color: itemActive ? "var(--brand-400)" : "var(--text-primary)",
                      background: itemActive
                        ? "color-mix(in oklab, var(--brand-400) 10%, transparent)"
                        : "transparent",
                    }}
                    onMouseEnter={(e) => {
                      if (!itemActive) e.currentTarget.style.background = "var(--bg-overlay)";
                    }}
                    onMouseLeave={(e) => {
                      if (!itemActive) e.currentTarget.style.background = "transparent";
                    }}
                  >
                    <ItemIcon size={14} />
                    <span>{it.label}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      )}
      </div>
    </TooltipProvider>
  );
}
