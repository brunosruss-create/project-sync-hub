import * as React from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, MoreVertical, Loader2, Minus } from "lucide-react";
import { describeRotation } from "@/lib/rotation";
import {
  SettingsLayout,
  Field,
  inputStyle,
  buttonPrimary,
} from "@/features/settings/settings-layout";
import { ManagerOnly } from "@/components/manager-only";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { listDepartments } from "@/lib/departments.functions";
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

/** Cores da barra de proporção do rodízio, na ordem dos atendentes elegíveis. */
const ROTATION_COLORS = ["#3654FF", "#25C880", "#F59E0B", "#8B5CF6", "#EC4899", "#14B8A6"];

/** Faixa oferecida na UI. O banco aceita até 100, mas peso alto vira espera longa. */
const WEIGHT_MIN = 1;
const WEIGHT_MAX = 10;

/**
 * Stepper em vez de `<input type="number">`: o padrão desta tela é mutação
 * direta no onChange, o que num campo numérico dispararia uma chamada por
 * tecla e permitiria estados intermediários inválidos (vazio, "007").
 */
function Stepper({
  value,
  onChange,
  disabled,
}: {
  value: number;
  onChange: (v: number) => void;
  disabled?: boolean;
}) {
  const btn = (enabled: boolean): React.CSSProperties => ({
    width: 22,
    height: 22,
    borderRadius: "var(--radius-pill)",
    border: "1px solid var(--border)",
    background: "var(--bg-surface)",
    color: enabled ? "var(--text-primary)" : "var(--text-muted)",
    cursor: enabled ? "pointer" : "not-allowed",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    opacity: enabled ? 1 : 0.5,
  });
  const canDec = !disabled && value > WEIGHT_MIN;
  const canInc = !disabled && value < WEIGHT_MAX;
  return (
    <span className="inline-flex items-center" style={{ gap: 4 }}>
      <button
        type="button"
        aria-label="Diminuir peso"
        disabled={!canDec}
        onClick={() => onChange(value - 1)}
        style={btn(canDec)}
      >
        <Minus size={12} />
      </button>
      <span
        style={{
          minWidth: 16,
          textAlign: "center",
          fontWeight: 600,
          color: "var(--text-primary)",
        }}
      >
        {value}
      </span>
      <button
        type="button"
        aria-label="Aumentar peso"
        disabled={!canInc}
        onClick={() => onChange(value + 1)}
        style={btn(canInc)}
      >
        <Plus size={12} />
      </button>
    </span>
  );
}

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

const MEMBER_STATUS_VARIANT: Record<"active" | "inactive", "success" | "neutral"> = {
  active: "success",
  inactive: "neutral",
};

