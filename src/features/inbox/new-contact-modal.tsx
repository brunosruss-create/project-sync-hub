import * as React from "react";
import { X, Check, Loader2, MessageCircle, ExternalLink, AlertTriangle, ChevronDown } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useWorkspaceOwnerId } from "@/hooks/use-workspace-owner";
import { useProfile } from "@/hooks/use-profile";
import { notify } from "@/lib/notify";
import {
  COLUMNS,
  COLUMN_COLOR,
  initials,
  type ContactCard as Contact,
  type KanbanColumnId,
} from "./data";

interface Props {
  open: boolean;
  onClose: () => void;
  onCreated: (contact: Contact, opts: { openExisting?: boolean }) => void;
}

type DuplicateInfo = {
  id: string;
  name: string;
  phone: string;
  kanban_column: KanbanColumnId;
  last_message_at: string | null;
  avatar_url: string | null;
  tags: string[];
  is_unread: boolean;
  priority: "normal" | "urgent";
  assigned_agent_id: string | null;
  last_message: string | null;
};

const QUICK_TEMPLATES: Array<{ label: string; emoji: string; text: (n: string) => string }> = [
  { label: "Saudação", emoji: "👋", text: (n) => `Olá ${n}! Tudo bem? Estou entrando em contato pelo WhatsApp.` },
  { label: "Oferecer horário", emoji: "📅", text: (n) => `Oi ${n}! Posso te oferecer um horário esta semana — qual o melhor dia para você?` },
  { label: "Perguntar necessidade", emoji: "💬", text: (n) => `Olá ${n}! Como posso te ajudar hoje?` },
];

function onlyDigits(v: string) {
  return v.replace(/\D+/g, "");
}

function digitsBody(raw: string): string {
  const trimmed = raw.trim();
  let d = onlyDigits(raw);
  if (d.startsWith("00")) d = d.slice(2);
  // Remove o DDI quando ele veio explicitamente da máscara (+55...) ou de um número completo.
  // Sem isso, ao apagar de "+55 (55) ..." o prefixo vira parte do DDD e reinserimos um "5".
  if ((trimmed.startsWith("+") || trimmed.startsWith("0055") || d.length >= 12) && d.startsWith("55")) {
    d = d.slice(2);
  }
  return d.slice(0, 11);
}

export function normalizePhone(raw: string, defaultDDI = "55"): string {
  const body = digitsBody(raw);
  if (!body) return "";
  return "+" + defaultDDI + body;
}

function formatBR(raw: string): string {
  const body = digitsBody(raw);
  if (!body) return "";
  const ddd = body.slice(0, 2);
  const part1 = body.slice(2, 7);
  const part2 = body.slice(7, 11);
  let out = "";
  if (ddd) out += `(${ddd}`;
  if (ddd.length === 2) out += `)`;
  if (part1) out += ` ${part1}`;
  if (part2) out += `-${part2}`;
  return out;
}

function isValidBR(normalized: string) {
  // +55 + DDD(2) + 8 ou 9 dígitos
  return /^\+55\d{10,11}$/.test(normalized);
}

function capitalizeName(s: string) {
  return s
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w))
    .join(" ");
}

