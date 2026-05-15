import * as React from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, MoreVertical, X, Loader2, Briefcase } from "lucide-react";
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
        <div
          style={{
            ...card,
            padding: 48,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            textAlign: "center",
            gap: 12,
          }}
        >
          <div
            style={{
              width: 64,
              height: 64,
              borderRadius: 999,
              background: "var(--bg-overlay)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "var(--text-muted)",
            }}
          >
            <Briefcase size={28} />
          </div>
          <div>
            <div style={{ fontSize: 15, fontWeight: 600 }}>
              Nenhum profissional cadastrado ainda.
            </div>
            <div style={{ fontSize: 13, color: "var(--text-muted)", marginTop: 4 }}>
              Adicione as pessoas que realizam os atendimentos presenciais.
            </div>
          </div>
          <button
            style={buttonPrimary}
            className="flex items-center gap-2"
            onClick={() => setOpenCreate(true)}
          >
            <Plus size={14} /> Adicionar primeiro profissional
          </button>
        </div>
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
                </div>
                <span
                  style={{
                    fontSize: 11,
                    padding: "3px 8px",
                    borderRadius: 999,
                    background: p.is_active
                      ? "color-mix(in oklab, #10B981 18%, transparent)"
                      : "var(--bg-overlay)",
                    color: p.is_active ? "#10B981" : "var(--text-muted)",
                  }}
                >
                  {p.is_active ? "Ativo" : "Inativo"}
                </span>
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

      {confirmDelete && (
        <ConfirmModal
          title={`Excluir ${confirmDelete.name}?`}
          description="Esta ação não pode ser desfeita. Agendamentos existentes ficarão sem profissional vinculado."
          danger
          loading={removeM.isPending}
          onCancel={() => setConfirmDelete(null)}
          onConfirm={() => removeM.mutate(confirmDelete.id)}
        />
      )}
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
          borderRadius: 6,
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
            borderRadius: 8,
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
        borderRadius: 4,
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
  }) => void;
}) {
  const [name, setName] = React.useState(initial?.name ?? "");
  const [role, setRole] = React.useState(initial?.role ?? "");
  const [phone, setPhone] = React.useState(initial?.phone ?? "");
  const [email, setEmail] = React.useState(initial?.email ?? "");
  const [linkEnabled, setLinkEnabled] = React.useState(!!initial?.linked_user_id);
  const [linkedUserId, setLinkedUserId] = React.useState<string>(initial?.linked_user_id ?? "");
  const [isActive, setIsActive] = React.useState(initial?.is_active ?? true);

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
    });
  };

  return (
    <Modal title={initial ? "Editar Profissional" : "Novo Profissional"} onClose={onClose}>
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
            borderRadius: 8,
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
            borderRadius: 8,
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

        <div className="flex justify-end gap-2" style={{ marginTop: 8 }}>
          <button style={buttonSecondary} onClick={onClose} disabled={loading}>
            Cancelar
          </button>
          <button style={buttonPrimary} disabled={!canSubmit} onClick={submit}>
            {loading ? (
              <span className="flex items-center gap-2">
                <Loader2 size={14} className="animate-spin" /> Salvando…
              </span>
            ) : (
              "Salvar"
            )}
          </button>
        </div>
      </div>
    </Modal>
  );
}

function ConfirmModal({
  title,
  description,
  onCancel,
  onConfirm,
  danger,
  loading,
}: {
  title: string;
  description: string;
  onCancel: () => void;
  onConfirm: () => void;
  danger?: boolean;
  loading?: boolean;
}) {
  return (
    <Modal title={title} onClose={onCancel}>
      <p style={{ fontSize: 13, color: "var(--text-muted)" }}>{description}</p>
      <div className="flex justify-end gap-2" style={{ marginTop: 16 }}>
        <button style={buttonSecondary} onClick={onCancel} disabled={loading}>
          Cancelar
        </button>
        <button
          style={danger ? buttonDanger : buttonPrimary}
          onClick={onConfirm}
          disabled={loading}
        >
          {loading ? "Removendo…" : "Confirmar"}
        </button>
      </div>
    </Modal>
  );
}

function Modal({
  title,
  children,
  onClose,
}: {
  title: string;
  children: React.ReactNode;
  onClose: () => void;
}) {
  React.useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);
  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.5)",
        zIndex: 70,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "100%",
          maxWidth: 440,
          background: "var(--bg-surface)",
          border: "1px solid var(--border)",
          borderRadius: 12,
          boxShadow: "0 20px 50px rgba(0,0,0,0.35)",
          display: "flex",
          flexDirection: "column",
          maxHeight: "calc(100vh - 32px)",
        }}
      >
        <div
          className="flex items-center justify-between"
          style={{ padding: "14px 16px", borderBottom: "1px solid var(--border)" }}
        >
          <div style={{ fontSize: 14, fontWeight: 600 }}>{title}</div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar"
            className="inline-flex items-center justify-center"
            style={{ width: 30, height: 30, borderRadius: 6, color: "var(--text-muted)" }}
          >
            <X size={16} />
          </button>
        </div>
        <div style={{ padding: 16, overflow: "auto" }}>{children}</div>
      </div>
    </div>
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
        borderRadius: 999,
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
          borderRadius: 999,
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
