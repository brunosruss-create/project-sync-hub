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
  ChevronDown,
  Trash2,
  Bot,
} from "lucide-react";
import { Composer } from "@/components/chat/Composer";
import { type ContactCard as Contact, formatRelative, formatPhone, initials } from "./data";
import { ContactAvatar } from "./contact-avatar";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useWorkspaceOwnerId } from "@/hooks/use-workspace-owner";
import { useProfile } from "@/hooks/use-profile";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import { sendWhatsAppMessage, refreshContactAvatar, sendWhatsAppMedia, sendWhatsAppAudio, reactToMessage, deleteMessageForEveryone, editMessage } from "@/lib/evolution.functions";
import { ScheduleModal } from "./schedule-modal";
import { MessageActions } from "./message-actions";
import { ForwardModal, type ForwardSource } from "./forward-modal";
import { TransferConversationModal } from "./transfer-conversation-modal";
import { AudioPlayerWithMe } from "@/components/chat/AudioPlayer";
import { DateSeparator } from "@/components/chat/DateSeparator";
import { uploadChatMedia } from "@/lib/chat-media";
import {
  SEED_SERVICES,
  formatCurrencyBRL,
  formatDuration,
  type Service,
} from "@/features/services/data";
import { useContactActions } from "@/hooks/use-contact-actions";


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
  is_ai?: boolean;
}

