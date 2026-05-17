import * as React from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import {
  LayoutDashboard,
  MessageSquare,
  Users,
  BarChart3,
  Settings,
  ChevronsUpDown,
  Wrench,
  Calendar,
  Bot,
  Shield,
  Columns3,
  ChevronsLeft,
  ChevronsRight,
} from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useProfile } from "@/hooks/use-profile";
import { useRole } from "@/hooks/use-role";
import { useIsSuperAdmin } from "@/hooks/use-is-super-admin";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

const ALL_ITEMS = [
  { label: "Dashboard", to: "/dashboard", icon: LayoutDashboard, agentVisible: false },
  { label: "Conversas", to: "/conversations-chat", icon: MessageSquare, agentVisible: true },
  { label: "Kanban", to: "/inbox", icon: Columns3, agentVisible: true },
  { label: "Agenda", to: "/schedule", icon: Calendar, agentVisible: true },
  { label: "Serviços", to: "/services", icon: Wrench, agentVisible: false },
  { label: "Agente IA", to: "/ai-agent", icon: Bot, agentVisible: false },
  { label: "Contatos", to: "/contacts", icon: Users, agentVisible: true },
  { label: "Relatórios", to: "/reports", icon: BarChart3, agentVisible: false },
  { label: "Configurações", to: "/settings/profile", icon: Settings, agentVisible: true },
  { label: "Super Admin", to: "/super-admin/workspaces", icon: Shield, agentVisible: false },
] as const;

