import * as React from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, MoreVertical, X, Loader2 } from "lucide-react";
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
import {
  listTeamMembers,
  createTeamMember,
  updateTeamMember,
  removeTeamMember,
  type TeamMember,
} from "@/lib/team.functions";

export const Route = createFileRoute("/_authenticated/settings/team")({
  component: () => (
    <ManagerOnly>
      <TeamPage />
    </ManagerOnly>
  ),
});

type Role = "manager" | "agent";

const ROLE_META: Record<Role, { label: string; bg: string; fg: string }> = {
  manager: {
    label: "Manager",
    bg: "color-mix(in oklab, #8B5CF6 18%, transparent)",
    fg: "#A78BFA",
  },
  agent: {
    label: "Agente",
    bg: "color-mix(in oklab, var(--brand-400) 18%, transparent)",
    fg: "var(--brand-400)",
  },
};

function TeamPage() {
  const qc = useQueryClient();
  const fetchList = useServerFn(listTeamMembers);
  const createFn = useServerFn(createTeamMember);
  const updateFn = useServerFn(updateTeamMember);
  const removeFn = useServerFn(removeTeamMember);

  const [openInvite, setOpenInvite] = React.useState(false);
  const [confirm, setConfirm] = React.useState<
    | { kind: "remove"; member: TeamMember }
    | { kind: "toggle"; member: TeamMember }
    | null
  >(null);

  const listQ = useQuery({
    queryKey: ["team-members"],
    queryFn: () => fetchList(),
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ["team-members"] });

  const createM = useMutation({
    mutationFn: (input: {
      email: string;
      password: string;
      full_name: string;
      role: Role;
    }) => createFn({ data: input }),
    onSuccess: () => {
      toast.success("Membro criado");
      setOpenInvite(false);
      invalidate();
    },
    onError: (e: Error) => toast.error("Não foi possível criar", { description: e.message }),
  });

  const updateM = useMutation({
    mutationFn: (input: { member_user_id: string; active?: boolean; role?: Role }) =>
      updateFn({ data: input }),
    onSuccess: () => {
      toast.success("Atualizado");
      invalidate();
    },
    onError: (e: Error) => toast.error("Falha ao atualizar", { description: e.message }),
  });

  const removeM = useMutation({
    mutationFn: (member_user_id: string) => removeFn({ data: { member_user_id } }),
    onSuccess: () => {
      toast.success("Membro removido");
      invalidate();
    },
    onError: (e: Error) => toast.error("Falha ao remover", { description: e.message }),
  });

  const members = listQ.data ?? [];

  return (
    <SettingsLayout
      title="Equipe"
      description="Gerencie membros da sua equipe. Todos compartilham o mesmo número de WhatsApp e a mesma caixa de entrada."
    >
      <div className="flex items-center justify-between" style={{ marginBottom: 16 }}>
        <p style={{ fontSize: 13, color: "var(--text-muted)" }}>
          {listQ.isLoading
            ? "Carregando…"
            : `${members.length} ${members.length === 1 ? "membro" : "membros"}`}
        </p>
        <button
          style={buttonPrimary}
          className="flex items-center gap-2"
          onClick={() => setOpenInvite(true)}
        >
          <Plus size={14} /> Adicionar membro
        </button>
      </div>

      <div style={card}>
        {listQ.isError && (
          <p style={{ fontSize: 13, color: "#EF4444", padding: 12 }}>
            Erro ao carregar: {(listQ.error as Error).message}
          </p>
        )}
        {!listQ.isLoading && members.length === 0 && (
          <p style={{ fontSize: 13, color: "var(--text-muted)", padding: 12 }}>
            Nenhum membro ainda.
          </p>
        )}
        <div className="flex flex-col" style={{ gap: 0 }}>
          {members.map((m, i) => {
            const meta = ROLE_META[m.role];
            const displayName = m.full_name || m.email.split("@")[0];
            return (
              <div
                key={m.id}
                className="flex items-center gap-3"
                style={{
                  padding: "12px 4px",
                  borderTop: i === 0 ? 0 : "1px solid var(--border)",
                  opacity: m.active ? 1 : 0.55,
                }}
              >
                <div
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 999,
                    background: "var(--bg-overlay)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontWeight: 600,
                    fontSize: 13,
                  }}
                >
                  {displayName.charAt(0).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <div
                    style={{
                      fontSize: 13,
                      fontWeight: 500,
                      display: "flex",
                      alignItems: "center",
                      gap: 6,
                    }}
                  >
                    {displayName}
                    {m.is_owner && (
                      <span
                        style={{
                          fontSize: 10,
                          padding: "2px 6px",
                          borderRadius: 999,
                          background: "var(--bg-overlay)",
                          color: "var(--text-muted)",
                        }}
                      >
                        Você
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: 12, color: "var(--text-muted)" }}>{m.email}</div>
                </div>
                <select
                  value={m.role}
                  disabled={m.is_owner || updateM.isPending}
                  onChange={(e) =>
                    updateM.mutate({
                      member_user_id: m.member_user_id,
                      role: e.target.value as Role,
                    })
                  }
                  style={{ ...inputStyle, width: 130, height: 28, fontSize: 12 }}
                >
                  <option value="manager">Manager</option>
                  <option value="agent">Agente</option>
                </select>
                <span
                  style={{
                    fontSize: 11,
                    fontWeight: 600,
                    padding: "3px 8px",
                    borderRadius: 999,
                    background: meta.bg,
                    color: meta.fg,
                  }}
                >
                  {meta.label}
                </span>
                <span
                  style={{
                    fontSize: 11,
                    padding: "3px 8px",
                    borderRadius: 999,
                    background: m.active
                      ? "color-mix(in oklab, #10B981 18%, transparent)"
                      : "var(--bg-overlay)",
                    color: m.active ? "#10B981" : "var(--text-muted)",
                  }}
                >
                  {m.active ? "Ativo" : "Inativo"}
                </span>
                {!m.is_owner && (
                  <Menu
                    onToggle={() => setConfirm({ kind: "toggle", member: m })}
                    onRemove={() => setConfirm({ kind: "remove", member: m })}
                    active={m.active}
                  />
                )}
                {m.is_owner && <span style={{ width: 28 }} />}
              </div>
            );
          })}
        </div>
      </div>

      {openInvite && (
        <InviteModal
          loading={createM.isPending}
          onClose={() => !createM.isPending && setOpenInvite(false)}
          onSubmit={(input) => createM.mutate(input)}
        />
      )}

      {confirm && (
        <ConfirmModal
          title={
            confirm.kind === "remove"
              ? `Remover ${confirm.member.full_name || confirm.member.email}?`
              : "Alterar status?"
          }
          description={
            confirm.kind === "remove"
              ? "A conta do agente será excluída e ele perderá o acesso. Esta ação não pode ser desfeita."
              : `O membro ${confirm.member.active ? "perderá" : "recuperará"} o acesso ao workspace.`
          }
          danger={confirm.kind === "remove"}
          loading={updateM.isPending || removeM.isPending}
          onCancel={() => setConfirm(null)}
          onConfirm={() => {
            if (confirm.kind === "remove") {
              removeM.mutate(confirm.member.member_user_id);
            } else {
              updateM.mutate({
                member_user_id: confirm.member.member_user_id,
                active: !confirm.member.active,
              });
            }
            setConfirm(null);
          }}
        />
      )}
    </SettingsLayout>
  );
}

