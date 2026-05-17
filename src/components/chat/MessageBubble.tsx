import { Check, CheckCheck, FileText, Bot } from "lucide-react";
import { AudioPlayerWithMe } from "./AudioPlayer";

export interface ChatMessage {
  id: string;
  direction: "inbound" | "outbound";
  content: string;
  message_type: "text" | "image" | "audio" | "video" | "document" | "system";
  status: "sent" | "delivered" | "read";
  created_at: Date;
  media_url?: string | null;
  media_mime?: string | null;
  media_name?: string | null;
  is_ai?: boolean;
  deleted_at?: string | null;
  contactName?: string;
  contactAvatar?: string | null;
}

function formatTime(d: Date): string {
  return d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

function StatusTicks({ status }: { status: ChatMessage["status"] }) {
  if (status === "sent") {
    return <Check size={13} style={{ color: "var(--text-muted)" }} />;
  }
  if (status === "delivered") {
    return <CheckCheck size={13} style={{ color: "var(--text-muted)" }} />;
  }
  return <CheckCheck size={13} style={{ color: "var(--brand-400)" }} />;
}

export function MessageBubble({ m }: { m: ChatMessage }) {
  // system
  if (m.message_type === "system") {
    return (
      <div
        style={{
          alignSelf: "center",
          fontSize: 11,
          color: "var(--text-muted)",
          padding: "4px 12px",
          background: "var(--bg-overlay)",
          borderRadius: 999,
          margin: "4px 0",
        }}
      >
        {m.content}
      </div>
    );
  }

  const outbound = m.direction === "outbound";
  const bg = outbound
    ? "color-mix(in oklab, var(--brand-400) 15%, var(--bg-surface))"
    : "var(--bg-surface)";
  const color = "var(--text-primary)";
  const radius = outbound ? "12px 2px 12px 12px" : "2px 12px 12px 12px";
  const border = outbound
    ? "1px solid color-mix(in oklab, var(--brand-400) 30%, transparent)"
    : "1px solid var(--border)";

  const deleted = !!m.deleted_at;

  return (
    <div
      style={{
        alignSelf: outbound ? "flex-end" : "flex-start",
        maxWidth: "min(560px, 70%)",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <div
        style={{
          background: bg,
          color,
          borderRadius: radius,
          padding: "8px 12px",
          boxShadow: outbound ? "none" : "0 1px 1px rgba(0,0,0,0.04)",
          border,
          fontSize: 13.5,
          lineHeight: 1.4,
          wordBreak: "break-word",
        }}
      >
        {m.is_ai && outbound && (
          <div
            className="inline-flex items-center"
            style={{
              gap: 4,
              fontSize: 10,
              fontWeight: 600,
              background: "color-mix(in oklab, var(--brand-400) 20%, transparent)",
              color: "var(--brand-400)",
              padding: "1px 6px",
              borderRadius: 999,
              marginBottom: 4,
              textTransform: "uppercase",
              letterSpacing: "0.04em",
            }}
          >
            <Bot size={10} /> IA
          </div>
        )}

        {deleted ? (
          <em style={{ opacity: 0.7, fontSize: 12 }}>🚫 Mensagem apagada</em>
        ) : m.message_type === "image" && m.media_url ? (
          <div>
            <img
              src={m.media_url}
              alt={m.media_name ?? "imagem"}
              style={{
                maxWidth: "100%",
                maxHeight: 280,
                borderRadius: 8,
                display: "block",
                marginBottom: m.content ? 6 : 0,
              }}
            />
            {m.content && <div>{m.content}</div>}
          </div>
        ) : m.message_type === "audio" && m.media_url ? (
          <div style={{ margin: "-2px 0" }}>
            <AudioPlayerWithMe
              src={m.media_url}
              contactName={m.contactName ?? ""}
              contactAvatar={m.contactAvatar ?? null}
              isMe={outbound}
            />
          </div>
        ) : m.message_type === "document" && m.media_url ? (
          <a
            href={m.media_url}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center"
            style={{ gap: 6, color, textDecoration: "underline" }}
          >
            <FileText size={14} />
            {m.media_name ?? "documento"}
          </a>
        ) : (
          <span style={{ whiteSpace: "pre-wrap" }}>{m.content}</span>
        )}

        <div
          className="flex items-center justify-end"
          style={{
            gap: 4,
            marginTop: 4,
            fontSize: 10,
            color: outbound ? "rgba(255,255,255,0.8)" : "var(--text-muted)",
          }}
        >
          <span>{formatTime(m.created_at)}</span>
          {outbound && <StatusTicks status={m.status} />}
        </div>
      </div>
    </div>
  );
}