export function AppSidebar() {
  const path = useRouterState({ select: (s) => s.location.pathname });
  const { user } = useAuth();
  const { data: profile } = useProfile();
  const { isAgent } = useRole();
  const { isSuperAdmin } = useIsSuperAdmin();
  const items = (isAgent ? ALL_ITEMS.filter((i) => i.agentVisible) : ALL_ITEMS).filter(
    (i) => i.label !== "Super Admin" || isSuperAdmin,
  );

  const [isCollapsed, setIsCollapsed] = React.useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return localStorage.getItem("sidebar_collapsed") === "true";
  });

  React.useEffect(() => {
    localStorage.setItem("sidebar_collapsed", String(isCollapsed));
  }, [isCollapsed]);

  React.useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<{ collapsed: boolean }>).detail;
      if (detail && typeof detail.collapsed === "boolean") {
        setIsCollapsed(detail.collapsed);
      }
    };
    window.addEventListener("sidebar:setCollapsed", handler);
    return () => window.removeEventListener("sidebar:setCollapsed", handler);
  }, []);

  const name =
    profile?.full_name ||
    (user?.user_metadata?.full_name as string | undefined) ||
    user?.email?.split("@")[0] ||
    "Usuário";
  const avatar =
    profile?.avatar_url || (user?.user_metadata?.avatar_url as string | undefined);

  return (
    <TooltipProvider delayDuration={0}>
      <aside
        className="hidden md:flex flex-col shrink-0"
        style={{
          width: isCollapsed ? 64 : 240,
          height: "100vh",
          background: "var(--bg-surface)",
          borderRight: "1px solid var(--border)",
          transition: "width 200ms ease",
          overflow: "hidden",
        }}
      >
        {/* Logo */}
        <div
          className="flex items-center gap-2"
          style={{
            height: 56,
            padding: isCollapsed ? "0" : "0 16px",
            justifyContent: isCollapsed ? "center" : "flex-start",
            borderBottom: "1px solid var(--border)",
          }}
        >
          <div
            className="flex items-center justify-center"
            style={{
              width: 24,
              height: 24,
              borderRadius: 6,
              background: "var(--brand-400)",
              color: "#fff",
              fontSize: 13,
              fontWeight: 600,
              flexShrink: 0,
            }}
          >
            Z
          </div>
          {!isCollapsed && (
            <span style={{ fontSize: 14, fontWeight: 600, letterSpacing: "-0.01em" }}>
              ZapFlow
            </span>
          )}
        </div>

        {/* Toggle */}
        <button
          type="button"
          onClick={() => setIsCollapsed((p) => !p)}
          title={isCollapsed ? "Expandir menu" : "Recolher menu"}
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: isCollapsed ? "center" : "flex-end",
            width: "100%",
            padding: "6px 8px",
            background: "transparent",
            border: "none",
            cursor: "pointer",
            color: "var(--text-muted)",
          }}
        >
          {isCollapsed ? <ChevronsRight size={14} /> : <ChevronsLeft size={14} />}
        </button>

        {/* Workspace selector */}
        <div style={{ padding: isCollapsed ? "4px 8px" : "8px 12px 4px" }}>
          {isCollapsed ? (
            <div
              className="flex items-center justify-center"
              style={{
                width: 36,
                height: 36,
                margin: "0 auto",
                borderRadius: 6,
                border: "1px solid var(--border)",
              }}
            >
              <span
                style={{
                  width: 18,
                  height: 18,
                  borderRadius: 4,
                  background: "var(--bg-overlay)",
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 11,
                  fontWeight: 600,
                }}
              >
                {name.charAt(0).toUpperCase()}
              </span>
            </div>
          ) : (
            <button
              type="button"
              className="w-full flex items-center justify-between transition-colors"
              style={{
                height: 36,
                padding: "0 8px",
                borderRadius: 6,
                border: "1px solid var(--border)",
                background: "transparent",
                color: "var(--text-primary)",
                fontSize: 13,
              }}
            >
              <span className="flex items-center gap-2 min-w-0">
                <span
                  style={{
                    width: 18,
                    height: 18,
                    borderRadius: 4,
                    background: "var(--bg-overlay)",
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 11,
                    fontWeight: 600,
                  }}
                >
                  {name.charAt(0).toUpperCase()}
                </span>
                <span className="truncate">Workspace pessoal</span>
              </span>
              <ChevronsUpDown size={14} style={{ color: "var(--text-muted)" }} />
            </button>
          )}
        </div>

        {/* Nav */}
        <nav className="flex-1" style={{ padding: "8px" }}>
          <ul className="flex flex-col" style={{ gap: 2 }}>
            {items.map((item) => {
              const active =
                item.to === "/dashboard" ? path === "/dashboard" : path.startsWith(item.to);
              const Icon = item.icon;
              const linkEl = (
                <Link
                  to={item.to}
                  className="flex items-center transition-colors"
                  style={{
                    height: 32,
                    padding: isCollapsed ? "0" : "0 8px",
                    paddingLeft: isCollapsed ? 0 : active ? 6 : 8,
                    gap: isCollapsed ? 0 : 8,
                    justifyContent: isCollapsed ? "center" : "flex-start",
                    borderRadius: 6,
                    fontSize: 13,
                    fontWeight: 500,
                    color: active ? "var(--brand-400)" : "var(--text-primary)",
                    background: active
                      ? "color-mix(in oklab, var(--brand-400) 10%, transparent)"
                      : "transparent",
                    borderLeft:
                      !isCollapsed && active
                        ? "2px solid var(--brand-400)"
                        : "2px solid transparent",
                  }}
                  onMouseEnter={(e) => {
                    if (!active) e.currentTarget.style.background = "var(--bg-overlay)";
                  }}
                  onMouseLeave={(e) => {
                    if (!active) e.currentTarget.style.background = "transparent";
                  }}
                >
                  <Icon size={16} />
                  {!isCollapsed && <span>{item.label}</span>}
                </Link>
              );
              return (
                <li key={item.label}>
                  {isCollapsed ? (
                    <Tooltip>
                      <TooltipTrigger asChild>{linkEl}</TooltipTrigger>
                      <TooltipContent side="right">{item.label}</TooltipContent>
                    </Tooltip>
                  ) : (
                    linkEl
                  )}
                </li>
              );
            })}
          </ul>
        </nav>

        {/* User */}
        <div
          style={{
            padding: isCollapsed ? "12px 8px" : 12,
            borderTop: "1px solid var(--border)",
            display: "flex",
            alignItems: "center",
            justifyContent: isCollapsed ? "center" : "flex-start",
            gap: 8,
          }}
        >
          {avatar ? (
            <img
              src={avatar}
              alt={name}
              style={{
                width: 28,
                height: 28,
                borderRadius: 999,
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
                borderRadius: 999,
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
          {!isCollapsed && (
            <div className="min-w-0 flex-1">
              <div
                className="truncate"
                style={{ fontSize: 13, fontWeight: 500, color: "var(--text-primary)" }}
              >
                {name}
              </div>
              <div
                className="truncate"
                style={{ fontSize: 11, color: "var(--text-muted)" }}
              >
                {user?.email}
              </div>
            </div>
          )}
        </div>
      </aside>
    </TooltipProvider>
  );
}
