import * as React from "react";

type Props = {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void | Promise<void>;
  title?: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
};

export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title = "Tem certeza?",
  description = "Esta ação não pode ser desfeita.",
  confirmLabel = "Confirmar",
  cancelLabel = "Cancelar",
  destructive = true,
}: Props) {
  const ref = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    // focus trap (basic)
    const t = setTimeout(() => ref.current?.querySelector<HTMLButtonElement>("button[data-confirm]")?.focus(), 30);
    return () => {
      window.removeEventListener("keydown", handler);
      clearTimeout(t);
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-title"
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: "rgba(0,0,0,0.55)", padding: 16 }}
      onClick={onClose}
    >
      <div
        ref={ref}
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "100%",
          maxWidth: 420,
          background: "var(--bg-surface)",
          border: "1px solid var(--border)",
          borderRadius: 12,
          padding: 20,
          boxShadow: "0 20px 60px rgba(0,0,0,0.4)",
        }}
      >
        <h2 id="confirm-title" style={{ fontSize: 16, fontWeight: 600, marginBottom: 6 }}>
          {title}
        </h2>
        <p style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 20 }}>{description}</p>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <button
            type="button"
            onClick={onClose}
            style={{
              height: 32,
              padding: "0 12px",
              borderRadius: 6,
              fontSize: 13,
              fontWeight: 500,
              background: "transparent",
              color: "var(--text-primary)",
              border: "1px solid var(--border)",
            }}
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            data-confirm
            onClick={() => {
              void onConfirm();
              onClose();
            }}
            style={{
              height: 32,
              padding: "0 12px",
              borderRadius: 6,
              fontSize: 13,
              fontWeight: 500,
              background: destructive ? "var(--danger)" : "var(--brand-400)",
              color: "#fff",
              border: "none",
            }}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
