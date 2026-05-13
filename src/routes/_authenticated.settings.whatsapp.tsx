import * as React from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ExternalLink, RefreshCw, Loader2 } from "lucide-react";
import {
  SettingsLayout,
  FieldGroup,
  buttonPrimary,
  buttonSecondary,
  buttonDanger,
  card,
} from "@/features/settings/settings-layout";
import {
  getInstance,
  connectInstance,
  refreshInstanceStatus,
  disconnectInstance,
} from "@/lib/evolution.functions";

export const Route = createFileRoute("/_authenticated/settings/whatsapp")({
  component: WhatsAppPage,
});

type Status = "connected" | "disconnected" | "pending" | "error";

function WhatsAppPage() {
  const qc = useQueryClient();
  const fetchInstance = useServerFn(getInstance);
  const doConnect = useServerFn(connectInstance);
  const doRefresh = useServerFn(refreshInstanceStatus);
  const doDisconnect = useServerFn(disconnectInstance);

  const [confirmDc, setConfirmDc] = React.useState(false);
  const [now, setNow] = React.useState(Date.now());

  const { data, isLoading } = useQuery({
    queryKey: ["whatsapp-instance"],
    queryFn: () => fetchInstance({ data: undefined as never }),
    refetchOnWindowFocus: false,
  });

  const instance = data?.instance ?? null;
  const status: Status = (instance?.status as Status) ?? "disconnected";
  const expiresAt = instance?.qr_expires_at ? new Date(instance.qr_expires_at).getTime() : 0;
  const secondsLeft = status === "pending" && expiresAt ? Math.max(0, Math.ceil((expiresAt - now) / 1000)) : null;

  // Polling enquanto pendente — pega QR / mudança de status
  React.useEffect(() => {
    if (status !== "pending") return;
    const id = setInterval(async () => {
      try {
        await doRefresh({ data: undefined as never });
        qc.invalidateQueries({ queryKey: ["whatsapp-instance"] });
      } catch {}
    }, 3000);
    return () => clearInterval(id);
  }, [status, doRefresh, qc]);

  React.useEffect(() => {
    if (status !== "pending") return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [status]);

  React.useEffect(() => {
    if (status !== "pending" || !expiresAt || secondsLeft !== 0) return;
    void doRefresh({ data: { forceQrRefresh: true } }).then(() => {
      qc.invalidateQueries({ queryKey: ["whatsapp-instance"] });
    });
  }, [status, expiresAt, secondsLeft, doRefresh, qc]);

  const connect = useMutation({
    mutationFn: () => doConnect({ data: undefined as never }),
    onSuccess: () => {
      toast.success("Escaneie o QR Code");
      qc.invalidateQueries({ queryKey: ["whatsapp-instance"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Falha ao conectar"),
  });

  const refreshQr = useMutation({
    mutationFn: () => doRefresh({ data: { forceQrRefresh: true } }),
    onSuccess: () => {
      toast.success("Novo QR Code gerado");
      qc.invalidateQueries({ queryKey: ["whatsapp-instance"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Falha ao gerar novo QR"),
  });

  const disconnect = useMutation({
    mutationFn: () => doDisconnect({ data: undefined as never }),
    onSuccess: () => {
      toast.success("WhatsApp desconectado");
      setConfirmDc(false);
      qc.invalidateQueries({ queryKey: ["whatsapp-instance"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Falha"),
  });

  const meta: Record<Status, { label: string; bg: string; fg: string }> = {
    connected: { label: "Conectado", bg: "color-mix(in oklab, #10B981 18%, transparent)", fg: "#10B981" },
    disconnected: { label: "Desconectado", bg: "color-mix(in oklab, #EF4444 18%, transparent)", fg: "#EF4444" },
    pending: { label: "Aguardando QR", bg: "color-mix(in oklab, #F59E0B 18%, transparent)", fg: "#F59E0B" },
    error: { label: "Erro", bg: "color-mix(in oklab, #EF4444 18%, transparent)", fg: "#EF4444" },
  };

  return (
    <SettingsLayout
      title="WhatsApp"
      description="Conexão da sua conta WhatsApp ao ZapFlow via Evolution API."
    >
      <div style={card}>
        <div className="flex items-center justify-between" style={{ marginBottom: 16 }}>
          <div className="flex items-center gap-3">
            <span
              style={{
                fontSize: 12,
                fontWeight: 600,
                padding: "4px 10px",
                borderRadius: 999,
                background: meta[status].bg,
                color: meta[status].fg,
              }}
            >
              ● {meta[status].label}
            </span>
            {instance?.updated_at && (
              <span style={{ fontSize: 12, color: "var(--text-muted)" }}>
                Atualizado {new Date(instance.updated_at).toLocaleTimeString("pt-BR")}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              style={buttonSecondary}
              className="flex items-center gap-2"
              disabled={connect.isPending}
              onClick={() => connect.mutate()}
            >
              {connect.isPending ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
              {status === "connected" ? "Reconectar" : "Conectar"}
            </button>
          </div>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center" style={{ padding: 32, color: "var(--text-muted)", fontSize: 13 }}>
            Carregando…
          </div>
        ) : status === "pending" && instance?.qr_code ? (
          <div
            className="flex flex-col items-center justify-center"
            style={{ padding: 32, border: "1px dashed var(--border)", borderRadius: 12, gap: 16 }}
          >
            <img
              src={instance.qr_code}
              alt="QR Code WhatsApp"
              width={240}
              height={240}
              style={{ borderRadius: 12, background: "#fff", padding: 8, boxShadow: "0 0 0 1px var(--border)" }}
            />
            <div className="text-center">
              <p style={{ fontSize: 14, fontWeight: 500 }}>Abra o WhatsApp e escaneie o QR Code</p>
              <p style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 4 }}>
                WhatsApp → Configurações → Aparelhos conectados → Conectar aparelho
              </p>
              <p style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 8 }}>
                Esse QR expira em ~60s. Se não funcionar, clique em <b>Reconectar</b>.
              </p>
            </div>
          </div>
        ) : status === "pending" ? (
          <div className="flex flex-col items-center justify-center" style={{ padding: 32, gap: 12 }}>
            <Loader2 className="animate-spin" />
            <p style={{ fontSize: 13, color: "var(--text-muted)" }}>Gerando QR Code…</p>
          </div>
        ) : status === "error" ? (
          <div className="flex flex-col items-center justify-center text-center" style={{ padding: 32, gap: 12 }}>
            <p style={{ fontSize: 14 }}>A Evolution respondeu sem QR Code.</p>
            <p style={{ maxWidth: 520, fontSize: 12, color: "var(--text-muted)" }}>
              Corrija no Railway: SERVER_URL, QRCODE_LIMIT e CONFIG_SESSION_PHONE_VERSION. Depois faça redeploy da Evolution e clique em Reconectar.
            </p>
            <button
              style={buttonPrimary}
              disabled={connect.isPending}
              onClick={() => connect.mutate()}
            >
              {connect.isPending ? "Reconectando…" : "Reconectar"}
            </button>
          </div>
        ) : status === "connected" ? (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
              gap: 12,
            }}
          >
            <Info label="Número" value={instance?.phone_number ?? "—"} />
            <Info label="Nome do perfil" value={instance?.profile_name ?? "—"} />
            <Info
              label="Conectado em"
              value={
                instance?.last_connected_at
                  ? new Date(instance.last_connected_at).toLocaleString("pt-BR")
                  : "—"
              }
            />
            <Info label="Instância" value={instance?.instance_name ?? "—"} />
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center text-center" style={{ padding: 32, gap: 12 }}>
            <p style={{ fontSize: 14 }}>Nenhum WhatsApp conectado.</p>
            <button
              style={buttonPrimary}
              disabled={connect.isPending}
              onClick={() => connect.mutate()}
            >
              {connect.isPending ? "Conectando…" : "Conectar agora"}
            </button>
          </div>
        )}

        {status === "connected" && (
          <div className="flex justify-end" style={{ marginTop: 16 }}>
            <button style={buttonDanger} onClick={() => setConfirmDc(true)}>
              Desconectar
            </button>
          </div>
        )}
      </div>

      <div style={{ marginTop: 24 }}>
        <FieldGroup label="Integração">
          <div style={card}>
            <p style={{ fontSize: 13, color: "var(--text-muted)" }}>
              Conexão via Evolution API (self-hosted no Railway). Mensagens recebidas
              caem direto no Inbox; envios feitos pelo Inbox vão pelo seu número conectado.
            </p>
          </div>
        </FieldGroup>
      </div>

      <a
        href="https://doc.evolution-api.com"
        target="_blank"
        rel="noreferrer"
        className="inline-flex items-center gap-2"
        style={{ fontSize: 13, color: "var(--brand-400)", marginTop: 8 }}
      >
        <ExternalLink size={14} /> Documentação Evolution API
      </a>

      {confirmDc && (
        <div
          onClick={() => setConfirmDc(false)}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.5)",
            zIndex: 50,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 16,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: "var(--bg-surface)",
              border: "1px solid var(--border)",
              borderRadius: 12,
              padding: 20,
              maxWidth: 420,
              width: "100%",
            }}
          >
            <h3 style={{ fontSize: 15, fontWeight: 600, marginBottom: 8 }}>
              Desconectar WhatsApp?
            </h3>
            <p style={{ fontSize: 13, color: "var(--text-muted)" }}>
              As conversas em andamento serão pausadas até reconectar.
            </p>
            <div className="flex justify-end gap-2" style={{ marginTop: 16 }}>
              <button style={buttonSecondary} onClick={() => setConfirmDc(false)}>
                Cancelar
              </button>
              <button
                style={buttonDanger}
                disabled={disconnect.isPending}
                onClick={() => disconnect.mutate()}
              >
                {disconnect.isPending ? "Desconectando…" : "Desconectar"}
              </button>
            </div>
          </div>
        </div>
      )}
    </SettingsLayout>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ padding: 12, borderRadius: 8, background: "var(--bg-overlay)" }}>
      <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 13, fontWeight: 500 }}>{value}</div>
    </div>
  );
}
