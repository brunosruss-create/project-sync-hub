import * as React from "react";
import { FieldHint } from "@/components/field-hint";

/**
 * A navegação entre telas de Configurações vive no flyout do rail
 * (`app-sidebar`), não aqui — este layout cuida só do cabeçalho, do conteúdo
 * e da barra de ações. A lista de itens está em `./nav-items`.
 */
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
  return (
    <div className="flex gap-6" data-settings-layout>
      <section
        className="flex-1 min-w-0 flex flex-col"
        style={footer ? { height: "calc(100vh - 48px - 48px)", overflow: "hidden" } : undefined}
      >
        <header style={{ marginBottom: 24, flexShrink: 0 }}>
          <h1 style={{ fontSize: 20, fontWeight: 600, letterSpacing: "-0.01em" }}>
            {title}
          </h1>
          {description && (
            <p style={{ fontSize: 13, color: "var(--text-muted)", marginTop: 4 }}>
              {description}
            </p>
          )}
        </header>

        <div className="flex-1" style={footer ? { overflowY: "auto" } : undefined}>
          {children}
        </div>

        {footer && (
          <div
            style={{
              flexShrink: 0,
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
      {hint && <FieldHint style={{ marginBottom: 12 }}>{hint}</FieldHint>}
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
      {hint && <FieldHint style={{ fontSize: 11 }}>{hint}</FieldHint>}
    </label>
  );
}

export const inputStyle: React.CSSProperties = {
  height: 36,
  padding: "0 10px",
  borderRadius: "var(--radius-control)",
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

/**
 * min-height (não height) + padding vertical: com altura fixa, rótulo que
 * quebra em duas linhas no mobile vazava a caixa do botão. Estes estilos são
 * compartilhados por todas as telas de Configurações, então a altura tem que
 * acompanhar o conteúdo. Visualmente idêntico com uma linha de texto.
 */
const buttonBase: React.CSSProperties = {
  minHeight: 36,
  padding: "8px 14px",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 6,
  lineHeight: 1.2,
  borderRadius: "var(--radius-pill)",
  fontSize: 13,
  fontWeight: 500,
  cursor: "pointer",
};

export const buttonPrimary: React.CSSProperties = {
  ...buttonBase,
  background: "var(--brand-400)",
  color: "#fff",
  border: 0,
};

export const buttonSecondary: React.CSSProperties = {
  ...buttonBase,
  background: "transparent",
  color: "var(--text-primary)",
  border: "1px solid var(--border)",
};

export const buttonDanger: React.CSSProperties = {
  ...buttonSecondary,
  color: "#EF4444",
  borderColor: "color-mix(in oklab, #EF4444 40%, var(--border))",
};

export const card: React.CSSProperties = {
  border: "1px solid var(--border)",
  borderRadius: "var(--radius-card)",
  background: "var(--bg-surface)",
  padding: 20,
};
