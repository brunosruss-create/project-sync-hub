import * as React from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, MoreVertical, X, Loader2, Briefcase, Check, Clock } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { EmptyState as SharedEmptyState } from "@/components/empty-state";
import { ConfirmDialog } from "@/components/confirm-dialog";
import {
  SettingsLayout,
  Field,
  inputStyle,
  buttonPrimary,
  buttonSecondary,
  buttonDanger,
  card,
} from "@/features/settings/settings-layout";
import { ManagerOnly } from "@/components/manager-only";
import { ContactAvatar } from "@/features/inbox/contact-avatar";
import {
  listProfessionals,
  createProfessional,
  updateProfessional,
  deleteProfessional,
  type Professional,
} from "@/lib/professionals.functions";
import { listTeamMembers, type TeamMember } from "@/lib/team.functions";
import {
  WorkingHoursEditor,
  emptyWeek,
} from "@/features/settings/working-hours-editor";
import { normalizeHours, describeHours, type NormalizedHours } from "@/lib/working-hours";

const PROFESSIONAL_STATUS_VARIANT: Record<"active" | "inactive", "success" | "neutral"> = {
  active: "success",
  inactive: "neutral",
};

export const Route = createFileRoute("/_authenticated/settings/professionals")({
  component: () => (
    <ManagerOnly>
      <ProfessionalsPage />
    </ManagerOnly>
  ),
});