function sameDay(a: Date, b: Date) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
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
  const { workspaceOwnerId } = useWorkspaceOwnerId();
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
  const [forwardSource, setForwardSource] = React.useState<ForwardSource | null>(null);
  const [transferOpen, setTransferOpen] = React.useState(false);
  const actions = useContactActions();
  
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
        .select("id,direction,content,message_type,status,created_at,media_url,media_mime,media_name,whatsapp_message_id,quoted_preview,reactions,deleted_at,edited_at,is_ai")
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
            is_ai: !!r.is_ai,
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
                    is_ai: !!r.is_ai,
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
          owner_user_id: workspaceOwnerId,
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

  const handleSendAttachments = async (files: File[], caption: string) => {
    if (!contact) return;
    const quoted = buildQuoted(replyingTo);
    setReplyingTo(null);
    for (let i = 0; i < files.length; i++) {
      const f = files[i];
      const { url } = await uploadChatMedia(f, user!.id);
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
    const { url } = await uploadChatMedia(file, user!.id);
    const quoted = buildQuoted(replyingTo);
    setReplyingTo(null);
    await sendAudioFn({ data: { contactId: contact.id, url, quoted } });
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
                  style={{ fontSize: 15, fontWeight: 600, letterSpacing: "-0.01em", lineHeight: 1.2 }}
                >
                  {contact.name}
                </div>
                <div
                  className="truncate flex items-center"
                  style={{ fontSize: 12, color: "var(--text-muted)", gap: 6, marginTop: 2 }}
                >
                  <span style={{ color: "var(--brand-400)", fontSize: 11 }}>● online</span>
                  <span style={{ opacity: 0.4 }}>·</span>
                  <span className="font-mono">{formatPhone(contact.phone)}</span>
                </div>
              </div>

              <HeaderButton onClick={() => setTransferOpen(true)}>
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
                  <MenuItem icon={<UserPlus size={14} />} onClick={() => { setMenuOpen(false); setTransferOpen(true); }}>
                    Transferir para agente
                  </MenuItem>
                  <MenuItem
                    icon={<AlertOctagon size={14} style={{ color: contact.priority === "urgent" ? "var(--text-muted)" : "#EF4444" }} />}
                    onClick={() => { setMenuOpen(false); void actions.toggleUrgent(contact.id, contact.priority); }}
                  >
                    {contact.priority === "urgent" ? "Remover urgência" : "Marcar como urgente"}
                  </MenuItem>
                  <MenuItem icon={<Tag size={14} />} onClick={() => { setMenuOpen(false); setTab("contact"); }}>
                    Adicionar tag
                  </MenuItem>
                  <MenuItem icon={<CalendarPlus size={14} />} onClick={() => { setMenuOpen(false); openSchedule(); }}>
                    Agendar atendimento
                  </MenuItem>
                  <MenuItem
                    icon={<Ban size={14} style={{ color: "#EF4444" }} />}
                    onClick={() => {
                      setMenuOpen(false);
                      const blocked = !!contact.is_blocked;
                      if (confirm(`${blocked ? "Desbloquear" : "Bloquear"} ${contact.name}?`)) {
                        void actions.toggleBlock(contact.id, blocked);
                      }
                    }}
                  >
                    {contact.is_blocked ? "Desbloquear contato" : "Bloquear contato"}
                  </MenuItem>
                  <MenuItem icon={<ExternalLink size={14} />} onClick={() => { setMenuOpen(false); setTab("contact"); }}>
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
                    {messages.map((m, i) => {
                      const prev = i > 0 ? messages[i - 1] : null;
                      const showSep = !prev || !sameDay(prev.created_at, m.created_at);
                      return (
                        <React.Fragment key={m.id}>
                          {showSep && <DateSeparator date={m.created_at} />}
                          <MessageBubble
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
                        onForward={(msg) =>
                          setForwardSource({
                            id: msg.id,
                            content: msg.content ?? "",
                            message_type: msg.message_type,
                            media_url: msg.media_url ?? null,
                            media_mime: msg.media_mime ?? null,
                            media_name: msg.media_name ?? null,
                          })
                        }
                          />
                        </React.Fragment>
                      );
                    })}
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
      <ForwardModal
        open={!!forwardSource}
        source={forwardSource}
        excludeContactId={contact?.id}
        onClose={() => setForwardSource(null)}
      />
      <TransferConversationModal
        open={transferOpen}
        contactId={contact?.id ?? null}
        contactName={contact?.name ?? null}
        currentAssignedAgentId={contact?.assignedAgent ?? null}
        onClose={() => setTransferOpen(false)}
        onAssigned={(agentUserId) => {
          if (contact) {
            onContactUpdate?.(contact.id, { assignedAgent: agentUserId });
          }
        }}
      />
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
  onForward,
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
  onForward?: (m: Message) => void;
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
        <MessageChevron isMe={isMe} bubbleBg={audioBg} message={m} onReply={onReply} onReact={onReact} onDelete={onDelete} onForward={onForward} />
        {m.quoted_preview && <QuotedPreview preview={m.quoted_preview} isMe={isMe} />}
        {m.is_ai && isMe && (
          <div className="inline-flex items-center" style={{ gap: 4, fontSize: 10, fontWeight: 600, background: "color-mix(in oklab, var(--brand-400) 20%, transparent)", color: "var(--brand-400)", padding: "1px 6px", borderRadius: 999, marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.04em" }}>
            <Bot size={10} /> IA
          </div>
        )}
        <AudioPlayerWithMe
          src={m.media_url}
          contactName={contactName}
          contactAvatar={contactAvatar ?? null}
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
      <MessageChevron isMe={isMe} bubbleBg={bubbleBg} message={m} onReply={onReply} onReact={onReact} onEdit={onStartEdit} onDelete={onDelete} onForward={onForward} />
      {m.quoted_preview && <QuotedPreview preview={m.quoted_preview} isMe={isMe} />}
      {m.is_ai && isMe && (
        <div className="inline-flex items-center" style={{ gap: 4, fontSize: 10, fontWeight: 600, background: "color-mix(in oklab, var(--brand-400) 20%, transparent)", color: "var(--brand-400)", padding: "1px 6px", borderRadius: 999, marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.04em" }}>
          <Bot size={10} /> IA
        </div>
      )}
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
      {editing ? (
        <InlineEditor
          initial={m.content}
          onCancel={() => onCancelEdit?.()}
          onSave={(t) => onSaveEdit?.(t)}
        />
      ) : (
        m.content && <div>{m.content}</div>
      )}
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
        {m.edited_at && <span style={{ fontStyle: "italic" }}>editada</span>}
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
  onEdit,
  onDelete,
  onForward,
}: {
  isMe: boolean;
  bubbleBg: string;
  message: Message;
  onReply?: (m: Message) => void;
  onReact?: (m: Message, emoji: string) => void;
  onEdit?: () => void;
  onDelete?: () => void;
  onForward?: (m: Message) => void;
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
      onEdit={() => onEdit?.()}
      onDelete={() => onDelete?.()}
      onForward={() => onForward?.(message)}
    />
  );
}

function InlineEditor({
  initial,
  onCancel,
  onSave,
}: {
  initial: string;
  onCancel: () => void;
  onSave: (text: string) => void;
}) {
  const [val, setVal] = React.useState(initial);
  const ref = React.useRef<HTMLTextAreaElement | null>(null);
  React.useEffect(() => {
    ref.current?.focus();
    ref.current?.setSelectionRange(val.length, val.length);
  }, []);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <textarea
        ref={ref}
        value={val}
        onChange={(e) => setVal(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            e.preventDefault();
            onCancel();
          } else if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            if (val.trim()) onSave(val);
          }
        }}
        rows={Math.min(6, Math.max(1, val.split("\n").length))}
        style={{
          width: "100%",
          background: "var(--bg-base)",
          border: "1px solid var(--border)",
          borderRadius: 6,
          color: "var(--text-primary)",
          padding: "6px 8px",
          fontSize: 14,
          fontFamily: "inherit",
          resize: "none",
          outline: "none",
        }}
      />
      <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
        <button
          type="button"
          onClick={onCancel}
          style={{
            padding: "4px 10px",
            background: "transparent",
            border: "1px solid var(--border)",
            borderRadius: 6,
            color: "var(--text-muted)",
            cursor: "pointer",
            fontSize: 12,
          }}
        >
          Cancelar
        </button>
        <button
          type="button"
          onClick={() => val.trim() && onSave(val)}
          disabled={!val.trim()}
          style={{
            padding: "4px 10px",
            background: "var(--brand-400)",
            border: "1px solid var(--brand-400)",
            borderRadius: 6,
            color: "white",
            cursor: val.trim() ? "pointer" : "not-allowed",
            fontSize: 12,
            opacity: val.trim() ? 1 : 0.6,
          }}
        >
          Salvar
        </button>
      </div>
    </div>
  );
}

function StatusTicks({ status }: { status: Message["status"] }) {
  if (status === "sent") {
    return <Check size={13} color="var(--text-muted)" />;
  }
  const color = status === "read" ? "#34B7F1" : "var(--text-muted)";
  return <CheckCheck size={13} color={color} />;
}

// AudioPlayer extracted to @/components/chat/AudioPlayer for reuse in chat mode.


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
  const actions = useContactActions();
  const [name, setName] = React.useState(contact.name);
  const [email, setEmail] = React.useState(contact.email ?? "");
  const [notes, setNotes] = React.useState(contact.notes ?? "");
  const [newTag, setNewTag] = React.useState("");
  const [saving, setSaving] = React.useState(false);
  const tags = contact.tags ?? [];

  React.useEffect(() => {
    setName(contact.name);
    setEmail(contact.email ?? "");
    setNotes(contact.notes ?? "");
    setNewTag("");
  }, [contact.id, contact.email, contact.notes, contact.name]);

  const handleSave = async () => {
    setSaving(true);
    await actions.saveContact(contact.id, {
      name,
      email: email.trim() || null,
      notes: notes.trim() || null,
    });
    setSaving(false);
  };

  const handleAddTag = async () => {
    const t = newTag.trim();
    if (!t) return;
    const ok = await actions.addTag(contact.id, t, tags);
    if (ok) setNewTag("");
  };

  return (
    <div className="flex flex-col" style={{ gap: 12 }}>
      <Field label="Nome" value={name} onChange={setName} />
      <Field label="Telefone" value={contact.phone} onChange={() => {}} />
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
                onClick={() => void actions.removeTag(contact.id, t, tags)}
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
                if (e.key === "Enter" || e.key === ",") {
                  e.preventDefault();
                  void handleAddTag();
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
              onClick={() => void handleAddTag()}
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
        <span style={{ fontSize: 10, color: "var(--text-muted)" }}>
          Enter ou vírgula para adicionar
        </span>
      </div>

      <button
        type="button"
        onClick={() => void handleSave()}
        disabled={saving}
        className="btn-primary"
        style={{ alignSelf: "flex-start", marginTop: 4, opacity: saving ? 0.6 : 1 }}
      >
        {saving ? "Salvando…" : "Salvar alterações"}
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

interface HistoryEvent {
  id: string;
  kind: "created" | "rescheduled" | "cancelled";
  created_at: Date;
  starts_at: Date | null;
  previous_starts_at: Date | null;
  service_name: string | null;
}

const EVENT_LABEL: Record<HistoryEvent["kind"], { label: string; color: string }> = {
  created: { label: "Agendado", color: "#3B82F6" },
  rescheduled: { label: "Reagendado", color: "#F59E0B" },
  cancelled: { label: "Cancelado", color: "#EF4444" },
};

function fmtDT(d: Date) {
  const dt = d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit" });
  const tm = d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  return `${dt} · ${tm}`;
}

function HistoryTab({ contactId }: { contactId: string }) {
  const [items, setItems] = React.useState<HistoryEvent[]>([]);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from("appointment_events")
        .select("id,kind,created_at,starts_at,previous_starts_at,services(name)")
        .eq("contact_id", contactId)
        .order("created_at", { ascending: false });
      if (cancelled) return;
      if (error || !data) {
        setItems([]);
      } else {
        setItems(
          data.map((r: any) => ({
            id: r.id,
            kind: r.kind,
            created_at: new Date(r.created_at),
            starts_at: r.starts_at ? new Date(r.starts_at) : null,
            previous_starts_at: r.previous_starts_at ? new Date(r.previous_starts_at) : null,
            service_name: r.services?.name ?? null,
          })),
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
        Nenhum histórico para este contato.
      </div>
    );
  }

  return (
    <div className="flex flex-col" style={{ gap: 10 }}>
      {items.map((it) => {
        const meta = EVENT_LABEL[it.kind];
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
                {fmtDT(it.created_at)}
              </div>
              <span
                style={{
                  fontSize: 11,
                  padding: "2px 8px",
                  borderRadius: 999,
                  border: `1px solid ${meta.color}`,
                  color: meta.color,
                }}
              >
                {meta.label}
              </span>
            </div>
            {it.kind === "rescheduled" && it.previous_starts_at && it.starts_at && (
              <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 6 }}>
                {fmtDT(it.previous_starts_at)} → {fmtDT(it.starts_at)}
              </div>
            )}
            {it.kind !== "rescheduled" && it.starts_at && (
              <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 6 }}>
                Horário: {fmtDT(it.starts_at)}
              </div>
            )}
            {it.service_name && (
              <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 2 }}>
                Serviço: {it.service_name}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