function Menu({
  onToggle,
  onRemove,
  active,
}: {
  onToggle: () => void;
  onRemove: () => void;
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
          <MenuItem onClick={() => { onToggle(); setOpen(false); }}>
            {active ? "Desativar" : "Ativar"}
          </MenuItem>
          <MenuItem danger onClick={() => { onRemove(); setOpen(false); }}>
            Remover
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

function InviteModal({
  onClose,
  onSubmit,
  loading,
}: {
  onClose: () => void;
  onSubmit: (input: { email: string; password: string; full_name: string; role: Role }) => void;
  loading: boolean;
}) {
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [fullName, setFullName] = React.useState("");
  const [role, setRole] = React.useState<Role>("agent");

  const canSubmit = email.length > 3 && password.length >= 6 && fullName.length > 0;

  return (
    <Modal title="Adicionar membro" onClose={onClose}>
      <div className="flex flex-col" style={{ gap: 12 }}>
        <Field label="Nome completo">
          <input
            style={inputStyle}
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            placeholder="Maria Silva"
            autoFocus
          />
        </Field>
        <Field label="Email">
          <input
            style={inputStyle}
            value={email}
            type="email"
            onChange={(e) => setEmail(e.target.value)}
            placeholder="pessoa@empresa.com"
          />
        </Field>
        <Field label="Senha temporária (mínimo 6 caracteres)">
          <input
            style={inputStyle}
            value={password}
            type="text"
            onChange={(e) => setPassword(e.target.value)}
            placeholder="ex: zapflow2026"
          />
        </Field>
        <Field label="Permissão">
          <select
            style={inputStyle}
            value={role}
            onChange={(e) => setRole(e.target.value as Role)}
          >
            <option value="agent">Agente — só atende conversas</option>
            <option value="manager">Manager — acesso total</option>
          </select>
        </Field>
        <p style={{ fontSize: 11, color: "var(--text-muted)" }}>
          O membro receberá esses dados de você e poderá entrar com email + senha. Ele
          atenderá o mesmo WhatsApp e verá a mesma caixa de entrada do workspace.
        </p>
        <div className="flex justify-end gap-2" style={{ marginTop: 8 }}>
          <button style={buttonSecondary} onClick={onClose} disabled={loading}>
            Cancelar
          </button>
          <button
            style={buttonPrimary}
            disabled={!canSubmit || loading}
            onClick={() => onSubmit({ email, password, full_name: fullName, role })}
          >
            {loading ? (
              <span className="flex items-center gap-2">
                <Loader2 size={14} className="animate-spin" /> Criando…
              </span>
            ) : (
              "Criar conta"
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
          Confirmar
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
  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.5)",
        zIndex: 50,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "var(--bg-surface)",
          border: "1px solid var(--border)",
          borderRadius: 12,
          padding: 20,
          width: "100%",
          maxWidth: 420,
        }}
      >
        <div className="flex items-center justify-between" style={{ marginBottom: 16 }}>
          <h3 style={{ fontSize: 15, fontWeight: 600 }}>{title}</h3>
          <button
            onClick={onClose}
            style={{
              background: "transparent",
              border: 0,
              cursor: "pointer",
              color: "var(--text-muted)",
            }}
          >
            <X size={16} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