function TeamPage() {
  const qc = useQueryClient();
  const fetchList = useServerFn(listTeamMembers);
  const fetchDepartments = useServerFn(listDepartments);
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

  const departmentsQ = useQuery({
    queryKey: ["departments"],
    queryFn: () => fetchDepartments(),
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
    mutationFn: (input: {
      member_user_id: string;
      active?: boolean;
      role?: Role;
      rotation_enabled?: boolean;
      rotation_weight?: number;
      department_id?: string | null;
    }) => updateFn({ data: input }),
    onSuccess: () => {
      toast.success("Atualizado");
      invalidate();
    },
    onError: (e: Error) => toast.error("Falha ao atualizar", { description: e.message }),
  });

  /**
   * Mutação separada para os campos de rodízio: sem toast, porque um stepper
   * dispara uma chamada por clique e a UI já mostra o valor novo.
   */
  const rotationM = useMutation({
    mutationFn: (input: {
      member_user_id: string;
      rotation_enabled?: boolean;
      rotation_weight?: number;
    }) => updateFn({ data: input }),
    onSuccess: () => invalidate(),
    onError: (e: Error) => toast.error("Falha ao atualizar o rodízio", { description: e.message }),
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
  const departments = (departmentsQ.data ?? []).filter((d) => d.is_active);

  // A proporção só existe em relação ao conjunto, então é calculada no nível da
  // lista, não da linha.
  const eligible = members.filter((m) => m.active && m.rotation_enabled);
  const { totalWeight } = describeRotation(
    eligible.map((m) => ({ userId: m.member_user_id, weight: m.rotation_weight })),
  );

  return (
    <SettingsLayout
      title="Equipe"
      description="Gerencie quem tem acesso ao sistema e atende pelo WhatsApp."
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

      {!listQ.isLoading && members.length > 0 && (
        <Card style={{ padding: 16, marginBottom: 12 }}>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>
            Distribuição automática
          </div>
          <div style={{ fontSize: 12, color: "var(--text-muted)", lineHeight: 1.5 }}>
            Quando a IA transfere uma conversa para atendimento humano, ela vai para o próximo
            atendente do rodízio.{" "}
            <strong style={{ color: "var(--text-primary)", fontWeight: 500 }}>
              Ao ser atribuída, a conversa sai do automático — a IA para de responder e o atendente
              assume.
            </strong>
          </div>

          {eligible.length === 0 ? (
            <div
              style={{
                marginTop: 10,
                padding: "8px 10px",
                borderRadius: "var(--radius-card)",
                fontSize: 12,
                border: "1px solid color-mix(in oklab, #F59E0B 40%, transparent)",
                background: "color-mix(in oklab, #F59E0B 12%, transparent)",
                color: "var(--text-primary)",
              }}
            >
              Ninguém no rodízio. As conversas transferidas ficam em <strong>Aguardando</strong> sem
              responsável, e a IA continua respondendo.
            </div>
          ) : (
            <>
              <div style={{ marginTop: 12, display: "flex", gap: 3, height: 8 }}>
                {eligible.map((m, i) => (
                  <div
                    key={m.id}
                    title={`${m.full_name || m.email.split("@")[0]}: ${m.rotation_weight}`}
                    style={{
                      flex: m.rotation_weight,
                      borderRadius: "var(--radius-pill)",
                      background: ROTATION_COLORS[i % ROTATION_COLORS.length],
                    }}
                  />
                ))}
              </div>
              <div style={{ marginTop: 8, fontSize: 12, color: "var(--text-muted)" }}>
                {eligible.length === 1 ? (
                  <>
                    Todas as conversas transferidas vão para{" "}
                    <strong style={{ color: "var(--text-primary)", fontWeight: 500 }}>
                      {eligible[0].full_name || eligible[0].email.split("@")[0]}
                    </strong>
                    .
                  </>
                ) : (
                  <>
                    Ciclo de <strong style={{ color: "var(--text-primary)" }}>{totalWeight}</strong>{" "}
                    conversas:{" "}
                    {eligible
                      .map((m) => `${m.full_name || m.email.split("@")[0]} ${m.rotation_weight}`)
                      .join(" · ")}{" "}
                    → e recomeça.
                  </>
                )}
              </div>
              <div style={{ marginTop: 4, fontSize: 11, color: "var(--text-muted)" }}>
                Ao mudar qualquer peso, o ciclo recomeça do primeiro atendente.
              </div>
            </>
          )}
        </Card>
      )}

      <Card style={{ padding: 20 }}>
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
                className="flex flex-col"
                style={{
                  padding: "12px 4px",
                  borderTop: i === 0 ? 0 : "1px solid var(--border)",
                  opacity: m.active ? 1 : 0.55,
                  gap: 8,
                }}
              >
              <div className="flex items-center gap-3">
                <div
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: "var(--radius-pill)",
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
                          borderRadius: "var(--radius-pill)",
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
                {/* Só aparece se o workspace tem departamentos — sem eles a
                    linha continua idêntica ao que era antes da feature. */}
                {departments.length > 0 && (
                  <select
                    aria-label={`Departamento de ${m.full_name || m.email}`}
                    value={m.department_id ?? ""}
                    disabled={updateM.isPending}
                    onChange={(e) =>
                      updateM.mutate({
                        member_user_id: m.member_user_id,
                        department_id: e.target.value || null,
                      })
                    }
                    style={{ ...inputStyle, width: 150, height: 28, fontSize: 12 }}
                  >
                    <option value="">Sem departamento</option>
                    {departments.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.name}
                      </option>
                    ))}
                  </select>
                )}
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
                    borderRadius: "var(--radius-pill)",
                    background: meta.bg,
                    color: meta.fg,
                  }}
                >
                  {meta.label}
                </span>
                <Badge variant={MEMBER_STATUS_VARIANT[m.active ? "active" : "inactive"]}>
                  {m.active ? "Ativo" : "Inativo"}
                </Badge>
                {!m.is_owner && (
                  <Menu
                    onToggle={() => setConfirm({ kind: "toggle", member: m })}
                    onRemove={() => setConfirm({ kind: "remove", member: m })}
                    active={m.active}
                  />
                )}
                {m.is_owner && <span style={{ width: 28 }} />}
              </div>

              {/* Rodízio — alinhado sob o nome (avatar 36 + gap 12). */}
              <div
                className="flex flex-wrap items-center"
                style={{ paddingLeft: 48, gap: 10, fontSize: 12, color: "var(--text-muted)" }}
              >
                <label
                  className="flex items-center"
                  style={{ gap: 6, cursor: m.active ? "pointer" : "not-allowed" }}
                >
                  <input
                    type="checkbox"
                    checked={m.rotation_enabled}
                    disabled={!m.active || rotationM.isPending}
                    onChange={(e) =>
                      rotationM.mutate({
                        member_user_id: m.member_user_id,
                        rotation_enabled: e.target.checked,
                      })
                    }
                  />
                  {m.is_owner ? "Também recebo conversas" : "Recebe conversas automaticamente"}
                </label>

                {m.rotation_enabled && m.active && (
                  <>
                    <Stepper
                      value={m.rotation_weight}
                      disabled={rotationM.isPending}
                      onChange={(v) =>
                        rotationM.mutate({ member_user_id: m.member_user_id, rotation_weight: v })
                      }
                    />
                    <span>
                      {eligible.length === 1
                        ? "recebe todas as conversas"
                        : `a cada ${totalWeight} conversas, recebe ${m.rotation_weight}`}
                    </span>
                  </>
                )}
                {!m.rotation_enabled && m.active && <span>fora do rodízio</span>}
              </div>
              </div>
            );
          })}
        </div>
      </Card>

      {openInvite && (
        <InviteModal
          loading={createM.isPending}
          onClose={() => !createM.isPending && setOpenInvite(false)}
          onSubmit={(input) => createM.mutate(input)}
        />
      )}

      <ConfirmDialog
        open={!!confirm}
        onClose={() => setConfirm(null)}
        onConfirm={() => {
          if (!confirm) return;
          if (confirm.kind === "remove") {
            removeM.mutate(confirm.member.member_user_id);
          } else {
            updateM.mutate({
              member_user_id: confirm.member.member_user_id,
              active: !confirm.member.active,
            });
          }
        }}
        title={
          confirm?.kind === "remove"
            ? `Remover ${confirm.member.full_name || confirm.member.email}?`
            : "Alterar status?"
        }
        description={
          confirm?.kind === "remove"
            ? "A conta do agente será excluída e ele perderá o acesso. Esta ação não pode ser desfeita."
            : confirm?.kind === "toggle"
              ? `O membro ${confirm.member.active ? "perderá" : "recuperará"} o acesso ao workspace.`
              : undefined
        }
        destructive={confirm?.kind === "remove"}
      />
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
    <Modal
      open
      onOpenChange={(o) => {
        if (!o && !loading) onClose();
      }}
      title="Adicionar membro"
      description="Crie o acesso de um novo agente ou manager ao workspace."
      size="sm"
      footer={
        <>
          <Button type="button" variant="outline" onClick={onClose} disabled={loading}>
            Cancelar
          </Button>
          <Button
            type="button"
            disabled={!canSubmit || loading}
            onClick={() => onSubmit({ email, password, full_name: fullName, role })}
          >
            {loading ? (
              <>
                <Loader2 size={14} className="animate-spin" /> Criando…
              </>
            ) : (
              "Criar conta"
            )}
          </Button>
        </>
      }
    >
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
      </div>
    </Modal>
  );
}
