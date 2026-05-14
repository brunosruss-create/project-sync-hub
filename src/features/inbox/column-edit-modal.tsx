import * as React from "react";
import { X, Loader2, Columns3 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useWorkspaceOwnerId } from "@/hooks/use-workspace-owner";
import { notify } from "@/lib/notify";
import {
  type KanbanColumnDef,
  COLUMN_PALETTE,
  EMOJI_SUGGESTIONS,
  slugify,
} from "./data";

interface Props {
  open: boolean;
  column: KanbanColumnDef | null; // null = criar nova
  existingSlugs: string[];
  nextPosition: number;
  onClose: () => void;
  onSaved: (col: KanbanColumnDef) => void;
}

export function ColumnEditModal({
  open,
  column,
  existingSlugs,
  nextPosition,
  onClose,
  onSaved,
}: Props) {
  const { user } = useAuth();
  const [label, setLabel] = React.useState("");
  const [emoji, setEmoji] = React.useState("📌");
  const [color, setColor] = React.useState("#6B7280");
  const [saving, setSaving] = React.useState(false);
  const labelRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    if (!open) return;
    setLabel(column?.label ?? "");
    setEmoji(column?.emoji ?? "📌");
    setColor(column?.color ?? "#6B7280");
    setSaving(false);
    setTimeout(() => labelRef.current?.focus(), 50);
  }, [open, column?.id]);

  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      else if ((e.metaKey || e.ctrlKey) && e.key === "Enter") void save();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, label, emoji, color]);

  async function save() {
    const finalLabel = label.trim();
    if (!finalLabel) {
      notify.error("Nome da coluna é obrigatório.");
      return;
    }
    if (!user?.id) {
      notify.error("Sessão expirada.");
      return;
    }
    setSaving(true);

    if (column) {
      // UPDATE — slug não muda
      const { data, error } = await supabase
        .from("kanban_columns")
        .update({ label: finalLabel, emoji, color })
        .eq("id", column.id)
        .select()
        .maybeSingle();
      if (error) {
        notify.error(error.message ?? "Falha ao salvar.");
        setSaving(false);
        return;
      }
      const next: KanbanColumnDef = {
        id: data?.id ?? column.id,
        slug: data?.slug ?? column.slug,
        label: data?.label ?? finalLabel,
        emoji: data?.emoji ?? emoji,
        color: data?.color ?? color,
        position: data?.position ?? column.position,
        is_system: !!(data?.is_system ?? column.is_system),
      };
      onSaved(next);
      notify.success("Coluna atualizada ✓");
      setSaving(false);
      onClose();
      return;
    }

    // CREATE — gera slug único
    let baseSlug = slugify(finalLabel);
    let slug = baseSlug;
    let i = 2;
    while (existingSlugs.includes(slug)) slug = `${baseSlug}_${i++}`;

    const { data, error } = await supabase
      .from("kanban_columns")
      .insert({
        owner_user_id: workspaceOwnerId,
        slug,
        label: finalLabel,
        emoji,
        color,
        position: nextPosition,
        is_system: false,
      })
      .select()
      .maybeSingle();

    if (error) {
      notify.error(
        /relation .* does not exist/i.test(error.message ?? "")
          ? "A tabela kanban_columns ainda não existe. Aplique a migration."
          : (error.message ?? "Falha ao criar."),
      );
      setSaving(false);
      return;
    }

    const created: KanbanColumnDef = {
      id: data?.id ?? slug,
      slug: data?.slug ?? slug,
      label: data?.label ?? finalLabel,
      emoji: data?.emoji ?? emoji,
      color: data?.color ?? color,
      position: data?.position ?? nextPosition,
      is_system: false,
    };
    onSaved(created);
    notify.success(`Coluna "${finalLabel}" criada`);
    setSaving(false);
    onClose();
  }

  if (!open) return null;
  const isEdit = !!column;

  return (
    <>
      <style>{`
        @keyframes zfCemIn { from { opacity:0; transform: scale(.96);} to { opacity:1; transform: scale(1);} }
        @keyframes zfCemFade { from { opacity:0; } to { opacity:1; } }
      `}</style>
      <div
        onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
        style={{
          position: "fixed", inset: 0, background: "rgba(0,0,0,.55)",
          backdropFilter: "blur(4px)", WebkitBackdropFilter: "blur(4px)",
          zIndex: 90, display: "flex", alignItems: "center", justifyContent: "center", padding: 16,
          animation: "zfCemFade .15s ease-out",
        }}
      >
        <div
          role="dialog"
          aria-modal="true"
          aria-label={isEdit ? "Editar coluna" : "Nova coluna"}
          style={{
            width: 420, maxWidth: "100%",
            background: "var(--bg-surface)",
            border: "1px solid var(--border-strong)",
            borderRadius: 12,
            boxShadow: "0 24px 48px rgba(0,0,0,.4)",
            display: "flex", flexDirection: "column",
            maxHeight: "calc(100vh - 32px)",
            animation: "zfCemIn .18s ease-out",
          }}
        >
          {/* Header */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 16px 12px", borderBottom: "1px solid var(--border)" }}>
            <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
              <div style={{
                width: 28, height: 28, borderRadius: 6,
                display: "inline-flex", alignItems: "center", justifyContent: "center",
                background: `${color}22`, border: `1px solid ${color}`,
                color, fontSize: 16,
              }}>{emoji}</div>
              <div>
                <div style={{ fontSize: 14, fontWeight: 600, color: "var(--text-primary)" }}>
                  {isEdit ? "Editar coluna" : "Nova coluna"}
                </div>
                <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 1 }}>
                  {isEdit
                    ? (column?.is_system ? "Coluna padrão (não pode ser excluída)" : "Personalizada")
                    : "Crie um novo estágio do funil"}
                </div>
              </div>
            </div>
            <button onClick={onClose} aria-label="Fechar" style={{ background: "transparent", border: 0, color: "var(--text-muted)", cursor: "pointer", padding: 4, borderRadius: 6 }}>
              <X size={16} />
            </button>
          </div>

          {/* Body */}
          <div style={{ padding: 16, overflowY: "auto", display: "flex", flexDirection: "column", gap: 14 }}>
            <div>
              <label style={lbl}>Nome *</label>
              <input
                ref={labelRef}
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                style={input}
                placeholder="Ex: VIP, Pós-venda, Cancelados"
                maxLength={40}
              />
            </div>

            <div>
              <label style={lbl}>Ícone</label>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {EMOJI_SUGGESTIONS.map((e) => (
                  <button
                    key={e}
                    type="button"
                    onClick={() => setEmoji(e)}
                    style={{
                      width: 34, height: 34, borderRadius: 6,
                      background: emoji === e ? "var(--bg-overlay)" : "var(--bg-base)",
                      border: emoji === e ? "1px solid var(--brand-400, #25D366)" : "1px solid var(--border)",
                      cursor: "pointer", fontSize: 18,
                    }}
                  >{e}</button>
                ))}
                <input
                  value={emoji}
                  onChange={(e) => setEmoji(e.target.value.slice(0, 4) || "📌")}
                  style={{
                    width: 56, height: 34, padding: "0 8px",
                    fontSize: 16, textAlign: "center",
                    color: "var(--text-primary)", background: "var(--bg-base)",
                    border: "1px solid var(--border-strong)", borderRadius: 6, outline: "none",
                  }}
                  aria-label="Outro emoji"
                />
              </div>
            </div>

            <div>
              <label style={lbl}>Cor</label>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
                {COLUMN_PALETTE.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setColor(c)}
                    aria-label={c}
                    style={{
                      width: 28, height: 28, borderRadius: "50%",
                      background: c, border: color === c ? "2px solid var(--text-primary)" : "2px solid transparent",
                      cursor: "pointer",
                      boxShadow: color === c ? `0 0 0 2px ${c}33` : "none",
                    }}
                  />
                ))}
                <input
                  type="text"
                  value={color}
                  onChange={(e) => setColor(e.target.value)}
                  style={{
                    width: 100, height: 30, padding: "0 8px",
                    fontSize: 12, fontFamily: "ui-monospace, monospace",
                    color: "var(--text-primary)", background: "var(--bg-base)",
                    border: "1px solid var(--border-strong)", borderRadius: 6, outline: "none",
                  }}
                  aria-label="Cor (hex)"
                />
              </div>
            </div>

            {/* Preview */}
            <div>
              <label style={lbl}>Pré-visualização</label>
              <div style={{
                background: "var(--bg-overlay)", borderRadius: 12, padding: 12,
                borderTop: `3px solid ${color}`,
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 600, textTransform: "uppercase", letterSpacing: ".06em", color: "var(--text-primary)" }}>
                  <span>{emoji}</span>
                  {label || "Nova coluna"}
                </div>
              </div>
            </div>
          </div>

          {/* Footer */}
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, padding: "12px 16px", borderTop: "1px solid var(--border)" }}>
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              style={{ height: 34, padding: "0 14px", borderRadius: 8, fontSize: 13, fontWeight: 500, background: "transparent", color: "var(--text-primary)", border: "1px solid var(--border-strong)", cursor: "pointer" }}
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={() => void save()}
              disabled={saving || !label.trim()}
              style={{
                display: "inline-flex", alignItems: "center", gap: 6,
                height: 34, padding: "0 14px", borderRadius: 8, fontSize: 13, fontWeight: 600,
                background: !saving && label.trim() ? "#25D366" : "color-mix(in oklab, #25D366 40%, var(--bg-overlay))",
                color: "#0a1a10", border: 0,
                cursor: !saving && label.trim() ? "pointer" : "not-allowed",
                opacity: !saving && label.trim() ? 1 : 0.7,
              }}
            >
              {saving ? <><Loader2 size={14} className="animate-spin" /> Salvando…</> : (isEdit ? "Salvar alterações" : "Criar coluna")}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

// Re-export para evitar import não-usado
export const _unused = Columns3;

const lbl: React.CSSProperties = {
  display: "block", fontSize: 11, fontWeight: 600, color: "var(--text-muted)",
  textTransform: "uppercase", letterSpacing: ".04em", marginBottom: 6,
};
const input: React.CSSProperties = {
  width: "100%", height: 38, padding: "0 12px", fontSize: 14,
  color: "var(--text-primary)", background: "var(--bg-base)",
  border: "1px solid var(--border-strong)", borderRadius: 8, outline: "none",
};
