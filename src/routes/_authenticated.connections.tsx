import * as React from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  Plus,
  Loader2,
  RefreshCw,
  AlertTriangle,
  Facebook,
  Instagram,
  Youtube,
  Music2,
  MessageSquare,
  Share2,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge, type BadgeVariant } from "@/components/ui/badge";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { ManagerOnly } from "@/components/manager-only";
import {
  getInstance,
  connectInstance,
  disconnectInstance,
} from "@/lib/evolution.functions";
import {
  getZernioConnectUrl,
  listZernioAccounts,
  disconnectZernioAccount,
} from "@/lib/zernio.functions";
import {
  listSocialAccounts,
  getSocialConnectUrl,
  disconnectSocialAccount,
} from "@/lib/social-publishing.functions";
import { PLATFORM_LABELS, type SocialPlatform } from "@/lib/social-post-validation";

export const Route = createFileRoute("/_authenticated/connections")({
  component: () => (
    <ManagerOnly>
      <ConnectionsPage />
    </ManagerOnly>
  ),
});

// ============================================================
// Componente principal
// ============================================================

function ConnectionsPage() {
  return (
    <div className="flex flex-col" style={{ gap: 24 }}>
      <div>
        <h1 style={{ fontSize: 22, fontWeight: 600, letterSpacing: "-0.015em" }}>
          Conexões
        </h1>
        <p style={{ marginTop: 2, fontSize: 12, color: "var(--text-muted)" }}>
          Gerencie todos os canais conectados ao seu ZapFlow.
        </p>
      </div>

      {/* Seção: Mensageria */}
      <MessagingSection />

      {/* Seção: Publicação em redes sociais */}
      <PublishingSection />
    </div>
  );
}

// ============================================================
// Seção de Mensageria (WhatsApp QR + Cloud + Instagram DM)
// ============================================================

