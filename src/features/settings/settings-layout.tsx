import * as React from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import {
  User as UserIcon,
  Building2,
  Users,
  MessageCircle,
  CreditCard,
  Briefcase,
} from "lucide-react";

type SidebarEntry =
  | { kind: "section"; label: string }
  | { kind: "item"; label: string; to: string; icon: React.ComponentType<{ size?: number }> };

const items: SidebarEntry[] = [
  { kind: "section", label: "Acesso ao sistema" },
  { kind: "item", label: "Perfil", to: "/settings/profile", icon: UserIcon },
  { kind: "item", label: "Negócio", to: "/settings/workspace", icon: Building2 },
  { kind: "item", label: "Equipe", to: "/settings/team", icon: Users },
  { kind: "section", label: "Agenda" },
  { kind: "item", label: "Profissionais", to: "/settings/professionals", icon: Briefcase },
  { kind: "item", label: "WhatsApp", to: "/settings/whatsapp", icon: MessageCircle },
  { kind: "item", label: "Planos & Cobrança", to: "/settings/billing", icon: CreditCard },
];

export function SettingsLayout({
  title,
  description,
  children,
  footer,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  const path = useRouterState({ select: (s) => s.location.pathname });

  return (
    <div className="flex gap-6" style={{ minHeight: "calc(100vh - 56px - 48px)" }}>
      <aside
        className="shrink-0 hidden lg:block"
        style={{
          width: 200,
          borderRight: "1px solid var(--border)",
          paddingRight: 16,
        }}
      >
        <div
          style={{
            fontSize: 11,
            fontWeight: 600,
            textTransform: "uppercase",
            letterSpacing: "0.05em",
            color: "var(--text-muted)",
            padding: "0 8px 8px",
          }}
        >
          Configurações
        </div>
        <ul className="flex flex-col" style={{ gap: 2 }}>
          {items.map((it, idx) => {
            if (it.kind === "section") {
              return (
                <li
                  key={`sec-${idx}`}
                  style={{
                    fontSize: 10,
                    fontWeight: 600,
                    textTransform: "uppercase",
                    letterSpacing: "0.06em",
                    color: "var(--text-muted)",
                    padding: idx === 0 ? "4px 8px 4px" : "12px 8px 4px",
                    marginTop: idx === 0 ? 0 : 6,
                    borderTop: idx === 0 ? "none" : "1px solid var(--border)",
                  }}
                >
                  {it.label}
                </li>
              );
            }
            const active = path === it.to;
            const Icon = it.icon;
            return (
              <li key={it.to}>
                <Link
                  to={it.to}
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
                  }}
                  onMouseEnter={(e) => {
                    if (!active) e.currentTarget.style.background = "var(--bg-overlay)";
                  }}
                  onMouseLeave={(e) => {
                    if (!active) e.currentTarget.style.background = "transparent";
                  }}
                >
                  <Icon size={14} />
                  <span>{it.label}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </aside>

      <section className="flex-1 min-w-0 flex flex-col">
        <header style={{ marginBottom: 24 }}>
          <h1 style={{ fontSize: 20, fontWeight: 600, letterSpacing: "-0.01em" }}>
            {title}
          </h1>
          {description && (
            <p style={{ fontSize: 13, color: "var(--text-muted)", marginTop: 4 }}>
              {description}
            </p>
          )}
        </header>

        <div className="flex-1" style={{ paddingBottom: footer ? 80 : 0 }}>
          {children}
        </div>

        {footer && (
          <div
            className="sticky bottom-0"
            style={{
              marginTop: 24,
              padding: "12px 0",
              borderTop: "1px solid var(--border)",
              background: "var(--bg-base)",
              display: "flex",
              justifyContent: "flex-end",
              gap: 8,
            }}
          >
            {footer}
          </div>
        )}
      </section>
    </div>
  );
}

export function FieldGroup({
  label,
  children,
  hint,
}: {
  label: string;
  children: React.ReactNode;
  hint?: string;
}) {
  return (
    <fieldset style={{ border: 0, padding: 0, margin: "0 0 24px" }}>
      <legend
        style={{
          fontSize: 12,
          fontWeight: 600,
          textTransform: "uppercase",
          letterSpacing: "0.05em",
          color: "var(--text-muted)",
          padding: 0,
          marginBottom: 12,
        }}
      >
        {label}
      </legend>
      {hint && (
        <p style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 12 }}>
          {hint}
        </p>
      )}
      <div className="flex flex-col" style={{ gap: 12 }}>
        {children}
      </div>
    </fieldset>
  );
}

export function Field({
  label,
  children,
  hint,
}: {
  label?: string;
  children: React.ReactNode;
  hint?: string;
}) {
  return (
    <label className="flex flex-col" style={{ gap: 6 }}>
      {label && (
        <span style={{ fontSize: 12, fontWeight: 500, color: "var(--text-secondary, var(--text-primary))" }}>
          {label}
        </span>
      )}
      {children}
      {hint && (
        <span style={{ fontSize: 11, color: "var(--text-muted)" }}>{hint}</span>
      )}
    </label>
  );
}

export const inputStyle: React.CSSProperties = {
  height: 36,
  padding: "0 10px",
  borderRadius: 6,
  border: "1px solid var(--border)",
  background: "var(--bg-surface)",
  color: "var(--text-primary)",
  fontSize: 13,
  outline: "none",
  width: "100%",
};

export const textareaStyle: React.CSSProperties = {
  ...inputStyle,
  height: "auto",
  minHeight: 80,
  padding: "8px 10px",
  resize: "vertical",
  fontFamily: "inherit",
};

export const buttonPrimary: React.CSSProperties = {
  height: 36,
  padding: "0 14px",
  borderRadius: 6,
  background: "var(--brand-400)",
  color: "#fff",
  fontSize: 13,
  fontWeight: 500,
  border: 0,
  cursor: "pointer",
};

export const buttonSecondary: React.CSSProperties = {
  height: 36,
  padding: "0 14px",
  borderRadius: 6,
  background: "transparent",
  color: "var(--text-primary)",
  fontSize: 13,
  fontWeight: 500,
  border: "1px solid var(--border)",
  cursor: "pointer",
};

export const buttonDanger: React.CSSProperties = {
  ...buttonSecondary,
  color: "#EF4444",
  borderColor: "color-mix(in oklab, #EF4444 40%, var(--border))",
};

export const card: React.CSSProperties = {
  border: "1px solid var(--border)",
  borderRadius: 10,
  background: "var(--bg-surface)",
  padding: 20,
};
