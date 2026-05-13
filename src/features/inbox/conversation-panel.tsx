import * as React from "react";
import {
  X,
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
  FileText,
  Download,
  Play,
  Pause,
  Mic,
  ChevronDown,
} from "lucide-react";
import { Composer } from "./composer";
import { type ContactCard as Contact, formatRelative, initials } from "./data";
import { ContactAvatar } from "./contact-avatar";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import { sendWhatsAppMessage, refreshContactAvatar, sendWhatsAppMedia, sendWhatsAppAudio, reactToMessage, deleteMessageForEveryone, editMessage } from "@/lib/evolution.functions";
import { ScheduleModal } from "./schedule-modal";
import { MessageActions } from "./message-actions";
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
  message_type: "text" | "image" | "audio" | "video" | "document" | "system";
  status: "sent" | "delivered" | "read";
  created_at: Date;
  media_url?: string | null;
  media_mime?: string | null;
  media_name?: string | null;
  whatsapp_message_id?: string | null;
  quoted_preview?: { content?: string; author?: string; message_type?: string } | null;
  reactions?: Array<{ emoji: string; from: string }> | null;
  deleted_at?: string | null;
  edited_at?: string | null;
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
  const sendMediaFn = useServerFn(sendWhatsAppMedia);
  const sendAudioFn = useServerFn(sendWhatsAppAudio);
  const refreshAvatar = useServerFn(refreshContactAvatar);
  const reactFn = useServerFn(reactToMessage);
  const deleteFn = useServerFn(deleteMessageForEveryone);
  const editFn = useServerFn(editMessage);
  const [tab, setTab] = React.useState<Tab>("conversation");
  const [draft, setDraft] = React.useState("");
  const [menuOpen, setMenuOpen] = React.useState(false);
  const [messages, setMessages] = React.useState<Message[]>([]);
  const [scheduleOpen, setScheduleOpen] = React.useState(false);
  const [scheduleSeed, setScheduleSeed] = React.useState<string[] | undefined>(undefined);
  const [replyingTo, setReplyingTo] = React.useState<Message | null>(null);
  const [editingId, setEditingId] = React.useState<string | null>(null);
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
    setReplyingTo(null);
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
        .select("id,direction,content,message_type,status,created_at,media_url,media_mime,media_name,whatsapp_message_id,quoted_preview,reactions,deleted_at,edited_at")
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
            media_url: r.media_url ?? null,
            media_mime: r.media_mime ?? null,
            media_name: r.media_name ?? null,
            whatsapp_message_id: r.whatsapp_message_id ?? null,
            quoted_preview: r.quoted_preview ?? null,
            reactions: r.reactions ?? [],
            deleted_at: r.deleted_at ?? null,
            edited_at: r.edited_at ?? null,
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
                    media_url: r.media_url ?? null,
                    media_mime: r.media_mime ?? null,
                    media_name: r.media_name ?? null,
                    whatsapp_message_id: r.whatsapp_message_id ?? null,
                    quoted_preview: r.quoted_preview ?? null,
                    reactions: r.reactions ?? [],
                    deleted_at: r.deleted_at ?? null,
                    edited_at: r.edited_at ?? null,
                  },
                ],
          );
        },
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "messages",
          filter: `contact_id=eq.${contact.id}`,
        },
        (payload: any) => {
          const r = payload.new;
          setMessages((prev) =>
            prev.map((m) =>
              m.id === r.id
                ? {
                    ...m,
                    status: r.status ?? m.status,
                    content: r.content ?? m.content,
                    media_url: r.media_url ?? m.media_url,
                    media_mime: r.media_mime ?? m.media_mime,
                    media_name: r.media_name ?? m.media_name,
                    whatsapp_message_id: r.whatsapp_message_id ?? m.whatsapp_message_id,
                    quoted_preview: r.quoted_preview ?? m.quoted_preview,
                    reactions: r.reactions ?? m.reactions,
                    deleted_at: r.deleted_at ?? m.deleted_at,
                    edited_at: r.edited_at ?? m.edited_at,
                  }
                : m,
            ),
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

  const buildQuoted = (m: Message | null) => {
    if (!m || !contact?.phone || !m.whatsapp_message_id) return undefined;
    const number = String(contact.phone).replace(/\D/g, "");
    return {
      messageId: m.whatsapp_message_id,
      fromMe: m.direction === "outbound",
      remoteJid: `${number}@s.whatsapp.net`,
      preview: {
        content: m.content || m.media_name || "",
        message_type: m.message_type,
      },
    };
  };

  const send = async () => {
    const text = draft.trim();
    if (!text || !contact) return;
    // Sem optimistic update: o canal realtime é a fonte da verdade.
    // Isso evita duplicação (mensagem aparecendo 2x para o agente).
    setDraft("");
    if (taRef.current) taRef.current.style.height = "auto";
    const quoted = buildQuoted(replyingTo);
    setReplyingTo(null);

    try {
      // tenta enviar pelo WhatsApp via Evolution; o handler já grava em messages
      await sendViaEvolution({ data: { contactId: contact.id, text, quoted } });
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

  // Upload arquivo no Storage e devolve URL pública
  const uploadToStorage = async (file: File, ext?: string): Promise<{ url: string; path: string }> => {
    if (!user?.id) throw new Error("Sessão expirada.");
    const safeName = file.name.replace(/[^\w.\-]/g, "_").slice(-80);
    const finalExt = ext ?? (safeName.includes(".") ? "" : "bin");
    const path = `${user.id}/${Date.now()}-${crypto.randomUUID()}-${safeName}${finalExt ? "." + finalExt : ""}`;
    const { error } = await supabase.storage
      .from("chat-media")
      .upload(path, file, { contentType: file.type, upsert: false });
    if (error) throw new Error(`Upload falhou: ${error.message}`);
    const { data } = supabase.storage.from("chat-media").getPublicUrl(path);
    return { url: data.publicUrl, path };
  };

  const handleSendAttachments = async (files: File[], caption: string) => {
    if (!contact) return;
    const quoted = buildQuoted(replyingTo);
    setReplyingTo(null);
    for (let i = 0; i < files.length; i++) {
      const f = files[i];
      const { url } = await uploadToStorage(f);
      const cap = i === 0 ? caption : "";
      try {
        await sendMediaFn({
          data: {
            contactId: contact.id,
            url,
            mime: f.type || "application/octet-stream",
            name: f.name || `file-${Date.now()}`,
            caption: cap || undefined,
            quoted: i === 0 ? quoted : undefined,
          },
        });
      } catch (e: any) {
        toast.error(e?.message ?? "Falha no envio.");
      }
    }
  };

  const handleSendAudio = async (blob: Blob) => {
    if (!contact) return;
    const file = new File([blob], `audio-${Date.now()}.webm`, { type: "audio/webm" });
    const { url } = await uploadToStorage(file);
    const quoted = buildQuoted(replyingTo);
    setReplyingTo(null);
    await sendAudioFn({ data: { contactId: contact.id, url, quoted } });
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
              style={{
                borderBottom: "1px solid var(--border)",
                padding: "0 8px",
                background: "var(--bg-overlay)",
                height: 36,
              }}
            >
              {TABS.map((t) => (
                <button
                  key={t.id}
                  onClick={() => setTab(t.id)}
                  style={{
                    padding: "0 12px",
                    height: 36,
                    fontSize: 12,
                    fontWeight: 500,
                    background: "transparent",
                    color: tab === t.id ? "var(--brand-400)" : "var(--text-muted)",
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
                      <MessageBubble
                        key={m.id}
                        m={m}
                        displayStatus={getVisualMessageStatus(m)}
                        contactName={contact.name}
                        contactAvatar={contact.avatar}
                        onReply={(msg) => {
                          setReplyingTo(msg);
                          setTimeout(() => taRef.current?.focus(), 0);
                        }}
                        onReact={async (msg, emoji) => {
                          // optimistic update
                          setMessages((prev) =>
                            prev.map((x) =>
                              x.id === msg.id
                                ? {
                                    ...x,
                                    reactions: [
                                      ...((x.reactions ?? []).filter((r) => r.from !== "me")),
                                      { emoji, from: "me" },
                                    ],
                                  }
                                : x,
                            ),
                          );
                          try {
                            await reactFn({ data: { messageId: msg.id, reaction: emoji } });
                          } catch (e: any) {
                            toast.error(e?.message ?? "Falha ao reagir");
                          }
                        }}
                        editing={editingId === m.id}
                        onStartEdit={() => setEditingId(m.id)}
                        onCancelEdit={() => setEditingId(null)}
                        onSaveEdit={async (text) => {
                          const trimmed = text.trim();
                          if (!trimmed) return;
                          const prevContent = m.content;
                          setMessages((prev) =>
                            prev.map((x) =>
                              x.id === m.id ? { ...x, content: trimmed, edited_at: new Date().toISOString() } : x,
                            ),
                          );
                          setEditingId(null);
                          try {
                            await editFn({ data: { messageId: m.id, text: trimmed } });
                          } catch (e: any) {
                            toast.error(e?.message ?? "Falha ao editar");
                            setMessages((prev) =>
                              prev.map((x) => (x.id === m.id ? { ...x, content: prevContent } : x)),
                            );
                          }
                        }}
                        onDelete={async () => {
                          if (!confirm("Apagar esta mensagem para todos?")) return;
                          try {
                            await deleteFn({ data: { messageId: m.id } });
                            setMessages((prev) =>
                              prev.map((x) =>
                                x.id === m.id ? { ...x, deleted_at: new Date().toISOString() } : x,
                              ),
                            );
                          } catch (e: any) {
                            toast.error(e?.message ?? "Falha ao apagar");
                          }
                        }}
                      />
                    ))}
                  </div>
                </div>

                {/* Composer */}
                <Composer
                  draft={draft}
                  setDraft={setDraft}
                  taRef={taRef}
                  onSend={send}
                  onClosePanel={onClose}
                  onSendAttachments={handleSendAttachments}
                  onSendAudio={handleSendAudio}
                  replyingTo={
                    replyingTo
                      ? {
                          author: replyingTo.direction === "outbound" ? "Você" : contact.name,
                          content: replyingTo.content || replyingTo.media_name || "Mídia",
                          isMe: replyingTo.direction === "outbound",
                        }
                      : null
                  }
                  onCancelReply={() => setReplyingTo(null)}
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

function MessageBubble({
  m,
  displayStatus,
  contactName,
  contactAvatar,
  onReply,
  onReact,
  editing,
  onStartEdit,
  onCancelEdit,
  onSaveEdit,
  onDelete,
}: {
  m: Message;
  displayStatus: Message["status"];
  contactName: string;
  contactAvatar?: string | null;
  onReply?: (m: Message) => void;
  onReact?: (m: Message, emoji: string) => void;
  editing?: boolean;
  onStartEdit?: () => void;
  onCancelEdit?: () => void;
  onSaveEdit?: (text: string) => void;
  onDelete?: () => void;
}) {
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

  // ===== Deleted message =====
  if (m.deleted_at) {
    const delBg = isMe
      ? "color-mix(in oklab, var(--brand-400) 8%, var(--bg-surface))"
      : "var(--bg-overlay)";
    return (
      <div
        style={{
          alignSelf: isMe ? "flex-end" : "flex-start",
          maxWidth: "75%",
          background: delBg,
          border: "1px dashed var(--border)",
          borderRadius: isMe ? "12px 2px 12px 12px" : "2px 12px 12px 12px",
          padding: "8px 11px",
          fontSize: 13,
          fontStyle: "italic",
          color: "var(--text-muted)",
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
        }}
      >
        <Trash2 size={13} />
        <span>Esta mensagem foi apagada</span>
        <span style={{ marginLeft: 6, fontSize: 11 }}>{fmtClock(m.created_at)}</span>
      </div>
    );
  }

  // ===== Audio: WhatsApp-like player as the bubble itself =====
  if (m.message_type === "audio" && m.media_url) {
    const audioBg = isMe
      ? "color-mix(in oklab, var(--brand-400) 15%, var(--bg-surface))"
      : "var(--bg-overlay)";
    return (
      <div
        className="group/msg relative"
        style={{
          alignSelf: isMe ? "flex-end" : "flex-start",
          maxWidth: "85%",
          background: audioBg,
          border: isMe
            ? "1px solid color-mix(in oklab, var(--brand-400) 30%, transparent)"
            : "1px solid var(--border)",
          borderRadius: isMe ? "16px 4px 16px 16px" : "4px 16px 16px 16px",
          padding: "6px 10px 4px",
          animation: "fadeSlideIn 200ms ease-out",
        }}
      >
        <MessageChevron isMe={isMe} bubbleBg={audioBg} message={m} onReply={onReply} onReact={onReact} />
        {m.quoted_preview && <QuotedPreview preview={m.quoted_preview} isMe={isMe} />}
        <AudioPlayer
          src={m.media_url}
          avatarName={contactName}
          avatarUrl={contactAvatar ?? null}
          isMe={isMe}
        />
        <div
          style={{
            marginTop: 2,
            fontSize: 11,
            color: "var(--text-muted)",
            textAlign: "right",
            display: "inline-flex",
            alignItems: "center",
            gap: 4,
            float: "right",
          }}
        >
          {fmtClock(m.created_at)}
          {isMe && <StatusTicks status={displayStatus} />}
        </div>
        <div style={{ clear: "both" }} />
        <ReactionsRow reactions={m.reactions} isMe={isMe} />
      </div>
    );
  }

  const bubbleBg = isMe
    ? "color-mix(in oklab, var(--brand-400) 15%, var(--bg-surface))"
    : "var(--bg-overlay)";
  return (
    <div
      className="group/msg relative"
      style={{
        alignSelf: isMe ? "flex-end" : "flex-start",
        maxWidth: "75%",
        background: bubbleBg,
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
      <MessageChevron isMe={isMe} bubbleBg={bubbleBg} message={m} onReply={onReply} onReact={onReact} />
      {m.quoted_preview && <QuotedPreview preview={m.quoted_preview} isMe={isMe} />}
      {m.media_url && m.message_type === "image" && (
        <a href={m.media_url} target="_blank" rel="noreferrer" style={{ display: "block", marginBottom: m.content ? 6 : 0 }}>
          <img
            src={m.media_url}
            alt={m.media_name ?? "imagem"}
            style={{ display: "block", maxWidth: 260, maxHeight: 320, width: "100%", borderRadius: 8, objectFit: "cover" }}
          />
        </a>
      )}
      {m.media_url && m.message_type === "video" && (
        <video
          controls
          src={m.media_url}
          style={{ display: "block", maxWidth: 260, width: "100%", borderRadius: 8, marginBottom: m.content ? 6 : 0 }}
        />
      )}
      {m.media_url && m.message_type === "document" && (
        <a
          href={m.media_url}
          target="_blank"
          rel="noreferrer"
          download={m.media_name ?? undefined}
          style={{
            display: "inline-flex", alignItems: "center", gap: 8,
            padding: "8px 10px", borderRadius: 8,
            background: "var(--bg-surface)",
            border: "1px solid var(--border)",
            color: "var(--text-primary)", textDecoration: "none",
            marginBottom: m.content ? 6 : 0, maxWidth: 240,
          }}
        >
          <FileText size={18} style={{ flexShrink: 0, color: "var(--brand-400)" }} />
          <span style={{ flex: 1, minWidth: 0, fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {m.media_name ?? "Documento"}
          </span>
          <Download size={14} style={{ flexShrink: 0, color: "var(--text-muted)" }} />
        </a>
      )}
      {m.content && <div>{m.content}</div>}
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
        {fmtClock(m.created_at)}
        {isMe && <StatusTicks status={displayStatus} />}
      </div>
      <div style={{ clear: "both" }} />
      <ReactionsRow reactions={m.reactions} isMe={isMe} />
    </div>
  );
}

function getVisualMessageStatus(message: Message): Message["status"] {
  return message.status;
}

function fmtClock(date: Date): string {
  return date.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

function ReactionsRow({
  reactions,
  isMe,
}: {
  reactions?: Array<{ emoji: string; from: string }> | null;
  isMe: boolean;
}) {
  if (!reactions || reactions.length === 0) return null;
  const counts = reactions.reduce<Record<string, number>>((acc, r) => {
    if (!r?.emoji) return acc;
    acc[r.emoji] = (acc[r.emoji] ?? 0) + 1;
    return acc;
  }, {});
  const entries = Object.entries(counts);
  if (entries.length === 0) return null;
  return (
    <div
      style={{
        display: "flex",
        gap: 4,
        marginTop: 2,
        marginBottom: -10,
        justifyContent: isMe ? "flex-end" : "flex-start",
        position: "relative",
        zIndex: 1,
      }}
    >
      {entries.map(([emoji, count]) => (
        <span
          key={emoji}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 3,
            padding: "1px 6px",
            background: "var(--bg-surface)",
            border: "1px solid var(--border)",
            borderRadius: 999,
            fontSize: 12,
            lineHeight: 1.4,
            boxShadow: "0 1px 2px rgba(0,0,0,0.15)",
          }}
        >
          <span style={{ fontSize: 13 }}>{emoji}</span>
          {count > 1 && <span style={{ color: "var(--text-muted)" }}>{count}</span>}
        </span>
      ))}
    </div>
  );
}

function QuotedPreview({
  preview,
  isMe,
}: {
  preview: { content?: string; author?: string; message_type?: string };
  isMe: boolean;
}) {
  const accent = isMe ? "var(--brand-400)" : "#9aa3af";
  const typeLabel =
    preview.message_type === "image" ? "📷 Foto"
    : preview.message_type === "video" ? "🎥 Vídeo"
    : preview.message_type === "audio" ? "🎤 Áudio"
    : preview.message_type === "document" ? "📄 Documento"
    : null;
  return (
    <div
      style={{
        display: "block",
        padding: "6px 8px",
        marginBottom: 6,
        background: "color-mix(in oklab, var(--text-primary) 6%, transparent)",
        borderRadius: 6,
        borderLeft: `3px solid ${accent}`,
        fontSize: 12,
      }}
    >
      <div style={{ fontWeight: 600, color: accent, marginBottom: 2 }}>
        {preview.author || (isMe ? "Você" : "")}
      </div>
      <div
        style={{
          color: "var(--text-muted)",
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        {typeLabel || preview.content || ""}
      </div>
    </div>
  );
}

function MessageChevron({
  isMe,
  bubbleBg,
  message,
  onReply,
  onReact,
}: {
  isMe: boolean;
  bubbleBg: string;
  message: Message;
  onReply?: (m: Message) => void;
  onReact?: (m: Message, emoji: string) => void;
}) {
  return (
    <MessageActions
      bubbleBg={bubbleBg}
      message={{
        id: message.id,
        isMe,
        content: message.content ?? "",
        mediaUrl: message.media_url ?? null,
        mediaName: message.media_name ?? null,
        messageType: message.message_type,
      }}
      onReply={() => onReply?.(message)}
      onReact={(_m, emoji) => onReact?.(message, emoji)}
    />
  );
}

function StatusTicks({ status }: { status: Message["status"] }) {
  if (status === "sent") {
    return <Check size={13} color="var(--text-muted)" />;
  }
  const color = status === "read" ? "#34B7F1" : "var(--text-muted)";
  return <CheckCheck size={13} color={color} />;
}

function fmtTime(s: number): string {
  if (!isFinite(s) || s < 0) s = 0;
  const m = Math.floor(s / 60);
  const ss = Math.floor(s % 60).toString().padStart(2, "0");
  return `${m}:${ss}`;
}

function AudioPlayer({
  src,
  avatarName,
  avatarUrl,
  isMe,
}: {
  src: string;
  avatarName: string;
  avatarUrl: string | null;
  isMe: boolean;
}) {
  const audioRef = React.useRef<HTMLAudioElement | null>(null);
  const trackRef = React.useRef<HTMLDivElement | null>(null);
  const [playing, setPlaying] = React.useState(false);
  const [cur, setCur] = React.useState(0);
  const [dur, setDur] = React.useState(0);
  const [seeking, setSeeking] = React.useState(false);

  React.useEffect(() => {
    const a = audioRef.current;
    if (!a) return;
    let fixingDuration = false;
    const onTime = () => {
      if (fixingDuration) return;
      if (!seeking) setCur(a.currentTime);
    };
    const onMeta = () => {
      if (isFinite(a.duration) && a.duration > 0) {
        setDur(a.duration);
      } else {
        // MediaRecorder webm blobs lack duration metadata; force calc.
        fixingDuration = true;
        try { a.currentTime = 1e101; } catch {}
      }
    };
    const onDurChange = () => {
      if (isFinite(a.duration) && a.duration > 0) {
        setDur(a.duration);
        if (fixingDuration) {
          fixingDuration = false;
          try { a.currentTime = 0; } catch {}
        }
      }
    };
    const onEnd = () => { setPlaying(false); setCur(0); a.currentTime = 0; };
    const onPlay = () => setPlaying(true);
    const onPause = () => setPlaying(false);
    a.addEventListener("timeupdate", onTime);
    a.addEventListener("loadedmetadata", onMeta);
    a.addEventListener("durationchange", onDurChange);
    a.addEventListener("ended", onEnd);
    a.addEventListener("play", onPlay);
    a.addEventListener("pause", onPause);
    // Trigger metadata load eagerly
    try { a.load(); } catch {}
    return () => {
      a.removeEventListener("timeupdate", onTime);
      a.removeEventListener("loadedmetadata", onMeta);
      a.removeEventListener("durationchange", onDurChange);
      a.removeEventListener("ended", onEnd);
      a.removeEventListener("play", onPlay);
      a.removeEventListener("pause", onPause);
    };
  }, [seeking]);

  const toggle = () => {
    const a = audioRef.current;
    if (!a) return;
    if (a.paused) a.play().catch(() => {});
    else a.pause();
  };

  const seekFromEvent = (clientX: number) => {
    const el = trackRef.current;
    const a = audioRef.current;
    if (!el || !a || !dur) return;
    const rect = el.getBoundingClientRect();
    const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    const t = ratio * dur;
    setCur(t);
    a.currentTime = t;
  };

  const onTrackPointerDown = (e: React.PointerEvent) => {
    setSeeking(true);
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
    seekFromEvent(e.clientX);
  };
  const onTrackPointerMove = (e: React.PointerEvent) => {
    if (!seeking) return;
    seekFromEvent(e.clientX);
  };
  const onTrackPointerUp = (e: React.PointerEvent) => {
    if (!seeking) return;
    seekFromEvent(e.clientX);
    setSeeking(false);
  };

  const progress = dur > 0 ? cur / dur : 0;
  const accent = isMe ? "var(--brand-400)" : "var(--text-muted)";

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 240 }}>
      {/* Avatar with mic badge */}
      <div style={{ position: "relative", flexShrink: 0 }}>
        <ContactAvatar name={avatarName} avatarUrl={avatarUrl ?? undefined} size={42} />
        <div
          style={{
            position: "absolute",
            right: -2,
            bottom: -2,
            width: 18,
            height: 18,
            borderRadius: 999,
            background: "var(--brand-400)",
            color: "#fff",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            border: "2px solid var(--bg-surface)",
          }}
        >
          <Mic size={10} />
        </div>
      </div>

      {/* Play / Pause */}
      <button
        type="button"
        onClick={toggle}
        aria-label={playing ? "Pausar" : "Reproduzir"}
        style={{
          width: 32, height: 32, borderRadius: 999,
          background: "transparent",
          color: "var(--text-primary)",
          display: "inline-flex", alignItems: "center", justifyContent: "center",
          border: "none", cursor: "pointer", flexShrink: 0,
        }}
      >
        {playing ? <Pause size={20} fill="currentColor" /> : <Play size={20} fill="currentColor" />}
      </button>

      {/* Track + time */}
      <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 2 }}>
        <div
          ref={trackRef}
          onPointerDown={onTrackPointerDown}
          onPointerMove={onTrackPointerMove}
          onPointerUp={onTrackPointerUp}
          style={{
            position: "relative",
            height: 18,
            display: "flex",
            alignItems: "center",
            cursor: "pointer",
            touchAction: "none",
          }}
        >
          {/* dotted line */}
          <div
            style={{
              position: "absolute",
              left: 0, right: 0, top: "50%",
              transform: "translateY(-50%)",
              height: 2,
              backgroundImage: `radial-gradient(circle, var(--text-muted) 0.9px, transparent 1.1px)`,
              backgroundSize: "6px 2px",
              backgroundRepeat: "repeat-x",
              opacity: 0.55,
            }}
          />
          {/* progress fill */}
          <div
            style={{
              position: "absolute",
              left: 0,
              top: "50%",
              transform: "translateY(-50%)",
              height: 2,
              width: `${progress * 100}%`,
              background: accent,
              borderRadius: 2,
            }}
          />
          {/* dot */}
          <div
            style={{
              position: "absolute",
              left: `calc(${progress * 100}% - 6px)`,
              top: "50%",
              transform: "translateY(-50%)",
              width: 12,
              height: 12,
              borderRadius: 999,
              background: accent,
              boxShadow: "0 0 0 2px var(--bg-surface)",
            }}
          />
        </div>
        <div style={{ fontSize: 11, color: "var(--text-muted)", fontVariantNumeric: "tabular-nums" }}>
          {fmtTime(playing || cur > 0 ? cur : dur)}
        </div>
      </div>

      <audio ref={audioRef} src={src} preload="metadata" style={{ display: "none" }} />
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
