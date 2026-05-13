import * as React from "react";
import {
  X,
  Send,
  Paperclip,
  Smile,
  Mic,
  MoreVertical,
  CheckCheck,
  UserPlus,
  AlertOctagon,
  Tag,
  Ban,
  ExternalLink,
  Check,
  Plus,
  CalendarPlus,
} from "lucide-react";
import { type ContactCard as Contact, formatRelative, initials } from "./data";
import { ContactAvatar } from "./contact-avatar";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import { sendWhatsAppMessage, refreshContactAvatar } from "@/lib/evolution.functions";
import { ScheduleModal } from "./schedule-modal";
import {
  SEED_SERVICES,
  formatCurrencyBRL,
  formatDuration,
  type Service,
} from "@/features/services/data";

type Tab = "conversation" | "contact" | "services" | "history";

const TABS: Array<{ id: Tab; label: string; icon: string }> = [
  { id: "conversation", label: "Conversa", icon: "💬" },
  { id: "contact", label: "Contato", icon: "👤" },
  { id: "services", label: "Serviços", icon: "🛠️" },
  { id: "history", label: "Histórico", icon: "📋" },
];

interface Message {
  id: string;
  direction: "inbound" | "outbound";
  content: string;
  message_type: "text" | "image" | "audio" | "document" | "system";
  status: "sent" | "delivered" | "read";
  created_at: Date;
}

const MAX_CHARS = 4096;

function seedMessages(c: Contact): Message[] {
  return [
    {
      id: "s1",
      direction: "inbound",
      content: "Oi, tudo bem? Vi o anúncio e queria saber mais.",
      message_type: "text",
      status: "read",
      created_at: new Date(Date.now() - 12 * 60_000),
    },
    {
      id: "s2",
      direction: "outbound",
      content: "Olá! Tudo ótimo, e contigo? Como posso ajudar hoje?",
      message_type: "text",
      status: "read",
      created_at: new Date(Date.now() - 11 * 60_000),
    },
    {
      id: "s3",
      direction: "inbound",
      content: "Atribuído para João",
      message_type: "system",
      status: "read",
      created_at: new Date(Date.now() - 10 * 60_000),
    },
    {
      id: "s4",
      direction: "inbound",
      content: c.lastMessage,
      message_type: "text",
      status: "delivered",
      created_at: c.lastMessageAt,
    },
  ];
}