function ProfessionalsPage() {
  const qc = useQueryClient();
  const fetchList = useServerFn(listProfessionals);
  const createFn = useServerFn(createProfessional);
  const updateFn = useServerFn(updateProfessional);
  const removeFn = useServerFn(deleteProfessional);
  const fetchTeam = useServerFn(listTeamMembers);

  const [editing, setEditing] = React.useState<Professional | null>(null);
  const [openCreate, setOpenCreate] = React.useState(false);
  const [confirmDelete, setConfirmDelete] = React.useState<Professional | null>(null);

  const listQ = useQuery({
    queryKey: ["professionals"],
    queryFn: () => fetchList(),
  });
  const teamQ = useQuery({
    queryKey: ["team-members"],
    queryFn: () => fetchTeam(),
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ["professionals"] });

  const createM = useMutation({
    mutationFn: (input: any) => createFn({ data: input }),
    onSuccess: () => {
      toast.success("Profissional cadastrado");
      setOpenCreate(false);
      invalidate();
    },
    onError: (e: Error) => toast.error("Não foi possível criar", { description: e.message }),
  });

  const updateM = useMutation({
    mutationFn: (input: any) => updateFn({ data: input }),
    onSuccess: () => {
      toast.success("Profissional atualizado");
      setEditing(null);
      invalidate();
    },
    onError: (e: Error) => toast.error("Falha ao atualizar", { description: e.message }),
  });

  const removeM = useMutation({
    mutationFn: (id: string) => removeFn({ data: { id } }),
    onSuccess: () => {
      toast.success("Profissional removido");
      setConfirmDelete(null);
      invalidate();
    },
    onError: (e: Error) => toast.error("Falha ao remover", { description: e.message }),
  });

  const items = listQ.data ?? [];
  const team = teamQ.data ?? [];

  return (
    <SettingsLayout
      title="Profissionais"
      description="Pessoas que executam os atendimentos. Aparecem como opção ao criar agendamentos."
    >
      {items.length > 0 && (
        <div className="flex items-center justify-between" style={{ marginBottom: 16 }}>
          <p style={{ fontSize: 13, color: "var(--text-muted)" }}>
            {listQ.isLoading
              ? "Carregando…"
              : `${items.length} ${items.length === 1 ? "profissional" : "profissionais"}`}
          </p>
          <button
            style={buttonPrimary}
            className="flex items-center gap-2"
            onClick={() => setOpenCreate(true)}
          >
            <Plus size={14} /> Novo profissional
          </button>
        </div>
      )}

      {listQ.isError && (
        <div style={card}>
          <p style={{ fontSize: 13, color: "#EF4444" }}>
            Erro ao carregar: {(listQ.error as Error).message}
          </p>
        </div>
      )}

      {!listQ.isLoading && items.length === 0 && (
        <SharedEmptyState
          icon={<Briefcase size={40} style={{ color: "var(--brand-400)" }} aria-hidden />}
          title="Nenhum profissional cadastrado ainda"
          description="Adicione as pessoas que realizam os atendimentos presenciais."
          action={{ label: "Adicionar primeiro profissional", onClick: () => setOpenCreate(true) }}
        />
      )}

      {items.length > 0 && (
        <div style={card}>
          <div className="flex flex-col">
            {items.map((p, i) => (
              <div
                key={p.id}
                className="flex items-center gap-3"
                style={{
                  padding: "12px 4px",
                  borderTop: i === 0 ? 0 : "1px solid var(--border)",
                  opacity: p.is_active ? 1 : 0.55,
                }}
              >
                <ContactAvatar name={p.name} avatarUrl={p.avatar_url} size={36} />
                <div className="flex-1 min-w-0">
                  <div style={{ fontSize: 13, fontWeight: 500 }}>{p.name}</div>
                  <div style={{ fontSize: 12, color: "var(--text-muted)" }}>
                    {p.role || "Sem cargo"}
                    {p.phone ? ` · ${p.phone}` : ""}
                  </div>
                  {/* Só aparece pra quem tem jornada própria — quem herda o
                      horário do negócio não precisa de ruído extra na lista. */}
                  {describeHours(normalizeHours(p.working_hours)) && (
                    <div
                      className="truncate flex items-center"
                      style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2, gap: 4 }}
                      title={describeHours(normalizeHours(p.working_hours))}
                    >
                      <Clock size={11} aria-hidden style={{ flexShrink: 0 }} />
                      {describeHours(normalizeHours(p.working_hours))}
                    </div>
                  )}
                </div>
                <Badge variant={PROFESSIONAL_STATUS_VARIANT[p.is_active ? "active" : "inactive"]}>
                  {p.is_active ? "Ativo" : "Inativo"}
                </Badge>
                <RowMenu
                  onEdit={() => setEditing(p)}
                  onToggle={() =>
                    updateM.mutate({ id: p.id, is_active: !p.is_active })
                  }
                  onDelete={() => setConfirmDelete(p)}
                  active={p.is_active}
                />
              </div>
            ))}
          </div>
        </div>
      )}

      {(openCreate || editing) && (
        <ProfessionalModal
          initial={editing}
          team={team}
          loading={createM.isPending || updateM.isPending}
          onClose={() => {
            if (createM.isPending || updateM.isPending) return;
            setOpenCreate(false);
            setEditing(null);
          }}
          onSubmit={(input) => {
            if (editing) updateM.mutate({ id: editing.id, ...input });
            else createM.mutate(input);
          }}
        />
      )}

      <ConfirmDialog
        open={!!confirmDelete}
        onClose={() => setConfirmDelete(null)}
        onConfirm={() => {
          if (confirmDelete) void removeM.mutate(confirmDelete.id);
        }}
        title={`Excluir ${confirmDelete?.name ?? ""}?`}
        description="Esta ação não pode ser desfeita. Agendamentos existentes ficarão sem profissional vinculado."
        confirmLabel="Excluir"
        destructive
      />
    </SettingsLayout>
  );
}

