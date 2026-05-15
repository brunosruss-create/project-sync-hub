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
} from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useIsSuperAdmin } from "@/hooks/use-is-super-admin";

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
        style={{ background: "#0A0A0A", color: "#fff" }}
      >
        <p style={{ fontSize: 13, opacity: 0.6 }}>Verificando permissões…</p>
      </div>
    );
  }

  if (!allowed) return null;

  return (
    <div
      className="fixed inset-0 flex"
      style={{ background: "#050505", color: "#fff", fontFamily: "inherit" }}
    >
      {/* Sidebar */}
      <aside
        className="hidden md:flex flex-col shrink-0"
        style={{
          width: 240,
          background: "#0A0A0A",
          borderRight: "1px solid #1F1F23",
        }}
      >
        <div
          className="flex items-center gap-2"
          style={{ height: 56, padding: "0 16px", borderBottom: "1px solid #1F1F23" }}
        >
          <div
            style={{
              width: 26,
              height: 26,
              borderRadius: 6,
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
                      borderRadius: 6,
                      fontSize: 13,
                      fontWeight: 500,
                      color: active ? "#fff" : "rgba(255,255,255,0.7)",
                      background: active
                        ? "color-mix(in oklab, #7C3AED 25%, transparent)"
                        : "transparent",
                      borderLeft: active ? "2px solid #7C3AED" : "2px solid transparent",
                      paddingLeft: active ? 8 : 10,
                    }}
                    onMouseEnter={(e) => {
                      if (!active) e.currentTarget.style.background = "#15151A";
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

        <div style={{ padding: 12, borderTop: "1px solid #1F1F23" }}>
          <Link
            to="/dashboard"
            className="flex items-center gap-2"
            style={{
              padding: "8px 10px",
              borderRadius: 6,
              fontSize: 12,
              color: "rgba(255,255,255,0.5)",
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
            borderBottom: "1px solid #1F1F23",
            background: "#0A0A0A",
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
                borderRadius: 999,
                background: "color-mix(in oklab, #7C3AED 25%, transparent)",
                color: "#A78BFA",
                border: "1px solid color-mix(in oklab, #7C3AED 50%, transparent)",
              }}
            >
              Super Admin
            </span>
          </div>
          <span style={{ fontSize: 12, color: "rgba(255,255,255,0.5)" }}>
            {user?.email}
          </span>
        </header>

        <main
          className="flex-1 overflow-y-auto"
          style={{ padding: 24, background: "#050505" }}
        >
          <Outlet />
        </main>
      </div>
    </div>
  );
}

// Re-export shared admin styles
export const adminCard: React.CSSProperties = {
  background: "#0A0A0A",
  border: "1px solid #1F1F23",
  borderRadius: 10,
  padding: 16,
};

export const adminInput: React.CSSProperties = {
  height: 34,
  padding: "0 10px",
  borderRadius: 6,
  border: "1px solid #1F1F23",
  background: "#0A0A0A",
  color: "#fff",
  fontSize: 13,
  outline: "none",
};

export const adminBtn: React.CSSProperties = {
  height: 32,
  padding: "0 12px",
  borderRadius: 6,
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
  border: "1px solid #1F1F23",
  color: "rgba(255,255,255,0.85)",
};

export const adminBtnDanger: React.CSSProperties = {
  ...adminBtnGhost,
  color: "#F87171",
  borderColor: "color-mix(in oklab, #EF4444 40%, #1F1F23)",
};

export { redirect };
