import * as React from "react";

type Props = {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: { label: string; onClick: () => void };
};

const DefaultIllustration = () => (
  <svg width="96" height="96" viewBox="0 0 96 96" fill="none" aria-hidden="true">
    <circle cx="48" cy="48" r="44" stroke="var(--border)" strokeWidth="1.5" strokeDasharray="3 4" />
    <path
      d="M30 56c0-9.94 8.06-18 18-18s18 8.06 18 18"
      stroke="var(--brand-400)"
      strokeWidth="2"
      strokeLinecap="round"
    />
    <circle cx="40" cy="44" r="2.5" fill="var(--brand-400)" />
    <circle cx="56" cy="44" r="2.5" fill="var(--brand-400)" />
  </svg>
);

export function EmptyState({ icon, title, description, action }: Props) {
  return (
    <div
      className="flex flex-col items-center justify-center text-center"
      style={{ padding: "48px 16px", gap: 12 }}
      role="status"
    >
      <div style={{ marginBottom: 4 }}>{icon ?? <DefaultIllustration />}</div>
      <h3 style={{ fontSize: 15, fontWeight: 600, color: "var(--text-primary)" }}>{title}</h3>
      {description && (
        <p style={{ fontSize: 13, color: "var(--text-muted)", maxWidth: 360 }}>{description}</p>
      )}
      {action && (
        <button type="button" className="btn-primary" onClick={action.onClick} style={{ marginTop: 8 }}>
          {action.label}
        </button>
      )}
    </div>
  );
}
