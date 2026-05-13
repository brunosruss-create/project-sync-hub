import * as React from "react";
import { X, Search, Forward, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import { sendWhatsAppMessage, sendWhatsAppMedia, sendWhatsAppAudio } from "@/lib/evolution.functions";

export interface ForwardSource {
  id: string;
  content: string;
  message_type: "text" | "image" | "audio" | "video" | "document" | "system";
  media_url?: string | null;
  media_mime?: string | null;
  media_name?: string | null;
}

interface ContactRow {
  id: string;
  name: string | null;
  phone: string | null;
  avatar_url: string | null;
}

interface Props {
  open: boolean;
  source: ForwardSource | null;
  excludeContactId?: string;
  onClose: () => void;
}

export function ForwardModal({ open, source, excludeContactId, onClose }: Props) {
  const { user } = useAuth();
  const sendText = useServerFn(sendWhatsAppMessage);
  const sendMedia = useServerFn(sendWhatsAppMedia);

  const [contacts, setContacts] = React.useState<ContactRow[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const [selected, setSelected] = React.useState<Set<string>>(new Set());
  const [sending, setSending] = React.useState(false);

  React.useEffect(() => {
    if (!open || !user?.id) return;
    setQuery("");
    setSelected(new Set());
    setLoading(true);
    void (async () => {
      const { data, error } = await supabase
        .from("contacts")
        .select("id,name,phone,avatar_url")
        .eq("owner_user_id", user.id)
        .not("phone", "is", null)
        .order("name", { ascending: true })
        .limit(500);
      if (error) {
        toast.error("Falha ao carregar contatos");
      } else {
        setContacts((data ?? []) as ContactRow[]);
      }
      setLoading(false);
    })();
  }, [open, user?.id]);

  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const filtered = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    return contacts.filter((c) => {
      if (excludeContactId && c.id === excludeContactId) return false;
      if (!q) return true;
      return (
        (c.name ?? "").toLowerCase().includes(q) ||
        (c.phone ?? "").toLowerCase().includes(q)
      );
    });
  }, [contacts, query, excludeContactId]);

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleSend = async () => {
    if (!source || selected.size === 0) return;
    setSending(true);
    let okCount = 0;
    let failCount = 0;
    for (const contactId of selected) {
      try {
        if (source.message_type === "text" || source.message_type === "system") {
          const text = (source.content ?? "").trim();
          if (!text) {
            failCount++;
            continue;
          }
          await sendText({ data: { contactId, text, quoted: undefined } });
        } else if (
          source.media_url &&
          source.media_mime &&
          (source.message_type === "image" ||
            source.message_type === "video" ||
            source.message_type === "document")
        ) {
          await sendMedia({
            data: {
              contactId,
              url: source.media_url,
              mime: source.media_mime,
              name: source.media_name ?? "arquivo",
              caption: source.content || undefined,
              quoted: undefined,
            },
          });
        } else {
          // áudio ou tipo não suportado
          failCount++;
          continue;
        }
        okCount++;
      } catch (e: any) {
        failCount++;
        console.warn("[forward] falhou:", e?.message ?? e);
      }
    }
    setSending(false);
    if (okCount > 0) toast.success(`Encaminhado para ${okCount} contato(s)`);
    if (failCount > 0) toast.error(`Falha em ${failCount} envio(s)`);
    onClose();
  };

  if (!open || !source) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Encaminhar mensagem"
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.55)",
        zIndex: 80,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
        animation: "fadeSlideIn 150ms ease-out",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "100%",
          maxWidth: 440,
          maxHeight: "85vh",
          background: "var(--bg-surface)",
          borderRadius: 14,
          border: "1px solid var(--border-subtle)",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
      >
        {/* Header */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            padding: "14px 16px",
            borderBottom: "1px solid var(--border-subtle)",
          }}
        >
          <Forward size={18} />
          <div style={{ fontWeight: 600, fontSize: 15, flex: 1 }}>Encaminhar mensagem</div>
          <button
            onClick={onClose}
            aria-label="Fechar"
            style={{
              background: "transparent",
              border: "none",
              cursor: "pointer",
              color: "var(--text-secondary)",
              padding: 4,
            }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Preview */}
        <div
          style={{
            padding: "10px 16px",
            background: "var(--bg-base)",
            borderBottom: "1px solid var(--border-subtle)",
            fontSize: 13,
            color: "var(--text-secondary)",
            maxHeight: 80,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {source.message_type === "text"
            ? source.content || "(vazio)"
            : source.message_type === "image"
              ? `📷 ${source.media_name ?? "Imagem"}`
              : source.message_type === "video"
                ? `🎥 ${source.media_name ?? "Vídeo"}`
                : source.message_type === "audio"
                  ? `🎤 Áudio`
                  : source.message_type === "document"
                    ? `📄 ${source.media_name ?? "Documento"}`
                    : source.content}
        </div>

        {/* Search */}
        <div style={{ padding: "10px 12px", borderBottom: "1px solid var(--border-subtle)" }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "8px 10px",
              background: "var(--bg-base)",
              border: "1px solid var(--border-subtle)",
              borderRadius: 8,
            }}
          >
            <Search size={14} color="var(--text-secondary)" />
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar contato"
              style={{
                flex: 1,
                background: "transparent",
                border: "none",
                outline: "none",
                color: "var(--text-primary)",
                fontSize: 14,
              }}
            />
          </div>
        </div>

        {/* List */}
        <div style={{ flex: 1, overflowY: "auto", minHeight: 200 }}>
          {loading ? (
            <div style={{ padding: 24, textAlign: "center", color: "var(--text-secondary)" }}>
              <Loader2 className="animate-spin" size={18} style={{ display: "inline-block" }} />
            </div>
          ) : filtered.length === 0 ? (
            <div style={{ padding: 24, textAlign: "center", color: "var(--text-secondary)", fontSize: 13 }}>
              Nenhum contato
            </div>
          ) : (
            filtered.map((c) => {
              const checked = selected.has(c.id);
              return (
                <button
                  key={c.id}
                  onClick={() => toggle(c.id)}
                  style={{
                    width: "100%",
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    padding: "10px 16px",
                    background: checked ? "var(--bg-hover)" : "transparent",
                    border: "none",
                    borderBottom: "1px solid var(--border-subtle)",
                    cursor: "pointer",
                    textAlign: "left",
                  }}
                >
                  <div
                    style={{
                      width: 36,
                      height: 36,
                      borderRadius: "50%",
                      background: c.avatar_url
                        ? `url(${c.avatar_url}) center/cover`
                        : "var(--bg-base)",
                      border: "1px solid var(--border-subtle)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: 13,
                      color: "var(--text-secondary)",
                      flexShrink: 0,
                    }}
                  >
                    {!c.avatar_url && (c.name ?? "?").slice(0, 1).toUpperCase()}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14, color: "var(--text-primary)", fontWeight: 500 }}>
                      {c.name ?? c.phone ?? "Sem nome"}
                    </div>
                    <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>{c.phone}</div>
                  </div>
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggle(c.id)}
                    onClick={(e) => e.stopPropagation()}
                    style={{ accentColor: "var(--accent)" }}
                  />
                </button>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div
          style={{
            padding: "10px 16px",
            borderTop: "1px solid var(--border-subtle)",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 8,
          }}
        >
          <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>
            {selected.size} selecionado(s)
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button
              onClick={onClose}
              disabled={sending}
              style={{
                padding: "8px 14px",
                borderRadius: 8,
                background: "transparent",
                border: "1px solid var(--border-subtle)",
                color: "var(--text-primary)",
                cursor: "pointer",
                fontSize: 13,
              }}
            >
              Cancelar
            </button>
            <button
              onClick={handleSend}
              disabled={selected.size === 0 || sending}
              style={{
                padding: "8px 14px",
                borderRadius: 8,
                background: "var(--accent)",
                border: "none",
                color: "white",
                cursor: selected.size === 0 || sending ? "not-allowed" : "pointer",
                opacity: selected.size === 0 || sending ? 0.5 : 1,
                fontSize: 13,
                fontWeight: 600,
                display: "flex",
                alignItems: "center",
                gap: 6,
              }}
            >
              {sending && <Loader2 className="animate-spin" size={14} />}
              Encaminhar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
