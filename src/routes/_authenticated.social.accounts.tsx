import * as React from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Plus, Loader2, Share2, FileText, Settings2, Facebook, Instagram, Youtube, Music2, Sparkles, Palette } from "lucide-react";
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
import { ManagerOnly } from "@/components/manager-only";

export const Route = createFileRoute("/_authenticated/social/accounts")({
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

const PLATFORM_ICON: Record<SocialPlatform, React.ReactNode> = {
  facebook: <Facebook size={20} />,
  instagram: <Instagram size={20} />,
  tiktok: <Music2 size={20} />,
  youtube: <Youtube size={20} />,
};

const PLATFORM_COLOR: Record<SocialPlatform, string> = {
  facebook: "#1877F2",
  instagram: "#E1306C",
  tiktok: "#000000",
  youtube: "#FF0000",
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

  // Reset do loading quando a página volta ao foco. Cobre o caso do usuário
  // clicar Conectar (que dispara redirect via window.location) e cancelar o
  // OAuth — o browser restaura a página do bfcache mantendo o estado antigo,
  // deixando o botão eternamente em spinner. pageshow dispara tanto no load
  // normal quanto na restauração do cache.
  React.useEffect(() => {
    const reset = () => setLoadingPlatform(null);
    window.addEventListener("pageshow", reset);
    return () => window.removeEventListener("pageshow", reset);
  }, []);

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
  const hasConnected = accounts.some((a: any) => a.status === "connected");

  return (
    <div className="flex flex-col" style={{ gap: 16 }}>
      {/* Header com navegação contextual */}
      <div className="flex flex-wrap items-center justify-between" style={{ gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 600, letterSpacing: "-0.015em" }}>
            Publicações
          </h1>
          <p style={{ marginTop: 2, fontSize: 12, color: "var(--text-muted)" }}>
            Publique nas redes sociais direto do ZapFlow.
          </p>
        </div>
        {/* Sub-navegação: só mostra Posts/Compor se tem pelo menos 1 conta */}
        {hasConnected && (
          <div className="flex items-center" style={{ gap: 6 }}>
            <Link
              to="/content/compose"
              className="inline-flex items-center"
              style={{
                gap: 6,
                height: 32,
                padding: "0 14px",
                borderRadius: "var(--radius-pill)",
                border: "1px solid var(--brand-400)",
                background: "color-mix(in oklab, var(--brand-400) 10%, transparent)",
                color: "var(--brand-400)",
                fontSize: 13,
                fontWeight: 600,
                textDecoration: "none",
              }}
            >
              <Sparkles size={14} />
              Gerar com IA
            </Link>
            <Link
              to="/social/posts"
              className="inline-flex items-center"
              style={{
                gap: 6,
                height: 32,
                padding: "0 14px",
                borderRadius: "var(--radius-pill)",
                border: "1px solid var(--border-strong)",
                background: "transparent",
                color: "var(--text-primary)",
                fontSize: 13,
                fontWeight: 500,
                textDecoration: "none",
              }}
            >
              <FileText size={14} />
              Meus Posts
            </Link>
            <Link
              to="/social/compose"
              className="btn-primary"
              style={{ textDecoration: "none" }}
            >
              <Plus size={14} />
              Novo Post
            </Link>
          </div>
        )}
      </div>

      {/* Sub-nav de módulo — só quando tem conta conectada */}
      {hasConnected && (
        <div
          className="flex flex-wrap"
          style={{ gap: 4, borderBottom: "1px solid var(--border)", paddingBottom: 8 }}
        >
          <SubNavLink to="/social/accounts" icon={<Share2 size={12} />} label="Contas" active />
          <SubNavLink to="/content/assets" icon={<Sparkles size={12} />} label="Posts com IA" />
          <SubNavLink to="/content/brand" icon={<Palette size={12} />} label="Identidade visual" />
        </div>
      )}

      {/* Cards de integração — sempre visíveis, são a porta de entrada */}
      <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.04em" }}>
        Integrações
      </div>

      <div
        className="grid"
        style={{
          gridTemplateColumns: "repeat(auto-fill, minmax(min(260px, 100%), 1fr))",
          gap: 12,
        }}
      >
        {PLATFORMS.map((platform) => {
          const connected = accounts.filter(
            (a: any) => a.platform === platform && a.status === "connected",
          );
          const expired = accounts.filter(
            (a: any) => a.platform === platform && a.status === "expired",
          );
          const isConnected = connected.length > 0;
          const isExpired = expired.length > 0 && !isConnected;
          const isLoading = loadingPlatform === platform;
          const account = connected[0] ?? expired[0];

          return (
            <Card key={platform} style={{ padding: 20 }}>
              <div className="flex items-center" style={{ gap: 12, marginBottom: 14 }}>
                <div
                  className="flex items-center justify-center"
                  style={{
                    width: 40,
                    height: 40,
                    borderRadius: "var(--radius-pill)",
                    background: `color-mix(in oklab, ${PLATFORM_COLOR[platform]} 12%, transparent)`,
                    color: PLATFORM_COLOR[platform],
                  }}
                >
                  {PLATFORM_ICON[platform]}
                </div>
                <div>
                  <div style={{ fontSize: 15, fontWeight: 600 }}>
                    {PLATFORM_LABELS[platform]}
                  </div>
                  {account && (
                    <div style={{ fontSize: 12, color: "var(--text-muted)" }}>
                      {(account as any).account_name ?? "Conta conectada"}
                    </div>
                  )}
                </div>
              </div>

              {isConnected ? (
                <div className="flex items-center justify-between">
                  <Badge variant="success" withDot>Conectado</Badge>
                  <button
                    type="button"
                    onClick={() => setConfirmDisconnect((account as any).id)}
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
              ) : isExpired ? (
                <div className="flex items-center justify-between">
                  <Badge variant="danger" withDot>Token expirado</Badge>
                  <button
                    type="button"
                    onClick={() => connect.mutate(platform)}
                    disabled={isLoading}
                    className="btn-primary"
                    style={{ height: 28, fontSize: 12 }}
                  >
                    {isLoading ? "Abrindo..." : "Reconectar"}
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => connect.mutate(platform)}
                  disabled={isLoading}
                  className="inline-flex items-center"
                  style={{
                    gap: 6,
                    width: "100%",
                    height: 36,
                    justifyContent: "center",
                    borderRadius: "var(--radius-pill)",
                    border: "1px solid var(--border-strong)",
                    background: "var(--bg-surface)",
                    color: "var(--text-primary)",
                    fontSize: 13,
                    fontWeight: 500,
                    cursor: "pointer",
                  }}
                >
                  {isLoading ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
                  Conectar
                </button>
              )}
            </Card>
          );
        })}
      </div>

      {/* Orientação quando não tem conta */}
      {!hasConnected && !q.isLoading && (
        <Card
          style={{
            padding: 24,
            textAlign: "center",
            background: "color-mix(in oklab, var(--brand-400) 4%, var(--bg-surface))",
            border: "1px dashed var(--border-strong)",
          }}
        >
          <Share2 size={32} style={{ color: "var(--brand-400)", margin: "0 auto 12px" }} />
          <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 4 }}>
            Conecte uma rede social pra começar
          </div>
          <div style={{ fontSize: 13, color: "var(--text-muted)", maxWidth: 400, margin: "0 auto" }}>
            Após conectar pelo menos uma conta acima, você poderá criar, agendar e publicar
            posts diretamente pelo ZapFlow.
          </div>
        </Card>
      )}

      {/* Link pra permissões (só Manager) */}
      {hasConnected && (
        <div style={{ marginTop: 8 }}>
          <Link
            to="/social/permissions"
            className="inline-flex items-center"
            style={{
              gap: 6,
              fontSize: 12,
              color: "var(--text-muted)",
              textDecoration: "none",
            }}
          >
            <Settings2 size={14} />
            Configurar permissões da equipe
          </Link>
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

function SubNavLink({
  to,
  label,
  icon,
  active = false,
}: {
  to: string;
  label: string;
  icon: React.ReactNode;
  active?: boolean;
}) {
  return (
    <Link
      to={to}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        padding: "6px 12px",
        borderRadius: "var(--radius-pill)",
        fontSize: 12,
        color: active ? "var(--text-primary)" : "var(--text-muted)",
        border: `1px solid ${active ? "var(--border)" : "transparent"}`,
        background: active ? "var(--bg-overlay)" : "transparent",
        textDecoration: "none",
      }}
    >
      {icon}
      {label}
    </Link>
  );
}
