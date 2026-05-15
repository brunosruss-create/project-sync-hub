import * as React from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { X, Wifi, WifiOff, Loader2, MoreVertical } from "lucide-react";
import {
  getWorkspaceDetail,
  setUserRole,
  setUserBlocked,
  resetUserPassword,
  setWorkspacePlan,
  suspendWorkspace,
  deleteWorkspace,
} from "@/lib/super-admin-actions.functions";

type Props = {
  ownerId: string | null;
  onClose: () => void;
};

const card: React.CSSProperties = {
  background: "#0F0F13",
  border: "1px solid #1F1F23",
  borderRadius: 8,
  padding: 14,
};

const tabs = [
  { id: "summary", label: "📊 Resumo" },
  { id: "members", label: "👥 Usuários" },
  { id: "contacts", label: "💬 Contatos" },
  { id: "settings", label: "⚙️ Configurações" },
] as const;
type TabId = (typeof tabs)[number]["id"];

const PLANS = ["trial", "starter", "pro", "enterprise"] as const;

const ROLE_META: Record<string, { label: string; color: string }> = {
  super_admin: { label: "Super Admin", color: "#7C3AED" },
  manager: { label: "Manager", color: "#10B981" },
  agent: { label: "Agente", color: "#F59E0B" },
};

function avatarColor(name: string) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) % 360;
  return `hsl(${h}, 55%, 45%)`;
}

function initials(name?: string | null, email?: string | null) {
  const src = (name ?? email ?? "?").trim();
  return src.slice(0, 2).toUpperCase();
}

