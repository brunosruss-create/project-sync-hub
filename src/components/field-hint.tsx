import * as React from "react";
import { Info, AlertTriangle } from "lucide-react";

/** Texto mudo sob um campo/label/toggle — explicação curta, sempre visível. */
export function FieldHint({
  children,
  style,
}: {
  children: React.ReactNode;
  style?: React.CSSProperties;
}) {
  return (
    <span style={{ display: "block", fontSize: 12, color: "var(--text-muted)", lineHeight: 1.5, ...style }}>
      {children}
    </span>
  );
}

const CALLOUT_TOKEN = { info: "var(--info)", warning: "var(--warning)" } as const;
const CALLOUT_ICON = { info: Info, warning: AlertTriangle } as const;

/**
 * Caixa de aviso mais chamativa que FieldHint — pra explicações de maior
 * risco de confusão (ex.: como um dado é usado pela IA). Fórmula única de
 * color-mix() no lugar das 2+ variantes divergentes que existiam antes.
 */
export function HintCallout({
  variant = "info",
  children,
}: {
  variant?: "info" | "warning";
  children: React.ReactNode;
}) {
  const token = CALLOUT_TOKEN[variant];
  const Icon = CALLOUT_ICON[variant];
  return (
    <div
      className="flex items-start"
      style={{
        gap: 8,
        padding: "10px 12px",
        borderRadius: 8,
        background: `color-mix(in oklab, ${token} 10%, var(--bg-surface))`,
        border: `1px solid color-mix(in oklab, ${token} 25%, var(--border))`,
      }}
    >
      <Icon size={15} style={{ color: token, flexShrink: 0, marginTop: 1 }} />
      <span style={{ fontSize: 12, color: "var(--text-muted)", lineHeight: 1.5 }}>{children}</span>
    </div>
  );
}
