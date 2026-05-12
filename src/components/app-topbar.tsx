import * as React from "react";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { Moon, Sun, LogOut } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useTheme } from "@/hooks/use-theme";

export function AppTopbar() {
  const { theme, toggle } = useTheme();
  const { signOut } = useAuth();
  const navigate = useNavigate();
  const path = useRouterState({ select: (s) => s.location.pathname });

  const segments = path.split("/").filter(Boolean);

  return (
    <header
      className="flex items-center justify-between"
      style={{
        height: 48,
        padding: "0 16px",
        background: "var(--bg-surface)",
        borderBottom: "1px solid var(--border)",
      }}
    >
      <nav className="flex items-center gap-1" style={{ fontSize: 13 }}>
        {segments.map((s, i) => (
          <React.Fragment key={i}>
            {i > 0 && (
              <span style={{ color: "var(--text-muted)" }}>/</span>
            )}
            <span
              style={{
                color: i === segments.length - 1 ? "var(--text-primary)" : "var(--text-muted)",
                textTransform: "capitalize",
              }}
            >
              {s}
            </span>
          </React.Fragment>
        ))}
      </nav>

      <div className="flex items-center" style={{ gap: 4 }}>
        <button
          type="button"
          onClick={toggle}
          aria-label="Alternar tema"
          className="inline-flex items-center justify-center transition-colors"
          style={{
            width: 32,
            height: 32,
            borderRadius: 6,
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
            borderRadius: 6,
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