function RowMenu({
  onEdit,
  onToggle,
  onDelete,
  active,
}: {
  onEdit: () => void;
  onToggle: () => void;
  onDelete: () => void;
  active: boolean;
}) {
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    const h = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);
  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button
        onClick={() => setOpen((v) => !v)}
        style={{
          width: 28,
          height: 28,
          borderRadius: "var(--radius-pill)",
          border: 0,
          background: "transparent",
          color: "var(--text-muted)",
          cursor: "pointer",
        }}
      >
        <MoreVertical size={14} />
      </button>
      {open && (
        <div
          style={{
            position: "absolute",
            right: 0,
            top: 32,
            minWidth: 160,
            background: "var(--bg-surface)",
            border: "1px solid var(--border)",
            borderRadius: "var(--radius-card)",
            padding: 4,
            zIndex: 10,
            boxShadow: "0 8px 24px rgba(0,0,0,0.25)",
          }}
        >
          <MenuItem onClick={() => { onEdit(); setOpen(false); }}>Editar</MenuItem>
          <MenuItem onClick={() => { onToggle(); setOpen(false); }}>
            {active ? "Desativar" : "Reativar"}
          </MenuItem>
          <MenuItem danger onClick={() => { onDelete(); setOpen(false); }}>
            Excluir
          </MenuItem>
        </div>
      )}
    </div>
  );
}

function MenuItem({
  children,
  onClick,
  danger,
}: {
  children: React.ReactNode;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        display: "block",
        width: "100%",
        textAlign: "left",
        padding: "6px 10px",
        fontSize: 13,
        background: "transparent",
        border: 0,
        borderRadius: "var(--radius-sm)",
        color: danger ? "#EF4444" : "var(--text-primary)",
        cursor: "pointer",
      }}
      onMouseEnter={(e) => (e.currentTarget.style.background = "var(--bg-overlay)")}
      onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
    >
      {children}
    </button>
  );
}

