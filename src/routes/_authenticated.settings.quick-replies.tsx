import * as React from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, MoreVertical, Loader2, Zap } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState as SharedEmptyState } from "@/components/empty-state";
import { ConfirmDialog } from "@/components/confirm-dialog";
import {
  SettingsLayout,
  Field,
  inputStyle,
  textareaStyle,
  card,
} from "@/features/settings/settings-layout";
import { ManagerOnly } from "@/components/manager-only";
import { renderTemplate } from "@/lib/message-templates";
import {
  listQuickReplies,
  createQuickReply,
  updateQuickReply,
  deleteQuickReply,
  type QuickReply,
} from "@/lib/quick-replies.functions";

export const Route = createFileRoute("/_authenticated/settings/quick-replies")({
  component: () => (
    <ManagerOnly>
      <QuickRepliesPage />
    </ManagerOnly>
  ),
});

/**
 * Mesmo vocabulário das mensagens automáticas (message-defaults.ts) de
 * propósito: um terceiro conjunto de variáveis só criaria confusão sobre qual
 * chave usar onde. ASCII porque o regex de renderTemplate é \w+.
 */
const PLACEHOLDERS = [
  { key: "cliente", desc: "Primeiro nome do contato" },
  { key: "negocio", desc: "Nome do seu negócio" },
];

const PREVIEW_VARS = { cliente: "Maria", negocio: "Studio Bella" };

type Editing = { mode: "create" } | { mode: "edit"; reply: QuickReply } | null;

/**
 * Espelham os schemas zod das server fns. Declarados aqui em vez de derivados
 * com `Parameters<typeof ...>` porque o tipo do createServerFn não expõe o
 * input de forma utilizável — e melhor um tipo explícito que um `any`.
 */
type CreateInput = { title: string; shortcut: string; body: string; is_active: boolean };
type UpdateInput = { id: string } & Partial<CreateInput>;

function QuickRepliesPage() {
  const qc = useQueryClient();
  const listFn = useServerFn(listQuickReplies);
  const createFn = useServerFn(createQuickReply);
  const updateFn = useServerFn(updateQuickReply);
  const deleteFn = useServerFn(deleteQuickReply);

  const [editing, setEditing] = React.useState<Editing>(null);
  const [confirmDelete, setConfirmDelete] = React.useState<QuickReply | null>(null);

  const { data, isLoading, error } = useQuery({
    queryKey: ["quick-replies"],
    queryFn: () => listFn(),
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ["quick-replies"] });

  const createM = useMutation({
    mutationFn: (input: CreateInput) => createFn({ data: input }),
    onSuccess: () => {
      invalidate();
      setEditing(null);
      toast.success("Resposta rápida criada");
    },
    onError: (e: any) => toast.error(e?.message ?? "Falha ao criar"),
  });

  const updateM = useMutation({
    mutationFn: (input: UpdateInput) => updateFn({ data: input }),
    onSuccess: () => {
      invalidate();
      setEditing(null);
      toast.success("Resposta rápida atualizada");
    },
    onError: (e: any) => toast.error(e?.message ?? "Falha ao atualizar"),
  });

  const deleteM = useMutation({
    mutationFn: (id: string) => deleteFn({ data: { id } }),
    onSuccess: () => {
      invalidate();
      setConfirmDelete(null);
      toast.success("Resposta rápida excluída");
    },
    onError: (e: any) => toast.error(e?.message ?? "Falha ao excluir"),
  });

  const replies = data ?? [];

  return (
    <SettingsLayout
      title="Respostas rápidas"
      description="Textos que o atendente insere na conversa com um clique — ou digitando barra e o atalho."
    >
      <div className="flex items-center justify-between" style={{ marginBottom: 12, gap: 12 }}>
        <div style={{ fontSize: 12, color: "var(--text-muted)" }}>
          {isLoading ? "Carregando…" : `${replies.length} resposta${replies.length === 1 ? "" : "s"}`}
        </div>
        <Button onClick={() => setEditing({ mode: "create" })}>
          <Plus size={14} /> Nova resposta
        </Button>
      </div>

      {error ? (
        <div style={{ ...card, borderColor: "#EF4444", color: "#EF4444", fontSize: 13 }}>
          {(error as any)?.message ?? "Falha ao carregar."}
        </div>
      ) : isLoading ? null : replies.length === 0 ? (
        <SharedEmptyState
          icon={<Zap size={40} style={{ color: "var(--brand-400)" }} aria-hidden />}
          title="Nenhuma resposta rápida ainda"
          description="Crie textos que a equipe usa toda hora — saudação, horário de funcionamento, formas de pagamento. Na conversa, o atendente insere com um clique ou digitando /atalho."
          action={{ label: "Nova resposta", onClick: () => setEditing({ mode: "create" }) }}
        />
      ) : (
        <div style={card}>
          {replies.map((r, i) => (
            <div
              key={r.id}
              className="flex items-center"
              style={{
                gap: 12,
                padding: "10px 0",
                borderTop: i === 0 ? "none" : "1px solid var(--border)",
              }}
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center" style={{ gap: 6 }}>
                  <span style={{ fontSize: 13, fontWeight: 500 }}>{r.title}</span>
                  {r.shortcut && (
                    <span
                      style={{
                        fontSize: 10,
                        fontFamily: "ui-monospace, monospace",
                        padding: "1px 5px",
                        borderRadius: "var(--radius-sm)",
                        background: "var(--bg-overlay)",
                        color: "var(--text-muted)",
                      }}
                    >
                      /{r.shortcut}
                    </span>
                  )}
                </div>
                <div
                  className="truncate"
                  style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 2 }}
                >
                  {r.body}
                </div>
              </div>
              <Badge variant={r.is_active ? "success" : "neutral"}>
                {r.is_active ? "Ativa" : "Inativa"}
              </Badge>
              <RowMenu
                onEdit={() => setEditing({ mode: "edit", reply: r })}
                onToggle={() => updateM.mutate({ id: r.id, is_active: !r.is_active })}
                isActive={r.is_active}
                onDelete={() => setConfirmDelete(r)}
              />
            </div>
          ))}
        </div>
      )}

      {editing && (
        <QuickReplyModal
          initial={editing.mode === "edit" ? editing.reply : null}
          saving={createM.isPending || updateM.isPending}
          onClose={() => setEditing(null)}
          onSubmit={(values) => {
            if (editing.mode === "edit") {
              updateM.mutate({ id: editing.reply.id, ...values });
            } else {
              createM.mutate(values);
            }
          }}
        />
      )}

      <ConfirmDialog
        open={!!confirmDelete}
        title={`Excluir "${confirmDelete?.title ?? ""}"?`}
        description="A resposta some do composer para toda a equipe. Não afeta mensagens já enviadas."
        confirmLabel="Excluir"
        destructive
        onConfirm={() => {
          if (confirmDelete) deleteM.mutate(confirmDelete.id);
        }}
        onClose={() => setConfirmDelete(null)}
      />
    </SettingsLayout>
  );
}

