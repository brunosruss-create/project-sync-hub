import * as React from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Search, MoreVertical } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  setUserRole,
  setUserBlocked,
  resetUserPassword,
} from "@/lib/super-admin-actions.functions";
import { adminCard, adminInput } from "./_authenticated.super-admin";

export const Route = createFileRoute("/_authenticated/super-admin/users")({
  component: UsersAdmin,
});

type Role = "super_admin" | "manager" | "agent" | null;
type User = {
  user_id: string;
  email: string | null;
  full_name: string | null;
  created_at: string;
  role: Role;
  workspace_owner_id: string | null;
  workspace_owner_email: string | null;
  is_blocked: boolean;
};

const ROLE_META: Record<NonNullable<Role>, { label: string; color: string }> = {
  super_admin: { label: "Super Admin", color: "#7C3AED" },
  manager: { label: "Manager", color: "#10B981" },
  agent: { label: "Agente", color: "#F59E0B" },
};

function UsersAdmin() {
  const [search, setSearch] = React.useState("");
  const [workspace, setWorkspace] = React.useState("all");
  const [role, setRole] = React.useState<"all" | NonNullable<Role>>("all");

  const { data: items = [], isLoading, error } = useQuery({
    queryKey: ["admin", "users"],
    queryFn: async (): Promise<User[]> => {
      const { data, error } = await supabase.rpc("admin_list_users");
      if (error) throw error;
      return (data ?? []) as User[];
    },
  });

  const workspaces = Array.from(
    new Set(items.map((u) => u.workspace_owner_email).filter(Boolean) as string[]),
  );

  const filtered = items.filter((u) => {
    if (workspace !== "all" && u.workspace_owner_email !== workspace) return false;
    if (role !== "all" && u.role !== role) return false;
    if (search && !`${u.full_name ?? ""} ${u.email ?? ""}`.toLowerCase().includes(search.toLowerCase()))
      return false;
    return true;
  });

  return (
    <div className="flex flex-col" style={{ gap: 16 }}>
      <div>
        <h2 style={{ fontSize: 20, fontWeight: 600 }}>Usuários</h2>
        <p style={{ fontSize: 13, color: "rgba(255,255,255,0.5)", marginTop: 4 }}>
          {isLoading
            ? "Carregando…"
            : `${filtered.length} de ${items.length} usuários da plataforma.`}
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
      </div>

      {error ? (
        <div style={{ ...adminCard, color: "#F87171" }}>
          Erro ao carregar usuários: {(error as Error).message}
        </div>
      ) : (
        <div style={{ ...adminCard, padding: 0, overflow: "hidden" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ background: "#0F0F13", color: "rgba(255,255,255,0.55)", fontSize: 11, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                <th style={th}>Usuário</th>
                <th style={th}>Workspace</th>
                <th style={th}>Role</th>
                <th style={th}>Criado</th>
                <th style={th}>Ações</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && !isLoading ? (
                <tr>
                  <td colSpan={5} style={{ padding: 24, textAlign: "center", color: "rgba(255,255,255,0.5)" }}>
                    Nenhum usuário encontrado.
                  </td>
                </tr>
              ) : (
                filtered.map((u) => <UserRow key={u.user_id} u={u} />)
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function UserRow({ u }: { u: User }) {
  const qc = useQueryClient();
  const [open, setOpen] = React.useState(false);
  const meta = u.role ? ROLE_META[u.role] : { label: "—", color: "#6B7280" };
  const roleFn = useServerFn(setUserRole);
  const blockFn = useServerFn(setUserBlocked);
  const resetFn = useServerFn(resetUserPassword);

  const refresh = () => qc.invalidateQueries({ queryKey: ["admin", "users"] });

  const handleRole = async (r: "super_admin" | "manager" | "agent") => {
    setOpen(false);
    try {
      await roleFn({ data: { userId: u.user_id, role: r } });
      toast.success(`Role atualizado para ${ROLE_META[r].label}`);
      refresh();
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const handleReset = async () => {
    setOpen(false);
    if (!confirm(`Enviar email de redefinição de senha para ${u.email}?`)) return;
    try {
      await resetFn({ data: { userId: u.user_id } });
      toast.success(`Email enviado para ${u.email}`);
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const handleBlock = async () => {
    setOpen(false);
    const blocking = !u.is_blocked;
    if (blocking && !confirm(`Bloquear acesso de ${u.full_name ?? u.email}?`)) return;
    try {
      await blockFn({ data: { userId: u.user_id, blocked: blocking } });
      toast.success(blocking ? "Usuário bloqueado" : "Usuário desbloqueado");
      refresh();
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  return (
    <tr style={{ borderTop: "1px solid #1F1F23", opacity: u.is_blocked ? 0.55 : 1 }}>
      <td style={td}>
        <div style={{ fontWeight: 500, display: "flex", gap: 6, alignItems: "center" }}>
          {u.full_name ?? "—"}
          {u.is_blocked && (
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
        <div style={{ fontSize: 12, color: "rgba(255,255,255,0.5)" }}>{u.email ?? "—"}</div>
      </td>
      <td style={td}>{u.workspace_owner_email ?? "—"}</td>
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
        <div style={{ position: "relative" }}>
          <button
            onClick={() => setOpen((s) => !s)}
            aria-label="Ações"
            style={{
              width: 28,
              height: 28,
              borderRadius: 6,
              background: "transparent",
              border: "1px solid #1F1F23",
              color: "#fff",
              cursor: "pointer",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <MoreVertical size={14} />
          </button>
          {open && (
            <>
              <div
                onClick={() => setOpen(false)}
                style={{ position: "fixed", inset: 0, zIndex: 60 }}
              />
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
                  {u.is_blocked ? "Desbloquear" : "Bloquear acesso"}
                </button>
              </div>
            </>
          )}
        </div>
      </td>
    </tr>
  );
}

const th: React.CSSProperties = { padding: "10px 12px", textAlign: "left", fontWeight: 500 };
const td: React.CSSProperties = { padding: "12px" };
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
