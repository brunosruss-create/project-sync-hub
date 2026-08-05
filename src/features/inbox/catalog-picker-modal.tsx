// Fase 11: Catálogo inline no chat.
// Agente pode escolher um serviço e inserir o texto formatado (nome + preço +
// duração + descrição) direto no Composer, ou enviar a primeira foto do
// serviço como anexo. Menos ctrl+c-ctrl+v de página em página.

import * as React from "react";
import { X, Search, ImageIcon, Send, DollarSign, Clock, PackageSearch, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { formatCurrencyBRL, formatDuration, type Service } from "@/features/services/data";

type Props = {
  open: boolean;
  onClose: () => void;
  /** Inserir o bloco de texto no rascunho atual (não envia). */
  onInsertText: (text: string) => void;
  /** Enviar a foto principal com legenda pronta. */
  onSendPhoto?: (photo: { url: string; mime: string; name: string }, caption: string) => Promise<void>;
};

type CatalogService = Pick<
  Service,
  "id" | "name" | "description" | "price_cents" | "duration_minutes" | "price_disclosure_policy" | "photos"
>;

/**
 * Monta o bloco de texto que vai pro cliente. Segue a estética do WhatsApp
 * (asteriscos negrito, quebras de linha). Se a política do serviço for
 * `never` esconde o preço — mesmo respeito que a IA aplica.
 */
function formatServiceText(s: CatalogService): string {
  const lines: string[] = [];
  lines.push(`*${s.name}*`);
  if (s.price_disclosure_policy !== "never" && s.price_cents > 0) {
    lines.push(`💰 ${formatCurrencyBRL(s.price_cents / 100)}`);
  }
  if (s.duration_minutes > 0) {
    lines.push(`⏱ ${formatDuration(s.duration_minutes)}`);
  }
  if (s.description?.trim()) {
    lines.push("");
    lines.push(s.description.trim());
  }
  return lines.join("\n");
}

export function CatalogPickerModal({ open, onClose, onInsertText, onSendPhoto }: Props) {
  const [loading, setLoading] = React.useState(false);
  const [services, setServices] = React.useState<CatalogService[]>([]);
  const [query, setQuery] = React.useState("");
  const [sendingId, setSendingId] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!open) return;
    setQuery("");
    let cancelled = false;
    setLoading(true);
    // Só serviços ativos: o objetivo é ajudar o atendente a agilizar, não
    // vender item descontinuado por engano.
    void (async () => {
      const { data, error } = await supabase
        .from("services")
        .select(
          "id,name,description,price_cents,duration_minutes,price_disclosure_policy,photos",
        )
        .eq("status", "active")
        .order("name", { ascending: true })
        .limit(200);
      if (cancelled) return;
      if (error) {
        toast.error("Falha ao carregar catálogo: " + error.message);
        setServices([]);
      } else {
        setServices(
          (data ?? []).map((r: any) => ({
            id: r.id,
            name: r.name,
            description: r.description ?? "",
            price_cents: r.price_cents ?? 0,
            duration_minutes: r.duration_minutes ?? 0,
            price_disclosure_policy: r.price_disclosure_policy ?? null,
            photos: Array.isArray(r.photos) ? r.photos : [],
          })),
        );
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [open]);

  const filtered = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return services;
    return services.filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        s.description.toLowerCase().includes(q),
    );
  }, [services, query]);

  if (!open) return null;

  const handleInsert = (s: CatalogService) => {
    onInsertText(formatServiceText(s));
    onClose();
  };

  const handleSendPhoto = async (s: CatalogService) => {
    if (!onSendPhoto) return;
    const photo = s.photos[0];
    if (!photo) {
      toast.error("Este serviço não tem foto cadastrada.");
      return;
    }
    setSendingId(s.id);
    try {
      await onSendPhoto(
        {
          url: photo.url,
          mime: photo.mime || "image/jpeg",
          name: `${s.name}.jpg`,
        },
        formatServiceText(s),
      );
      toast.success("Foto enviada.");
      onClose();
    } catch (e: any) {
      toast.error(e?.message ?? "Falha ao enviar foto.");
    } finally {
      setSendingId(null);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Catálogo de serviços"
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.4)",
        zIndex: 200,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 20,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "100%",
          maxWidth: 520,
          maxHeight: "85vh",
          background: "var(--bg-surface)",
          border: "1px solid var(--border)",
          borderRadius: "var(--radius-card, 12px)",
          boxShadow: "0 20px 40px rgba(0,0,0,0.2)",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
      >
        <div
          className="flex items-center justify-between"
          style={{ padding: "14px 16px", borderBottom: "1px solid var(--border)" }}
        >
          <div className="flex items-center" style={{ gap: 8 }}>
            <PackageSearch size={18} style={{ color: "var(--brand-400)" }} />
            <h3 style={{ margin: 0, fontSize: 15, fontWeight: 600 }}>Catálogo</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar"
            style={{
              width: 28,
              height: 28,
              borderRadius: "var(--radius-pill)",
              border: "none",
              background: "transparent",
              color: "var(--text-muted)",
              cursor: "pointer",
            }}
          >
            <X size={16} />
          </button>
        </div>

        <div style={{ padding: 12, borderBottom: "1px solid var(--border)" }}>
          <div
            className="flex items-center"
            style={{
              gap: 6,
              background: "var(--bg-base)",
              border: "1px solid var(--border)",
              borderRadius: "var(--radius-control)",
              padding: "6px 10px",
            }}
          >
            <Search size={14} style={{ color: "var(--text-muted)" }} />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar serviço…"
              style={{
                flex: 1,
                border: "none",
                background: "transparent",
                outline: "none",
                fontSize: 13,
                color: "var(--text-primary)",
              }}
              autoFocus
            />
          </div>
        </div>

        <div style={{ flex: 1, overflowY: "auto", padding: 8 }}>
          {loading ? (
            <div
              style={{
                padding: 30,
                textAlign: "center",
                color: "var(--text-muted)",
                fontSize: 13,
              }}
            >
              <Loader2 size={16} className="animate-spin" style={{ display: "inline-block" }} />
            </div>
          ) : filtered.length === 0 ? (
            <div
              style={{
                padding: 30,
                textAlign: "center",
                fontSize: 13,
                color: "var(--text-muted)",
              }}
            >
              {services.length === 0
                ? "Nenhum serviço ativo cadastrado."
                : "Nenhum serviço encontrado."}
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {filtered.map((s) => {
                const firstPhoto = s.photos[0];
                const canShowPrice =
                  s.price_disclosure_policy !== "never" && s.price_cents > 0;
                const sending = sendingId === s.id;
                return (
                  <div
                    key={s.id}
                    className="flex items-start"
                    style={{
                      gap: 10,
                      padding: 10,
                      borderRadius: "var(--radius-control)",
                      background: "var(--bg-base)",
                      border: "1px solid var(--border)",
                    }}
                  >
                    {firstPhoto ? (
                      <div
                        style={{
                          width: 46,
                          height: 46,
                          borderRadius: "var(--radius-control)",
                          background: `url(${firstPhoto.url}) center/cover, var(--bg-overlay)`,
                          flexShrink: 0,
                        }}
                      />
                    ) : (
                      <div
                        className="flex items-center justify-center"
                        style={{
                          width: 46,
                          height: 46,
                          borderRadius: "var(--radius-control)",
                          background: "var(--bg-overlay)",
                          color: "var(--text-muted)",
                          flexShrink: 0,
                        }}
                      >
                        <ImageIcon size={18} />
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <div
                        style={{
                          fontSize: 13.5,
                          fontWeight: 600,
                          color: "var(--text-primary)",
                        }}
                      >
                        {s.name}
                      </div>
                      <div
                        className="flex items-center"
                        style={{
                          gap: 10,
                          marginTop: 2,
                          fontSize: 11.5,
                          color: "var(--text-muted)",
                        }}
                      >
                        {canShowPrice && (
                          <span className="inline-flex items-center" style={{ gap: 2 }}>
                            <DollarSign size={11} />
                            {formatCurrencyBRL(s.price_cents / 100)}
                          </span>
                        )}
                        {s.duration_minutes > 0 && (
                          <span className="inline-flex items-center" style={{ gap: 2 }}>
                            <Clock size={11} />
                            {formatDuration(s.duration_minutes)}
                          </span>
                        )}
                      </div>
                      {s.description && (
                        <div
                          style={{
                            fontSize: 12,
                            color: "var(--text-muted)",
                            marginTop: 4,
                            display: "-webkit-box",
                            WebkitBoxOrient: "vertical",
                            WebkitLineClamp: 2,
                            overflow: "hidden",
                          }}
                        >
                          {s.description}
                        </div>
                      )}
                    </div>
                    <div className="flex" style={{ gap: 4, flexShrink: 0 }}>
                      <button
                        type="button"
                        onClick={() => handleInsert(s)}
                        title="Inserir texto no rascunho"
                        aria-label="Inserir texto"
                        style={{
                          width: 30,
                          height: 30,
                          borderRadius: "var(--radius-pill)",
                          border: "1px solid var(--border)",
                          background: "transparent",
                          color: "var(--text-primary)",
                          cursor: "pointer",
                          display: "inline-flex",
                          alignItems: "center",
                          justifyContent: "center",
                          fontSize: 11,
                          fontWeight: 600,
                        }}
                      >
                        T
                      </button>
                      {firstPhoto && onSendPhoto && (
                        <button
                          type="button"
                          onClick={() => void handleSendPhoto(s)}
                          disabled={sending}
                          title="Enviar foto com legenda"
                          aria-label="Enviar foto"
                          style={{
                            width: 30,
                            height: 30,
                            borderRadius: "var(--radius-pill)",
                            border: "none",
                            background: "var(--brand-400)",
                            color: "#fff",
                            cursor: sending ? "wait" : "pointer",
                            display: "inline-flex",
                            alignItems: "center",
                            justifyContent: "center",
                          }}
                        >
                          {sending ? (
                            <Loader2 size={14} className="animate-spin" />
                          ) : (
                            <Send size={13} />
                          )}
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
