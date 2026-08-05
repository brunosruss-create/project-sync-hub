import * as React from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Plus, Loader2, Plug } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge, type BadgeVariant } from "@/components/ui/badge";
import { EmptyState } from "@/components/empty-state";
import {
  listSocialAccounts,
  getSocialConnectUrl,
  disconnectSocialAccount,
} from "@/lib/social-publishing.functions";
import { PLATFORM_LABELS, type SocialPlatform } from "@/lib/social-post-validation";
import { ConfirmDialog } from "@/components/confirm-dialog";

export const Route = createFileRoute("/_authenticated/social/accounts" as any)({
  component: SocialAccountsPage,
});

const STATUS_VARIANT: Record<string, BadgeVariant> = {
  connected: "success",
  expired: "danger",
  disconnected: "neutral",
  connecting: "warning",
};

const STATUS_LABEL: Record<string, string> = {
  connected: "Conectado",
  expired: "Token expirado",
  disconnected: "Desconectado",
  connecting: "Conectando",
};

const PLATFORMS: SocialPlatform[] = ["facebook", "instagram", "tiktok", "youtube"];

function SocialAccountsPage() {
  const qc = useQueryClient();
  const listFn = useServerFn(listSocialAccounts);
  const connectFn = useServerFn(getSocialConnectUrl);
  const disconnectFn = useServerFn(disconnectSocialAccount);

  const q = useQuery({
    queryKey: ["social-accounts"],
    queryFn: () => listFn(),
  });

  const [loadingPlatform, setLoadingPlatform] = React.useState<string | null>(null);
  const [confirmDisconnect, setConfirmDisconnect] = React.useState<string | null>(null);

  const connect = useMutation({
    mutationFn: async (platform: SocialPlatform) => {
      setLoadingPlatform(platform);
      return connectFn({ data: { platform } });
    },
    onSuccess: (r: any) => {
      if (r?.authUrl) window.location.href = r.authUrl;
      else { toast.error("Não foi possível iniciar a conexão."); setLoadingPlatform(null); }
    },
    onError: (e: any) => { toast.error(e?.message ?? "Falha ao conectar."); setLoadingPlatform(null); },
  });

  const disconnect = useMutation({
    mutationFn: (id: string) => disconnectFn({ data: { connectionId: id } }),
    onSuccess: () => {
      toast.success("Conta desconectada.");
      setConfirmDisconnect(null);
      qc.invalidateQueries({ queryKey: ["social-accounts"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Falha ao desconectar."),
  });

  const accounts = q.data?.accounts ?? [];

  return (
    <div className="flex flex-col" style={{ gap: 16 }}>
      <div>
        <h1 style={{ fontSize: 22, fontWeight: 600, letterSpacing: "-0.015em" }}>
          Contas Sociais
        </h1>
        <p style={{ marginTop: 2, fontSize: 12, color: "var(--text-muted)" }}>
          Conecte suas contas pra publicar posts pelo ZapFlow.
        </p>
      </div>

      {/* Botões de conexão por plataforma */}
      <Card style={{ padding: 16 }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text-muted)", marginBottom: 10, textTransform: "uppercase", letterSpacing: "0.04em" }}>
          Conectar nova conta
        </div>
        <div className="flex flex-wrap" style={{ gap: 8 }}>
          {PLATFORMS.map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => connect.mutate(p)}
              disabled={loadingPlatform === p}
              className="inline-flex items-center"
              style={{
                gap: 6,
                height: 34,
                padding: "0 14px",
                borderRadius: "var(--radius-pill)",
                border: "1px solid var(--border-strong)",
                background: "var(--bg-surface)",
                color: "var(--text-primary)",
                fontSize: 13,
                fontWeight: 500,
                cursor: "pointer",
              }}
            >
              {loadingPlatform === p ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
              {PLATFORM_LABELS[p]}
            </button>
          ))}
        </div>
      </Card>

      {/* Lista de contas conectadas */}
      {q.isLoading ? (
        <div style={{ padding: 24, textAlign: "center", color: "var(--text-muted)" }}>
          Carregando...
        </div>
      ) : accounts.length === 0 ? (
        <EmptyState
          icon={<Plug size={40} style={{ color: "var(--brand-400)" }} aria-hidden />}
          title="Nenhuma conta conectada"
          description="Clique em um dos botões acima pra conectar via OAuth."
        />
      ) : (
        <div className="flex flex-col" style={{ gap: 8 }}>
          {accounts.map((a: any) => (
            <Card key={a.id} style={{ padding: 14 }}>
              <div className="flex items-center justify-between">
                <div className="flex items-center" style={{ gap: 10 }}>
                  <span style={{ fontSize: 14, fontWeight: 500 }}>
                    {PLATFORM_LABELS[a.platform as SocialPlatform] ?? a.platform}
                  </span>
                  {a.account_name && (
                    <span style={{ fontSize: 12, color: "var(--text-muted)" }}>
                      {a.account_name}
                    </span>
                  )}
                  <Badge variant={STATUS_VARIANT[a.status] ?? "neutral"} withDot>
                    {STATUS_LABEL[a.status] ?? a.status}
                  </Badge>
                </div>
                <div className="flex items-center" style={{ gap: 6 }}>
                  {a.status === "expired" && (
                    <button
                      type="button"
                      onClick={() => connect.mutate(a.platform)}
                      className="inline-flex items-center"
                      style={{
                        gap: 4,
                        height: 28,
                        padding: "0 10px",
                        borderRadius: "var(--radius-pill)",
                        background: "var(--brand-400)",
                        color: "#fff",
                        fontSize: 12,
                        fontWeight: 500,
                        border: "none",
                        cursor: "pointer",
                      }}
                    >
                      Reconectar
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setConfirmDisconnect(a.id)}
                    style={{
                      height: 28,
                      padding: "0 10px",
                      borderRadius: "var(--radius-pill)",
                      border: "1px solid var(--border)",
                      background: "transparent",
                      color: "var(--text-muted)",
                      fontSize: 12,
                      cursor: "pointer",
                    }}
                  >
                    Desconectar
                  </button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      <ConfirmDialog
        open={!!confirmDisconnect}
        onClose={() => setConfirmDisconnect(null)}
        onConfirm={() => { if (confirmDisconnect) disconnect.mutate(confirmDisconnect); }}
        title="Desconectar conta?"
        description="Posts já publicados serão mantidos no histórico. Novos posts não poderão usar esta conta."
        confirmLabel="Desconectar"
        destructive
      />
    </div>
  );
}
