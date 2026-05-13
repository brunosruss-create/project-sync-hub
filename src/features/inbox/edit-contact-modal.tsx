import * as React from "react";
import { X, Loader2, UserCog } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { notify } from "@/lib/notify";
import { type ContactCard as Contact, formatPhone } from "./data";

interface Props {
  open: boolean;
  contact: Contact | null;
  onClose: () => void;
  onSaved: (patch: Partial<Contact> & { notes?: string | null }) => void;
}

export function EditContactModal({ open, contact, onClose, onSaved }: Props) {
  const { user } = useAuth();
  const [name, setName] = React.useState("");
  const [tags, setTags] = React.useState<string[]>([]);
  const [tagDraft, setTagDraft] = React.useState("");
  const [notes, setNotes] = React.useState("");
  const [assignedAgent, setAssignedAgent] = React.useState<string | null>(null);
  const [agents, setAgents] = React.useState<Array<{ id: string; label: string }>>([]);
  const [saving, setSaving] = React.useState(false);
  const nameRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    if (!open || !contact) return;
    setName(contact.name ?? "");
    setTags(Array.isArray(contact.tags) ? [...contact.tags] : []);
    setTagDraft("");
    setAssignedAgent(contact.assignedAgent ?? null);
    setNotes("");
    setSaving(false);

    // Carrega notes e lista de agentes
    void (async () => {
      if (!user?.id) return;
      const { data } = await supabase
        .from("contacts")
        .select("notes")
        .eq("id", contact.id)
        .maybeSingle();
      if (data && typeof (data as any).notes === "string") {
        setNotes((data as any).notes ?? "");
      }
    })();

    void (async () => {
      // Lista simples: o próprio usuário (single-tenant)
      const me = user?.email?.split("@")[0] ?? "Eu";
      setAgents([{ id: user?.id ?? "", label: `Eu (${me})` }]);
    })();

    setTimeout(() => nameRef.current?.focus(), 60);
  }, [open, contact?.id, user?.id]);

  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      else if ((e.metaKey || e.ctrlKey) && e.key === "Enter") void save();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, name, tags, notes, assignedAgent]);

  function addTag(raw: string) {
    const t = raw.trim().replace(/,$/, "");
    if (!t || tags.includes(t)) return;
    setTags((p) => [...p, t]);
    setTagDraft("");
  }

  async function save() {
    if (!contact || saving) return;
    const finalName = name.trim();
    if (!finalName) {
      notify.error("Nome é obrigatório.");
      return;
    }
    setSaving(true);
    const payload: Record<string, any> = {
      name: finalName,
      tags,
      assigned_agent_id: assignedAgent,
    };

    let { error } = await supabase
      .from("contacts")
      .update({ ...payload, notes })
      .eq("id", contact.id);

    // Fallback caso coluna `notes` ainda não exista
    if (error && /notes/i.test(error.message ?? "") && /column|does not exist/i.test(error.message ?? "")) {
      const retry = await supabase.from("contacts").update(payload).eq("id", contact.id);
      error = retry.error;
    }

    if (error) {
      notify.error(error.message ?? "Falha ao salvar.");
      setSaving(false);
      return;
    }
    onSaved({
      name: finalName,
      tags: [...tags],
      assignedAgent,
      notes: notes || null,
    });
    notify.success("Contato atualizado ✓");
    setSaving(false);
    onClose();
  }

  if (!open || !contact) return null;

  return (
    <>
      <style>{`
        @keyframes zfEcmIn { from { opacity:0; transform: scale(.96);} to { opacity:1; transform: scale(1);} }
        @keyframes zfEcmFade { from { opacity:0; } to { opacity:1; } }
      `}</style>
      <div
        onClick={(e) => {
          if (e.target === e.currentTarget) onClose();
        }}
        style={{
          position: "fixed", inset: 0, background: "rgba(0,0,0,.55)",
          backdropFilter: "blur(4px)", WebkitBackdropFilter: "blur(4px)",
          zIndex: 90, display: "flex", alignItems: "center", justifyContent: "center", padding: 16,
          animation: "zfEcmFade .15s ease-out",
        }}
      >
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Editar contato"
          style={{
            width: 400, maxWidth: "100%",
            background: "var(--bg-surface)",
            border: "1px solid var(--border-strong)",
            borderRadius: 12,
            boxShadow: "0 24px 48px rgba(0,0,0,.4)",
            display: "flex", flexDirection: "column",
            maxHeight: "calc(100vh - 32px)",
            animation: "zfEcmIn .18s ease-out",
          }}
        >
          {/* Header */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 16px 12px", borderBottom: "1px solid var(--border)" }}>
            <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
              <UserCog size={16} style={{ color: "var(--brand-400, #25D366)" }} />
              <div>
                <div style={{ fontSize: 14, fontWeight: 600, color: "var(--text-primary)" }}>Editar contato</div>
                <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 1 }} className="font-mono">
                  {formatPhone(contact.phone)}
                </div>
              </div>
            </div>
            <button onClick={onClose} aria-label="Fechar" style={{ background: "transparent", border: 0, color: "var(--text-muted)", cursor: "pointer", padding: 4, borderRadius: 6 }}>
              <X size={16} />
            </button>
          </div>

          {/* Body */}
          <div style={{ padding: 16, overflowY: "auto", display: "flex", flexDirection: "column", gap: 12 }}>
            <div>
              <label style={lbl}>Nome *</label>
              <input
                ref={nameRef}
                value={name}
                onChange={(e) => setName(e.target.value)}
                style={input}
                placeholder="Nome do contato"
              />
            </div>

            <div>
              <label style={lbl}>Tags</label>
              <div style={chipsBox}>
                {tags.map((t) => (
                  <span key={t} style={chip}>
                    {t}
                    <button type="button" onClick={() => setTags((p) => p.filter((x) => x !== t))} style={chipX} aria-label={`Remover ${t}`}>
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
                    if (e.key === "Enter") { e.preventDefault(); addTag(tagDraft); }
                    else if (e.key === "Backspace" && !tagDraft && tags.length) setTags((p) => p.slice(0, -1));
                  }}
                  placeholder={tags.length ? "" : "Digite e Enter"}
                  style={{ flex: 1, minWidth: 100, height: 24, border: 0, outline: "none", background: "transparent", color: "var(--text-primary)", fontSize: 12 }}
                />
              </div>
            </div>

            <div>
              <label style={lbl}>Agente responsável</label>
              <select
                value={assignedAgent ?? ""}
                onChange={(e) => setAssignedAgent(e.target.value || null)}
                style={{ ...input, padding: "0 10px" }}
              >
                <option value="">Sem atendente</option>
                {agents.map((a) => (
                  <option key={a.id} value={a.id}>{a.label}</option>
                ))}
              </select>
            </div>

            <div>
              <label style={lbl}>Observações</label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={3}
                placeholder="Anotações internas sobre este contato (não aparecem para o cliente)."
                style={{ ...input, height: "auto", padding: 10, minHeight: 70, resize: "vertical", fontFamily: "inherit" }}
              />
            </div>

            <div style={{ fontSize: 11, color: "var(--text-muted)" }}>
              💡 Telefone e coluna do Kanban não podem ser editados aqui.
              Para mover, arraste o card.
            </div>
          </div>

          {/* Footer */}
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, padding: "12px 16px", borderTop: "1px solid var(--border)" }}>
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              style={{ height: 34, padding: "0 14px", borderRadius: 8, fontSize: 13, fontWeight: 500, background: "transparent", color: "var(--text-primary)", border: "1px solid var(--border-strong)", cursor: "pointer" }}
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={() => void save()}
              disabled={saving || !name.trim()}
              style={{
                display: "inline-flex", alignItems: "center", gap: 6,
                height: 34, padding: "0 14px", borderRadius: 8, fontSize: 13, fontWeight: 600,
                background: !saving && name.trim() ? "#25D366" : "color-mix(in oklab, #25D366 40%, var(--bg-overlay))",
                color: "#0a1a10", border: 0,
                cursor: !saving && name.trim() ? "pointer" : "not-allowed",
                opacity: !saving && name.trim() ? 1 : 0.7,
              }}
            >
              {saving ? <><Loader2 size={14} className="animate-spin" /> Salvando…</> : "Salvar alterações"}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

const lbl: React.CSSProperties = {
  display: "block", fontSize: 11, fontWeight: 600, color: "var(--text-muted)",
  textTransform: "uppercase", letterSpacing: ".04em", marginBottom: 6,
};
const input: React.CSSProperties = {
  width: "100%", height: 38, padding: "0 12px", fontSize: 14,
  color: "var(--text-primary)", background: "var(--bg-base)",
  border: "1px solid var(--border-strong)", borderRadius: 8, outline: "none",
};
const chipsBox: React.CSSProperties = {
  display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center",
  padding: 6, minHeight: 38, background: "var(--bg-base)",
  border: "1px solid var(--border-strong)", borderRadius: 8,
};
const chip: React.CSSProperties = {
  display: "inline-flex", alignItems: "center", gap: 4,
  padding: "2px 8px", borderRadius: 999,
  background: "var(--bg-overlay)", border: "1px solid var(--border)",
  fontSize: 12, color: "var(--text-primary)",
};
const chipX: React.CSSProperties = {
  background: "transparent", border: 0, color: "var(--text-muted)",
  cursor: "pointer", lineHeight: 1, padding: 0,
};
