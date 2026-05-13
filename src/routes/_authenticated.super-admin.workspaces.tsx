import * as React from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Search, MoreVertical, Eye, PauseCircle, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  adminCard,
  adminInput,
  adminBtnGhost,
  adminBtnDanger,
} from "./_authenticated.super-admin";

export const Route = createFileRoute("/_authenticated/super-admin/workspaces")({
  component: WorkspacesAdmin,
});

type Plan = "trial" | "starter" | "pro" | "enterprise";
type Status = "active" | "suspended" | "trial_expired";

type Workspace = {
  id: string;
  name: string;
  owner: string;
  plan: Plan;
  users: number;
  contacts: number;
  created_at: string;
  status: Status;
};

const SEED: Workspace[] = [
  { id: "1", name: "Auto Center Silva", owner: "joao@silva.com", plan: "pro", users: 8, contacts: 1240, created_at: "2025-12-04", status: "active" },
  { id: "2", name: "Clínica Bem-Estar", owner: "ana@bemestar.com", plan: "starter", users: 3, contacts: 320, created_at: "2026-01-12", status: "active" },
  { id: "3", name: "Dr. Pedro Odonto", owner: "pedro@odonto.com", plan: "trial", users: 1, contacts: 47, created_at: "2026-05-01", status: "active" },
  { id: "4", name: "Mecânica Garagem", owner: "carlos@garagem.com", plan: "trial", users: 1, contacts: 12, created_at: "2026-04-20", status: "trial_expired" },
  { id: "5", name: "Studio Beauty", owner: "lia@beauty.com", plan: "pro", users: 12, contacts: 3400, created_at: "2025-09-18", status: "active" },
  { id: "6", name: "Loja Fashion BR", owner: "rodrigo@fashion.com", plan: "enterprise", users: 25, contacts: 8900, created_at: "2025-06-22", status: "active" },
  { id: "7", name: "Pet Shop Amigo", owner: "marina@pet.com", plan: "starter", users: 2, contacts: 180, created_at: "2026-03-08", status: "suspended" },
];

const PLAN_META: Record<Plan, { label: string; color: string }> = {
  trial: { label: "Trial", color: "#F59E0B" },
  starter: { label: "Starter", color: "#3B82F6" },
  pro: { label: "Pro", color: "#7C3AED" },
  enterprise: { label: "Enterprise", color: "#10B981" },
};

const STATUS_META: Record<Status, { label: string; color: string; bg: string }> = {
  active: { label: "Ativo", color: "#10B981", bg: "color-mix(in oklab, #10B981 18%, transparent)" },
  suspended: { label: "Suspenso", color: "#F87171", bg: "color-mix(in oklab, #EF4444 18%, transparent)" },
  trial_expired: { label: "Trial vencido", color: "#F59E0B", bg: "color-mix(in oklab, #F59E0B 18%, transparent)" },
};