export function ConversationPanel({
  contact,
  onClose,
  onContactUpdate,
}: {
  contact: Contact | null;
  onClose: () => void;
  onContactUpdate?: (contactId: string, patch: Partial<Contact>) => void;
}) {
  const { user } = useAuth();
  const sendViaEvolution = useServerFn(sendWhatsAppMessage);
  const refreshAvatar = useServerFn(refreshContactAvatar);
  const [tab, setTab] = React.useState<Tab>("conversation");
  const [draft, setDraft] = React.useState("");
  const [menuOpen, setMenuOpen] = React.useState(false);
  const [messages, setMessages] = React.useState<Message[]>([]);
  const [scheduleOpen, setScheduleOpen] = React.useState(false);
  const [scheduleSeed, setScheduleSeed] = React.useState<string[] | undefined>(undefined);
  const open = !!contact;
  const scrollRef = React.useRef<HTMLDivElement | null>(null);
  const taRef = React.useRef<HTMLTextAreaElement | null>(null);

  const openSchedule = (preselected?: string[]) => {
    setScheduleSeed(preselected);
    setScheduleOpen(true);
  };

  // reset on contact change
  React.useEffect(() => {
    if (!contact) return;
    setTab("conversation");
    setDraft("");
    setMenuOpen(false);
    setMessages(import.meta.env.DEV && contact.id.startsWith("c") ? seedMessages(contact) : []);
  }, [contact?.id]);

  // Background: refresh foto do WhatsApp ao abrir o chat (silencioso)
  React.useEffect(() => {
    if (!contact?.id) return;
    let cancelled = false;
    (async () => {
      try {
        const r = await refreshAvatar({ data: { contactId: contact.id } });
        if (!cancelled && r?.changed && r.url) {
          onContactUpdate?.(contact.id, { avatar: r.url });
        }
      } catch {
        // silencioso — Evolution pode não estar configurado
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [contact?.id]);

  // load + subscribe to realtime messages reais do Supabase
  React.useEffect(() => {
    if (!contact) return;
    let cancelled = false;

    (async () => {
      const { data, error } = await supabase
        .from("messages")
        .select("id,direction,content,message_type,status,created_at")
        .eq("contact_id", contact.id)
        .order("created_at", { ascending: true });
      if (cancelled) return;
      if (error) {
        console.warn("[chat] erro ao carregar mensagens:", error.message);
      } else if (data) {
        setMessages(
          data.map((r: any) => ({
            id: r.id,
            direction: r.direction,
            content: r.content,
            message_type: r.message_type ?? "text",
            status: r.status ?? "sent",
            created_at: new Date(r.created_at),
          })),
        );
      }
    })();

    const channel = supabase
      .channel(`messages:${contact.id}:${Math.random().toString(36).slice(2, 8)}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
          filter: `contact_id=eq.${contact.id}`,
        },
        (payload: any) => {
          const r = payload.new;
          setMessages((prev) =>
            prev.some((m) => m.id === r.id)
              ? prev
              : [
                  ...prev,
                  {
                    id: r.id,
                    direction: r.direction,
                    content: r.content,
                    message_type: r.message_type ?? "text",
                    status: r.status ?? "sent",
                    created_at: new Date(r.created_at),
                  },
                ],
          );
        },
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [contact?.id]);

  // auto scroll to bottom on new message
  React.useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [messages.length, tab]);

  const send = async () => {
    const text = draft.trim();
    if (!text || !contact) return;
    // Sem optimistic update: o canal realtime é a fonte da verdade.
    // Isso evita duplicação (mensagem aparecendo 2x para o agente).
    setDraft("");
    if (taRef.current) taRef.current.style.height = "auto";

    try {
      // tenta enviar pelo WhatsApp via Evolution; o handler já grava em messages
      await sendViaEvolution({ data: { contactId: contact.id, text } });
    } catch (e: any) {
      const msg = String(e?.message ?? "");
      // se Evolution não estiver configurado/conectado, persiste só no banco
      if (/Evolution|conectar|conectado|configurad/i.test(msg)) {
        const { error } = await supabase.from("messages").insert({
          owner_user_id: user?.id ?? null,
          contact_id: contact.id,
          direction: "outbound",
          content: text,
          message_type: "text",
          status: "sent",
          sent_by: user?.id ?? null,
        });
        if (error) console.warn("[chat] persistência ignorada:", error.message);
        toast.warning("WhatsApp não conectado — mensagem salva localmente.");
      } else {
        toast.error(msg || "Falha ao enviar");
      }
    }
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  };

  const menuAction = (label: string) => {
    setMenuOpen(false);
    toast.info(`${label} — em breve.`);
  };

  return (
    <>
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

      <aside
        style={{
          position: "fixed",
          top: 0,
          right: 0,
          height: "100vh",
          width: 460,
          maxWidth: "100vw",
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
            {/* Header — 48px */}
            <div
              className="flex items-center"
              style={{
                gap: 10,
                padding: "0 10px",
                height: 48,
                borderBottom: "1px solid var(--border)",
                position: "relative",
              }}
            >
              <div style={{ position: "relative", width: 36, height: 36, flexShrink: 0 }}>
                <ContactAvatar name={contact.name} avatarUrl={contact.avatar} size={36} />
                <span
                  style={{
                    position: "absolute",
                    bottom: 0,
                    right: 0,
                    width: 9,
                    height: 9,
                    borderRadius: 999,
                    background: "var(--brand-400)",
                    border: "2px solid var(--bg-surface)",
                  }}
                />
              </div>
              <div className="flex-1 min-w-0">
                <div
                  className="truncate"
                  style={{ fontSize: 13, fontWeight: 600, lineHeight: 1.2 }}
                >
                  {contact.name}
                </div>
                <div
                  className="truncate"
                  style={{ fontSize: 11, color: "var(--text-muted)" }}
                >
                  <span style={{ color: "var(--brand-400)" }}>● online</span>
                  <span style={{ margin: "0 6px", opacity: 0.4 }}>·</span>
                  <span className="font-mono">{contact.phone}</span>
                </div>
              </div>

              <HeaderButton onClick={() => toast.info("Transferir — em breve.")}>
                Transferir
              </HeaderButton>
              <HeaderButton primary onClick={() => openSchedule()}>
                <span className="inline-flex items-center" style={{ gap: 4 }}>
                  <CalendarPlus size={13} /> Agendar
                </span>
              </HeaderButton>
              <IconBtn label="Mais ações" onClick={() => setMenuOpen((v) => !v)}>
                <MoreVertical size={15} />
              </IconBtn>
              <IconBtn label="Fechar" onClick={onClose}>
                <X size={15} />
              </IconBtn>

              {menuOpen && (
                <div
                  style={{
                    position: "absolute",
                    top: 46,
                    right: 8,
                    width: 220,
                    background: "var(--bg-surface)",
                    border: "1px solid var(--border-strong)",
                    borderRadius: 8,
                    boxShadow: "0 10px 28px rgba(0,0,0,0.18)",
                    padding: 4,
                    zIndex: 60,
                    animation: "fadeSlideIn 150ms ease-out",
                  }}
                  onMouseLeave={() => setMenuOpen(false)}
                >
                  <MenuItem icon={<UserPlus size={14} />} onClick={() => menuAction("Transferir para agente")}>
                    Transferir para agente
                  </MenuItem>
                  <MenuItem icon={<AlertOctagon size={14} />} onClick={() => menuAction("Marcar como urgente")}>
                    Marcar como urgente
                  </MenuItem>
                  <MenuItem icon={<Tag size={14} />} onClick={() => menuAction("Adicionar tag")}>
                    Adicionar tag
                  </MenuItem>
                  <MenuItem icon={<CalendarPlus size={14} />} onClick={() => { setMenuOpen(false); openSchedule(); }}>
                    Agendar atendimento
                  </MenuItem>
                  <MenuItem icon={<Ban size={14} />} onClick={() => menuAction("Bloquear contato")}>
                    Bloquear contato
                  </MenuItem>
                  <MenuItem icon={<ExternalLink size={14} />} onClick={() => menuAction("Ver perfil completo")}>
                    Ver perfil completo
                  </MenuItem>
                </div>
              )}
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
                    padding: "10px 12px",
                    fontSize: 12,
                    fontWeight: 500,
                    background: "transparent",
                    color: tab === t.id ? "var(--text-primary)" : "var(--text-muted)",
                    borderBottom:
                      tab === t.id
                        ? "2px solid var(--brand-400)"
                        : "2px solid transparent",
                    marginBottom: -1,
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 6,
                  }}
                >
                  <span>{t.icon}</span>
                  {t.label}
                </button>
              ))}
            </div>

            {/* Body */}
            {tab === "conversation" ? (
              <>
                <div
                  ref={scrollRef}
                  className="flex-1 overflow-y-auto"
                  style={{ padding: 16, background: "var(--bg-base)" }}
                >
                  <div className="flex flex-col" style={{ gap: 8 }}>
                    {messages.map((m) => (
                      <MessageBubble key={m.id} m={m} />
                    ))}
                    <div
                      style={{
                        fontSize: 11,
                        color: "var(--text-muted)",
                        opacity: 0.7,
                        marginTop: 4,
                        height: 14,
                      }}
                    >
                      {/* digitando indicator (placeholder) */}
                    </div>
                  </div>
                </div>

                {/* Composer */}
                <Composer
                  draft={draft}
                  setDraft={setDraft}
                  taRef={taRef}
                  onKeyDown={onKeyDown}
                  onSend={send}
                />
              </>
            ) : (
              <div className="flex-1 overflow-y-auto" style={{ padding: 16 }}>
                {tab === "contact" && <ContactTab contact={contact} />}
                {tab === "services" && (
                  <ServicesTab onSchedule={(ids) => openSchedule(ids)} />
                )}
                {tab === "history" && <HistoryTab contactId={contact.id} />}
              </div>
            )}
          </>
        )}
      </aside>

      {contact && (
        <ScheduleModal
          contact={contact}
          open={scheduleOpen}
          onClose={() => setScheduleOpen(false)}
          preselectedServiceIds={scheduleSeed}
          onScheduled={() => {
            onContactUpdate?.(contact.id, { kanban_column: "scheduled" });
          }}
        />
      )}
    </>
  );
}

/* ---------------- subcomponents ---------------- */

function MessageBubble({ m }: { m: Message }) {
  if (m.message_type === "system") {
    return (
      <div
        style={{
          alignSelf: "center",
          fontSize: 11,
          color: "var(--text-muted)",
          textAlign: "center",
          padding: "6px 0",
          display: "flex",
          alignItems: "center",
          gap: 8,
          width: "100%",
        }}
      >
        <span style={{ flex: 1, height: 1, background: "var(--border)" }} />
        <span>{m.content}</span>
        <span style={{ flex: 1, height: 1, background: "var(--border)" }} />
      </div>
    );
  }

  const isMe = m.direction === "outbound";
  return (
    <div
      style={{
        alignSelf: isMe ? "flex-end" : "flex-start",
        maxWidth: "75%",
        background: isMe
          ? "color-mix(in oklab, var(--brand-400) 15%, var(--bg-surface))"
          : "var(--bg-overlay)",
        border: isMe
          ? "1px solid color-mix(in oklab, var(--brand-400) 30%, transparent)"
          : "1px solid var(--border)",
        borderRadius: isMe ? "12px 2px 12px 12px" : "2px 12px 12px 12px",
        padding: "8px 11px",
        fontSize: 14,
        lineHeight: 1.4,
        color: "var(--text-primary)",
        animation: "fadeSlideIn 200ms ease-out",
        wordBreak: "break-word",
      }}
    >
      {m.content}
      <div
        style={{
          marginTop: 4,
          fontSize: 11,
          color: "var(--text-muted)",
          textAlign: "right",
          display: "inline-flex",
          alignItems: "center",
          gap: 4,
          float: "right",
          marginLeft: 8,
        }}
      >
        {formatRelative(m.created_at)}
        {isMe && (
          <CheckCheck
            size={13}
            color={m.status === "read" ? "var(--brand-400)" : "var(--text-muted)"}
          />
        )}
      </div>
      <div style={{ clear: "both" }} />
    </div>
  );
}

function Composer({
  draft,
  setDraft,
  taRef,
  onKeyDown,
  onSend,
}: {
  draft: string;
  setDraft: (s: string) => void;
  taRef: React.RefObject<HTMLTextAreaElement | null>;
  onKeyDown: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void;
  onSend: () => void;
}) {
  const nearLimit = draft.length > MAX_CHARS - 200;
  return (
    <div style={{ padding: 10, borderTop: "1px solid var(--border)" }}>
      <div
        className="flex items-end"
        style={{
          gap: 4,
          border: "1px solid var(--border-strong)",
          borderRadius: 10,
          padding: 6,
          background: "var(--bg-base)",
        }}
      >
        <IconBtn label="Emoji">
          <Smile size={15} />
        </IconBtn>
        <IconBtn label="Anexar">
          <Paperclip size={15} />
        </IconBtn>
        <textarea
          ref={taRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value.slice(0, MAX_CHARS))}
          onKeyDown={onKeyDown}
          placeholder="Digite uma mensagem… (Enter envia, Shift+Enter quebra linha)"
          rows={1}
          className="chat-input-textarea"
          onInput={(e) => {
            const el = e.currentTarget;
            el.style.height = "auto";
            const lineH = 20;
            el.style.height = Math.min(lineH * 5 + 12, el.scrollHeight) + "px";
          }}
          style={{
            flex: 1,
            resize: "none",
            overflow: "hidden",
            background: "transparent",
            outline: "none",
            border: "none",
            color: "var(--text-primary)",
            fontSize: 14,
            fontFamily: "inherit",
            lineHeight: "20px",
            padding: "6px 4px",
            maxHeight: 5 * 20 + 12,
          }}
        />
        <IconBtn label="Áudio">
          <Mic size={15} />
        </IconBtn>
        <button
          type="button"
          onClick={onSend}
          aria-label="Enviar"
          className="inline-flex items-center justify-center shrink-0"
          disabled={!draft.trim()}
          style={{
            width: 32,
            height: 32,
            borderRadius: 8,
            background: "var(--brand-400)",
            color: "#fff",
            opacity: draft.trim() ? 1 : 0.4,
            transition: "background 150ms ease",
          }}
          onMouseEnter={(e) => {
            if (draft.trim()) e.currentTarget.style.background = "var(--brand-600)";
          }}
          onMouseLeave={(e) => (e.currentTarget.style.background = "var(--brand-400)")}
        >
          <Send size={14} />
        </button>
      </div>
      {nearLimit && (
        <div
          style={{
            marginTop: 4,
            fontSize: 11,
            textAlign: "right",
            color: draft.length >= MAX_CHARS ? "#EF4444" : "var(--text-muted)",
          }}
        >
          {draft.length} / {MAX_CHARS}
        </div>
      )}
    </div>
  );
}

function HeaderButton({
  children,
  onClick,
  primary,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  primary?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        height: 28,
        padding: "0 10px",
        borderRadius: 6,
        fontSize: 12,
        fontWeight: 500,
        background: primary ? "var(--brand-400)" : "transparent",
        color: primary ? "#fff" : "var(--text-primary)",
        border: primary ? "none" : "1px solid var(--border-strong)",
        transition: "background 150ms ease",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = primary
          ? "var(--brand-600)"
          : "var(--bg-overlay)";
      }}
      onMouseLeave={(e) =>
        (e.currentTarget.style.background = primary ? "var(--brand-400)" : "transparent")
      }
    >
      {children}
    </button>
  );
}

function IconBtn({
  children,
  onClick,
  label,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className="inline-flex items-center justify-center shrink-0"
      style={{
        width: 30,
        height: 30,
        borderRadius: 6,
        background: "transparent",
        color: "var(--text-muted)",
      }}
      onMouseEnter={(e) => (e.currentTarget.style.background = "var(--bg-overlay)")}
      onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
    >
      {children}
    </button>
  );
}

function MenuItem({
  children,
  icon,
  onClick,
}: {
  children: React.ReactNode;
  icon: React.ReactNode;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center w-full"
      style={{
        gap: 8,
        padding: "8px 10px",
        fontSize: 13,
        color: "var(--text-primary)",
        background: "transparent",
        borderRadius: 6,
        textAlign: "left",
      }}
      onMouseEnter={(e) => (e.currentTarget.style.background = "var(--bg-overlay)")}
      onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
    >
      <span style={{ color: "var(--text-muted)" }}>{icon}</span>
      {children}
    </button>
  );
}

/* ---------------- tab panes ---------------- */

function Field({
  label,
  value,
  onChange,
  multiline,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  multiline?: boolean;
}) {
  const sharedStyle: React.CSSProperties = {
    width: "100%",
    background: "var(--bg-base)",
    border: "1px solid var(--border-strong)",
    borderRadius: 6,
    color: "var(--text-primary)",
    fontSize: 13,
    padding: "8px 10px",
    outline: "none",
    fontFamily: "inherit",
  };
  return (
    <label className="flex flex-col" style={{ gap: 4 }}>
      <span
        style={{
          fontSize: 11,
          color: "var(--text-muted)",
          textTransform: "uppercase",
          letterSpacing: "0.05em",
        }}
      >
        {label}
      </span>
      {multiline ? (
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          rows={3}
          style={{ ...sharedStyle, resize: "vertical", lineHeight: 1.4 }}
        />
      ) : (
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          style={{ ...sharedStyle, height: 34 }}
        />
      )}
    </label>
  );
}

function ContactTab({ contact }: { contact: Contact }) {
  const [name, setName] = React.useState(contact.name);
  const [phone, setPhone] = React.useState(contact.phone);
  const [email, setEmail] = React.useState("");
  const [notes, setNotes] = React.useState("");
  const [tags, setTags] = React.useState<string[]>(contact.tags);
  const [newTag, setNewTag] = React.useState("");

  React.useEffect(() => {
    setName(contact.name);
    setPhone(contact.phone);
    setEmail("");
    setNotes("");
    setTags(contact.tags);
  }, [contact.id]);

  const addTag = () => {
    const t = newTag.trim();
    if (!t || tags.includes(t)) return;
    setTags([...tags, t]);
    setNewTag("");
  };

  return (
    <div className="flex flex-col" style={{ gap: 12 }}>
      <Field label="Nome" value={name} onChange={setName} />
      <Field label="Telefone" value={phone} onChange={setPhone} />
      <Field label="Email" value={email} onChange={setEmail} />
      <Field label="Observações" value={notes} onChange={setNotes} multiline />

      <div className="flex flex-col" style={{ gap: 6 }}>
        <span
          style={{
            fontSize: 11,
            color: "var(--text-muted)",
            textTransform: "uppercase",
            letterSpacing: "0.05em",
          }}
        >
          Tags
        </span>
        <div className="flex flex-wrap" style={{ gap: 4 }}>
          {tags.map((t) => (
            <span
              key={t}
              className="inline-flex items-center"
              style={{
                gap: 4,
                padding: "3px 4px 3px 8px",
                background: "var(--bg-overlay)",
                border: "1px solid var(--border)",
                borderRadius: 999,
                fontSize: 11,
                color: "var(--text-primary)",
              }}
            >
              {t}
              <button
                type="button"
                onClick={() => setTags(tags.filter((x) => x !== t))}
                aria-label={`Remover ${t}`}
                style={{
                  width: 16,
                  height: 16,
                  borderRadius: 999,
                  background: "transparent",
                  color: "var(--text-muted)",
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <X size={10} />
              </button>
            </span>
          ))}
          <div className="inline-flex items-center" style={{ gap: 4 }}>
            <input
              value={newTag}
              onChange={(e) => setNewTag(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addTag();
                }
              }}
              placeholder="Nova tag…"
              style={{
                height: 24,
                width: 100,
                fontSize: 11,
                padding: "0 8px",
                borderRadius: 999,
                border: "1px dashed var(--border-strong)",
                background: "transparent",
                color: "var(--text-primary)",
                outline: "none",
              }}
            />
            <button
              type="button"
              onClick={addTag}
              aria-label="Adicionar tag"
              style={{
                width: 24,
                height: 24,
                borderRadius: 999,
                background: "var(--bg-overlay)",
                color: "var(--text-primary)",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Plus size={12} />
            </button>
          </div>
        </div>
      </div>

      <div className="flex flex-col" style={{ gap: 6, marginTop: 4 }}>
        <span
          style={{
            fontSize: 11,
            color: "var(--text-muted)",
            textTransform: "uppercase",
            letterSpacing: "0.05em",
          }}
        >
          Histórico de serviços
        </span>
        <div
          style={{
            fontSize: 12,
            color: "var(--text-muted)",
            padding: 12,
            border: "1px dashed var(--border)",
            borderRadius: 8,
            textAlign: "center",
          }}
        >
          Nenhum serviço registrado para este contato.
        </div>
      </div>

      <button
        type="button"
        onClick={() => toast.success("Contato atualizado.")}
        className="btn-primary"
        style={{ alignSelf: "flex-start", marginTop: 4 }}
      >
        Salvar alterações
      </button>
    </div>
  );
}

const CATALOG: Array<{ id: string; name: string; price: number; minutes: number }> = [
  { id: "s1", name: "Corte feminino", price: 80, minutes: 45 },
  { id: "s2", name: "Coloração", price: 220, minutes: 120 },
  { id: "s3", name: "Hidratação", price: 60, minutes: 30 },
  { id: "s4", name: "Manicure", price: 45, minutes: 40 },
  { id: "s5", name: "Pedicure", price: 55, minutes: 45 },
];

function ServicesTab({ onSchedule }: { onSchedule: (serviceIds: string[]) => void }) {
  const catalog: Service[] = SEED_SERVICES.filter((s) => s.status === "active");
  const [selected, setSelected] = React.useState<Set<string>>(new Set());
  const sel = catalog.filter((s) => selected.has(s.id));
  const totalCents = sel.reduce((a, s) => a + s.price_cents, 0);
  const totalMin = sel.reduce((a, s) => a + s.duration_minutes, 0);
  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <div className="flex flex-col" style={{ gap: 8, paddingBottom: 80 }}>
      <p style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 4 }}>
        Marque os serviços de interesse do cliente. Eles serão pré-selecionados ao agendar.
      </p>
      {catalog.map((s) => {
        const on = selected.has(s.id);
        return (
          <button
            key={s.id}
            type="button"
            onClick={() => toggle(s.id)}
            className="flex items-center w-full"
            style={{
              gap: 10,
              padding: "10px 12px",
              borderRadius: 8,
              border: on
                ? "1px solid color-mix(in oklab, var(--brand-400) 60%, transparent)"
                : "1px solid var(--border)",
              background: on
                ? "color-mix(in oklab, var(--brand-400) 10%, var(--bg-surface))"
                : "var(--bg-surface)",
              textAlign: "left",
              transition: "all 150ms ease",
            }}
          >
            <span
              className="inline-flex items-center justify-center shrink-0"
              style={{
                width: 18,
                height: 18,
                borderRadius: 4,
                border: "1.5px solid",
                borderColor: on ? "var(--brand-400)" : "var(--border-strong)",
                background: on ? "var(--brand-400)" : "transparent",
                color: "#fff",
              }}
            >
              {on && <Check size={12} />}
            </span>
            <div className="flex-1 min-w-0">
              <div style={{ fontSize: 13, fontWeight: 500, color: "var(--text-primary)" }}>
                {s.name}
              </div>
              <div style={{ fontSize: 11, color: "var(--text-muted)" }}>
                {formatDuration(s.duration_minutes)}
              </div>
            </div>
            <div className="font-mono" style={{ fontSize: 13, color: "var(--text-primary)" }}>
              {formatCurrencyBRL(s.price_cents)}
            </div>
          </button>
        );
      })}

      {/* Sticky footer */}
      <div
        style={{
          position: "sticky",
          bottom: -16,
          marginTop: 8,
          marginInline: -16,
          marginBottom: -16,
          padding: 12,
          background: "var(--bg-surface)",
          borderTop: "1px solid var(--border)",
          display: "flex",
          alignItems: "center",
          gap: 10,
        }}
      >
        <div className="flex-1">
          <div style={{ fontSize: 11, color: "var(--text-muted)" }}>
            {sel.length} selecionado{sel.length === 1 ? "" : "s"} · {formatDuration(totalMin)}
          </div>
          <div className="font-mono" style={{ fontSize: 14, fontWeight: 600, color: "var(--text-primary)" }}>
            {formatCurrencyBRL(totalCents)}
          </div>
        </div>
        <button
          type="button"
          onClick={() => onSchedule(sel.map((s) => s.id))}
          disabled={sel.length === 0}
          className="inline-flex items-center"
          style={{
            gap: 6,
            height: 34,
            padding: "0 12px",
            borderRadius: 6,
            background: "var(--brand-400)",
            color: "#fff",
            fontSize: 13,
            fontWeight: 600,
            border: "none",
            opacity: sel.length === 0 ? 0.5 : 1,
            cursor: sel.length === 0 ? "not-allowed" : "pointer",
          }}
        >
          <CalendarPlus size={14} /> Agendar serviços selecionados
        </button>
      </div>
    </div>
  );
}

interface HistoryItem {
  id: string;
  starts_at: Date;
  status: string;
  agent_name: string;
  services: Array<{ name: string; price_cents: number }>;
  total_cents: number;
}

const STATUS_PT: Record<string, { label: string; color: string }> = {
  completed: { label: "Realizado", color: "#25C880" },
  cancelled: { label: "Cancelado", color: "#EF4444" },
  no_show: { label: "Faltou", color: "#F59E0B" },
  scheduled: { label: "Agendado", color: "#3B82F6" },
  confirmed: { label: "Confirmado", color: "#3B82F6" },
  in_progress: { label: "Em andamento", color: "#F59E0B" },
};

function HistoryTab({ contactId }: { contactId: string }) {
  const [items, setItems] = React.useState<HistoryItem[]>([]);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from("appointments")
        .select("id,starts_at,status,agent_id,appointment_services(price_cents,duration_minutes,services(name))")
        .eq("contact_id", contactId)
        .order("starts_at", { ascending: false });
      if (cancelled) return;
      if (error || !data) {
        setItems([]);
      } else {
        setItems(
          data.map((r: any) => {
            const svcs = (r.appointment_services ?? []).map((as: any) => ({
              name: as.services?.name ?? "Serviço",
              price_cents: as.price_cents ?? 0,
            }));
            return {
              id: r.id,
              starts_at: new Date(r.starts_at),
              status: r.status ?? "scheduled",
              agent_name: r.agent_id ?? "—",
              services: svcs,
              total_cents: svcs.reduce((a: number, s: any) => a + (s.price_cents ?? 0), 0),
            };
          }),
        );
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [contactId]);

  if (loading) {
    return <div style={{ fontSize: 12, color: "var(--text-muted)", padding: 12 }}>Carregando…</div>;
  }

  if (items.length === 0) {
    return (
      <div
        style={{
          fontSize: 12,
          color: "var(--text-muted)",
          padding: 16,
          textAlign: "center",
          border: "1px dashed var(--border)",
          borderRadius: 8,
        }}
      >
        Nenhum agendamento anterior para este contato.
      </div>
    );
  }

  return (
    <div className="flex flex-col" style={{ gap: 10 }}>
      {items.map((it) => {
        const st = STATUS_PT[it.status] ?? { label: it.status, color: "var(--text-muted)" };
        const dt = it.starts_at.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit" });
        const tm = it.starts_at.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
        return (
          <div
            key={it.id}
            style={{
              padding: 10,
              borderRadius: 8,
              border: "1px solid var(--border)",
              background: "var(--bg-surface)",
            }}
          >
            <div className="flex items-center justify-between" style={{ gap: 8 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>
                {dt} · {tm}
              </div>
              <span
                style={{
                  fontSize: 11,
                  padding: "2px 8px",
                  borderRadius: 999,
                  border: `1px solid ${st.color}`,
                  color: st.color,
                }}
              >
                {st.label}
              </span>
            </div>
            {it.services.length > 0 && (
              <div className="flex flex-wrap" style={{ gap: 4, marginTop: 6 }}>
                {it.services.map((s, i) => (
                  <span
                    key={i}
                    style={{
                      fontSize: 11,
                      padding: "2px 6px",
                      borderRadius: 4,
                      background: "var(--bg-overlay)",
                      color: "var(--text-muted)",
                    }}
                  >
                    {s.name}
                  </span>
                ))}
              </div>
            )}
            {it.total_cents > 0 && (
              <div className="font-mono" style={{ marginTop: 6, fontSize: 12, color: "var(--text-primary)" }}>
                {formatCurrencyBRL(it.total_cents)}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
