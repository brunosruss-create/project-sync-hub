import * as React from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import {
  LayoutDashboard,
  MessageSquare,
  Users,
  BarChart3,
  Settings,
  Wrench,
  Calendar,
  Bot,
  Shield,
  X,
  Menu,
} from "lucide-react";

const items = [
  { label: "Dashboard", to: "/dashboard", icon: LayoutDashboard },
  { label: "Conversas", to: "/inbox", icon: MessageSquare },
  { label: "Agenda", to: "/schedule", icon: Calendar },
  { label: "Serviços", to: "/services", icon: Wrench },
  { label: "Agente IA", to: "/ai-agent", icon: Bot },
  { label: "Contatos", to: "/dashboard", icon: Users },
  { label: "Relatórios", to: "/dashboard", icon: BarChart3 },
  { label: "Configurações", to: "/settings/profile", icon: Settings },
  { label: "Super Admin", to: "/super-admin/workspaces", icon: Shield },
] as const;

export function MobileSidebarTrigger() {
  const [open, setOpen] = React.useState(false);
  const path = useRouterState({ select: (s) => s.location.pathname });

  React.useEffect(() => {
    setOpen(false);
  }, [path]);

  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <>
      <button
        type="button"
        aria-label="Abrir menu"
        onClick={() => setOpen(true)}
        className="md:hidden inline-flex items-center justify-center"
        style={{
          width: 32,
          height: 32,
          borderRadius: 6,
          color: "var(--text-primary)",
          background: "transparent",
        }}
      >
        <Menu size={18} />
      </button>
      {open && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Menu de navegação"
          className="md:hidden fixed inset-0 z-50"
          style={{ background: "rgba(0,0,0,0.55)" }}
          onClick={() => setOpen(false)}
        >
          <aside
            onClick={(e) => e.stopPropagation()}
            style={{
              width: 260,
              height: "100%",
              background: "var(--bg-surface)",
              borderRight: "1px solid var(--border)",
              display: "flex",
              flexDirection: "column",
            }}
          >
            <div
              className="flex items-center justify-between"
              style={{ height: 48, padding: "0 12px", borderBottom: "1px solid var(--border)" }}
            >
              <span style={{ fontSize: 14, fontWeight: 600 }}>ZapFlow</span>
              <button
                type="button"
                aria-label="Fechar menu"
                onClick={() => setOpen(false)}
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: 6,
                  background: "transparent",
                  color: "var(--text-muted)",
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <X size={16} />
              </button>
            </div>
            <nav style={{ flex: 1, padding: 8, overflowY: "auto" }}>
              <ul style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                {items.map((item) => {
                  const active =
                    item.to === "/dashboard" ? path === "/dashboard" : path.startsWith(item.to);
                  const Icon = item.icon;
                  return (
                    <li key={item.label}>
                      <Link
                        to={item.to}
                        className="flex items-center gap-2"
                        style={{
                          height: 36,
                          padding: "0 10px",
                          borderRadius: 6,
                          fontSize: 14,
                          color: active ? "var(--brand-400)" : "var(--text-primary)",
                          background: active
                            ? "color-mix(in oklab, var(--brand-400) 10%, transparent)"
                            : "transparent",
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
          </aside>
        </div>
      )}
    </>
  );
}
