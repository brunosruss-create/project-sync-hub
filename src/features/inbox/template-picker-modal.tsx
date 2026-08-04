import * as React from "react";
import { X, FileText, Loader2, Send, ChevronLeft } from "lucide-react";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import { listZernioTemplates, sendZernioTemplate } from "@/lib/zernio.functions";

type ZTemplate = {
  name: string;
  language: string;
  category: string | null;
  status: string | null;
  components: any[];
};

interface Props {
  open: boolean;
  contactId: string | null;
  onClose: () => void;
  /** Chamado após envio bem-sucedido (o pai pode dar refresh otimista). */
  onSent?: () => void;
}

/** Extrai o texto do corpo (component BODY) de um template. */
function bodyText(t: ZTemplate): string {
  const body = (t.components ?? []).find(
    (c) => String(c?.type ?? "").toUpperCase() === "BODY",
  );
  return typeof body?.text === "string" ? body.text : "";
}

/** Quantas variáveis {{1}}, {{2}}... o corpo usa (maior índice encontrado). */
function countVars(text: string): number {
  let max = 0;
  const re = /\{\{\s*(\d+)\s*\}\}/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) max = Math.max(max, parseInt(m[1], 10));
  return max;
}

/** Substitui {{n}} pelos valores informados (vazio mantém o placeholder). */
function renderBody(text: string, params: string[]): string {
  return text.replace(/\{\{\s*(\d+)\s*\}\}/g, (whole, n) => {
    const v = params[parseInt(n, 10) - 1];
    return v && v.trim() ? v : whole;
  });
}

