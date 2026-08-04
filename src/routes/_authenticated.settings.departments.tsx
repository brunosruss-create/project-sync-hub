import * as React from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, Building2, Trash2, Users } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState as SharedEmptyState } from "@/components/empty-state";
import { ConfirmDialog } from "@/components/confirm-dialog";
import {
  SettingsLayout,
  Field,
  inputStyle,
  card,
} from "@/features/settings/settings-layout";
import { ManagerOnly } from "@/components/manager-only";
import {
  listDepartments,
  createDepartment,
  updateDepartment,
  deleteDepartment,
  type Department,
} from "@/lib/departments.functions";

export const Route = createFileRoute("/_authenticated/settings/departments")({
  component: () => (
    <ManagerOnly>
      <DepartmentsPage />
    </ManagerOnly>
  ),
});

/** Cores sugeridas — mesma paleta dos rótulos do Kanban. */
const CORES = ["#3654FF", "#10B981", "#F59E0B", "#EF4444", "#8B5CF6", "#EC4899", "#64748B"];

type Editing = { mode: "create" } | { mode: "edit"; dept: Department } | null;

function DepartmentsPage() {
  const qc = useQueryClient();
  const listFn = useServerFn(listDepartments);
  const createFn = useServerFn(createDepartment);
  const updateFn = useServerFn(updateDepartment);
  const deleteFn = useServerFn(deleteDepartment);

  const [editing, setEditing] = React.useState<Editing>(null);
  const [confirmDelete, setConfirmDelete] = React.useState<Department | null>(null);

  const { data, isLoading, error } = useQuery({
    queryKey: ["departments"],
    queryFn: () => listFn(),
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["departments"] });
    // A tela de Equipe e o modal de transferência mostram o nome do
    // departamento — sem isto ficam com o valor velho até o refresh.
    qc.invalidateQueries({ queryKey: ["team-members"] });
    qc.invalidateQueries({ queryKey: ["assignable-members"] });
  };

  const createM = useMutation({
    mutationFn: (input: { name: string; color: string | null }) => createFn({ data: input }),
    onSuccess: () => {
      invalidate();
      setEditing(null);
      toast.success("Departamento criado");
    },
    onError: (e: any) => toast.error(e?.message ?? "Falha ao criar"),
  });

  const updateM = useMutation({
    mutationFn: (input: { id: string; name?: string; color?: string | null; is_active?: boolean }) =>
      updateFn({ data: input }),
    onSuccess: () => {
      invalidate();
      setEditing(null);
      toast.success("Departamento atualizado");
    },
    onError: (e: any) => toast.error(e?.message ?? "Falha ao atualizar"),
  });

  const deleteM = useMutation({
    mutationFn: (id: string) => deleteFn({ data: { id } }),
    onSuccess: () => {
      invalidate();
      setConfirmDelete(null);
      toast.success("Departamento excluído");
    },
    onError: (e: any) => toast.error(e?.message ?? "Falha ao excluir"),
  });

  const departments = data ?? [];

  return (
    <SettingsLayout
      title="Departamentos"
      description="Agrupam a equipe por área. Ao transferir uma conversa, escolhe-se o departamento — e o rodízio dele decide quem atende."
    >
      <div className="flex items-center justify-between" style={{ marginBottom: 12, gap: 12 }}>
        <div style={{ fontSize: 12, color: "var(--text-muted)" }}>
          {isLoading
            ? "Carregando…"
            : `${departments.length} departamento${departments.length === 1 ? "" : "s"}`}
        </div>
        <Button onClick={() => setEditing({ mode: "create" })}>
          <Plus size={14} /> Novo departamento
        </Button>
      </div>

      {error ? (
        <div style={{ ...card, borderColor: "#EF4444", color: "#EF4444", fontSize: 13 }}>
          {(error as any)?.message ?? "Falha ao carregar."}
        </div>
      ) : isLoading ? null : departments.length === 0 ? (
        <SharedEmptyState
          icon={<Building2 size={40} style={{ color: "var(--brand-400)" }} aria-hidden />}
          title="Nenhum departamento ainda"
          description="Crie áreas como Vendas, Suporte ou Financeiro e distribua a equipe entre elas. Sem nenhum departamento, a transferência continua sendo direto para uma pessoa."
          action={{ label: "Criar departamento", onClick: () => setEditing({ mode: "create" }) }}
        />
      ) : (
        <div style={{ ...card, padding: 0 }}>
          {departments.map((d, i) => (
            <div
              key={d.id}
              className="flex items-center"
              style={{
                gap: 12,
                padding: "12px 14px",
                borderTop: i === 0 ? "none" : "1px solid var(--border)",
              }}
            >
              <span
                aria-hidden
                style={{
                  width: 10,
                  height: 10,
                  borderRadius: "var(--radius-pill)",
                  background: d.color ?? "var(--text-muted)",
                  flexShrink: 0,
                }}
              />
              <div className="flex-1 min-w-0">
                <div className="flex items-center" style={{ gap: 8 }}>
                  <span style={{ fontSize: 14, fontWeight: 500 }}>{d.name}</span>
                  {!d.is_active && <Badge variant="neutral">Inativo</Badge>}
                </div>
                <div
                  className="flex items-center"
                  style={{ gap: 4, marginTop: 2, fontSize: 12, color: "var(--text-muted)" }}
                >
                  <Users size={12} aria-hidden />
                  {d.member_count ?? 0}{" "}
                  {(d.member_count ?? 0) === 1 ? "pessoa" : "pessoas"}
                </div>
              </div>

              <button
                type="button"
                onClick={() =>
                  updateM.mutate({ id: d.id, is_active: !d.is_active })
                }
                style={{
                  height: 28,
                  padding: "0 12px",
                  borderRadius: "var(--radius-pill)",
                  border: "1px solid var(--border)",
                  background: "transparent",
                  color: "var(--text-primary)",
                  fontSize: 12,
                  cursor: "pointer",
                }}
              >
                {d.is_active ? "Desativar" : "Reativar"}
              </button>
              <button
                type="button"
                onClick={() => setEditing({ mode: "edit", dept: d })}
                style={{
                  height: 28,
                  padding: "0 12px",
                  borderRadius: "var(--radius-pill)",
                  border: "1px solid var(--border)",
                  background: "transparent",
                  color: "var(--text-primary)",
                  fontSize: 12,
                  cursor: "pointer",
                }}
              >
                Editar
              </button>
              <button
                type="button"
                aria-label={`Excluir ${d.name}`}
                onClick={() => setConfirmDelete(d)}
                className="inline-flex items-center justify-center"
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: "var(--radius-pill)",
                  border: "none",
                  background: "transparent",
                  color: "#EF4444",
                  cursor: "pointer",
                  flexShrink: 0,
                }}
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </div>
      )}

      {editing && (
        <DepartmentModal
          editing={editing}
          saving={createM.isPending || updateM.isPending}
          onClose={() => setEditing(null)}
          onSubmit={(v) => {
            if (editing.mode === "create") createM.mutate(v);
            else updateM.mutate({ id: editing.dept.id, ...v });
          }}
        />
      )}

      <ConfirmDialog
        open={!!confirmDelete}
        title={`Excluir ${confirmDelete?.name ?? ""}?`}
        description="A equipe e as conversas deste departamento voltam para “sem departamento”. Ninguém é removido e nenhuma conversa é perdida."
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

function DepartmentModal({
  editing,
  saving,
  onClose,
  onSubmit,
}: {
  editing: Exclude<Editing, null>;
  saving: boolean;
  onClose: () => void;
  onSubmit: (v: { name: string; color: string | null }) => void;
}) {
  const inicial = editing.mode === "edit" ? editing.dept : null;
  const [name, setName] = React.useState(inicial?.name ?? "");
  const [color, setColor] = React.useState<string | null>(inicial?.color ?? CORES[0]);

  const submit = () => {
    const limpo = name.trim();
    if (!limpo) {
      toast.error("Dê um nome ao departamento.");
      return;
    }
    onSubmit({ name: limpo, color });
  };

  return (
    <Modal
      open
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
      title={editing.mode === "create" ? "Novo departamento" : "Editar departamento"}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={submit} disabled={saving}>
            {saving ? "Salvando…" : "Salvar"}
          </Button>
        </>
      }
    >
      <Field label="Nome">
        <input
          autoFocus
          style={inputStyle}
          value={name}
          maxLength={60}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") submit();
          }}
          placeholder="Vendas"
        />
      </Field>

      <Field label="Cor">
        <div className="flex flex-wrap items-center" style={{ gap: 8 }}>
          {CORES.map((c) => (
            <button
              key={c}
              type="button"
              aria-label={`Cor ${c}`}
              onClick={() => setColor(c)}
              style={{
                width: 26,
                height: 26,
                borderRadius: "var(--radius-pill)",
                background: c,
                border: color === c ? "2px solid var(--text-primary)" : "2px solid transparent",
                cursor: "pointer",
              }}
            />
          ))}
        </div>
      </Field>
    </Modal>
  );
}
