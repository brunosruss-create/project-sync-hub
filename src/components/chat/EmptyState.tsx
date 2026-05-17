import { MessageSquare } from "lucide-react";

export function ChatEmptyState() {
  return (
    <div
      className="flex flex-col items-center justify-center"
      style={{
        flex: 1,
        gap: 16,
        color: "var(--text-muted)",
        background: "var(--bg-base)",
      }}
    >
      <div
        style={{
          width: 72,
          height: 72,
          borderRadius: 999,
          background: "var(--bg-overlay)",
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <MessageSquare size={32} style={{ color: "var(--text-muted)" }} />
      </div>
      <div style={{ textAlign: "center" }}>
        <div style={{ fontSize: 15, fontWeight: 600, color: "var(--text-primary)" }}>
          Selecione uma conversa
        </div>
        <div style={{ fontSize: 13, marginTop: 4 }}>
          Escolha um contato à esquerda para começar a atender
        </div>
      </div>
    </div>
  );
}
