import * as React from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Search, Eye, PauseCircle, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { InspectWorkspaceDrawer } from "@/features/super-admin/inspect-workspace-drawer";
import {
  adminCard,
  adminInput,
  adminBtnGhost,
  adminBtnDanger,
} from "./_authenticated.super-admin";

export const Route = createFileRoute("/_authenticated/super-admin/workspaces")({
  component: WorkspacesAdmin,
});

const WHATSAPP_STATUS_VARIANT: Record<"connected" | "disconnected", "success" | "neutral"> = {
  connected: "success",
  disconnected: "neutral",
};

type Workspace = {
  workspace_owner_id: string;
  owner_email: string | null;
  owner_name: string | null;
  created_at: string;
  user_count: number;
  contact_count: number;
  has_whatsapp: boolean;
};

function WorkspacesAdmin() {
  const [search, setSearch] = React.useState("");
  const [status, setStatus] = React.useState<"all" | "active" | "inactive">("all");
  const [inspectId, setInspectId] = React.useState<string | null>(null);

  const { data: items = [], isLoading, error } = useQuery({
    queryKey: ["admin", "workspaces"],
    queryFn: async (): Promise<Workspace[]> => {
      const { data, error } = await supabase.rpc("admin_list_workspaces");
      if (error) throw error;
      return (data ?? []) as Workspace[];
    },
  });

  const filtered = items.filter((w) => {
    const isActive = w.has_whatsapp;
    if (status === "active" && !isActive) return false;
    if (status === "inactive" && isActive) return false;
    if (search) {
      const hay = `${w.owner_name ?? ""} ${w.owner_email ?? ""}`.toLowerCase();
      if (!hay.includes(search.toLowerCase())) return false;
    }
    return true;
  });

  return (
    <div className="flex flex-col" style={{ gap: 16 }}>
      <div>
        <h2 style={{ fontSize: 20, fontWeight: 600 }}>Workspaces</h2>
        <p style={{ fontSize: 13, color: "var(--text-muted)", marginTop: 4 }}>
          {isLoading ? "Carregando…" : `${filtered.length} de ${items.length} workspaces`}
        </p>
      </div>

      <div className="flex gap-2 flex-wrap">
        <div className="flex items-center gap-2 flex-1" style={{ minWidth: 240, ...adminInput, padding: "0 10px" }}>
          <Search size={14} style={{ color: "var(--text-muted)" }} />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por nome ou email…"
            style={{
              flex: 1,
              border: 0,
              background: "transparent",
              color: "var(--text-primary)",
              fontSize: 13,
              outline: 0,
            }}
          />
        </div>
        <select style={adminInput} value={status} onChange={(e) => setStatus(e.target.value as never)}>
          <option value="all">Todos os status</option>
          <option value="active">Com WhatsApp conectado</option>
          <option value="inactive">Sem WhatsApp</option>
        </select>
      </div>

      {error ? (
        <div style={{ ...adminCard, color: "#F87171" }}>
          Erro ao carregar workspaces: {(error as Error).message}
        </div>
      ) : (
        <div style={{ ...adminCard, padding: 0, overflow: "hidden" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ background: "var(--bg-overlay)", color: "var(--text-muted)", fontSize: 11, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                <Th>Dono</Th>
                <Th>Email</Th>
                <Th>Usuários</Th>
                <Th>Contatos</Th>
                <Th>WhatsApp</Th>
                <Th>Criado em</Th>
                <Th>Ações</Th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && !isLoading ? (
                <tr>
                  <td colSpan={7} style={{ padding: 24, textAlign: "center", color: "var(--text-muted)" }}>
                    Nenhum workspace encontrado.
                  </td>
                </tr>
              ) : (
                filtered.map((w) => (
                  <tr key={w.workspace_owner_id} style={{ borderTop: "1px solid var(--border)" }}>
                    <Td style={{ fontWeight: 500 }}>{w.owner_name ?? "—"}</Td>
                    <Td style={{ color: "var(--text-muted)" }}>{w.owner_email ?? "—"}</Td>
                    <Td>{w.user_count}</Td>
                    <Td>{Number(w.contact_count).toLocaleString("pt-BR")}</Td>
                    <Td>
                      {w.has_whatsapp ? (
                        <Badge variant={WHATSAPP_STATUS_VARIANT.connected}>
                          Conectado
                        </Badge>
                      ) : (
                        "—"
                      )}
                    </Td>
                    <Td style={{ color: "var(--text-muted)" }}>
                      {new Date(w.created_at).toLocaleDateString("pt-BR")}
                    </Td>
                    <Td>
                      <div className="flex items-center gap-1">
                        <button style={adminBtnGhost} onClick={() => setInspectId(w.workspace_owner_id)}>
                          <Eye size={12} />
                        </button>
                        <button style={adminBtnGhost} onClick={() => toast("Use o drawer → Configurações para suspender")}>
                          <PauseCircle size={12} />
                        </button>
                        <button style={adminBtnDanger} onClick={() => toast("Use o drawer → Configurações para deletar")}>
                          <Trash2 size={12} />
                        </button>
                      </div>
                    </Td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}
      <InspectWorkspaceDrawer ownerId={inspectId} onClose={() => setInspectId(null)} />
    </div>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return <th style={{ padding: "10px 12px", textAlign: "left", fontWeight: 500 }}>{children}</th>;
}
function Td({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return <td style={{ padding: "12px", ...style }}>{children}</td>;
}
