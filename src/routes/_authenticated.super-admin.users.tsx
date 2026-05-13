import * as React from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Search, UserCog } from "lucide-react";
import { toast } from "sonner";
import {
  adminCard,
  adminInput,
  adminBtn,
} from "./_authenticated.super-admin";

export const Route = createFileRoute("/_authenticated/super-admin/users")({
  component: UsersAdmin,
});

type Role = "super_admin" | "admin" | "manager" | "agent";
type User = {
  id: string;
  name: string;
  email: string;
  workspace: string;
  plan: string;
  role: Role;
  created_at: string;
};

const SEED: User[] = [
  { id: "1", name: "João Silva", email: "joao@silva.com", workspace: "Auto Center Silva", plan: "pro", role: "admin", created_at: "2025-12-04" },
  { id: "2", name: "Mariana Lima", email: "mariana@silva.com", workspace: "Auto Center Silva", plan: "pro", role: "manager", created_at: "2026-01-09" },
  { id: "3", name: "Bruno Costa", email: "bruno@silva.com", workspace: "Auto Center Silva", plan: "pro", role: "agent", created_at: "2026-02-14" },
  { id: "4", name: "Ana Pereira", email: "ana@bemestar.com", workspace: "Clínica Bem-Estar", plan: "starter", role: "admin", created_at: "2026-01-12" },
  { id: "5", name: "Pedro Souza", email: "pedro@odonto.com", workspace: "Dr. Pedro Odonto", plan: "trial", role: "admin", created_at: "2026-05-01" },
  { id: "6", name: "Lia Ramos", email: "lia@beauty.com", workspace: "Studio Beauty", plan: "pro", role: "admin", created_at: "2025-09-18" },
  { id: "7", name: "Equipe Suporte", email: "ops@zapflow.com", workspace: "—", plan: "—", role: "super_admin", created_at: "2025-01-01" },
];

const ROLE_META: Record<Role, { label: string; color: string }> = {
  super_admin: { label: "Super Admin", color: "#7C3AED" },
  admin: { label: "Admin", color: "#3B82F6" },
  manager: { label: "Manager", color: "#10B981" },
  agent: { label: "Agente", color: "#F59E0B" },
};

function UsersAdmin() {
  const [search, setSearch] = React.useState("");
  const [workspace, setWorkspace] = React.useState("all");
  const [role, setRole] = React.useState<"all" | Role>("all");
  const [plan, setPlan] = React.useState("all");

  const workspaces = Array.from(new Set(SEED.map((u) => u.workspace)));
  const plans = Array.from(new Set(SEED.map((u) => u.plan)));

  const filtered = SEED.filter((u) => {
    if (workspace !== "all" && u.workspace !== workspace) return false;
    if (role !== "all" && u.role !== role) return false;
    if (plan !== "all" && u.plan !== plan) return false;
    if (search && !`${u.name} ${u.email}`.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  return (
    <div className="flex flex-col" style={{ gap: 16 }}>
      <div>
        <h2 style={{ fontSize: 20, fontWeight: 600 }}>Usuários</h2>
        <p style={{ fontSize: 13, color: "rgba(255,255,255,0.5)", marginTop: 4 }}>
          Visão consolidada de todos os usuários da plataforma.
        </p>
      </div>

      <div className="flex gap-2 flex-wrap">
        <div className="flex items-center gap-2 flex-1" style={{ minWidth: 240, ...adminInput, padding: "0 10px" }}>
          <Search size={14} style={{ color: "rgba(255,255,255,0.4)" }} />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por nome ou email…"
            style={{ flex: 1, border: 0, background: "transparent", color: "#fff", fontSize: 13, outline: 0 }}
          />
        </div>
        <select style={adminInput} value={workspace} onChange={(e) => setWorkspace(e.target.value)}>
          <option value="all">Todos workspaces</option>
          {workspaces.map((w) => <option key={w}>{w}</option>)}
        </select>
        <select style={adminInput} value={role} onChange={(e) => setRole(e.target.value as never)}>
          <option value="all">Todas roles</option>
          {Object.entries(ROLE_META).map(([k, v]) => (
            <option key={k} value={k}>{v.label}</option>
          ))}
        </select>
        <select style={adminInput} value={plan} onChange={(e) => setPlan(e.target.value)}>
          <option value="all">Todos planos</option>
          {plans.map((p) => <option key={p}>{p}</option>)}
        </select>
      </div>

      <div style={{ ...adminCard, padding: 0, overflow: "hidden" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr style={{ background: "#0F0F13", color: "rgba(255,255,255,0.55)", fontSize: 11, textTransform: "uppercase", letterSpacing: "0.05em" }}>
              <th style={th}>Usuário</th>
              <th style={th}>Workspace</th>
              <th style={th}>Plano</th>
              <th style={th}>Role</th>
              <th style={th}>Criado</th>
              <th style={th}>Ações</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((u) => {
              const meta = ROLE_META[u.role];
              return (
                <tr key={u.id} style={{ borderTop: "1px solid #1F1F23" }}>
                  <td style={td}>
                    <div style={{ fontWeight: 500 }}>{u.name}</div>
                    <div style={{ fontSize: 12, color: "rgba(255,255,255,0.5)" }}>{u.email}</div>
                  </td>
                  <td style={td}>{u.workspace}</td>
                  <td style={td}>{u.plan}</td>
                  <td style={td}>
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
                  </td>
                  <td style={{ ...td, color: "rgba(255,255,255,0.6)" }}>
                    {new Date(u.created_at).toLocaleDateString("pt-BR")}
                  </td>
                  <td style={td}>
                    <button
                      style={adminBtn}
                      className="inline-flex items-center gap-1"
                      onClick={() => {
                        if (confirm(`Impersonar ${u.email}?`)) {
                          toast.success(`Sessão de impersonação iniciada para ${u.email}`);
                        }
                      }}
                    >
                      <UserCog size={12} /> Impersonar
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const th: React.CSSProperties = { padding: "10px 12px", textAlign: "left", fontWeight: 500 };
const td: React.CSSProperties = { padding: "12px" };
