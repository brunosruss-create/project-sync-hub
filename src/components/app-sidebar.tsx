import * as React from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import {
  LayoutDashboard,
  MessageSquare,
  Users,
  BarChart3,
  Settings,
  ChevronsUpDown,
} from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useProfile } from "@/hooks/use-profile";

const items = [
  { label: "Dashboard", to: "/dashboard", icon: LayoutDashboard },
  { label: "Conversas", to: "/inbox", icon: MessageSquare },
  { label: "Contatos", to: "/dashboard", icon: Users },
  { label: "Relatórios", to: "/dashboard", icon: BarChart3 },
  { label: "Configurações", to: "/dashboard", icon: Settings },
] as const;

export function AppSidebar() {
  const path = useRouterState({ select: (s) => s.location.pathname });
  const { user } = useAuth();
  const { data: profile } = useProfile();

  const name =
    profile?.full_name ||
    (user?.user_metadata?.full_name as string | undefined) ||
    user?.email?.split("@")[0] ||
    "Usuário";
  const avatar =
    profile?.avatar_url || (user?.user_metadata?.avatar_url as string | undefined);

  return (
    <aside
      className="hidden md:flex flex-col shrink-0"
      style={{
        width: 240,
        background: "var(--bg-surface)",
        borderRight: "1px solid var(--border)",
      }}
    >
      {/* Logo */}
      <div
        className="flex items-center gap-2"
        style={{ height: 56, padding: "0 16px", borderBottom: "1px solid var(--border)" }}
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
          }}
        >
          Z
        </div>
        <span style={{ fontSize: 14, fontWeight: 600, letterSpacing: "-0.01em" }}>
          ZapFlow
        </span>
      </div>

      {/* Workspace selector */}
      <div style={{ padding: "12px 12px 4px" }}>
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
      </div>

      {/* Nav */}
      <nav className="flex-1" style={{ padding: "8px" }}>
        <ul className="flex flex-col" style={{ gap: 2 }}>
          {items.map((item, i) => {
            const active = i === 0 && path.startsWith("/dashboard");
            const Icon = item.icon;
            return (
              <li key={item.label}>
                <Link
                  to={item.to}
                  className="flex items-center gap-2 transition-colors"
                  style={{
                    height: 32,
                    padding: "0 8px",
                    borderRadius: 6,
                    fontSize: 13,
                    fontWeight: 500,
                    color: active ? "var(--brand-400)" : "var(--text-primary)",
                    background: active
                      ? "color-mix(in oklab, var(--brand-400) 10%, transparent)"
                      : "transparent",
                    borderLeft: active ? "2px solid var(--brand-400)" : "2px solid transparent",
                    paddingLeft: active ? 6 : 8,
                  }}
                  onMouseEnter={(e) => {
                    if (!active) e.currentTarget.style.background = "var(--bg-overlay)";
                  }}
                  onMouseLeave={(e) => {
                    if (!active) e.currentTarget.style.background = "transparent";
                  }}
                >
                  <Icon size={16} />
                  <span>{item.label}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* User */}
      <div
        style={{
          padding: 12,
          borderTop: "1px solid var(--border)",
          display: "flex",
          alignItems: "center",
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
            }}
          >
            {name.charAt(0).toUpperCase()}
          </div>
        )}
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
      </div>
    </aside>
  );
}
