import * as React from "react";
import { X, Send, Paperclip, Smile } from "lucide-react";
import { type ContactCard as Contact, formatRelative, initials } from "./data";

type Tab = "conversation" | "contact" | "services" | "history";

const TABS: Array<{ id: Tab; label: string }> = [
  { id: "conversation", label: "Conversa" },
  { id: "contact", label: "Dados do Contato" },
  { id: "services", label: "Serviços" },
  { id: "history", label: "Histórico" },
];

const sampleMessages = (c: Contact) => [
  { id: "m1", from: "them", text: "Oi, tudo bem?", at: new Date(Date.now() - 9 * 60_000) },
  {
    id: "m2",
    from: "me",
    text: "Tudo ótimo! Como posso ajudar?",
    at: new Date(Date.now() - 8 * 60_000),
  },
  { id: "m3", from: "them", text: c.lastMessage, at: c.lastMessageAt },
];

export function ConversationPanel({
  contact,
  onClose,
}: {
  contact: Contact | null;
  onClose: () => void;
}) {
  const [tab, setTab] = React.useState<Tab>("conversation");
  const [draft, setDraft] = React.useState("");
  const open = !!contact;

  // reset tab when switching contact
  React.useEffect(() => {
    if (contact) setTab("conversation");
  }, [contact?.id]);

  return (
    <>
      {/* Backdrop */}
      {open && (
        <div
          onClick={onClose}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.35)",
            zIndex: 40,
            animation: "fadeSlideIn 150ms ease-out",
          }}
        />
      )}

      {/* Panel */}
      <aside
        style={{
          position: "fixed",
          top: 0,
          right: 0,
          height: "100vh",
          width: 360,
          background: "var(--bg-surface)",
          borderLeft: "1px solid var(--border)",
          transform: open ? "translateX(0)" : "translateX(100%)",
          transition: "transform 200ms ease-out",
          zIndex: 50,
          display: "flex",
          flexDirection: "column",
        }}
      >
        {contact && (
          <>
            {/* Header */}
            <div
              className="flex items-center gap-3"
              style={{
                padding: 14,
                borderBottom: "1px solid var(--border)",
                height: 64,
              }}
            >
              <div
                className="inline-flex items-center justify-center shrink-0"
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 999,
                  background: "var(--bg-overlay)",
                  fontSize: 13,
                  fontWeight: 600,
                }}
              >
                {initials(contact.name)}
              </div>
              <div className="flex-1 min-w-0">
                <div
                  className="truncate"
                  style={{ fontSize: 14, fontWeight: 600 }}
                >
                  {contact.name}
                </div>
                <div
                  className="truncate font-mono"
                  style={{ fontSize: 11, color: "var(--text-muted)" }}
                >
                  {contact.phone}
                </div>
              </div>
              <button
                onClick={onClose}
                aria-label="Fechar"
                className="inline-flex items-center justify-center"
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: 6,
                  background: "transparent",
                  color: "var(--text-muted)",
                }}
                onMouseEnter={(e) =>
                  (e.currentTarget.style.background = "var(--bg-overlay)")
                }
                onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
              >
                <X size={16} />
              </button>
            </div>

            {/* Tabs */}
            <div
              className="flex"
              style={{ borderBottom: "1px solid var(--border)", padding: "0 8px" }}
            >
              {TABS.map((t) => (
                <button
                  key={t.id}
                  onClick={() => setTab(t.id)}
                  style={{
                    padding: "10px 10px",
                    fontSize: 12,
                    fontWeight: 500,
                    background: "transparent",
                    color: tab === t.id ? "var(--text-primary)" : "var(--text-muted)",
                    borderBottom:
                      tab === t.id
                        ? "2px solid var(--brand-400)"
                        : "2px solid transparent",
                    marginBottom: -1,
                  }}
                >
                  {t.label}
                </button>
              ))}
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto" style={{ padding: 16 }}>
              {tab === "conversation" && (
                <div className="flex flex-col" style={{ gap: 10 }}>
                  {sampleMessages(contact).map((m) => (
                    <div
                      key={m.id}
                      style={{
                        alignSelf: m.from === "me" ? "flex-end" : "flex-start",
                        maxWidth: "82%",
                        background:
                          m.from === "me"
                            ? "color-mix(in oklab, var(--brand-400) 18%, var(--bg-surface))"
                            : "var(--bg-overlay)",
                        border: "1px solid var(--border)",
                        borderRadius: 10,
                        padding: "8px 10px",
                        fontSize: 13,
                        lineHeight: 1.4,
                      }}
                    >
                      {m.text}
                      <div
                        style={{
                          marginTop: 4,
                          fontSize: 10,
                          color: "var(--text-muted)",
                          textAlign: "right",
                        }}
                      >
                        {formatRelative(m.at)}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {tab === "contact" && (
                <DataList
                  rows={[
                    ["Nome", contact.name],
                    ["Telefone", contact.phone],
                    ["Atendente", contact.assignedAgent || "—"],
                    ["Prioridade", contact.priority === "urgent" ? "Urgente" : "Normal"],
                    ["Tags", contact.tags.join(", ") || "—"],
                  ]}
                />
              )}

              {tab === "services" && (
                <div style={{ fontSize: 12, color: "var(--text-muted)" }}>
                  Nenhum serviço vinculado a este contato ainda.
                </div>
              )}

              {tab === "history" && (
                <div style={{ fontSize: 12, color: "var(--text-muted)" }}>
                  Sem eventos anteriores registrados.
                </div>
              )}
            </div>

            {/* Composer */}
            {tab === "conversation" && (
              <div
                style={{ padding: 12, borderTop: "1px solid var(--border)" }}
              >
                <div
                  className="flex items-end"
                  style={{
                    gap: 6,
                    border: "1px solid var(--border-strong)",
                    borderRadius: 8,
                    padding: 6,
                    background: "var(--bg-base)",
                  }}
                >
                  <button
                    type="button"
                    aria-label="Anexar"
                    className="inline-flex items-center justify-center shrink-0"
                    style={{
                      width: 28,
                      height: 28,
                      borderRadius: 6,
                      background: "transparent",
                      color: "var(--text-muted)",
                    }}
                  >
                    <Paperclip size={14} />
                  </button>
                  <textarea
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    placeholder="Digite uma mensagem…"
                    rows={1}
                    onInput={(e) => {
                      const el = e.currentTarget;
                      el.style.height = "auto";
                      el.style.height = Math.min(120, el.scrollHeight) + "px";
                    }}
                    style={{
                      flex: 1,
                      resize: "none",
                      background: "transparent",
                      outline: "none",
                      border: "none",
                      color: "var(--text-primary)",
                      fontSize: 13,
                      fontFamily: "inherit",
                      lineHeight: 1.4,
                      padding: "4px 2px",
                      maxHeight: 120,
                    }}
                  />
                  <button
                    type="button"
                    aria-label="Emoji"
                    className="inline-flex items-center justify-center shrink-0"
                    style={{
                      width: 28,
                      height: 28,
                      borderRadius: 6,
                      background: "transparent",
                      color: "var(--text-muted)",
                    }}
                  >
                    <Smile size={14} />
                  </button>
                  <button
                    type="button"
                    onClick={() => setDraft("")}
                    aria-label="Enviar"
                    className="inline-flex items-center justify-center shrink-0"
                    disabled={!draft.trim()}
                    style={{
                      width: 32,
                      height: 28,
                      borderRadius: 6,
                      background: "var(--brand-400)",
                      color: "#fff",
                      opacity: draft.trim() ? 1 : 0.5,
                    }}
                  >
                    <Send size={14} />
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </aside>
    </>
  );
}

function DataList({ rows }: { rows: Array<[string, string]> }) {
  return (
    <div className="flex flex-col" style={{ gap: 8 }}>
      {rows.map(([k, v]) => (
        <div
          key={k}
          className="flex items-start justify-between"
          style={{
            gap: 12,
            padding: "8px 10px",
            background: "var(--bg-overlay)",
            borderRadius: 6,
            border: "1px solid var(--border)",
          }}
        >
          <span style={{ fontSize: 11, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
            {k}
          </span>
          <span style={{ fontSize: 12, color: "var(--text-primary)", textAlign: "right" }}>
            {v}
          </span>
        </div>
      ))}
    </div>
  );
}
