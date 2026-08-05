import * as React from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Plus, Loader2, AlertTriangle, Instagram } from "lucide-react";
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

export const Route = createFileRoute("/_authenticated/connections")({
  component: () => (
    <ManagerOnly>
      <ConnectionsPage />
    </ManagerOnly>
  ),
});

function ConnectionsPage() {
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
  const waCloud = zernioAccounts.find((a) => a.platform === "whatsapp");
  const igDm = zernioAccounts.find((a) => a.platform === "instagram");

  const [confirmDcEvo, setConfirmDcEvo] = React.useState(false);
  const [loadingZernio, setLoadingZernio] = React.useState<string | null>(null);

  const connectEvo = useMutation({
    mutationFn: () => doConnect({ data: undefined as never }),
    onSuccess: () => {
      toast.success("Escaneie o QR Code");
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

  type ChannelDef = {
    id: string;
    icon: React.ReactNode;
    title: string;
    subtitle: string;
    isOfficial: boolean;
    status: string;
    meta?: Array<{ label: string; value: string }>;
    onConnect: () => void;
    onDisconnect: () => void;
    loading: boolean;
  };

  const channels: ChannelDef[] = [
    {
      id: "evo",
      icon: <WhatsAppIcon />,
      title: "WhatsApp (QR)",
      subtitle: "Conexão via leitura de QR Code",
      isOfficial: false,
      status: evoStatus,
      meta: evoStatus === "connected" ? [
        { label: "Número", value: instance?.phone_number ?? "—" },
        { label: "Perfil", value: instance?.profile_name ?? "—" },
        { label: "Conectado em", value: instance?.last_connected_at ? new Date(instance.last_connected_at).toLocaleString("pt-BR") : "—" },
      ] : undefined,
      onConnect: () => connectEvo.mutate(),
      onDisconnect: () => setConfirmDcEvo(true),
      loading: connectEvo.isPending,
    },
    {
      id: "wa-cloud",
      icon: <WhatsAppIcon />,
      title: "WhatsApp Oficial",
      subtitle: waCloud?.username ?? "Meta Cloud API, sem QR Code",
      isOfficial: true,
      status: waCloud?.status === "connected" ? "connected" : "disconnected",
      meta: waCloud?.status === "connected" ? [
        { label: "Número", value: waCloud?.username ?? "—" },
        { label: "Conectado em", value: waCloud?.connected_at ? new Date(waCloud.connected_at).toLocaleString("pt-BR") : "—" },
      ] : undefined,
      onConnect: () => connectZernio.mutate("whatsapp"),
      onDisconnect: () => disconnectZernio.mutate("whatsapp"),
      loading: loadingZernio === "whatsapp",
    },
    {
      id: "ig-dm",
      icon: <Instagram size={20} style={{ color: "#E1306C" }} />,
      title: "Instagram Direct",
      subtitle: igDm?.username ?? "DMs do Instagram no inbox",
      isOfficial: true,
      status: igDm?.status === "connected" ? "connected" : "disconnected",
      meta: igDm?.status === "connected" ? [
        { label: "Username", value: igDm?.username ?? "—" },
        { label: "Conectado em", value: igDm?.connected_at ? new Date(igDm.connected_at).toLocaleString("pt-BR") : "—" },
      ] : undefined,
      onConnect: () => connectZernio.mutate("instagram"),
      onDisconnect: () => disconnectZernio.mutate("instagram"),
      loading: loadingZernio === "instagram",
    },
  ];

  return (
    <div className="flex flex-col" style={{ gap: 16 }}>
      <div>
        <h1 style={{ fontSize: 22, fontWeight: 600, letterSpacing: "-0.015em" }}>
          Conexões
        </h1>
        <p style={{ marginTop: 2, fontSize: 12, color: "var(--text-muted)" }}>
          Canais de mensagem conectados ao seu ZapFlow.
        </p>
      </div>

      {/* Grid de cards quadrados — mesmo formato de Publicações */}
      <div
        className="grid"
        style={{
          gridTemplateColumns: "repeat(auto-fill, minmax(min(260px, 100%), 1fr))",
          gap: 12,
        }}
      >
        {channels.map((ch) => {
          const isConnected = ch.status === "connected";
          return (
            <Card key={ch.id} style={{ padding: 20 }}>
              <div className="flex items-center" style={{ gap: 12, marginBottom: 14 }}>
                <div
                  className="flex items-center justify-center"
                  style={{
                    width: 40,
                    height: 40,
                    borderRadius: "var(--radius-pill)",
                    background: "var(--bg-overlay)",
                  }}
                >
                  {ch.icon}
                </div>
                <div>
                  <div className="flex items-center" style={{ gap: 6 }}>
                    <span style={{ fontSize: 14, fontWeight: 600 }}>{ch.title}</span>
                    {ch.isOfficial && (
                      <span style={{ fontSize: 9, fontWeight: 700, padding: "1px 5px", borderRadius: "var(--radius-pill)", background: "color-mix(in oklab, var(--success) 14%, transparent)", color: "var(--success)" }}>
                        OFICIAL
                      </span>
                    )}
                    {!ch.isOfficial && (
                      <span style={{ fontSize: 9, fontWeight: 700, padding: "1px 5px", borderRadius: "var(--radius-pill)", background: "color-mix(in oklab, var(--warning) 14%, transparent)", color: "#B45309" }}>
                        QR
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 1 }}>
                    {ch.subtitle}
                  </div>
                </div>
              </div>

              {/* Metadados quando conectado */}
              {isConnected && ch.meta && (
                <div className="flex flex-wrap" style={{ gap: 12, marginBottom: 12 }}>
                  {ch.meta.map((m) => (
                    <div key={m.label}>
                      <div style={{ fontSize: 10, color: "var(--text-muted)" }}>{m.label}</div>
                      <div style={{ fontSize: 12, fontWeight: 500 }}>{m.value}</div>
                    </div>
                  ))}
                </div>
              )}

              {/* Ação */}
              {isConnected ? (
                <div className="flex items-center justify-between">
                  <Badge variant="success" withDot>Conectado</Badge>
                  <button
                    type="button"
                    onClick={ch.onDisconnect}
                    style={{
                      height: 28,
                      padding: "0 10px",
                      borderRadius: "var(--radius-pill)",
                      border: "1px solid color-mix(in oklab, #EF4444 40%, var(--border))",
                      background: "transparent",
                      color: "#EF4444",
                      fontSize: 12,
                      fontWeight: 500,
                      cursor: "pointer",
                    }}
                  >
                    Desconectar
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={ch.onConnect}
                  disabled={ch.loading}
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
                  {ch.loading ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
                  Conectar
                </button>
              )}

              {/* Disclaimer QR — só aparece quando conectado E é não-oficial */}
              {!ch.isOfficial && isConnected && (
                <div
                  className="flex items-start"
                  style={{
                    gap: 8,
                    marginTop: 12,
                    padding: "8px 10px",
                    borderRadius: "var(--radius-control)",
                    background: "color-mix(in oklab, var(--warning) 8%, transparent)",
                    border: "1px solid color-mix(in oklab, var(--warning) 25%, transparent)",
                  }}
                >
                  <AlertTriangle size={13} style={{ color: "#B45309", flexShrink: 0, marginTop: 1 }} />
                  <div style={{ fontSize: 11, color: "#92400E", lineHeight: 1.4 }}>
                    Conexão via QR Code (não-oficial). O ZapFlow <strong>não se responsabiliza</strong> por bloqueios
                    ou banimentos. Para conexão estável, use a API Oficial.
                  </div>
                </div>
              )}
            </Card>
          );
        })}
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
    </div>
  );
}

function WhatsAppIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="#25D366">
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
    </svg>
  );
}