export function TemplatePickerModal({ open, contactId, onClose, onSent }: Props) {
  const listFn = useServerFn(listZernioTemplates);
  const sendFn = useServerFn(sendZernioTemplate);

  const [loading, setLoading] = React.useState(false);
  const [templates, setTemplates] = React.useState<ZTemplate[]>([]);
  const [selected, setSelected] = React.useState<ZTemplate | null>(null);
  const [params, setParams] = React.useState<string[]>([]);
  const [sending, setSending] = React.useState(false);

  React.useEffect(() => {
    if (!open) return;
    setSelected(null);
    setParams([]);
    setLoading(true);
    void (async () => {
      try {
        const r: any = await listFn();
        setTemplates((r?.templates ?? []) as ZTemplate[]);
      } catch (e: any) {
        toast.error(e?.message ?? "Falha ao carregar templates");
        setTemplates([]);
      } finally {
        setLoading(false);
      }
    })();
    // listFn é estável (useServerFn); recarrega só ao (re)abrir.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (selected) setSelected(null);
        else onClose();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, selected, onClose]);

  const pick = (t: ZTemplate) => {
    setSelected(t);
    setParams(new Array(countVars(bodyText(t))).fill(""));
  };

  const handleSend = async () => {
    if (!selected || !contactId || sending) return;
    const preview = renderBody(bodyText(selected), params);
    setSending(true);
    try {
      await sendFn({
        data: {
          contactId,
          name: selected.name,
          language: selected.language,
          bodyParams: params.map((p) => p.trim()),
          previewText: preview,
        },
      });
      toast.success("Template enviado");
      onSent?.();
      onClose();
    } catch (e: any) {
      toast.error(e?.message ?? "Falha ao enviar template");
    } finally {
      setSending(false);
    }
  };

  if (!open) return null;

  const body = selected ? bodyText(selected) : "";
  const preview = selected ? renderBody(body, params) : "";

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Enviar template"
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
          maxWidth: 460,
          maxHeight: "85vh",
          background: "var(--bg-surface)",
          borderRadius: "var(--radius-modal)",
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
          {selected ? (
            <button
              onClick={() => setSelected(null)}
              aria-label="Voltar"
              style={{ background: "transparent", border: "none", cursor: "pointer", color: "var(--text-secondary)", padding: 4 }}
            >
              <ChevronLeft size={18} />
            </button>
          ) : (
            <FileText size={18} />
          )}
          <div style={{ fontWeight: 600, fontSize: 15, flex: 1 }}>
            {selected ? selected.name : "Templates do WhatsApp"}
          </div>
          <button
            onClick={onClose}
            aria-label="Fechar"
            style={{ background: "transparent", border: "none", cursor: "pointer", color: "var(--text-secondary)", padding: 4 }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        {!selected ? (
          <div style={{ flex: 1, overflowY: "auto", minHeight: 200 }}>
            {loading ? (
              <div style={{ padding: 24, textAlign: "center", color: "var(--text-secondary)" }}>
                <Loader2 className="animate-spin" size={18} style={{ display: "inline-block" }} />
              </div>
            ) : templates.length === 0 ? (
              <div style={{ padding: 24, textAlign: "center", color: "var(--text-secondary)", fontSize: 13 }}>
                Nenhum template aprovado. Crie e aprove templates no WhatsApp Manager (Meta).
              </div>
            ) : (
              templates.map((t) => (
                <button
                  key={`${t.name}:${t.language}`}
                  onClick={() => pick(t)}
                  style={{
                    width: "100%",
                    display: "block",
                    textAlign: "left",
                    padding: "12px 16px",
                    background: "transparent",
                    border: "none",
                    borderBottom: "1px solid var(--border-subtle)",
                    cursor: "pointer",
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = "var(--bg-hover)")}
                  onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ fontSize: 14, fontWeight: 600, color: "var(--text-primary)" }}>
                      {t.name}
                    </span>
                    <span
                      style={{
                        fontSize: 10,
                        padding: "1px 6px",
                        borderRadius: "var(--radius-sm)",
                        background: "var(--bg-overlay)",
                        color: "var(--text-muted)",
                        textTransform: "uppercase",
                      }}
                    >
                      {t.language}
                    </span>
                    {t.category && (
                      <span style={{ fontSize: 10, color: "var(--text-muted)" }}>{t.category}</span>
                    )}
                  </div>
                  <div
                    className="truncate"
                    style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 3 }}
                  >
                    {bodyText(t) || "(sem corpo de texto)"}
                  </div>
                </button>
              ))
            )}
          </div>
        ) : (
          <div style={{ flex: 1, overflowY: "auto", padding: 16 }}>
            {/* Variáveis */}
            {params.length > 0 && (
              <div style={{ marginBottom: 14 }}>
                <div style={{ fontSize: 12, color: "var(--text-secondary)", marginBottom: 8 }}>
                  Preencha as variáveis do template:
                </div>
                {params.map((val, i) => (
                  <div key={i} style={{ marginBottom: 8 }}>
                    <label style={{ fontSize: 11, color: "var(--text-muted)" }}>
                      Variável {`{{${i + 1}}}`}
                    </label>
                    <input
                      value={val}
                      onChange={(e) =>
                        setParams((prev) => prev.map((p, j) => (j === i ? e.target.value : p)))
                      }
                      placeholder={`Valor da variável ${i + 1}`}
                      style={{
                        width: "100%",
                        marginTop: 3,
                        padding: "8px 10px",
                        background: "var(--bg-base)",
                        border: "1px solid var(--border-subtle)",
                        borderRadius: "var(--radius-card)",
                        color: "var(--text-primary)",
                        fontSize: 14,
                        outline: "none",
                      }}
                    />
                  </div>
                ))}
              </div>
            )}

            {/* Preview */}
            <div style={{ fontSize: 12, color: "var(--text-secondary)", marginBottom: 6 }}>
              Pré-visualização:
            </div>
            <div
              style={{
                padding: "10px 12px",
                background: "var(--bg-base)",
                border: "1px solid var(--border-subtle)",
                borderRadius: "var(--radius-card)",
                fontSize: 14,
                color: "var(--text-primary)",
                whiteSpace: "pre-wrap",
                wordBreak: "break-word",
              }}
            >
              {preview || "(template sem corpo de texto)"}
            </div>
          </div>
        )}

        {/* Footer (só no detalhe) */}
        {selected && (
          <div
            style={{
              padding: "10px 16px",
              borderTop: "1px solid var(--border-subtle)",
              display: "flex",
              justifyContent: "flex-end",
              gap: 8,
            }}
          >
            <button
              onClick={onClose}
              disabled={sending}
              style={{
                padding: "8px 14px",
                borderRadius: "var(--radius-card)",
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
              disabled={sending || !contactId}
              style={{
                padding: "8px 14px",
                borderRadius: "var(--radius-card)",
                background: "var(--brand-400)",
                border: "none",
                color: "#fff",
                cursor: sending || !contactId ? "not-allowed" : "pointer",
                opacity: sending || !contactId ? 0.5 : 1,
                fontSize: 13,
                fontWeight: 600,
                display: "flex",
                alignItems: "center",
                gap: 6,
              }}
            >
              {sending ? <Loader2 className="animate-spin" size={14} /> : <Send size={14} />}
              Enviar template
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