function QuickReplyModal({
  initial,
  saving,
  onClose,
  onSubmit,
}: {
  initial: QuickReply | null;
  saving: boolean;
  onClose: () => void;
  onSubmit: (v: { title: string; shortcut: string; body: string; is_active: boolean }) => void;
}) {
  const [title, setTitle] = React.useState(initial?.title ?? "");
  const [shortcut, setShortcut] = React.useState(initial?.shortcut ?? "");
  const [body, setBody] = React.useState(initial?.body ?? "");
  const [isActive, setIsActive] = React.useState(initial?.is_active ?? true);
  const bodyRef = React.useRef<HTMLTextAreaElement>(null);

  /** Mesma técnica do Composer e da tela de Mensagens: insere no cursor. */
  const insertPlaceholder = (key: string) => {
    const el = bodyRef.current;
    const token = `{{${key}}}`;
    if (!el) {
      setBody((b) => b + token);
      return;
    }
    const start = el.selectionStart ?? body.length;
    const end = el.selectionEnd ?? body.length;
    const next = body.slice(0, start) + token + body.slice(end);
    setBody(next);
    requestAnimationFrame(() => {
      el.focus();
      const pos = start + token.length;
      el.selectionStart = el.selectionEnd = pos;
    });
  };

  const canSave = title.trim().length > 0 && body.trim().length > 0 && !saving;

  return (
    <Modal
      open
      onOpenChange={(o) => !o && onClose()}
      size="md"
      title={initial ? "Editar resposta rápida" : "Nova resposta rápida"}
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Cancelar
          </Button>
          <Button type="submit" form="quick-reply-form" disabled={!canSave}>
            {saving ? (
              <>
                <Loader2 size={14} className="animate-spin" /> Salvando…
              </>
            ) : initial ? (
              "Salvar alterações"
            ) : (
              "Criar resposta"
            )}
          </Button>
        </>
      }
    >
      <form
        id="quick-reply-form"
        onSubmit={(e) => {
          e.preventDefault();
          if (!canSave) return;
          onSubmit({
            title: title.trim(),
            shortcut: shortcut.trim().toLowerCase(),
            body: body.trim(),
            is_active: isActive,
          });
        }}
        style={{ display: "flex", flexDirection: "column", gap: 14 }}
      >
        <Field label="Nome *" hint="Como aparece na lista para o atendente.">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            style={inputStyle}
            placeholder="Ex: Horário de funcionamento"
            maxLength={120}
          />
        </Field>

        <Field
          label="Atalho"
          hint="Opcional. Na conversa, digitar a barra seguida deste atalho insere o texto. Só letras, números, hífen e underscore."
        >
          <input
            value={shortcut}
            onChange={(e) => setShortcut(e.target.value.replace(/[^a-zA-Z0-9_-]/g, "").toLowerCase())}
            style={inputStyle}
            placeholder="horario"
            maxLength={40}
          />
        </Field>

        <Field label="Texto *">
          <textarea
            ref={bodyRef}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            style={{ ...textareaStyle, minHeight: 110 }}
            placeholder="Olá {{cliente}}! Nosso horário é de segunda a sexta, das 9h às 18h."
            maxLength={4096}
          />
          <div className="flex flex-wrap items-center" style={{ gap: 6, marginTop: 6 }}>
            {PLACEHOLDERS.map((p) => (
              <button
                key={p.key}
                type="button"
                title={p.desc}
                onClick={() => insertPlaceholder(p.key)}
                style={{
                  fontSize: 11,
                  fontFamily: "ui-monospace, monospace",
                  padding: "2px 7px",
                  borderRadius: "var(--radius-pill)",
                  border: "1px solid var(--border)",
                  background: "var(--bg-overlay)",
                  color: "var(--text-primary)",
                  cursor: "pointer",
                }}
              >
                {`{{${p.key}}}`}
              </button>
            ))}
          </div>
        </Field>

        {body.trim() && (
          <Field label="Pré-visualização">
            <div
              style={{
                fontSize: 13,
                padding: "8px 11px",
                borderRadius: "var(--radius-card)",
                background: "color-mix(in oklab, var(--brand-400) 12%, var(--bg-surface))",
                border: "1px solid var(--border)",
                whiteSpace: "pre-wrap",
                color: "var(--text-primary)",
              }}
            >
              {renderTemplate(body, PREVIEW_VARS)}
            </div>
          </Field>
        )}

        <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, cursor: "pointer" }}>
          <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
          Ativa (aparece no composer)
        </label>
      </form>
    </Modal>
  );
}