function WorkspacesAdmin() {
  const [items, setItems] = React.useState(SEED);
  const [search, setSearch] = React.useState("");
  const [plan, setPlan] = React.useState<"all" | Plan>("all");
  const [status, setStatus] = React.useState<"all" | Status>("all");

  const filtered = items.filter((w) => {
    if (plan !== "all" && w.plan !== plan) return false;
    if (status !== "all" && w.status !== status) return false;
    if (search && !`${w.name} ${w.owner}`.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const action = (id: string, kind: "suspend" | "delete") => {
    if (kind === "delete") {
      if (!confirm("Excluir workspace? Esta ação é irreversível.")) return;
      setItems((x) => x.filter((w) => w.id !== id));
      toast.success("Workspace excluído");
    } else {
      setItems((x) =>
        x.map((w) =>
          w.id === id ? { ...w, status: w.status === "suspended" ? "active" : "suspended" } : w,
        ),
      );
      toast.success("Status atualizado");
    }
  };

  return (
    <div className="flex flex-col" style={{ gap: 16 }}>
      <div>
        <h2 style={{ fontSize: 20, fontWeight: 600 }}>Workspaces</h2>
        <p style={{ fontSize: 13, color: "rgba(255,255,255,0.5)", marginTop: 4 }}>
          {filtered.length} de {items.length} workspaces
        </p>
      </div>

      <div className="flex gap-2 flex-wrap">
        <div className="flex items-center gap-2 flex-1" style={{ minWidth: 240, ...adminInput, padding: "0 10px" }}>
          <Search size={14} style={{ color: "rgba(255,255,255,0.4)" }} />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por nome ou dono…"
            style={{
              flex: 1,
              border: 0,
              background: "transparent",
              color: "#fff",
              fontSize: 13,
              outline: 0,
            }}
          />
        </div>
        <select style={adminInput} value={plan} onChange={(e) => setPlan(e.target.value as never)}>
          <option value="all">Todos os planos</option>
          <option value="trial">Trial</option>
          <option value="starter">Starter</option>
          <option value="pro">Pro</option>
          <option value="enterprise">Enterprise</option>
        </select>
        <select style={adminInput} value={status} onChange={(e) => setStatus(e.target.value as never)}>
          <option value="all">Todos os status</option>
          <option value="active">Ativo</option>
          <option value="suspended">Suspenso</option>
          <option value="trial_expired">Trial vencido</option>
        </select>
      </div>

      <div style={{ ...adminCard, padding: 0, overflow: "hidden" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr style={{ background: "#0F0F13", color: "rgba(255,255,255,0.55)", fontSize: 11, textTransform: "uppercase", letterSpacing: "0.05em" }}>
              <Th>Workspace</Th>
              <Th>Dono</Th>
              <Th>Plano</Th>
              <Th>Usuários</Th>
              <Th>Contatos</Th>
              <Th>Criado em</Th>
              <Th>Status</Th>
              <Th>Ações</Th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((w) => (
              <tr key={w.id} style={{ borderTop: "1px solid #1F1F23" }}>
                <Td style={{ fontWeight: 500 }}>{w.name}</Td>
                <Td style={{ color: "rgba(255,255,255,0.7)" }}>{w.owner}</Td>
                <Td>
                  <Badge color={PLAN_META[w.plan].color}>{PLAN_META[w.plan].label}</Badge>
                </Td>
                <Td>{w.users}</Td>
                <Td>{w.contacts.toLocaleString("pt-BR")}</Td>
                <Td style={{ color: "rgba(255,255,255,0.6)" }}>
                  {new Date(w.created_at).toLocaleDateString("pt-BR")}
                </Td>
                <Td>
                  <span
                    style={{
                      fontSize: 11,
                      fontWeight: 600,
                      padding: "3px 8px",
                      borderRadius: 999,
                      background: STATUS_META[w.status].bg,
                      color: STATUS_META[w.status].color,
                    }}
                  >
                    {STATUS_META[w.status].label}
                  </span>
                </Td>
                <Td>
                  <div className="flex items-center gap-1">
                    <button style={adminBtnGhost} onClick={() => toast(`Detalhes de ${w.name}`)}>
                      <Eye size={12} />
                    </button>
                    <button style={adminBtnGhost} onClick={() => action(w.id, "suspend")}>
                      <PauseCircle size={12} />
                    </button>
                    <button style={adminBtnDanger} onClick={() => action(w.id, "delete")}>
                      <Trash2 size={12} />
                    </button>
                  </div>
                </Td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return <th style={{ padding: "10px 12px", textAlign: "left", fontWeight: 500 }}>{children}</th>;
}
function Td({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return <td style={{ padding: "12px", ...style }}>{children}</td>;
}
function Badge({ color, children }: { color: string; children: React.ReactNode }) {
  return (
    <span
      style={{
        fontSize: 11,
        fontWeight: 600,
        padding: "3px 8px",
        borderRadius: 999,
        background: `color-mix(in oklab, ${color} 18%, transparent)`,
        color,
      }}
    >
      {children}
    </span>
  );
}
