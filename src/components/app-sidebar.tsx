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
  Share2,
  Plug,
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

/** Largura recolhida (só ícones) e expandida (ícones + rótulos). */
const RAIL_WIDTH = 64;
const EXPANDED_WIDTH = 232;
const SIDEBAR_PREF_KEY = "zf:sidebar-expanded";

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
  { label: "Conexões", to: "/connections", icon: Plug, agentVisible: false },
  { label: "Publicações", to: "/social/accounts", icon: Share2, agentVisible: true },
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

  /**
   * Recolhido (rail de ícones) x expandido (ícones + rótulos + identidade).
   * Preferência persiste no localStorage. Começa recolhido no SSR para evitar
   * mismatch de hidratação; lê a preferência real depois de montar.
   */
  const [expanded, setExpanded] = React.useState(false);
  React.useEffect(() => {
    try {
      const saved = window.localStorage.getItem(SIDEBAR_PREF_KEY);
      if (saved !== null) setExpanded(saved === "1");
    } catch {}
  }, []);
  const toggleExpanded = React.useCallback(() => {
    setExpanded((v) => {
      const next = !v;
      try {
        window.localStorage.setItem(SIDEBAR_PREF_KEY, next ? "1" : "0");
      } catch {}
      return next;
    });
  }, []);
  const sidebarWidth = expanded ? EXPANDED_WIDTH : RAIL_WIDTH;

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
          width: sidebarWidth,
          height: "100vh",
          background: "var(--bg-surface)",
          borderRight: "1px solid var(--border)",
          overflow: "hidden",
          transition: "width 160ms ease-out",
        }}
      >
        {/* Identidade: logo ZapFlow + workspace do cliente num bloco coeso,
            sem régua de separação — hierarquia vem do tamanho/espaçamento.
            Recolhido: empilhado e centrado. Expandido: logo+nome do sistema
            em cima, negócio do cliente embaixo. */}
        {expanded ? (
          <div className="flex flex-col" style={{ padding: "14px 12px 10px", gap: 10 }}>
            <div className="flex items-center" style={{ gap: 8 }}>
              <div
                className="flex items-center justify-center"
                style={{
                  width: 26,
                  height: 26,
                  borderRadius: "var(--radius-pill)",
                  background: "var(--brand-400)",
                  color: "#fff",
                  fontSize: 13,
                  fontWeight: 700,
                  flexShrink: 0,
                }}
              >
                Z
              </div>
              <span style={{ fontSize: 15, fontWeight: 700, color: "var(--text-primary)" }}>
                ZapFlow
              </span>
            </div>
            <div className="flex items-center" style={{ gap: 8 }}>
              <div
                className="flex items-center justify-center"
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: "var(--radius-pill)",
                  border: "1px solid var(--border)",
                  fontSize: 11,
                  fontWeight: 600,
                  color: "var(--text-muted)",
                  flexShrink: 0,
                }}
              >
                {businessName.charAt(0).toUpperCase()}
              </div>
              <span
                className="truncate"
                style={{ fontSize: 13, fontWeight: 500, color: "var(--text-primary)", minWidth: 0 }}
              >
                {businessName}
              </span>
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center" style={{ padding: "14px 8px 10px", gap: 6 }}>
            <div
              className="flex items-center justify-center"
              style={{
                width: 26,
                height: 26,
                borderRadius: "var(--radius-pill)",
                background: "var(--brand-400)",
                color: "#fff",
                fontSize: 13,
                fontWeight: 700,
                flexShrink: 0,
              }}
            >
              Z
            </div>
            <Tooltip>
              <TooltipTrigger asChild>
                <div
                  className="flex items-center justify-center"
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: "var(--radius-pill)",
                    border: "1px solid var(--border)",
                    fontSize: 11,
                    fontWeight: 600,
                    color: "var(--text-muted)",
                    cursor: "default",
                  }}
                >
                  {businessName.charAt(0).toUpperCase()}
                </div>
              </TooltipTrigger>
              <TooltipContent side="right">{businessName}</TooltipContent>
            </Tooltip>
          </div>
        )}

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
                  className="flex items-center transition-colors"
                  style={{
                    height: 40,
                    ...(expanded
                      ? { width: "100%", padding: "0 12px", gap: 12, justifyContent: "flex-start" }
                      : { width: 40, margin: "0 auto", justifyContent: "center" }),
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
                  {expanded && (
                    <span style={{ fontSize: 13.5, fontWeight: 500 }}>{item.label}</span>
                  )}
                </Link>
              );
              return (
                <li
                  key={item.label}
                  onMouseEnter={hasFlyout ? openFlyout : undefined}
                  onMouseLeave={hasFlyout ? scheduleClose : undefined}
                >
                  {/* Tooltip só faz sentido recolhido (rótulo já aparece
                      expandido). Item com flyout dispensa tooltip — o painel já
                      diz o nome. */}
                  {hasFlyout || expanded ? (
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

        {/* Alternador recolher/expandir — discreto, na base antes do user */}
        <div style={{ padding: "4px 8px" }}>
          <button
            type="button"
            onClick={toggleExpanded}
            aria-label={expanded ? "Recolher menu" : "Expandir menu"}
            className="flex items-center transition-colors"
            style={{
              height: 32,
              ...(expanded
                ? { width: "100%", padding: "0 10px", gap: 10, justifyContent: "flex-start" }
                : { width: 32, margin: "0 auto", justifyContent: "center" }),
              borderRadius: "var(--radius-pill)",
              border: "none",
              background: "transparent",
              color: "var(--text-muted)",
              cursor: "pointer",
              fontSize: 12,
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = "var(--bg-overlay)")}
            onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
          >
            {/* Chevron duplo sutil — combina com o design do site (mesma
                linguagem visual dos botões pill com ícone outline). */}
            <svg
              width="16"
              height="16"
              viewBox="0 0 16 16"
              fill="none"
              style={{
                transform: expanded ? "rotate(0deg)" : "rotate(180deg)",
                transition: "transform 160ms ease",
                flexShrink: 0,
              }}
            >
              <path
                d="M10 3.5L6 8l4 4.5"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <path
                d="M6 3.5L2 8l4 4.5"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                opacity="0.4"
              />
            </svg>
            {expanded && (
              <span style={{ fontWeight: 500, color: "var(--text-muted)" }}>Recolher</span>
            )}
          </button>
        </div>

        {/* User */}
        <div
          style={{
            padding: "8px 8px 12px",
            display: "flex",
            alignItems: "center",
            gap: 10,
            ...(expanded ? { justifyContent: "flex-start", paddingLeft: 12 } : { justifyContent: "center" }),
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
            {!expanded && (
              <TooltipContent side="right">
                {name}
                {user?.email ? ` · ${user.email}` : ""}
              </TooltipContent>
            )}
          </Tooltip>
          {expanded && (
            <div className="flex flex-col" style={{ minWidth: 0 }}>
              <span
                className="truncate"
                style={{ fontSize: 13, fontWeight: 500, color: "var(--text-primary)" }}
              >
                {name}
              </span>
              {user?.email && (
                <span
                  className="truncate"
                  style={{ fontSize: 11, color: "var(--text-muted)" }}
                >
                  {user.email}
                </span>
              )}
            </div>
          )}
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
            left: sidebarWidth,
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