function timeAgo(iso: string | null | undefined) {
  if (!iso) return "—";
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "agora";
  if (m < 60) return `há ${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `há ${h}h`;
  const d = Math.floor(h / 24);
  return `há ${d}d`;
}

export function InspectWorkspaceDrawer({ ownerId, onClose }: Props) {
  const [tab, setTab] = React.useState<TabId>("summary");
  const qc = useQueryClient();
  const fetchDetail = useServerFn(getWorkspaceDetail);

  const { data, isLoading, error } = useQuery({
    queryKey: ["admin", "ws", ownerId],
    enabled: !!ownerId,
    queryFn: () => fetchDetail({ data: { ownerId: ownerId! } }),
  });

  React.useEffect(() => {
    if (ownerId) setTab("summary");
  }, [ownerId]);

  const open = !!ownerId;

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["admin", "ws", ownerId] });
    qc.invalidateQueries({ queryKey: ["admin", "workspaces"] });
    qc.invalidateQueries({ queryKey: ["admin", "users"] });
  };

  return (
    <>
      {/* Overlay */}
      <div
        onClick={onClose}
        style={{
          position: "fixed",
          inset: 0,
          background: "rgba(0,0,0,0.55)",
          opacity: open ? 1 : 0,
          pointerEvents: open ? "auto" : "none",
          transition: "opacity 200ms ease-out",
          zIndex: 50,
        }}
      />
      {/* Drawer */}
      <aside
        style={{
          position: "fixed",
          top: 0,
          right: 0,
          height: "100vh",
          width: 520,
          maxWidth: "100vw",
          background: "#0A0A0A",
          borderLeft: "1px solid #1F1F23",
          color: "#fff",
          transform: open ? "translateX(0)" : "translateX(100%)",
          transition: "transform 200ms ease-out",
          zIndex: 51,
          display: "flex",
          flexDirection: "column",
        }}
      >
        {!ownerId ? null : isLoading ? (
          <div className="flex items-center justify-center" style={{ flex: 1 }}>
            <Loader2 size={20} className="animate-spin" />
          </div>
        ) : error || !data ? (
          <div style={{ padding: 24, color: "#F87171" }}>
            Erro ao carregar workspace: {(error as Error)?.message ?? "desconhecido"}
            <div style={{ marginTop: 12 }}>
              <button onClick={onClose} style={btnGhost}>Fechar</button>
            </div>
          </div>
        ) : (
          <>
            <Header data={data} onClose={onClose} />
            <nav
              className="flex"
              style={{ borderBottom: "1px solid #1F1F23", padding: "0 12px", gap: 4 }}
            >
              {tabs.map((t) => (
                <button
                  key={t.id}
                  onClick={() => setTab(t.id)}
                  style={{
                    padding: "10px 12px",
                    fontSize: 12,
                    fontWeight: 500,
                    background: "transparent",
                    border: 0,
                    color: tab === t.id ? "#fff" : "rgba(255,255,255,0.55)",
                    borderBottom:
                      tab === t.id ? "2px solid #7C3AED" : "2px solid transparent",
                    cursor: "pointer",
                  }}
                >
                  {t.label}
                </button>
              ))}
            </nav>

            <div style={{ flex: 1, overflowY: "auto", padding: 16 }}>
              {tab === "summary" && <SummaryTab data={data} />}
              {tab === "members" && <MembersTab data={data} onChanged={invalidate} />}
              {tab === "contacts" && <ContactsTab data={data} />}
              {tab === "settings" && (
                <SettingsTab data={data} onChanged={invalidate} onClose={onClose} />
              )}
            </div>
          </>
        )}
      </aside>
    </>
  );
}

type Detail = Awaited<ReturnType<typeof getWorkspaceDetail>>;

function Header({ data, onClose }: { data: Detail; onClose: () => void }) {
  const name = data.owner.full_name ?? data.owner.email ?? "Workspace";
  const wa = data.whatsapp;
  const connected = wa?.status === "connected" || wa?.status === "open";
  return (
    <div
      className="flex items-center gap-3"
      style={{ padding: 16, borderBottom: "1px solid #1F1F23" }}
    >
      <div
        style={{
          width: 36,
          height: 36,
          borderRadius: 8,
          background: avatarColor(name),
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 13,
          fontWeight: 600,
        }}
      >
        {initials(data.owner.full_name, data.owner.email)}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 600, lineHeight: 1.2 }}>{name}</div>
        <div style={{ fontSize: 12, color: "rgba(255,255,255,0.55)" }}>
          {data.owner.email ?? "—"}
        </div>
      </div>
      <span
        style={{
          fontSize: 11,
          fontWeight: 600,
          padding: "4px 8px",
          borderRadius: 999,
          background: connected
            ? "color-mix(in oklab, #10B981 18%, transparent)"
            : "color-mix(in oklab, #EF4444 18%, transparent)",
          color: connected ? "#10B981" : "#F87171",
          display: "inline-flex",
          alignItems: "center",
          gap: 4,
        }}
      >
        {connected ? <Wifi size={11} /> : <WifiOff size={11} />}
        {connected ? "Conectado" : wa ? "Desconectado" : "Sem WA"}
      </span>
      <button onClick={onClose} style={iconBtn} aria-label="Fechar">
        <X size={16} />
      </button>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div style={card}>
      <div style={{ fontSize: 11, color: "rgba(255,255,255,0.55)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
        {label}
      </div>
      <div style={{ fontSize: 22, fontWeight: 600, marginTop: 4 }}>{value}</div>
    </div>
  );
}

function SummaryTab({ data }: { data: Detail }) {
  return (
    <div className="flex flex-col" style={{ gap: 16 }}>
      <div className="grid grid-cols-2" style={{ gap: 10 }}>
        <Metric label="Contatos" value={data.summary.contacts.toLocaleString("pt-BR")} />
        <Metric label="Mensagens (mês)" value={data.summary.messages_month.toLocaleString("pt-BR")} />
        <Metric label="Agendamentos" value={data.summary.appointments.toLocaleString("pt-BR")} />
        <Metric label="Membros" value={data.summary.members} />
      </div>

      <div style={card}>
        <div style={{ fontSize: 12, color: "rgba(255,255,255,0.55)", marginBottom: 10 }}>
          Informações
        </div>
        <Row k="Dono" v={`${data.owner.full_name ?? "—"} · ${data.owner.email ?? "—"}`} />
        <Row
          k="Criado em"
          v={data.owner.created_at ? new Date(data.owner.created_at).toLocaleDateString("pt-BR") : "—"}
        />
        <Row
          k="Plano"
          v={
            <span
              style={{
                fontSize: 11,
                fontWeight: 600,
                padding: "3px 8px",
                borderRadius: 999,
                background: "color-mix(in oklab, #7C3AED 18%, transparent)",
                color: "#A78BFA",
                textTransform: "capitalize",
              }}
            >
              {data.owner.plan ?? "trial"}
            </span>
          }
        />
        <Row
          k="WhatsApp"
          v={
            data.whatsapp
              ? `${data.whatsapp.phone_number ?? data.whatsapp.instance_name} · ${data.whatsapp.status}`
              : "—"
          }
        />
      </div>

      <div style={card}>
        <div style={{ fontSize: 12, color: "rgba(255,255,255,0.55)", marginBottom: 10 }}>
          Atividade recente
        </div>
        {data.audit.length === 0 ? (
          <div style={{ fontSize: 13, color: "rgba(255,255,255,0.45)" }}>Nenhuma ação registrada.</div>
        ) : (
          <ul style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {data.audit.map((a) => (
              <li key={a.id} style={{ fontSize: 12, display: "flex", justifyContent: "space-between", gap: 8 }}>
                <span>
                  <span style={{ fontWeight: 500 }}>{a.action}</span>
                  <span style={{ color: "rgba(255,255,255,0.5)" }}> · {a.actor_email ?? "—"}</span>
                </span>
                <span style={{ color: "rgba(255,255,255,0.5)" }}>{timeAgo(a.created_at)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function Row({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between" style={{ padding: "6px 0", fontSize: 13 }}>
      <span style={{ color: "rgba(255,255,255,0.55)" }}>{k}</span>
      <span>{v}</span>
    </div>
  );
}

function MembersTab({ data, onChanged }: { data: Detail; onChanged: () => void }) {
  return (
    <div>
      {data.members.length === 0 ? (
        <div style={{ fontSize: 13, color: "rgba(255,255,255,0.5)" }}>Sem membros.</div>
      ) : (
        data.members.map((m) => <MemberRow key={m.member_user_id} m={m} onChanged={onChanged} />)
      )}
    </div>
  );
}

function MemberRow({
  m,
  onChanged,
}: {
  m: Detail["members"][number];
  onChanged: () => void;
}) {
  const [open, setOpen] = React.useState(false);
  const meta = ROLE_META[m.role] ?? ROLE_META.agent;
  const roleFn = useServerFn(setUserRole);
  const blockFn = useServerFn(setUserBlocked);
  const resetFn = useServerFn(resetUserPassword);

  const handleRole = async (newRole: "super_admin" | "manager" | "agent") => {
    setOpen(false);
    try {
      await roleFn({ data: { userId: m.member_user_id, role: newRole } });
      toast.success(`Role atualizado para ${ROLE_META[newRole].label}`);
      onChanged();
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const handleReset = async () => {
    setOpen(false);
    if (!confirm(`Enviar email de redefinição de senha para ${m.email}?`)) return;
    try {
      await resetFn({ data: { userId: m.member_user_id } });
      toast.success(`Email enviado para ${m.email}`);
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const handleBlock = async () => {
    setOpen(false);
    const blocking = !m.is_blocked;
    if (blocking && !confirm(`Bloquear acesso de ${m.full_name ?? m.email}?`)) return;
    try {
      await blockFn({ data: { userId: m.member_user_id, blocked: blocking } });
      toast.success(blocking ? "Usuário bloqueado" : "Usuário desbloqueado");
      onChanged();
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const name = m.full_name ?? m.email ?? "—";

  return (
    <div
      className="flex items-center"
      style={{
        gap: 12,
        padding: "10px 0",
        borderBottom: "1px solid #1F1F23",
        opacity: m.is_blocked ? 0.55 : 1,
      }}
    >
      <div
        style={{
          width: 34,
          height: 34,
          borderRadius: "50%",
          background: avatarColor(name),
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 12,
          fontWeight: 600,
          flexShrink: 0,
        }}
      >
        {initials(m.full_name, m.email)}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 500, display: "flex", gap: 6, alignItems: "center" }}>
          {name}
          {m.is_blocked && (
            <span
              style={{
                fontSize: 10,
                fontWeight: 600,
                padding: "2px 6px",
                borderRadius: 999,
                background: "color-mix(in oklab, #EF4444 22%, transparent)",
                color: "#F87171",
              }}
            >
              Bloqueado
            </span>
          )}
        </div>
        <div style={{ fontSize: 12, color: "rgba(255,255,255,0.55)" }}>{m.email ?? "—"}</div>
      </div>
      <span
        style={{
          fontSize: 11,
          fontWeight: 600,
          padding: "3px 8px",
          borderRadius: 999,
          background: `color-mix(in oklab, ${meta.color} 18%, transparent)`,
          color: meta.color,
        }}
      >
        {meta.label}
      </span>
      <div style={{ position: "relative" }}>
        <button onClick={() => setOpen((s) => !s)} style={iconBtn} aria-label="Ações">
          <MoreVertical size={14} />
        </button>
        {open && (
          <>
            <div onClick={() => setOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 60 }} />
            <div
              style={{
                position: "absolute",
                right: 0,
                top: "100%",
                marginTop: 4,
                background: "#15151A",
                border: "1px solid #1F1F23",
                borderRadius: 8,
                minWidth: 180,
                padding: 4,
                zIndex: 61,
                boxShadow: "0 8px 24px rgba(0,0,0,0.4)",
              }}
            >
              <div style={{ padding: "6px 10px", fontSize: 11, color: "rgba(255,255,255,0.5)" }}>
                Trocar role
              </div>
              {(["manager", "agent", "super_admin"] as const).map((r) => (
                <button key={r} style={menuItem} onClick={() => handleRole(r)}>
                  {ROLE_META[r].label}
                </button>
              ))}
              <div style={{ height: 1, background: "#1F1F23", margin: "4px 0" }} />
              <button style={menuItem} onClick={handleReset}>
                Resetar senha
              </button>
              <button style={{ ...menuItem, color: "#F87171" }} onClick={handleBlock}>
                {m.is_blocked ? "Desbloquear" : "Bloquear acesso"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function ContactsTab({ data }: { data: Detail }) {
  if (data.contacts.length === 0) {
    return <div style={{ fontSize: 13, color: "rgba(255,255,255,0.5)" }}>Sem contatos.</div>;
  }
  return (
    <div>
      <div style={{ fontSize: 12, color: "rgba(255,255,255,0.55)", marginBottom: 8 }}>
        Mostrando {data.contacts.length} de {data.summary.contacts} contatos · read-only
      </div>
      <div style={{ ...card, padding: 0, overflow: "hidden" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
          <thead>
            <tr style={{ background: "#15151A", color: "rgba(255,255,255,0.55)" }}>
              <th style={cellH}>Nome</th>
              <th style={cellH}>Telefone</th>
              <th style={cellH}>Coluna</th>
              <th style={cellH}>Última msg</th>
            </tr>
          </thead>
          <tbody>
            {data.contacts.map((c) => (
              <tr key={c.id} style={{ borderTop: "1px solid #1F1F23" }}>
                <td style={cell}>{c.name ?? "—"}</td>
                <td style={cell}>{c.phone ?? "—"}</td>
                <td style={cell}>{c.kanban_column ?? "—"}</td>
                <td style={{ ...cell, color: "rgba(255,255,255,0.5)" }}>
                  {timeAgo(c.last_message_at)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function SettingsTab({
  data,
  onChanged,
  onClose,
}: {
  data: Detail;
  onChanged: () => void;
  onClose: () => void;
}) {
  const [plan, setPlan] = React.useState<string>(data.owner.plan ?? "trial");
  const planFn = useServerFn(setWorkspacePlan);
  const suspendFn = useServerFn(suspendWorkspace);
  const deleteFn = useServerFn(deleteWorkspace);

  const planMut = useMutation({
    mutationFn: () =>
      planFn({
        data: { ownerId: data.owner.id, plan: plan as "trial" | "starter" | "pro" | "enterprise" },
      }),
    onSuccess: () => {
      toast.success("Plano atualizado");
      onChanged();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const handleSuspend = async () => {
    if (!confirm("Suspender workspace? Todos os membros serão bloqueados.")) return;
    try {
      const r = await suspendFn({ data: { ownerId: data.owner.id } });
      toast.success(`Workspace suspenso (${r.blocked} usuários bloqueados)`);
      onChanged();
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const handleDelete = async () => {
    const confirmEmail = window.prompt(
      `Para deletar este workspace, digite o email do dono (${data.owner.email}):`,
    );
    if (!confirmEmail) return;
    try {
      await deleteFn({ data: { ownerId: data.owner.id, confirmEmail } });
      toast.success("Workspace deletado");
      onChanged();
      onClose();
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  return (
    <div className="flex flex-col" style={{ gap: 16 }}>
      <div style={card}>
        <div style={{ fontSize: 12, color: "rgba(255,255,255,0.55)", marginBottom: 10 }}>
          WhatsApp
        </div>
        {data.whatsapp ? (
          <>
            <Row k="Instance" v={data.whatsapp.instance_name} />
            <Row k="Status" v={data.whatsapp.status} />
            <Row k="Número" v={data.whatsapp.phone_number ?? "—"} />
            <Row
              k="Atualizado"
              v={data.whatsapp.updated_at ? new Date(data.whatsapp.updated_at).toLocaleString("pt-BR") : "—"}
            />
          </>
        ) : (
          <div style={{ fontSize: 13, color: "rgba(255,255,255,0.5)" }}>
            Nenhuma instância vinculada.
          </div>
        )}
      </div>

      <div style={card}>
        <div style={{ fontSize: 12, color: "rgba(255,255,255,0.55)", marginBottom: 10 }}>
          Plano
        </div>
        <div className="flex items-center gap-2">
          <select
            value={plan}
            onChange={(e) => setPlan(e.target.value)}
            style={{
              flex: 1,
              height: 34,
              padding: "0 10px",
              borderRadius: 6,
              border: "1px solid #1F1F23",
              background: "#0A0A0A",
              color: "#fff",
              fontSize: 13,
            }}
          >
            {PLANS.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
          <button
            disabled={planMut.isPending}
            onClick={() => planMut.mutate()}
            style={{ ...btnPrimary, opacity: planMut.isPending ? 0.6 : 1 }}
          >
            {planMut.isPending ? "Salvando…" : "Salvar"}
          </button>
        </div>
      </div>

      <div style={{ ...card, borderColor: "color-mix(in oklab, #EF4444 35%, #1F1F23)" }}>
        <div style={{ fontSize: 12, color: "#F87171", marginBottom: 10, fontWeight: 600 }}>
          Ações de risco
        </div>
        <div className="flex flex-col" style={{ gap: 8 }}>
          <button onClick={handleSuspend} style={btnDanger}>
            🔴 Suspender workspace
          </button>
          <button onClick={handleDelete} style={btnDanger}>
            🗑️ Deletar workspace
          </button>
        </div>
      </div>
    </div>
  );
}

const cellH: React.CSSProperties = {
  textAlign: "left",
  padding: "8px 10px",
  fontSize: 11,
  fontWeight: 500,
  textTransform: "uppercase",
};
const cell: React.CSSProperties = { padding: "8px 10px" };
const iconBtn: React.CSSProperties = {
  width: 28,
  height: 28,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  borderRadius: 6,
  background: "transparent",
  border: "1px solid #1F1F23",
  color: "#fff",
  cursor: "pointer",
};
const btnGhost: React.CSSProperties = {
  height: 32,
  padding: "0 12px",
  borderRadius: 6,
  background: "transparent",
  border: "1px solid #1F1F23",
  color: "#fff",
  fontSize: 12,
  cursor: "pointer",
};
const btnPrimary: React.CSSProperties = {
  height: 34,
  padding: "0 14px",
  borderRadius: 6,
  background: "#7C3AED",
  border: 0,
  color: "#fff",
  fontSize: 12,
  fontWeight: 500,
  cursor: "pointer",
};
const btnDanger: React.CSSProperties = {
  height: 34,
  padding: "0 14px",
  borderRadius: 6,
  background: "color-mix(in oklab, #EF4444 18%, transparent)",
  border: "1px solid color-mix(in oklab, #EF4444 40%, #1F1F23)",
  color: "#F87171",
  fontSize: 12,
  fontWeight: 500,
  cursor: "pointer",
  textAlign: "left",
};
const menuItem: React.CSSProperties = {
  display: "block",
  width: "100%",
  textAlign: "left",
  padding: "8px 10px",
  fontSize: 12,
  background: "transparent",
  border: 0,
  color: "#fff",
  cursor: "pointer",
  borderRadius: 4,
};