export function NewContactModal({ open, onClose, onCreated }: Props) {
  const { user } = useAuth();
  const { data: profile } = useProfile();

  const [phoneInput, setPhoneInput] = React.useState("");
  const [name, setName] = React.useState("");
  const [column, setColumn] = React.useState<KanbanColumnId>("in_progress");
  const [tags, setTags] = React.useState<string[]>([]);
  const [tagDraft, setTagDraft] = React.useState("");
  const [tagSuggestions, setTagSuggestions] = React.useState<string[]>([]);
  const [showSendMessage, setShowSendMessage] = React.useState(false);
  const [openingMessage, setOpeningMessage] = React.useState("");
  const [assignSelf, setAssignSelf] = React.useState(true);
  const [createAnother, setCreateAnother] = React.useState(false);

  const [phoneStatus, setPhoneStatus] = React.useState<
    "idle" | "checking" | "valid" | "invalid" | "duplicate"
  >("idle");
  const [duplicate, setDuplicate] = React.useState<DuplicateInfo | null>(null);
  const [phoneError, setPhoneError] = React.useState<string | null>(null);

  const [submitting, setSubmitting] = React.useState(false);
  const [shake, setShake] = React.useState(false);

  const nameRef = React.useRef<HTMLInputElement>(null);
  const phoneRef = React.useRef<HTMLInputElement>(null);
  const checkTimer = React.useRef<number | null>(null);

  // reset on open
  React.useEffect(() => {
    if (!open) return;
    setPhoneInput("");
    setName("");
    setColumn("in_progress");
    setTags([]);
    setTagDraft("");
    setShowSendMessage(false);
    setOpeningMessage("");
    setAssignSelf(true);
    setPhoneStatus("idle");
    setDuplicate(null);
    setPhoneError(null);
    setSubmitting(false);
    setTimeout(() => phoneRef.current?.focus(), 80);
  }, [open]);

  // load tag suggestions
  React.useEffect(() => {
    if (!open || !user?.id) return;
    void (async () => {
      const { data } = await supabase
        .from("contacts")
        .select("tags")
        .eq("owner_user_id", workspaceOwnerId)
        .limit(200);
      const all = new Set<string>();
      (data ?? []).forEach((r: any) => (r.tags ?? []).forEach((t: string) => all.add(t)));
      setTagSuggestions([...all].slice(0, 12));
    })();
  }, [open, user?.id]);

  // debounced phone validation
  React.useEffect(() => {
    if (checkTimer.current) window.clearTimeout(checkTimer.current);
    setDuplicate(null);
    setPhoneError(null);
    if (!phoneInput.trim()) {
      setPhoneStatus("idle");
      return;
    }
    const normalized = normalizePhone(phoneInput);
    if (!isValidBR(normalized)) {
      setPhoneStatus("invalid");
      setPhoneError("Número inválido. Inclua DDD + número.");
      return;
    }
    setPhoneStatus("checking");
    checkTimer.current = window.setTimeout(async () => {
      if (!user?.id) return;
      const phoneDigits = normalized.replace("+", "");
      // procura por phone normalizado e variantes (sem +)
      const { data, error } = await supabase
        .from("contacts")
        .select("id,name,phone,kanban_column,last_message_at,avatar_url,tags,is_unread,priority,assigned_agent_id,last_message")
        .eq("owner_user_id", workspaceOwnerId)
        .or(`phone.eq.${normalized},phone.eq.${phoneDigits}`)
        .maybeSingle();
      if (error && error.code !== "PGRST116") {
        setPhoneStatus("valid");
        return;
      }
      if (data) {
        setDuplicate(data as DuplicateInfo);
        setPhoneStatus("duplicate");
      } else {
        setPhoneStatus("valid");
      }
    }, 600);
    return () => {
      if (checkTimer.current) window.clearTimeout(checkTimer.current);
    };
  }, [phoneInput, user?.id]);

  // Esc to close, Cmd+Enter submit
  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        attemptClose();
      } else if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
        e.preventDefault();
        void handleSubmit();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, phoneStatus, name, column, tags, openingMessage, showSendMessage]);

  const hasDirty = phoneInput || name || tags.length > 0 || openingMessage;

  function attemptClose() {
    if (submitting) return;
    if (hasDirty) {
      const ok = window.confirm("Descartar este contato? Os dados preenchidos serão perdidos.");
      if (!ok) return;
    }
    onClose();
  }

  function addTag(raw: string) {
    const t = raw.trim().replace(/,$/, "");
    if (!t) return;
    if (tags.includes(t)) return;
    setTags((prev) => [...prev, t]);
    setTagDraft("");
  }

  function mapDuplicateToContact(d: DuplicateInfo): Contact {
    return {
      id: d.id,
      name: d.name,
      phone: d.phone,
      avatar: d.avatar_url,
      lastMessage: d.last_message ?? "",
      lastMessageAt: d.last_message_at ? new Date(d.last_message_at) : new Date(),
      assignedAgent: d.assigned_agent_id,
      tags: d.tags ?? [],
      isUnread: !!d.is_unread,
      priority: d.priority === "urgent" ? "urgent" : "normal",
      kanban_column: (d.kanban_column ?? "waiting") as KanbanColumnId,
    };
  }

  async function handleOpenDuplicate() {
    if (!duplicate) return;
    onCreated(mapDuplicateToContact(duplicate), { openExisting: true });
    onClose();
  }

  async function handleSubmit() {
    if (submitting) return;
    if (!user?.id) {
      notify.error("Você precisa estar logado.");
      return;
    }
    if (phoneStatus === "duplicate") {
      // tratado no painel especial; ignorar submit
      return;
    }
    const normalized = normalizePhone(phoneInput);
    const finalName = capitalizeName(name);
    if (!isValidBR(normalized) || !finalName) {
      setShake(true);
      setTimeout(() => setShake(false), 350);
      if (!isValidBR(normalized)) {
        setPhoneStatus("invalid");
        setPhoneError("Número inválido.");
      }
      return;
    }

    setSubmitting(true);
    try {
      const insertPayload: Record<string, any> = {
        owner_user_id: workspaceOwnerId,
        // Espelha em user_id caso a coluna legada ainda exista (compat).
        user_id: user.id,
        name: finalName,
        phone: normalized,
        kanban_column: column,
        is_unread: false,
        tags,
        last_message: showSendMessage && openingMessage.trim() ? openingMessage.trim() : null,
        last_message_at: new Date().toISOString(),
      };
      if (assignSelf) insertPayload.assigned_agent_id = user.id;

      let { data: created, error } = await supabase
        .from("contacts")
        .insert(insertPayload)
        .select(
          "id,name,phone,avatar_url,kanban_column,assigned_agent_id,tags,priority,is_unread,last_message,last_message_at",
        )
        .single();

      // Se a coluna user_id não existir mais, refaz sem ela.
      if (error && /user_id/i.test(error.message ?? "") && /column/i.test(error.message ?? "")) {
        delete insertPayload.user_id;
        const retry = await supabase
          .from("contacts")
          .insert(insertPayload)
          .select(
            "id,name,phone,avatar_url,kanban_column,assigned_agent_id,tags,priority,is_unread,last_message,last_message_at",
          )
          .single();
        created = retry.data;
        error = retry.error;
      }

      if (error || !created) {
        console.error("[new-contact] insert error", {
          message: error?.message,
          code: (error as any)?.code,
          details: (error as any)?.details,
          hint: (error as any)?.hint,
        });
        notify.error(error?.message ?? "Não foi possível criar o contato.");
        setSubmitting(false);
        return;
      }

      // mensagem inicial
      if (showSendMessage && openingMessage.trim()) {
        const { error: msgErr } = await supabase.from("messages").insert({
          owner_user_id: workspaceOwnerId,
          contact_id: created.id,
          direction: "outbound",
          content: openingMessage.trim(),
          message_type: "text",
          status: "sent",
        });
        if (msgErr) console.warn("[new-contact] msg insert:", msgErr.message);
      }

      const contact: Contact = {
        id: created.id,
        name: created.name,
        phone: created.phone,
        avatar: created.avatar_url,
        lastMessage: created.last_message ?? "",
        lastMessageAt: created.last_message_at ? new Date(created.last_message_at) : new Date(),
        assignedAgent: created.assigned_agent_id ?? null,
        tags: Array.isArray(created.tags) ? created.tags : [],
        isUnread: !!created.is_unread,
        priority: created.priority === "urgent" ? "urgent" : "normal",
        kanban_column: (created.kanban_column ?? column) as KanbanColumnId,
      };

      notify.success("Contato criado!", "Abrindo conversa...");
      onCreated(contact, { openExisting: false });

      if (createAnother) {
        // limpa, mantém modal aberto
        setPhoneInput("");
        setName("");
        setTags([]);
        setOpeningMessage("");
        setShowSendMessage(false);
        setPhoneStatus("idle");
        setSubmitting(false);
        setTimeout(() => phoneRef.current?.focus(), 50);
      } else {
        onClose();
      }
    } catch (e: any) {
      notify.error(e?.message ?? "Erro inesperado.");
      setSubmitting(false);
    }
  }

  if (!open) return null;

  const canSubmit =
    !submitting &&
    phoneStatus === "valid" &&
    name.trim().length > 0;

  const phoneBorder =
    phoneStatus === "valid"
      ? "var(--success, #25C880)"
      : phoneStatus === "invalid"
        ? "var(--danger, #EF4444)"
        : phoneStatus === "duplicate"
          ? "#F59E0B"
          : "var(--border-strong)";

  return (
    <>
      <style>{`
        @keyframes zfNcmIn { from { opacity:0; transform: scale(.96); } to { opacity:1; transform: scale(1); } }
        @keyframes zfNcmFade { from { opacity:0; } to { opacity:1; } }
        @keyframes zfShake { 0%,100% { transform: translateX(0);} 25% { transform: translateX(-6px);} 75% { transform: translateX(6px);} }
        .zf-ncm-modal { animation: zfNcmIn .18s ease-out; }
        .zf-ncm-back { animation: zfNcmFade .15s ease-out; }
        .zf-shake { animation: zfShake .35s ease-out; }
        .zf-ncm-chip { display:inline-flex; align-items:center; gap:4px; padding:2px 8px; border-radius:999px; background:var(--bg-overlay); border:1px solid var(--border); font-size:12px; color:var(--text-primary); }
        .zf-ncm-chip button { background:transparent; border:0; color:var(--text-muted); cursor:pointer; line-height:1; padding:0; }
        .zf-ncm-segbtn { flex:1; display:flex; align-items:center; justify-content:center; gap:6px; height:34px; border-radius:8px; font-size:12px; font-weight:600; cursor:pointer; transition: all .15s; }
        .zf-quick-tpl { display:inline-flex; align-items:center; gap:4px; padding:4px 10px; height:26px; border-radius:6px; font-size:11px; font-weight:500; background:var(--bg-overlay); border:1px solid var(--border); color:var(--text-primary); cursor:pointer; }
        .zf-quick-tpl:hover { background:var(--bg-surface); }
        @media (max-width: 640px) {
          .zf-ncm-modal { width:100% !important; max-width:100% !important; height:100vh; max-height:100vh; border-radius:0 !important; }
        }
      `}</style>

      {/* backdrop */}
      <div
        className="zf-ncm-back"
        onClick={(e) => {
          // não fecha ao clicar fora — exigência da UX
          e.stopPropagation();
        }}
        style={{
          position: "fixed",
          inset: 0,
          background: "rgba(0,0,0,.6)",
          backdropFilter: "blur(4px)",
          WebkitBackdropFilter: "blur(4px)",
          zIndex: 80,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: 16,
        }}
      >
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Novo Contato"
          className={`zf-ncm-modal ${shake ? "zf-shake" : ""}`}
          style={{
            width: 480,
            maxWidth: "100%",
            background: "var(--bg-surface)",
            border: "1px solid var(--border-strong)",
            borderRadius: 12,
            boxShadow: "var(--shadow-lg, 0 24px 48px rgba(0,0,0,.4))",
            display: "flex",
            flexDirection: "column",
            maxHeight: "calc(100vh - 32px)",
          }}
        >
          {/* Header */}
          <div
            style={{
              display: "flex",
              alignItems: "flex-start",
              justifyContent: "space-between",
              padding: "16px 18px 12px",
              borderBottom: "1px solid var(--border)",
            }}
          >
            <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
              <MessageCircle size={18} style={{ color: "#25D366" }} />
              <div>
                <div style={{ fontSize: 15, fontWeight: 600, color: "var(--text-primary)" }}>
                  Novo Contato
                </div>
                <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 1 }}>
                  Inicie uma conversa pelo WhatsApp
                </div>
              </div>
            </div>
            <button
              type="button"
              onClick={attemptClose}
              aria-label="Fechar"
              style={{
                background: "transparent",
                border: 0,
                color: "var(--text-muted)",
                cursor: "pointer",
                padding: 4,
                borderRadius: 6,
              }}
            >
              <X size={16} />
            </button>
          </div>

          {/* Body */}
          <div style={{ padding: 18, overflowY: "auto", display: "flex", flexDirection: "column", gap: 14 }}>
            {/* Telefone */}
            <div>
              <label style={fieldLabel}>Número do WhatsApp *</label>
              <div style={{ position: "relative" }}>
                <span
                  style={{
                    position: "absolute",
                    left: 10,
                    top: "50%",
                    transform: "translateY(-50%)",
                    fontSize: 13,
                    fontWeight: 600,
                    color: "var(--text-muted)",
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    pointerEvents: "none",
                  }}
                  aria-hidden
                >
                  <span style={{ fontSize: 16 }}>🇧🇷</span>
                  <span>+55</span>
                </span>
                <input
                  ref={phoneRef}
                  value={formatBR(phoneInput)}
                  onChange={(e) => setPhoneInput(e.target.value)}
                  onPaste={(e) => {
                    const txt = e.clipboardData.getData("text");
                    if (txt) {
                      e.preventDefault();
                      setPhoneInput(txt);
                    }
                  }}
                  placeholder="(11) 99999-9999"
                  inputMode="tel"
                  style={{
                    width: "100%",
                    height: 38,
                    padding: "0 36px 0 64px",
                    fontSize: 14,
                    color: "var(--text-primary)",
                    background: "var(--bg-base)",
                    border: `1px solid ${phoneBorder}`,
                    borderRadius: 8,
                    outline: "none",
                    transition: "border-color .15s",
                  }}
                />
                <span
                  style={{
                    position: "absolute",
                    right: 10,
                    top: "50%",
                    transform: "translateY(-50%)",
                  }}
                >
                  {phoneStatus === "checking" && <Loader2 size={14} className="animate-spin" style={{ color: "var(--text-muted)" }} />}
                  {phoneStatus === "valid" && <Check size={16} style={{ color: "#25C880" }} />}
                  {phoneStatus === "invalid" && <X size={16} style={{ color: "#EF4444" }} />}
                  {phoneStatus === "duplicate" && <AlertTriangle size={14} style={{ color: "#F59E0B" }} />}
                </span>
              </div>
              {phoneError && (
                <div style={{ marginTop: 6, fontSize: 11, color: "#EF4444" }}>{phoneError}</div>
              )}
            </div>

            {/* Card de duplicado */}
            {duplicate && phoneStatus === "duplicate" && (
              <div
                style={{
                  border: "1px solid #F59E0B66",
                  background: "color-mix(in oklab, #F59E0B 10%, transparent)",
                  borderRadius: 10,
                  padding: 12,
                  display: "flex",
                  flexDirection: "column",
                  gap: 10,
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, fontWeight: 600, color: "#F59E0B" }}>
                  <AlertTriangle size={14} /> Este número já está cadastrado
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <div
                    style={{
                      width: 36, height: 36, borderRadius: "50%",
                      background: "var(--bg-overlay)",
                      display: "flex", alignItems: "center", justifyContent: "center",
                      fontSize: 12, fontWeight: 600, color: "var(--text-primary)",
                      border: "1px solid var(--border)",
                    }}
                  >
                    {initials(duplicate.name || "?")}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>{duplicate.name}</div>
                    <div style={{ fontSize: 11, color: "var(--text-muted)" }}>{duplicate.phone}</div>
                    <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2 }}>
                      <span style={{ color: COLUMN_COLOR[duplicate.kanban_column as KanbanColumnId] }}>●</span>{" "}
                      {COLUMNS.find((c) => c.id === duplicate.kanban_column)?.label ?? "—"}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={handleOpenDuplicate}
                    style={{
                      display: "inline-flex", alignItems: "center", gap: 4,
                      height: 32, padding: "0 12px", borderRadius: 6,
                      background: "#F59E0B", color: "#1a1a1a",
                      border: 0, fontSize: 12, fontWeight: 600, cursor: "pointer",
                    }}
                  >
                    Abrir conversa <ExternalLink size={12} />
                  </button>
                </div>
              </div>
            )}

            {/* Nome */}
            <div>
              <label style={fieldLabel}>Nome *</label>
              <input
                ref={nameRef}
                value={name}
                onChange={(e) => setName(e.target.value)}
                onBlur={() => setName((v) => capitalizeName(v))}
                placeholder="Ex: Maria Silva"
                style={textInput}
              />
              <div style={{ marginTop: 4, fontSize: 11, color: "var(--text-muted)" }}>
                💡 Você pode editar depois — o importante é iniciar a conversa.
              </div>
            </div>

            {/* Coluna inicial */}
            <div>
              <label style={fieldLabel}>Iniciar em</label>
              <div
                style={{
                  display: "flex",
                  gap: 4,
                  padding: 3,
                  background: "var(--bg-overlay)",
                  borderRadius: 10,
                  border: "1px solid var(--border)",
                }}
              >
                {COLUMNS.map((c) => {
                  const active = column === c.id;
                  return (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => setColumn(c.id)}
                      className="zf-ncm-segbtn"
                      style={{
                        background: active ? c.color : "transparent",
                        color: active ? "#fff" : "var(--text-muted)",
                        border: active ? `1px solid ${c.color}` : "1px solid transparent",
                      }}
                    >
                      <span aria-hidden>{c.emoji}</span>
                      <span>{c.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Tags */}
            <div>
              <label style={fieldLabel}>Tag <span style={{ color: "var(--text-muted)", fontWeight: 400 }}>(opcional)</span></label>
              <div
                style={{
                  display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center",
                  padding: 6, minHeight: 38,
                  background: "var(--bg-base)",
                  border: "1px solid var(--border-strong)",
                  borderRadius: 8,
                }}
              >
                {tags.map((t) => (
                  <span key={t} className="zf-ncm-chip">
                    {t}
                    <button type="button" onClick={() => setTags((prev) => prev.filter((x) => x !== t))} aria-label={`Remover ${t}`}>
                      <X size={11} />
                    </button>
                  </span>
                ))}
                <input
                  value={tagDraft}
                  onChange={(e) => {
                    const v = e.target.value;
                    if (v.endsWith(",")) addTag(v);
                    else setTagDraft(v);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      addTag(tagDraft);
                    } else if (e.key === "Backspace" && !tagDraft && tags.length) {
                      setTags((prev) => prev.slice(0, -1));
                    }
                  }}
                  placeholder={tags.length ? "" : "Digite e Enter"}
                  style={{
                    flex: 1, minWidth: 100, height: 24, border: 0, outline: "none",
                    background: "transparent", color: "var(--text-primary)", fontSize: 12,
                  }}
                />
              </div>
              {tagSuggestions.length > 0 && (
                <div style={{ marginTop: 6, display: "flex", flexWrap: "wrap", gap: 4 }}>
                  {tagSuggestions
                    .filter((t) => !tags.includes(t))
                    .slice(0, 6)
                    .map((t) => (
                      <button
                        key={t}
                        type="button"
                        onClick={() => addTag(t)}
                        style={{
                          fontSize: 10, padding: "2px 6px", borderRadius: 4,
                          background: "transparent", border: "1px dashed var(--border-strong)",
                          color: "var(--text-muted)", cursor: "pointer",
                        }}
                      >
                        + {t}
                      </button>
                    ))}
                </div>
              )}
            </div>

            {/* Mensagem inicial */}
            <div>
              <button
                type="button"
                onClick={() => setShowSendMessage((v) => !v)}
                style={{
                  display: "flex", alignItems: "center", gap: 6,
                  background: "transparent", border: 0, color: "var(--text-primary)",
                  fontSize: 12, fontWeight: 500, cursor: "pointer", padding: 0,
                }}
              >
                <ChevronDown
                  size={14}
                  style={{ transform: showSendMessage ? "rotate(0deg)" : "rotate(-90deg)", transition: "transform .15s" }}
                />
                📨 Enviar mensagem de abertura?
              </button>
              <div
                style={{
                  overflow: "hidden",
                  maxHeight: showSendMessage ? 220 : 0,
                  transition: "max-height .2s ease-out",
                }}
              >
                <div style={{ paddingTop: 8 }}>
                  <textarea
                    value={openingMessage}
                    onChange={(e) => setOpeningMessage(e.target.value)}
                    rows={3}
                    placeholder={`Olá! Aqui é ${profile?.full_name ?? "[seu nome]"}. Como posso te ajudar?`}
                    style={{
                      width: "100%", padding: 10, fontSize: 13,
                      color: "var(--text-primary)", background: "var(--bg-base)",
                      border: "1px solid var(--border-strong)", borderRadius: 8, outline: "none",
                      resize: "vertical", minHeight: 70, fontFamily: "inherit",
                    }}
                  />
                  <div style={{ marginTop: 6, display: "flex", flexWrap: "wrap", gap: 6 }}>
                    {QUICK_TEMPLATES.map((q) => (
                      <button
                        key={q.label}
                        type="button"
                        className="zf-quick-tpl"
                        onClick={() => setOpeningMessage(q.text(name.split(" ")[0] || "tudo bem?"))}
                      >
                        <span aria-hidden>{q.emoji}</span> {q.label}
                      </button>
                    ))}
                  </div>
                  <div style={{ marginTop: 6, fontSize: 11, color: "var(--text-muted)" }}>
                    A mensagem será enviada assim que confirmar.
                  </div>
                </div>
              </div>
            </div>

            {/* Atribuição */}
            <div>
              <label style={fieldLabel}>Responsável <span style={{ color: "var(--text-muted)", fontWeight: 400 }}>(opcional)</span></label>
              <div
                style={{
                  display: "flex", gap: 8, padding: 4,
                  background: "var(--bg-overlay)", border: "1px solid var(--border)", borderRadius: 8,
                }}
              >
                <button
                  type="button"
                  onClick={() => setAssignSelf(true)}
                  className="zf-ncm-segbtn"
                  style={{
                    background: assignSelf ? "var(--bg-surface)" : "transparent",
                    color: assignSelf ? "var(--text-primary)" : "var(--text-muted)",
                    border: assignSelf ? "1px solid var(--border)" : "1px solid transparent",
                  }}
                >
                  👤 Eu ({profile?.full_name?.split(" ")[0] ?? user?.email?.split("@")[0] ?? "agente"})
                </button>
                <button
                  type="button"
                  onClick={() => setAssignSelf(false)}
                  className="zf-ncm-segbtn"
                  style={{
                    background: !assignSelf ? "var(--bg-surface)" : "transparent",
                    color: !assignSelf ? "var(--text-primary)" : "var(--text-muted)",
                    border: !assignSelf ? "1px solid var(--border)" : "1px solid transparent",
                  }}
                >
                  Sem atribuição
                </button>
              </div>
            </div>
          </div>

          {/* Footer */}
          <div
            style={{
              display: "flex", alignItems: "center", justifyContent: "space-between",
              padding: "12px 18px", borderTop: "1px solid var(--border)", gap: 12,
            }}
          >
            <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "var(--text-muted)", cursor: "pointer" }}>
              <input
                type="checkbox"
                checked={createAnother}
                onChange={(e) => setCreateAnother(e.target.checked)}
              />
              Criar outro após salvar
            </label>
            <div style={{ display: "flex", gap: 8 }}>
              <button
                type="button"
                onClick={attemptClose}
                disabled={submitting}
                style={{
                  height: 34, padding: "0 14px", borderRadius: 8, fontSize: 13, fontWeight: 500,
                  background: "transparent", color: "var(--text-primary)",
                  border: "1px solid var(--border-strong)", cursor: "pointer",
                }}
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => void handleSubmit()}
                disabled={!canSubmit}
                style={{
                  display: "inline-flex", alignItems: "center", gap: 6,
                  height: 34, padding: "0 14px", borderRadius: 8, fontSize: 13, fontWeight: 600,
                  background: canSubmit ? "#25D366" : "color-mix(in oklab, #25D366 40%, var(--bg-overlay))",
                  color: "#0a1a10", border: 0, cursor: canSubmit ? "pointer" : "not-allowed",
                  opacity: canSubmit ? 1 : 0.7,
                }}
              >
                {submitting ? <><Loader2 size={14} className="animate-spin" /> Criando...</> : <>Criar e Abrir Conversa →</>}
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

const fieldLabel: React.CSSProperties = {
  display: "block",
  fontSize: 11,
  fontWeight: 600,
  color: "var(--text-muted)",
  textTransform: "uppercase",
  letterSpacing: ".04em",
  marginBottom: 6,
};

const textInput: React.CSSProperties = {
  width: "100%",
  height: 38,
  padding: "0 12px",
  fontSize: 14,
  color: "var(--text-primary)",
  background: "var(--bg-base)",
  border: "1px solid var(--border-strong)",
  borderRadius: 8,
  outline: "none",
};
