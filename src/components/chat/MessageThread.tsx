import * as React from "react";
import { ArrowLeft, MoreVertical, CalendarPlus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { ContactAvatar } from "@/features/inbox/contact-avatar";
import { formatPhone, type ContactCard as Contact } from "@/features/inbox/data";
import { ScheduleModal } from "@/features/inbox/schedule-modal";
import { TransferConversationModal } from "@/features/inbox/transfer-conversation-modal";
import { useContactActions } from "@/hooks/use-contact-actions";
import { MessageBubble, type ChatMessage } from "./MessageBubble";
import { DateSeparator } from "./DateSeparator";
import { MessageInput } from "./MessageInput";

function sameDay(a: Date, b: Date) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

export function MessageThread({
  contact,
  onBack,
}: {
  contact: Contact;
  onBack: () => void;
}) {
  const [messages, setMessages] = React.useState<ChatMessage[]>([]);
  const [scheduleOpen, setScheduleOpen] = React.useState(false);
  const [transferOpen, setTransferOpen] = React.useState(false);
  const [menuOpen, setMenuOpen] = React.useState(false);
  const scrollRef = React.useRef<HTMLDivElement | null>(null);
  const nearBottomRef = React.useRef(true);
  const actions = useContactActions();

  // Carrega + subscribe (mesma lógica do conversation-panel)
  React.useEffect(() => {
    if (!contact?.id) return;
    let cancelled = false;
    setMessages([]);

    (async () => {
      const { data, error } = await supabase
        .from("messages")
        .select(
          "id,direction,content,message_type,status,created_at,media_url,media_mime,media_name,is_ai,deleted_at",
        )
        .eq("contact_id", contact.id)
        .order("created_at", { ascending: true });
      if (cancelled) return;
      if (error) {
        console.warn("[chat] erro ao carregar mensagens:", error.message);
        return;
      }
      setMessages(
        (data ?? []).map((r: any) => ({
          id: r.id,
          direction: r.direction,
          content: r.content ?? "",
          message_type: r.message_type ?? "text",
          status: r.status ?? "sent",
          created_at: new Date(r.created_at),
          media_url: r.media_url ?? null,
          media_mime: r.media_mime ?? null,
          media_name: r.media_name ?? null,
          is_ai: !!r.is_ai,
          deleted_at: r.deleted_at ?? null,
        })),
      );
    })();

    const channel = supabase
      .channel(`chat-thread:${contact.id}:${Math.random().toString(36).slice(2, 8)}`)
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
                    content: r.content ?? "",
                    message_type: r.message_type ?? "text",
                    status: r.status ?? "sent",
                    created_at: new Date(r.created_at),
                    media_url: r.media_url ?? null,
                    media_mime: r.media_mime ?? null,
                    media_name: r.media_name ?? null,
                    is_ai: !!r.is_ai,
                    deleted_at: r.deleted_at ?? null,
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
                    is_ai: typeof r.is_ai === "boolean" ? r.is_ai : m.is_ai,
                    deleted_at: r.deleted_at ?? m.deleted_at,
                  }
                : m,
            ),
          );
        },
      )
      .subscribe();

    return () => {
      cancelled = true;
      void supabase.removeChannel(channel);
    };
  }, [contact?.id]);

  // Auto-scroll
  const scrollToBottom = (smooth: boolean) => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: smooth ? "smooth" : "auto" });
  };

  // Ao trocar de conversa: scroll instantâneo ao fim
  React.useLayoutEffect(() => {
    nearBottomRef.current = true;
    scrollToBottom(false);
  }, [contact.id]);

  // Nova mensagem: scroll suave se estava perto do fim
  React.useEffect(() => {
    if (nearBottomRef.current) scrollToBottom(true);
  }, [messages.length]);

  const onScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    nearBottomRef.current =
      el.scrollHeight - (el.scrollTop + el.clientHeight) < 120;
  };

  // Monta linhas com separador de data
  const rows = React.useMemo(() => {
    const out: Array<{ type: "sep"; date: Date; key: string } | { type: "msg"; m: ChatMessage }> = [];
    let last: Date | null = null;
    for (const m of messages) {
      if (!last || !sameDay(last, m.created_at)) {
        out.push({ type: "sep", date: m.created_at, key: `sep-${m.id}` });
        last = m.created_at;
      }
      out.push({ type: "msg", m });
    }
    return out;
  }, [messages]);

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        flex: 1,
        background: "var(--bg-base)",
        overflow: "hidden",
      }}
    >
      {/* Header */}
      <div
        className="flex items-center"
        style={{
          gap: 10,
          padding: "0 12px",
          height: 56,
          borderBottom: "1px solid var(--border)",
          background: "var(--bg-surface)",
          position: "relative",
        }}
      >
        <button
          type="button"
          onClick={onBack}
          aria-label="Voltar"
          className="md:hidden inline-flex items-center justify-center"
          style={{
            width: 32,
            height: 32,
            borderRadius: 8,
            background: "transparent",
            border: "none",
            color: "var(--text-primary)",
            cursor: "pointer",
          }}
        >
          <ArrowLeft size={18} />
        </button>

        <ContactAvatar name={contact.name} avatarUrl={contact.avatar} size={38} />

        <div className="flex-1 min-w-0">
          <div
            className="truncate"
            style={{ fontSize: 14.5, fontWeight: 600, color: "var(--text-primary)" }}
          >
            {contact.name}
          </div>
          <div
            className="truncate flex items-center"
            style={{ fontSize: 11.5, color: "var(--text-muted)", gap: 6, marginTop: 1 }}
          >
            <span style={{ color: "var(--brand-400)" }}>● online</span>
            <span style={{ opacity: 0.4 }}>·</span>
            <span className="font-mono">{formatPhone(contact.phone)}</span>
          </div>
        </div>

        <button
          type="button"
          onClick={() => setTransferOpen(true)}
          style={{
            fontSize: 12,
            fontWeight: 500,
            padding: "6px 10px",
            borderRadius: 6,
            border: "1px solid var(--border)",
            background: "transparent",
            color: "var(--text-primary)",
            cursor: "pointer",
          }}
        >
          Transferir
        </button>
        <button
          type="button"
          onClick={() => setScheduleOpen(true)}
          className="inline-flex items-center"
          style={{
            gap: 4,
            fontSize: 12,
            fontWeight: 600,
            padding: "6px 10px",
            borderRadius: 6,
            border: "none",
            background: "var(--brand-400)",
            color: "#fff",
            cursor: "pointer",
          }}
        >
          <CalendarPlus size={13} /> Agendar
        </button>
        <button
          type="button"
          onClick={() => setMenuOpen((v) => !v)}
          aria-label="Mais ações"
          className="inline-flex items-center justify-center"
          style={{
            width: 32,
            height: 32,
            borderRadius: 8,
            background: "transparent",
            border: "none",
            color: "var(--text-muted)",
            cursor: "pointer",
          }}
        >
          <MoreVertical size={16} />
        </button>

        {menuOpen && (
          <div
            onMouseLeave={() => setMenuOpen(false)}
            style={{
              position: "absolute",
              top: 52,
              right: 10,
              minWidth: 200,
              background: "var(--bg-surface)",
              border: "1px solid var(--border-strong)",
              borderRadius: 8,
              boxShadow: "0 10px 28px rgba(0,0,0,0.18)",
              padding: 4,
              zIndex: 30,
            }}
          >
            <button
              type="button"
              onClick={async () => {
                setMenuOpen(false);
                await actions.toggleBlock(contact.id, !!contact.is_blocked);
              }}
              className="w-full text-left"
              style={{
                padding: "8px 10px",
                fontSize: 13,
                background: "transparent",
                border: "none",
                cursor: "pointer",
                color: "var(--text-primary)",
                borderRadius: 6,
              }}
            >
              {contact.is_blocked ? "Desbloquear contato" : "Bloquear contato"}
            </button>
            <button
              type="button"
              onClick={async () => {
                setMenuOpen(false);
                await actions.archiveContact(contact.id);
              }}
              className="w-full text-left"
              style={{
                padding: "8px 10px",
                fontSize: 13,
                background: "transparent",
                border: "none",
                cursor: "pointer",
                color: "var(--text-primary)",
                borderRadius: 6,
              }}
            >
              Arquivar conversa
            </button>
          </div>
        )}
      </div>

      {/* Mensagens */}
      <div
        ref={scrollRef}
        onScroll={onScroll}
        style={{
          flex: 1,
          overflowY: "auto",
          padding: "16px 20px",
          display: "flex",
          flexDirection: "column",
          gap: 4,
        }}
      >
        {rows.length === 0 ? (
          <div
            style={{
              alignSelf: "center",
              marginTop: 40,
              fontSize: 12.5,
              color: "var(--text-muted)",
            }}
          >
            Nenhuma mensagem ainda. Envie a primeira abaixo.
          </div>
        ) : (
          rows.map((row) =>
            row.type === "sep" ? (
              <DateSeparator key={row.key} date={row.date} />
            ) : (
              <MessageBubble
                key={row.m.id}
                m={{ ...row.m, contactName: contact.name, contactAvatar: contact.avatar ?? null }}
              />
            ),
          )
        )}
      </div>

      {/* Input */}
      <MessageInput contactId={contact.id} />

      {/* Modais reutilizados do kanban */}
      <ScheduleModal
        contact={contact}
        open={scheduleOpen}
        onClose={() => setScheduleOpen(false)}
      />
      <TransferConversationModal
        open={transferOpen}
        contactId={contact.id}
        contactName={contact.name}
        currentAssignedAgentId={contact.assignedAgent ?? null}
        onClose={() => setTransferOpen(false)}
        onAssigned={() => setTransferOpen(false)}
      />
    </div>
  );
}
