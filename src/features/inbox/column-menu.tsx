import * as React from "react";
import { Edit3, ArrowLeft, ArrowRight, Trash2 } from "lucide-react";
import type { KanbanColumnDef } from "./data";

export type ColumnMenuAction =
  | { type: "edit" }
  | { type: "move-left" }
  | { type: "move-right" }
  | { type: "delete" };

type Props = {
  column: KanbanColumnDef;
  anchor: { top: number; left: number };
  canMoveLeft: boolean;
  canMoveRight: boolean;
  onClose: () => void;
  onAction: (a: ColumnMenuAction) => void;
};

export function ColumnMenu({
  column,
  anchor,
  canMoveLeft,
  canMoveRight,
  onClose,
  onAction,
}: Props) {
  const ref = React.useRef<HTMLDivElement | null>(null);

  React.useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (!ref.current) return;
      if (!ref.current.contains(e.target as Node)) onClose();
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  const top = Math.min(anchor.top, window.innerHeight - 220);
  const left = Math.min(anchor.left, window.innerWidth - 200);
  const canDelete = !column.is_system;

  return (
    <div
      ref={ref}
      role="menu"
      style={{
        position: "fixed",
        top, left,
        width: 200,
        background: "var(--bg-surface)",
        border: "1px solid var(--border-strong)",
        borderRadius: 8,
        boxShadow: "0 12px 28px rgba(0,0,0,0.32)",
        padding: 4,
        zIndex: 70,
        animation: "zfMenuIn 130ms ease-out",
        fontSize: 13,
      }}
      onClick={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <Item icon={<Edit3 size={14} />} onClick={() => { onAction({ type: "edit" }); onClose(); }}>
        Editar coluna
      </Item>
      <Item
        icon={<ArrowLeft size={14} />}
        disabled={!canMoveLeft}
        onClick={() => { if (canMoveLeft) { onAction({ type: "move-left" }); onClose(); } }}
      >
        Mover ← esquerda
      </Item>
      <Item
        icon={<ArrowRight size={14} />}
        disabled={!canMoveRight}
        onClick={() => { if (canMoveRight) { onAction({ type: "move-right" }); onClose(); } }}
      >
        Mover direita →
      </Item>
      <div style={{ height: 1, background: "var(--border)", margin: "4px 0" }} />
      <Item
        icon={<Trash2 size={14} style={{ color: canDelete ? "#EF4444" : undefined }} />}
        danger
        disabled={!canDelete}
        onClick={() => {
          if (!canDelete) return;
          onAction({ type: "delete" });
          onClose();
        }}
      >
        {canDelete ? "Excluir coluna" : "Padrão (não excluível)"}
      </Item>
    </div>
  );
}

function Item({
  icon, children, onClick, danger, disabled,
}: {
  icon: React.ReactNode;
  children: React.ReactNode;
  onClick?: () => void;
  danger?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      disabled={disabled}
      style={{
        display: "flex", alignItems: "center", gap: 8,
        width: "100%", padding: "7px 8px",
        background: "transparent", border: 0, borderRadius: 6,
        color: disabled ? "var(--text-muted)" : danger ? "#EF4444" : "var(--text-primary)",
        fontSize: 12, textAlign: "left",
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.5 : 1,
      }}
      onMouseEnter={(e) => { if (!disabled) e.currentTarget.style.background = "var(--bg-overlay)"; }}
      onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
    >
      <span style={{ width: 16, display: "inline-flex", justifyContent: "center" }}>{icon}</span>
      <span style={{ flex: 1 }}>{children}</span>
    </button>
  );
}
