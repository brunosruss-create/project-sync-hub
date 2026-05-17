import * as React from "react";
import { Send, Link as LinkIcon } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { sendWhatsAppMessage } from "@/lib/evolution.functions";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useWorkspaceOwnerId } from "@/hooks/use-workspace-owner";
import { useBookingLink } from "@/hooks/use-booking-link";

export function MessageInput({ contactId }: { contactId: string }) {
  const { user } = useAuth();
  const { workspaceOwnerId } = useWorkspaceOwnerId();
  const sendViaEvolution = useServerFn(sendWhatsAppMessage);
  const { url: bookingUrl } = useBookingLink();
  const [draft, setDraft] = React.useState("");
  const [sending, setSending] = React.useState(false);
  const taRef = React.useRef<HTMLTextAreaElement | null>(null);

  React.useEffect(() => {
    setDraft("");
    if (taRef.current) taRef.current.style.height = "auto";
  }, [contactId]);

  const autoResize = () => {
    const el = taRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 140) + "px";
  };

  const send = async () => {
    const text = draft.trim();
    if (!text || sending) return;
    setSending(true);
    setDraft("");
    if (taRef.current) taRef.current.style.height = "auto";
    try {
      await sendViaEvolution({ data: { contactId, text } });
    } catch (e: any) {
      const msg = String(e?.message ?? "");
      if (/Evolution|conectar|conectado|configurad/i.test(msg)) {
        const { error } = await supabase.from("messages").insert({
          owner_user_id: workspaceOwnerId,
          contact_id: contactId,
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
    } finally {
      setSending(false);
    }
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void send();
    }
  };

  const canSend = draft.trim().length > 0 && !sending;

  const insertBookingLink = () => {
    if (!bookingUrl) return;
    const prefix = draft.trim()
      ? draft.replace(/\s+$/, "") + "\n\n"
      : "Olá! Você pode agendar pelo link: ";
    setDraft(prefix + bookingUrl);
    requestAnimationFrame(() => taRef.current?.focus());
  };

  return (
    <div
      className="flex items-end"
      style={{
        gap: 8,
        padding: 10,
        borderTop: "1px solid var(--border)",
        background: "var(--bg-surface)",
      }}
    >
      <textarea
        ref={taRef}
        value={draft}
        onChange={(e) => {
          setDraft(e.target.value);
          autoResize();
        }}
        onKeyDown={onKeyDown}
        placeholder="Digite uma mensagem..."
        rows={1}
        style={{
          flex: 1,
          resize: "none",
          background: "var(--bg-base)",
          border: "1px solid var(--border)",
          borderRadius: 8,
          padding: "8px 12px",
          fontSize: 13.5,
          color: "var(--text-primary)",
          outline: "none",
          maxHeight: 140,
          lineHeight: 1.4,
        }}
      />
      <button
        type="button"
        onClick={() => void send()}
        disabled={!canSend}
        aria-label="Enviar"
        style={{
          width: 38,
          height: 38,
          borderRadius: 999,
          background: canSend ? "var(--brand-400)" : "var(--bg-overlay)",
          color: canSend ? "#fff" : "var(--text-muted)",
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          border: "none",
          cursor: canSend ? "pointer" : "not-allowed",
          transition: "background 120ms",
          flexShrink: 0,
        }}
      >
        <Send size={16} />
      </button>
    </div>
  );
}
