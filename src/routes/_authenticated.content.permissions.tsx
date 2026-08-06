import * as React from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ShieldCheck } from "lucide-react";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/empty-state";
import { getMyContentPermissions } from "@/lib/content-permissions.functions";

export const Route = createFileRoute("/_authenticated/content/permissions")({
  component: ContentPermissionsPage,
});

const ACTION_LABELS: Record<string, string> = {
  brand_edit: "Editar o Brand Kit",
  brief_create: "Criar briefs",
  asset_approve: "Aprovar posts gerados",
  publish_immediate: "Publicar imediatamente",
  ai_image_optin: "Usar geração de imagem por IA",
};

function ContentPermissionsPage() {
  const getFn = useServerFn(getMyContentPermissions);
  const q = useQuery({ queryKey: ["content-perms"], queryFn: () => getFn() });

  const perms = q.data?.permissions;

  if (!perms) {
    return (
      <EmptyState
        icon={<ShieldCheck size={32} />}
        title="Carregando permissões..."
        description=""
      />
    );
  }

  return (
    <div className="flex flex-col" style={{ gap: 16, maxWidth: 640 }}>
      <Card style={{ padding: 16 }}>
        <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 12 }}>
          Suas permissões neste workspace
        </div>
        <p style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 16 }}>
          {q.data?.isManager
            ? "Você é Manager. Tem acesso total ao módulo de Conteúdo IA."
            : "Você é Agent. Fale com o Manager para liberar mais ações se precisar."}
        </p>
        <div className="flex flex-col" style={{ gap: 10 }}>
          {Object.entries(perms).map(([key, value]) => (
            <div
              key={key}
              className="flex items-center justify-between"
              style={{
                padding: "10px 14px",
                background: "var(--surface-2)",
                borderRadius: "var(--radius-control)",
              }}
            >
              <span style={{ fontSize: 13 }}>{ACTION_LABELS[key] ?? key}</span>
              <span
                style={{
                  fontSize: 11,
                  fontWeight: 600,
                  color: value ? "var(--success, #059669)" : "var(--text-muted)",
                }}
              >
                {value ? "Permitido" : "Bloqueado"}
              </span>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