function MessagingSection() {
  const qc = useQueryClient();
  const fetchInstance = useServerFn(getInstance);
  const doConnect = useServerFn(connectInstance);
  const doDisconnect = useServerFn(disconnectInstance);
  const fetchZernioAccounts = useServerFn(listZernioAccounts);
  const doZernioConnect = useServerFn(getZernioConnectUrl);
  const doZernioDisconnect = useServerFn(disconnectZernioAccount);

  const { data: evoData } = useQuery({
    queryKey: ["whatsapp-instance"],
    queryFn: () => fetchInstance({ data: undefined as never }),
    refetchOnWindowFocus: false,
  });

  const { data: zernioData } = useQuery({
    queryKey: ["zernio-accounts"],
    queryFn: () => fetchZernioAccounts({ data: undefined as never }),
    refetchOnWindowFocus: false,
  });

  const instance = evoData?.instance ?? null;
  const evoStatus = (instance?.status as string) ?? "disconnected";
  const zernioAccounts: any[] = zernioData?.accounts ?? [];

  const [confirmDcEvo, setConfirmDcEvo] = React.useState(false);
  const [loadingZernio, setLoadingZernio] = React.useState<string | null>(null);

  const connectEvo = useMutation({
    mutationFn: () => doConnect({ data: undefined as never }),
    onSuccess: () => {
      toast.success("Escaneie o QR Code em Configurações → WhatsApp");
      qc.invalidateQueries({ queryKey: ["whatsapp-instance"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Falha"),
  });

  const disconnectEvo = useMutation({
    mutationFn: () => doDisconnect({ data: undefined as never }),
    onSuccess: () => {
      toast.success("WhatsApp QR desconectado.");
      setConfirmDcEvo(false);
      qc.invalidateQueries({ queryKey: ["whatsapp-instance"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Falha"),
  });

  const connectZernio = useMutation({
    mutationFn: (platform: "whatsapp" | "instagram") => {
      setLoadingZernio(platform);
      return doZernioConnect({ data: { platform } });
    },
    onSuccess: (r: any) => {
      if (r?.authUrl) window.location.href = r.authUrl;
      else { toast.error("Não foi possível iniciar."); setLoadingZernio(null); }
    },
    onError: (e: any) => { toast.error(e?.message ?? "Falha"); setLoadingZernio(null); },
  });

  const disconnectZernio = useMutation({
    mutationFn: (platform: "whatsapp" | "instagram") => doZernioDisconnect({ data: { platform } }),
    onSuccess: () => {
      toast.success("Canal desconectado.");
      qc.invalidateQueries({ queryKey: ["zernio-accounts"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Falha"),
  });

  const waCloud = zernioAccounts.find((a) => a.platform === "whatsapp");
  const igDm = zernioAccounts.find((a) => a.platform === "instagram");

  return (
    <section>
      <div className="flex items-center" style={{ gap: 8, marginBottom: 12 }}>
        <MessageSquare size={16} style={{ color: "var(--text-muted)" }} />
        <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.04em" }}>
          Mensageria
        </span>
      </div>

      <div className="flex flex-col" style={{ gap: 12 }}>
        {/* WhatsApp QR (Evolution) */}
        <ConnectionCard
          icon={<WhatsAppIcon />}
          title="WhatsApp (QR Code)"
          subtitle={instance?.phone_number ?? "Conexão via leitura de QR Code"}
          badge={evoStatus === "connected" ? "connected" : evoStatus === "pending" ? "pending" : "disconnected"}
          isUnofficial
          meta={evoStatus === "connected" ? [
            { label: "Número", value: instance?.phone_number ?? "—" },
            { label: "Nome do perfil", value: instance?.profile_name ?? "—" },
            { label: "Conectado em", value: instance?.last_connected_at ? new Date(instance.last_connected_at).toLocaleString("pt-BR") : "—" },
          ] : undefined}
          action={
            evoStatus === "connected" ? (
              <button
                type="button"
                onClick={() => setConfirmDcEvo(true)}
                style={dangerOutlineBtn}
              >
                Desconectar
              </button>
            ) : (
              <button
                type="button"
                onClick={() => connectEvo.mutate()}
                disabled={connectEvo.isPending}
                className="btn-primary"
                style={{ height: 32, fontSize: 12 }}
              >
                {connectEvo.isPending ? "Conectando..." : evoStatus === "pending" ? "Gerar novo QR" : "Conectar"}
              </button>
            )
          }
        />

        {/* WhatsApp Cloud (API Oficial) */}
        <ConnectionCard
          icon={<WhatsAppIcon />}
          title="WhatsApp Oficial (API)"
          subtitle={waCloud?.username ?? "Número oficial via Meta Cloud API"}
          badge={waCloud?.status === "connected" ? "connected" : "disconnected"}
          isOfficial
          meta={waCloud?.status === "connected" ? [
            { label: "Número", value: waCloud?.username ?? "—" },
            { label: "Conectado em", value: waCloud?.connected_at ? new Date(waCloud.connected_at).toLocaleString("pt-BR") : "—" },
          ] : undefined}
          action={
            waCloud?.status === "connected" ? (
              <button type="button" onClick={() => disconnectZernio.mutate("whatsapp")} style={dangerOutlineBtn}>
                Desconectar
              </button>
            ) : (
              <button
                type="button"
                onClick={() => connectZernio.mutate("whatsapp")}
                disabled={loadingZernio === "whatsapp"}
                className="btn-primary"
                style={{ height: 32, fontSize: 12 }}
              >
                {loadingZernio === "whatsapp" ? "Abrindo..." : "Conectar"}
              </button>
            )
          }
        />

        {/* Instagram DM */}
        <ConnectionCard
          icon={<Instagram size={18} style={{ color: "#E1306C" }} />}
          title="Instagram Direct"
          subtitle={igDm?.username ?? "Responda DMs do Instagram"}
          badge={igDm?.status === "connected" ? "connected" : "disconnected"}
          isOfficial
          meta={igDm?.status === "connected" ? [
            { label: "Username", value: igDm?.username ?? "—" },
            { label: "Conectado em", value: igDm?.connected_at ? new Date(igDm.connected_at).toLocaleString("pt-BR") : "—" },
          ] : undefined}
          action={
            igDm?.status === "connected" ? (
              <button type="button" onClick={() => disconnectZernio.mutate("instagram")} style={dangerOutlineBtn}>
                Desconectar
              </button>
            ) : (
              <button
                type="button"
                onClick={() => connectZernio.mutate("instagram")}
                disabled={loadingZernio === "instagram"}
                className="btn-primary"
                style={{ height: 32, fontSize: 12 }}
              >
                {loadingZernio === "instagram" ? "Abrindo..." : "Conectar"}
              </button>
            )
          }
        />
      </div>

      <ConfirmDialog
        open={confirmDcEvo}
        onClose={() => setConfirmDcEvo(false)}
        onConfirm={() => disconnectEvo.mutate()}
        title="Desconectar WhatsApp QR?"
        description="As conversas em andamento serão pausadas até reconectar."
        confirmLabel="Desconectar"
        destructive
      />
    </section>
  );
}

// ============================================================
// Seção de Publicação (Facebook, Instagram, TikTok, YouTube)
// ============================================================

const SOCIAL_PLATFORMS: SocialPlatform[] = ["facebook", "instagram", "tiktok", "youtube"];

const SOCIAL_ICON: Record<SocialPlatform, React.ReactNode> = {
  facebook: <Facebook size={18} style={{ color: "#1877F2" }} />,
  instagram: <Instagram size={18} style={{ color: "#E1306C" }} />,
  tiktok: <Music2 size={18} style={{ color: "#000" }} />,
  youtube: <Youtube size={18} style={{ color: "#FF0000" }} />,
};

function PublishingSection() {
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
      else { toast.error("Não foi possível iniciar."); setLoadingPlatform(null); }
    },
    onError: (e: any) => { toast.error(e?.message ?? "Falha"); setLoadingPlatform(null); },
  });

  const disconnect = useMutation({
    mutationFn: (id: string) => disconnectFn({ data: { connectionId: id } }),
    onSuccess: () => {
      toast.success("Conta desconectada.");
      setConfirmDisconnect(null);
      qc.invalidateQueries({ queryKey: ["social-accounts"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Falha"),
  });

  const accounts = q.data?.accounts ?? [];

  return (
    <section>
      <div className="flex items-center" style={{ gap: 8, marginBottom: 12 }}>
        <Share2 size={16} style={{ color: "var(--text-muted)" }} />
        <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.04em" }}>
          Publicação em Redes Sociais
        </span>
      </div>

      <div className="flex flex-col" style={{ gap: 12 }}>
        {SOCIAL_PLATFORMS.map((platform) => {
          const account = accounts.find((a: any) => a.platform === platform && a.status === "connected")
            ?? accounts.find((a: any) => a.platform === platform);
          const isConnected = account?.status === "connected";
          const isExpired = account?.status === "expired";
          const isLoading = loadingPlatform === platform;

          return (
            <ConnectionCard
              key={platform}
              icon={SOCIAL_ICON[platform]}
              title={PLATFORM_LABELS[platform]}
              subtitle={isConnected ? (account as any)?.account_name ?? "Conta conectada" : `Conecte para publicar no ${PLATFORM_LABELS[platform]}`}
              badge={isConnected ? "connected" : isExpired ? "expired" : "disconnected"}
              isOfficial
              meta={isConnected ? [
                { label: "Conta", value: (account as any)?.account_name ?? "—" },
                { label: "Conectado em", value: (account as any)?.connected_at ? new Date((account as any).connected_at).toLocaleString("pt-BR") : "—" },
              ] : undefined}
              action={
                isConnected ? (
                  <button type="button" onClick={() => setConfirmDisconnect((account as any).id)} style={dangerOutlineBtn}>
                    Desconectar
                  </button>
                ) : isExpired ? (
                  <button type="button" onClick={() => connect.mutate(platform)} disabled={isLoading} className="btn-primary" style={{ height: 32, fontSize: 12 }}>
                    {isLoading ? "Abrindo..." : "Reconectar"}
                  </button>
                ) : (
                  <button type="button" onClick={() => connect.mutate(platform)} disabled={isLoading} className="btn-primary" style={{ height: 32, fontSize: 12 }}>
                    {isLoading ? <Loader2 size={14} className="animate-spin" /> : "Conectar"}
                  </button>
                )
              }
            />
          );
        })}
      </div>

      <ConfirmDialog
        open={!!confirmDisconnect}
        onClose={() => setConfirmDisconnect(null)}
        onConfirm={() => { if (confirmDisconnect) disconnect.mutate(confirmDisconnect); }}
        title="Desconectar conta?"
        description="Posts já publicados serão mantidos no histórico."
        confirmLabel="Desconectar"
        destructive
      />
    </section>
  );
}

// ============================================================
// Card de conexão reutilizável
// ============================================================

const STATUS_BADGE: Record<string, { variant: BadgeVariant; label: string }> = {
  connected: { variant: "success", label: "Conectado" },
  pending: { variant: "warning", label: "Aguardando QR" },
  expired: { variant: "danger", label: "Token expirado" },
  disconnected: { variant: "neutral", label: "Desconectado" },
};

function ConnectionCard({
  icon,
  title,
  subtitle,
  badge,
  isUnofficial,
  isOfficial,
  meta,
  action,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  badge: string;
  isUnofficial?: boolean;
  isOfficial?: boolean;
  meta?: Array<{ label: string; value: string }>;
  action: React.ReactNode;
}) {
  const b = STATUS_BADGE[badge] ?? STATUS_BADGE.disconnected;
  const isConnected = badge === "connected";

  return (
    <Card style={{ padding: 16 }}>
      <div className="flex items-start justify-between" style={{ gap: 12 }}>
        <div className="flex items-center" style={{ gap: 12 }}>
          <div
            className="flex items-center justify-center"
            style={{
              width: 36,
              height: 36,
              borderRadius: "var(--radius-pill)",
              background: "var(--bg-overlay)",
              flexShrink: 0,
            }}
          >
            {icon}
          </div>
          <div>
            <div className="flex items-center" style={{ gap: 8 }}>
              <span style={{ fontSize: 14, fontWeight: 600 }}>{title}</span>
              <Badge variant={b.variant} withDot>{b.label}</Badge>
              {isOfficial && (
                <span style={{ fontSize: 10, fontWeight: 600, padding: "1px 6px", borderRadius: "var(--radius-pill)", background: "color-mix(in oklab, var(--success) 14%, transparent)", color: "var(--success)" }}>
                  Oficial
                </span>
              )}
              {isUnofficial && (
                <span style={{ fontSize: 10, fontWeight: 600, padding: "1px 6px", borderRadius: "var(--radius-pill)", background: "color-mix(in oklab, var(--warning) 14%, transparent)", color: "#B45309" }}>
                  QR · Não-oficial
                </span>
              )}
            </div>
            <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 2 }}>
              {subtitle}
            </div>
          </div>
        </div>
        <div style={{ flexShrink: 0 }}>
          {action}
        </div>
      </div>

      {/* Metadados expandidos quando conectado */}
      {isConnected && meta && meta.length > 0 && (
        <div
          className="flex flex-wrap"
          style={{
            gap: 16,
            marginTop: 14,
            paddingTop: 14,
            borderTop: "1px solid var(--border)",
          }}
        >
          {meta.map((m) => (
            <div key={m.label}>
              <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 2 }}>
                {m.label}
              </div>
              <div style={{ fontSize: 13, fontWeight: 500, color: "var(--text-primary)" }}>
                {m.value}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Disclaimer QR */}
      {isUnofficial && isConnected && (
        <div
          className="flex items-start"
          style={{
            gap: 8,
            marginTop: 12,
            padding: "10px 12px",
            borderRadius: "var(--radius-control)",
            background: "color-mix(in oklab, var(--warning) 8%, transparent)",
            border: "1px solid color-mix(in oklab, var(--warning) 25%, transparent)",
          }}
        >
          <AlertTriangle size={14} style={{ color: "#B45309", flexShrink: 0, marginTop: 2 }} />
          <div style={{ fontSize: 11.5, color: "#92400E", lineHeight: 1.5 }}>
            Esta conexão usa emulação de sessão (QR Code). O ZapFlow <strong>não se responsabiliza</strong> por
            restrições, bloqueios ou banimentos aplicados pelo WhatsApp a números conectados por este
            método. Para uma conexão estável e sem risco, use a <strong>API Oficial</strong> acima.
          </div>
        </div>
      )}
    </Card>
  );
}

function WhatsAppIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="#25D366">
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
    </svg>
  );
}

const dangerOutlineBtn: React.CSSProperties = {
  height: 32,
  padding: "0 12px",
  borderRadius: "var(--radius-pill)",
  border: "1px solid color-mix(in oklab, #EF4444 40%, var(--border))",
  background: "transparent",
  color: "#EF4444",
  fontSize: 12,
  fontWeight: 500,
  cursor: "pointer",
};
