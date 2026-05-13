import * as React from "react";
import { createFileRoute } from "@tanstack/react-router";
import { toast } from "sonner";
import { Plus, MoreVertical, X } from "lucide-react";
import {
  SettingsLayout,
  Field,
  inputStyle,
  buttonPrimary,
  buttonSecondary,
  buttonDanger,
  card,
} from "@/features/settings/settings-layout";

export const Route = createFileRoute("/_authenticated/settings/team")({
  component: TeamPage,
});

type Role = "manager" | "agent";
type Member = {
  id: string;
  name: string;
  email: string;
  role: Role;
  active: boolean;
};

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

const SEED: Member[] = [
  { id: "1", name: "Ana Souza", email: "ana@empresa.com", role: "manager", active: true },
  { id: "2", name: "Bruno Lima", email: "bruno@empresa.com", role: "agent", active: true },
  { id: "3", name: "Carla Mendes", email: "carla@empresa.com", role: "agent", active: false },
];

function TeamPage() {
  const [members, setMembers] = React.useState<Member[]>(SEED);
  const [openInvite, setOpenInvite] = React.useState(false);
  const [confirm, setConfirm] = React.useState<{ id: string; action: "remove" | "toggle" } | null>(
    null,
  );

  const apply = (id: string, fn: (m: Member) => Member) =>
    setMembers((arr) => arr.map((m) => (m.id === id ? fn(m) : m)));

  return (
    <SettingsLayout
      title="Equipe"
      description="Gerencie membros, convites e permissões."
    >
      <div className="flex items-center justify-between" style={{ marginBottom: 16 }}>
        <p style={{ fontSize: 13, color: "var(--text-muted)" }}>
          {members.length} {members.length === 1 ? "membro" : "membros"}
        </p>
        <button
          style={buttonPrimary}
          className="flex items-center gap-2"
          onClick={() => setOpenInvite(true)}
        >
          <Plus size={14} /> Convidar membro
        </button>
      </div>

      <div style={card}>
        <div className="flex flex-col" style={{ gap: 0 }}>
          {members.map((m, i) => {
            const meta = ROLE_META[m.role];
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
                  {m.name.charAt(0).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <div style={{ fontSize: 13, fontWeight: 500 }}>{m.name}</div>
                  <div style={{ fontSize: 12, color: "var(--text-muted)" }}>{m.email}</div>
                </div>
                <select
                  value={m.role}
                  onChange={(e) =>
                    apply(m.id, (x) => ({ ...x, role: e.target.value as Role }))
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
                <Menu
                  onToggle={() => setConfirm({ id: m.id, action: "toggle" })}
                  onRemove={() => setConfirm({ id: m.id, action: "remove" })}
                  active={m.active}
                />
              </div>
            );
          })}
        </div>
      </div>

      {openInvite && (
        <InviteModal
          onClose={() => setOpenInvite(false)}
          onInvite={(email, role) => {
            setMembers((a) => [
              ...a,
              {
                id: String(Date.now()),
                name: email.split("@")[0],
                email,
                role,
                active: true,
              },
            ]);
            setOpenInvite(false);
            toast.success(`Convite enviado para ${email}`);
          }}
        />
      )}

      {confirm && (
        <ConfirmModal
          title={confirm.action === "remove" ? "Remover membro?" : "Alterar status?"}
          description={
            confirm.action === "remove"
              ? "Esta ação não pode ser desfeita."
              : "O membro perderá ou recuperará o acesso ao workspace."
          }
          danger={confirm.action === "remove"}
          onCancel={() => setConfirm(null)}
          onConfirm={() => {
            if (confirm.action === "remove") {
              setMembers((a) => a.filter((m) => m.id !== confirm.id));
              toast.success("Membro removido");
            } else {
              apply(confirm.id, (x) => ({ ...x, active: !x.active }));
              toast.success("Status atualizado");
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
  onInvite,
}: {
  onClose: () => void;
  onInvite: (email: string, role: Role) => void;
}) {
  const [email, setEmail] = React.useState("");
  const [role, setRole] = React.useState<Role>("agent");
  return (
    <Modal title="Convidar membro" onClose={onClose}>
      <div className="flex flex-col" style={{ gap: 12 }}>
        <Field label="Email">
          <input
            style={inputStyle}
            value={email}
            type="email"
            onChange={(e) => setEmail(e.target.value)}
            placeholder="pessoa@empresa.com"
          />
        </Field>
        <Field label="Permissão">
          <select
            style={inputStyle}
            value={role}
            onChange={(e) => setRole(e.target.value as Role)}
          >
            <option value="manager">Manager</option>
            <option value="agent">Agente</option>
          </select>
        </Field>
        <div className="flex justify-end gap-2" style={{ marginTop: 8 }}>
          <button style={buttonSecondary} onClick={onClose}>
            Cancelar
          </button>
          <button
            style={buttonPrimary}
            disabled={!email}
            onClick={() => onInvite(email, role)}
          >
            Enviar convite
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
}: {
  title: string;
  description: string;
  onCancel: () => void;
  onConfirm: () => void;
  danger?: boolean;
}) {
  return (
    <Modal title={title} onClose={onCancel}>
      <p style={{ fontSize: 13, color: "var(--text-muted)" }}>{description}</p>
      <div className="flex justify-end gap-2" style={{ marginTop: 16 }}>
        <button style={buttonSecondary} onClick={onCancel}>
          Cancelar
        </button>
        <button style={danger ? buttonDanger : buttonPrimary} onClick={onConfirm}>
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