function ProfessionalModal({
  initial,
  team,
  loading,
  onClose,
  onSubmit,
}: {
  initial: Professional | null;
  team: TeamMember[];
  loading: boolean;
  onClose: () => void;
  onSubmit: (input: {
    name: string;
    role: string;
    phone: string;
    email: string;
    linked_user_id: string | null;
    is_active: boolean;
    working_hours: NormalizedHours | null;
  }) => void;
}) {
  const [name, setName] = React.useState(initial?.name ?? "");
  const [role, setRole] = React.useState(initial?.role ?? "");
  const [phone, setPhone] = React.useState(initial?.phone ?? "");
  const [email, setEmail] = React.useState(initial?.email ?? "");
  const [linkEnabled, setLinkEnabled] = React.useState(!!initial?.linked_user_id);
  const [linkedUserId, setLinkedUserId] = React.useState<string>(initial?.linked_user_id ?? "");
  const [isActive, setIsActive] = React.useState(initial?.is_active ?? true);

  // Jornada própria é opt-in: sem ela, o profissional herda o horário do
  // negócio (é o caso da maioria — não faz sentido obrigar a configurar).
  const initialHours = normalizeHours(initial?.working_hours);
  const [ownHours, setOwnHours] = React.useState(!!initialHours);
  const [hours, setHours] = React.useState<NormalizedHours>(initialHours ?? emptyWeek());

  const canSubmit = name.trim().length > 0 && !loading;

  const submit = () => {
    if (!canSubmit) return;
    onSubmit({
      name: name.trim(),
      role: role.trim(),
      phone: phone.trim(),
      email: email.trim(),
      linked_user_id: linkEnabled && linkedUserId ? linkedUserId : null,
      is_active: isActive,
      working_hours: ownHours ? hours : null,
    });
  };

  return (
    <Modal
      open
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
      title={initial ? "Editar Profissional" : "Novo Profissional"}
      size="md"
      footer={
        <>
          <Button type="button" variant="outline" onClick={onClose} disabled={loading}>
            Cancelar
          </Button>
          <Button type="submit" form="professional-form" disabled={!canSubmit}>
            <Check size={14} />
            Salvar
          </Button>
        </>
      }
    >
      <form id="professional-form" onSubmit={(e) => { e.preventDefault(); submit(); }}>
        <div className="flex flex-col" style={{ gap: 12 }}>
          <Field label="Nome *">
            <input
              style={inputStyle}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Nome completo"
              autoFocus
            />
          </Field>
          <Field
            label="Cargo"
            hint="Defina como preferir — sem restrição de área."
          >
            <input
              style={inputStyle}
              value={role}
              onChange={(e) => setRole(e.target.value)}
              placeholder="Ex: Médico, Mecânico, Especialista..."
            />
          </Field>
          <Field label="Telefone">
            <input
              style={inputStyle}
              value={phone}
              onChange={(e) => setPhone(maskPhoneBR(e.target.value))}
              placeholder="(11) 99999-9999"
              inputMode="numeric"
            />
          </Field>
          <Field label="Email">
            <input
              style={inputStyle}
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="email@exemplo.com"
            />
          </Field>

          <label
            className="flex items-center justify-between"
            style={{
              padding: "10px 12px",
              borderRadius: "var(--radius-card)",
              border: "1px solid var(--border)",
              background: "var(--bg-base)",
              cursor: "pointer",
            }}
          >
            <div>
              <div style={{ fontSize: 13, fontWeight: 500 }}>
                Esta pessoa também tem acesso ao sistema?
              </div>
              <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2 }}>
                Útil quando o profissional também atende pelo WhatsApp.
              </div>
            </div>
            <Toggle on={linkEnabled} onChange={setLinkEnabled} />
          </label>

          {linkEnabled && (
            <Field label="Membro da equipe">
              <select
                style={inputStyle}
                value={linkedUserId}
                onChange={(e) => setLinkedUserId(e.target.value)}
              >
                <option value="">Selecione um membro…</option>
                {team.map((t) => (
                  <option key={t.member_user_id} value={t.member_user_id}>
                    {t.full_name || t.email}
                  </option>
                ))}
              </select>
            </Field>
          )}

          <label
            className="flex items-center justify-between"
            style={{
              padding: "10px 12px",
              borderRadius: "var(--radius-card)",
              border: "1px solid var(--border)",
              background: "var(--bg-base)",
              cursor: "pointer",
            }}
          >
            <div>
              <div style={{ fontSize: 13, fontWeight: 500 }}>
                {ownHours ? "Horário próprio" : "Segue o horário do negócio"}
              </div>
              <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2 }}>
                {ownHours
                  ? "A IA e a agenda só marcam dentro destes horários."
                  : "Ative se esta pessoa trabalha em dias ou horários diferentes."}
              </div>
            </div>
            <Toggle on={ownHours} onChange={setOwnHours} />
          </label>

          {ownHours && <WorkingHoursEditor value={hours} onChange={setHours} />}

          <label
            className="flex items-center justify-between"
            style={{
              padding: "10px 12px",
              borderRadius: "var(--radius-card)",
              border: "1px solid var(--border)",
              background: "var(--bg-base)",
              cursor: "pointer",
            }}
          >
            <div style={{ fontSize: 13, fontWeight: 500 }}>
              {isActive ? "Ativo" : "Inativo"}
            </div>
            <Toggle on={isActive} onChange={setIsActive} />
          </label>
        </div>
      </form>
    </Modal>
  );
}

function Toggle({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      onClick={(e) => {
        e.preventDefault();
        onChange(!on);
      }}
      style={{
        width: 36,
        height: 20,
        borderRadius: "var(--radius-pill)",
        background: on ? "var(--brand-400)" : "var(--bg-overlay)",
        border: "1px solid var(--border-strong)",
        position: "relative",
        flexShrink: 0,
      }}
    >
      <span
        style={{
          position: "absolute",
          top: 1,
          left: on ? 17 : 1,
          width: 16,
          height: 16,
          borderRadius: "var(--radius-pill)",
          background: "#fff",
          transition: "left 150ms ease",
        }}
      />
    </button>
  );
}

function maskPhoneBR(v: string): string {
  const d = v.replace(/\D/g, "").slice(0, 11);
  if (d.length <= 2) return d;
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}
