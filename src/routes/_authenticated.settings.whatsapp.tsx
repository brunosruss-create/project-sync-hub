import * as React from "react";
import { createFileRoute } from "@tanstack/react-router";
import { toast } from "sonner";
import { ExternalLink, RefreshCw } from "lucide-react";
import {
  SettingsLayout,
  FieldGroup,
  buttonPrimary,
  buttonSecondary,
  buttonDanger,
  card,
} from "@/features/settings/settings-layout";

export const Route = createFileRoute("/_authenticated/settings/whatsapp")({
  component: WhatsAppPage,
});

type Status = "connected" | "disconnected" | "pending";

function WhatsAppPage() {
  const [status, setStatus] = React.useState<Status>("connected");
  const [multi, setMulti] = React.useState(true);
  const [confirmDc, setConfirmDc] = React.useState(false);

  const meta: Record<Status, { label: string; bg: string; fg: string }> = {
    connected: {
      label: "Conectado",
      bg: "color-mix(in oklab, #10B981 18%, transparent)",
      fg: "#10B981",
    },
    disconnected: {
      label: "Desconectado",
      bg: "color-mix(in oklab, #EF4444 18%, transparent)",
      fg: "#EF4444",
    },
    pending: {
      label: "Aguardando QR",
      bg: "color-mix(in oklab, #F59E0B 18%, transparent)",
      fg: "#F59E0B",
    },
  };

  return (
    <SettingsLayout
      title="WhatsApp"
      description="Conexão da sua conta WhatsApp ao ZapFlow."
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
            <span style={{ fontSize: 12, color: "var(--text-muted)" }}>
              Status atualizado agora
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              style={buttonSecondary}
              className="flex items-center gap-2"
              onClick={() => {
                setStatus("pending");
                toast("Solicitando novo QR Code…");
              }}
            >
              <RefreshCw size={14} /> Reconectar
            </button>
          </div>
        </div>

        {status === "pending" ? (
          <div
            className="flex flex-col items-center justify-center"
            style={{
              padding: 32,
              border: "1px dashed var(--border)",
              borderRadius: 12,
              gap: 16,
            }}
          >
            <div
              style={{
                width: 220,
                height: 220,
                background:
                  "repeating-conic-gradient(var(--text-primary) 0% 25%, var(--bg-surface) 0% 50%) 50% / 18px 18px",
                borderRadius: 12,
                border: "8px solid var(--bg-surface)",
                boxShadow: "0 0 0 1px var(--border)",
              }}
            />
            <div className="text-center">
              <p style={{ fontSize: 14, fontWeight: 500 }}>
                Abra o WhatsApp e escaneie o QR Code
              </p>
              <p style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 4 }}>
                WhatsApp → Configurações → Aparelhos conectados → Conectar aparelho
              </p>
            </div>
            <button style={buttonSecondary} onClick={() => setStatus("connected")}>
              Simular conexão
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
            <Info label="Número" value="+55 11 98765-4321" />
            <Info label="Nome do perfil" value="Meu Negócio" />
            <Info label="Conectado em" value="12/05/2026 09:42" />
            <Info label="Versão" value="WA Web 2.3000" />
          </div>
        ) : (
          <div
            className="flex flex-col items-center justify-center text-center"
            style={{ padding: 32, gap: 12 }}
          >
            <p style={{ fontSize: 14 }}>Nenhum WhatsApp conectado.</p>
            <button style={buttonPrimary} onClick={() => setStatus("pending")}>
              Conectar agora
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
        <FieldGroup label="Multi-agente">
          <div style={card}>
            <div className="flex items-start justify-between gap-4">
              <div>
                <p style={{ fontSize: 14, fontWeight: 500 }}>Atendimento simultâneo</p>
                <p style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 4 }}>
                  Quando ativo, vários agentes podem responder conversas distintas no mesmo
                  número, com transferência fluida entre eles.
                </p>
              </div>
              <Toggle value={multi} onChange={setMulti} />
            </div>
          </div>
        </FieldGroup>
      </div>

      <a
        href="https://docs.zapflow.app/whatsapp"
        target="_blank"
        rel="noreferrer"
        className="inline-flex items-center gap-2"
        style={{ fontSize: 13, color: "var(--brand-400)", marginTop: 8 }}
      >
        <ExternalLink size={14} /> Documentação da integração
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
                onClick={() => {
                  setStatus("disconnected");
                  setConfirmDc(false);
                  toast.success("WhatsApp desconectado");
                }}
              >
                Desconectar
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
    <div
      style={{
        padding: 12,
        borderRadius: 8,
        background: "var(--bg-overlay)",
      }}
    >
      <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 13, fontWeight: 500 }}>{value}</div>
    </div>
  );
}

function Toggle({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      onClick={() => onChange(!value)}
      style={{
        width: 36,
        height: 20,
        borderRadius: 999,
        border: 0,
        background: value ? "var(--brand-400)" : "var(--border)",
        position: "relative",
        cursor: "pointer",
        flexShrink: 0,
      }}
    >
      <span
        style={{
          position: "absolute",
          top: 2,
          left: value ? 18 : 2,
          width: 16,
          height: 16,
          borderRadius: 999,
          background: "#fff",
          transition: "left 0.15s",
        }}
      />
    </button>
  );
}
