import * as React from "react";
import {
  Outlet,
  Link,
  createFileRoute,
  useNavigate,
  useRouterState,
  redirect,
} from "@tanstack/react-router";
import { toast } from "sonner";
import {
  Building2,
  Users,
  Activity,
  CreditCard,
  Shield,
  LogOut,
  Bot,
  Moon,
  Sun,
} from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useIsSuperAdmin } from "@/hooks/use-is-super-admin";
import { useTheme } from "@/hooks/use-theme";

export const Route = createFileRoute("/_authenticated/super-admin")({
  component: SuperAdminLayout,
});

const NAV = [
  { to: "/super-admin/workspaces", label: "Workspaces", icon: Building2 },
  { to: "/super-admin/users", label: "Usuários", icon: Users },
  { to: "/super-admin/ia", label: "Inteligência Artificial", icon: Bot },
  { to: "/super-admin/health", label: "Saúde", icon: Activity },
  { to: "/super-admin/billing", label: "Cobrança", icon: CreditCard },
] as const;

function SuperAdminLayout() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const path = useRouterState({ select: (s) => s.location.pathname });
  const { isSuperAdmin, loading: checking } = useIsSuperAdmin();
  const { theme, toggle } = useTheme();
  const [denied, setDenied] = React.useState(false);

  React.useEffect(() => {
    if (checking) return;
    if (!isSuperAdmin && !denied) {
      setDenied(true);
      toast.error("Acesso negado", {
        description: "Você não tem permissão para acessar o painel admin.",
      });
      navigate({ to: "/dashboard" });
    }
  }, [checking, isSuperAdmin, denied, navigate]);

  const allowed = isSuperAdmin;

  if (checking) {
    return (
      <div
        className="flex min-h-screen items-center justify-center"
        style={{ background: "var(--bg-surface)", color: "var(--text-primary)" }}
      >
        <p style={{ fontSize: 13, opacity: 0.6 }}>Verificando permissões…</p>
      </div>
    );
  }

  if (!allowed) return null;

  return (
    <div
      className="fixed inset-0 flex"
      style={{ background: "var(--bg-base)", color: "var(--text-primary)", fontFamily: "inherit" }}
    >
      {/* Sidebar */}
      <aside
        className="hidden md:flex flex-col shrink-0"
        style={{
          width: 240,
          background: "var(--bg-surface)",
          borderRight: "1px solid var(--border)",
        }}
      >
        <div
          className="flex items-center gap-2"
          style={{ height: 56, padding: "0 16px", borderBottom: "1px solid var(--border)" }}
        >
          <div
            style={{
              width: 26,
              height: 26,
              borderRadius: "var(--radius-pill)",
              background: "#7C3AED",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Shield size={14} color="#fff" />
          </div>
          <span style={{ fontSize: 14, fontWeight: 600 }}>ZapFlow Admin</span>
        </div>

        <nav className="flex-1" style={{ padding: 8 }}>
          <ul className="flex flex-col" style={{ gap: 2 }}>
            {NAV.map((n) => {
              const active = path.startsWith(n.to);
              const Icon = n.icon;
              return (
                <li key={n.to}>
                  <Link
                    to={n.to}
                    className="flex items-center gap-2 transition-colors"
                    style={{
                      height: 34,
                      padding: "0 10px",
                      borderRadius: "var(--radius-control)",
                      fontSize: 13,
                      fontWeight: 500,
                      color: active ? "var(--text-primary)" : "var(--text-muted)",
                      background: active
                        ? "color-mix(in oklab, #7C3AED 25%, transparent)"
                        : "transparent",
                      borderLeft: active ? "2px solid #7C3AED" : "2px solid transparent",
                      paddingLeft: active ? 8 : 10,
                    }}
                    onMouseEnter={(e) => {
                      if (!active) e.currentTarget.style.background = "var(--bg-overlay)";
                    }}
                    onMouseLeave={(e) => {
                      if (!active) e.currentTarget.style.background = "transparent";
                    }}
                  >
                    <Icon size={15} />
                    {n.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        <div style={{ padding: 12, borderTop: "1px solid var(--border)" }}>
          <Link
            to="/dashboard"
            className="flex items-center gap-2"
            style={{
              padding: "8px 10px",
              borderRadius: "var(--radius-control)",
              fontSize: 12,
              color: "var(--text-muted)",
            }}
          >
            <LogOut size={13} /> Voltar ao app
          </Link>
        </div>
      </aside>

      <div className="flex-1 flex flex-col min-w-0">
        <header
          className="flex items-center justify-between"
          style={{
            height: 56,
            padding: "0 24px",
            borderBottom: "1px solid var(--border)",
            background: "var(--bg-surface)",
          }}
        >
          <div className="flex items-center gap-3">
            <h1 style={{ fontSize: 14, fontWeight: 600 }}>Painel Super Admin</h1>
            <span
              style={{
                fontSize: 10,
                fontWeight: 700,
                textTransform: "uppercase",
                letterSpacing: "0.08em",
                padding: "3px 8px",
                borderRadius: "var(--radius-pill)",
                background: "color-mix(in oklab, #7C3AED 25%, transparent)",
                color: "#A78BFA",
                border: "1px solid color-mix(in oklab, #7C3AED 50%, transparent)",
              }}
            >
              Super Admin
            </span>
          </div>
          <div className="flex items-center gap-3">
            <span style={{ fontSize: 12, color: "var(--text-muted)" }}>
              {user?.email}
            </span>
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
          </div>
        </header>

        <main
          className="flex-1 overflow-y-auto"
          style={{ padding: 24, background: "var(--bg-base)" }}
        >
          <Outlet />
        </main>
      </div>
    </div>
  );
}

// Re-export shared admin styles
export const adminCard: React.CSSProperties = {
  background: "var(--bg-surface)",
  border: "1px solid var(--border)",
  borderRadius: "var(--radius-card)",
  padding: 16,
};

export const adminInput: React.CSSProperties = {
  height: 34,
  padding: "0 10px",
  borderRadius: "var(--radius-control)",
  border: "1px solid var(--border)",
  background: "var(--bg-surface)",
  color: "var(--text-primary)",
  fontSize: 13,
  outline: "none",
};

export const adminBtn: React.CSSProperties = {
  height: 32,
  padding: "0 12px",
  borderRadius: "var(--radius-control)",
  background: "#7C3AED",
  color: "#fff",
  fontSize: 12,
  fontWeight: 500,
  border: 0,
  cursor: "pointer",
};

export const adminBtnGhost: React.CSSProperties = {
  ...adminBtn,
  background: "transparent",
  border: "1px solid var(--border)",
  color: "var(--text-primary)",
};

export const adminBtnDanger: React.CSSProperties = {
  ...adminBtnGhost,
  color: "#F87171",
  borderColor: "color-mix(in oklab, #EF4444 40%, var(--border))",
};

export { redirect };
