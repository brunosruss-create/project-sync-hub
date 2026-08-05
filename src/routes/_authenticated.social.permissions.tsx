import * as React from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { ManagerOnly } from "@/components/manager-only";
import {
  getPublishingPermissionsConfig,
  updatePublishingPermissions,
} from "@/lib/social-permissions.server";

export const Route = createFileRoute("/_authenticated/social/permissions" as any)({
  component: () => (
    <ManagerOnly>
      <SocialPermissionsPage />
    </ManagerOnly>
  ),
});

const ACTION_LABELS: Record<string, string> = {
  create_edit_draft: "Criar/editar rascunhos",
  connect_account: "Conectar/desconectar contas",
  schedule: "Agendar publicações",
  publish_now: "Publicar imediatamente",
};

const ACTIONS = ["create_edit_draft", "connect_account", "schedule", "publish_now"] as const;

function SocialPermissionsPage() {
  const qc = useQueryClient();
  const getFn = useServerFn(getPublishingPermissionsConfig);
  const updateFn = useServerFn(updatePublishingPermissions);

  const q = useQuery({
    queryKey: ["social-permissions"],
    queryFn: () => getFn(),
  });

  const defaults = q.data?.defaults ?? { manager: {}, agent: {} };
  const overrides = q.data?.overrides ?? [];

  // Estado local para edição dos overrides de papel
  const roleAgent = overrides.find((o: any) => o.scope === "role" && o.role === "agent");
  const [agentPerms, setAgentPerms] = React.useState<Record<string, boolean> | null>(null);

  React.useEffect(() => {
    if (roleAgent) {
      setAgentPerms({
        create_edit_draft: roleAgent.create_edit_draft,
        connect_account: roleAgent.connect_account,
        schedule: roleAgent.schedule,
        publish_now: roleAgent.publish_now,
      });
    } else {
      setAgentPerms((defaults as any).agent ?? { create_edit_draft: true, connect_account: false, schedule: false, publish_now: false });
    }
  }, [q.data]);

  const saveAgentPerms = async () => {
    if (!agentPerms) return;
    try {
      await updateFn({
        data: {
          scope: "role",
          targetId: "agent",
          permissions: agentPerms as any,
        },
      });
      toast.success("Permissões atualizadas.");
      qc.invalidateQueries({ queryKey: ["social-permissions"] });
    } catch (e: any) {
      toast.error(e?.message ?? "Falha ao salvar.");
    }
  };

  return (
    <div className="flex flex-col" style={{ gap: 16 }}>
      <div>
        <h1 style={{ fontSize: 22, fontWeight: 600, letterSpacing: "-0.015em" }}>
          Permissões de Publicação
        </h1>
        <p style={{ marginTop: 2, fontSize: 12, color: "var(--text-muted)" }}>
          Configure o que cada papel pode fazer no módulo de publicações.
        </p>
      </div>

      <Card style={{ padding: 20 }}>
        <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>Managers</div>
        <p style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 12 }}>
          Managers têm todas as permissões liberadas por padrão e não podem ter restrições nesta tela.
        </p>
        <div className="flex flex-wrap" style={{ gap: 8 }}>
          {ACTIONS.map((a) => (
            <span
              key={a}
              style={{
                fontSize: 12,
                padding: "4px 10px",
                borderRadius: "var(--radius-pill)",
                background: "color-mix(in oklab, var(--success) 14%, transparent)",
                color: "var(--success)",
                fontWeight: 500,
              }}
            >
              ✓ {ACTION_LABELS[a]}
            </span>
          ))}
        </div>
      </Card>

      <Card style={{ padding: 20 }}>
        <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>Agentes</div>
        <p style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 12 }}>
          Configure quais ações os agentes podem executar no módulo de publicações.
        </p>
        {agentPerms && (
          <div className="flex flex-col" style={{ gap: 10 }}>
            {ACTIONS.map((a) => (
              <label key={a} className="flex items-center" style={{ gap: 10, cursor: "pointer" }}>
                <input
                  type="checkbox"
                  checked={!!agentPerms[a]}
                  onChange={(e) => setAgentPerms((prev) => prev ? { ...prev, [a]: e.target.checked } : prev)}
                />
                <span style={{ fontSize: 13 }}>{ACTION_LABELS[a]}</span>
              </label>
            ))}
            <button
              type="button"
              onClick={saveAgentPerms}
              className="btn-primary"
              style={{ alignSelf: "flex-start", marginTop: 8 }}
            >
              Salvar permissões
            </button>
          </div>
        )}
      </Card>
    </div>
  );
}