function RowMenu({
  onEdit,
  onToggle,
  onDelete,
  isActive,
}: {
  onEdit: () => void;
  onToggle: () => void;
  onDelete: () => void;
  isActive: boolean;
}) {
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button
        type="button"
        aria-label="Opções"
        onClick={() => setOpen((v) => !v)}
        style={{
          background: "transparent",
          border: 0,
          cursor: "pointer",
          color: "var(--text-muted)",
          padding: 4,
          display: "flex",
        }}
      >
        <MoreVertical size={16} />
      </button>
      {open && (
        <div
          style={{
            position: "absolute",
            right: 0,
            top: "100%",
            marginTop: 4,
            minWidth: 170,
            background: "var(--bg-surface)",
            border: "1px solid var(--border-strong)",
            borderRadius: "var(--radius-card)",
            boxShadow: "0 12px 28px rgba(0,0,0,0.32)",
            padding: 4,
            zIndex: 30,
          }}
        >
          <MenuItem label="Editar" onClick={() => { setOpen(false); onEdit(); }} />
          <MenuItem
            label={isActive ? "Desativar" : "Ativar"}
            onClick={() => { setOpen(false); onToggle(); }}
          />
          <MenuItem label="Excluir" danger onClick={() => { setOpen(false); onDelete(); }} />
        </div>
      )}
    </div>
  );
}

function MenuItem({
  label,
  onClick,
  danger,
}: {
  label: string;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        display: "block",
        width: "100%",
        textAlign: "left",
        padding: "6px 9px",
        borderRadius: "var(--radius-control)",
        border: 0,
        background: "transparent",
        color: danger ? "#EF4444" : "var(--text-primary)",
        fontSize: 13,
        cursor: "pointer",
      }}
      onMouseEnter={(e) => (e.currentTarget.style.background = "var(--bg-overlay)")}
      onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
    >
      {label}
    </button>
  );
}
