import * as React from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  SettingsLayout,
  buttonPrimary,
  buttonSecondary,
  textareaStyle,
  card,
} from "@/features/settings/settings-layout";
import { ManagerOnly } from "@/components/manager-only";
import { notify } from "@/lib/notify";
import {
  getMessageTemplates,
  updateMessageTemplates,
  type MessageTemplate,
} from "@/lib/messages.functions";
import {
  MESSAGE_DEFAULTS,
  MESSAGE_ORDER,
  type MessageKey,
} from "@/lib/message-defaults";
import { renderTemplate } from "@/lib/message-templates";
import { useProfile } from "@/hooks/use-profile";

export const Route = createFileRoute("/_authenticated/settings/messages")({
  component: () => (
    <ManagerOnly>
      <MessagesPage />
    </ManagerOnly>
  ),
});

type Draft = Record<MessageKey, { enabled: boolean; text: string }>;

function MessagesPage() {
  const qc = useQueryClient();
  const getFn = useServerFn(getMessageTemplates);
  const updateFn = useServerFn(updateMessageTemplates);
  const { data: profile } = useProfile();
  const businessName = (profile as { business_name?: string | null } | null | undefined)
    ?.business_name?.trim() || null;
  const aiEnabled = (profile as { ai_enabled?: boolean | null } | null | undefined)
    ?.ai_enabled === true;

  const q = useQuery({
    queryKey: ["message-templates"],
    queryFn: () => getFn(),
  });

  const [draft, setDraft] = React.useState<Draft | null>(null);
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    if (!q.data) return;
    const t = q.data.templates as Record<MessageKey, MessageTemplate>;
    const d = {} as Draft;
    for (const k of MESSAGE_ORDER) {
      d[k] = { enabled: t[k].enabled, text: t[k].text };
    }
    setDraft(d);
  }, [q.data]);

  const dirty = React.useMemo(() => {
    if (!q.data || !draft) return false;
    const t = q.data.templates as Record<MessageKey, MessageTemplate>;
    return MESSAGE_ORDER.some(
      (k) => draft[k].enabled !== t[k].enabled || draft[k].text !== t[k].text,
    );
  }, [draft, q.data]);

  const set = (k: MessageKey, patch: Partial<{ enabled: boolean; text: string }>) =>
    setDraft((d) => (d ? { ...d, [k]: { ...d[k], ...patch } } : d));

  const save = async () => {
    if (!draft) return;
    setSaving(true);
    try {
      await updateFn({ data: draft });
      await qc.invalidateQueries({ queryKey: ["message-templates"] });
      notify.success("Mensagens atualizadas");
    } catch (e) {
      notify.error(e);
    } finally {
      setSaving(false);
    }
  };

  return (
    <SettingsLayout
      title="Mensagens automáticas"
      description="Edite todas as mensagens que o sistema envia para o cliente final no WhatsApp. Use {{variáveis}} para personalizar."
      footer={
        <>
          <button
            style={buttonSecondary}
            onClick={() => {
              if (!q.data) return;
              const t = q.data.templates as Record<MessageKey, MessageTemplate>;
              const d = {} as Draft;
              for (const k of MESSAGE_ORDER) {
                d[k] = { enabled: t[k].enabled, text: t[k].text };
              }
              setDraft(d);
            }}
            disabled={!dirty || saving}
          >
            Descartar
          </button>
          <button
            style={buttonPrimary}
            onClick={save}
            disabled={!dirty || saving}
          >
            {saving ? "Salvando…" : "Salvar alterações"}
          </button>
        </>
      }
    >
      {!draft && <div style={{ color: "var(--text-muted)" }}>Carregando…</div>}
      {draft && (
        <div className="flex flex-col" style={{ gap: 16 }}>
          {MESSAGE_ORDER.map((k) => (
            <MessageCard
              key={k}
              meta={MESSAGE_DEFAULTS[k]}
              value={draft[k]}
              businessName={businessName}
              onChange={(patch) => set(k, patch)}
              onReset={() =>
                set(k, { text: MESSAGE_DEFAULTS[k].default })
              }
            />
          ))}
        </div>
      )}
    </SettingsLayout>
  );
}

function MessageCard({
  meta,
  value,
  businessName,
  onChange,
  onReset,
}: {
  meta: (typeof MESSAGE_DEFAULTS)[MessageKey];
  value: { enabled: boolean; text: string };
  businessName: string | null;
  onChange: (patch: Partial<{ enabled: boolean; text: string }>) => void;
  onReset: () => void;
}) {
  const textareaRef = React.useRef<HTMLTextAreaElement>(null);
  const effective = value.text?.trim() ? value.text : meta.default;
  const previewVars = {
    ...meta.preview,
    negocio: businessName || meta.preview.negocio,
  };
  const preview = renderTemplate(effective, previewVars);

  const insertPlaceholder = (ph: string) => {
    const el = textareaRef.current;
    const current = value.text || meta.default;
    if (!el) {
      onChange({ text: current + ph });
      return;
    }
    const start = el.selectionStart ?? current.length;
    const end = el.selectionEnd ?? current.length;
    const next = current.slice(0, start) + ph + current.slice(end);
    onChange({ text: next });
    requestAnimationFrame(() => {
      el.focus();
      const pos = start + ph.length;
      el.setSelectionRange(pos, pos);
    });
  };

  return (
    <div style={card}>
      <div
        className="flex items-start"
        style={{ gap: 12, marginBottom: 12 }}
      >
        <div className="flex-1 min-w-0">
          <div
            style={{
              fontSize: 14,
              fontWeight: 600,
              color: "var(--text-primary)",
            }}
          >
            {meta.label}
          </div>
          <div
            style={{
              fontSize: 12,
              color: "var(--text-muted)",
              marginTop: 2,
            }}
          >
            {meta.description}
          </div>
        </div>
        <label
          className="flex items-center"
          style={{ gap: 6, fontSize: 12, color: "var(--text-secondary)" }}
        >
          <input
            type="checkbox"
            checked={value.enabled}
            onChange={(e) => onChange({ enabled: e.target.checked })}
          />
          {value.enabled ? "Ativa" : "Desativada"}
        </label>
      </div>

      <div
        className="grid"
        style={{ gridTemplateColumns: "1fr 1fr", gap: 12 }}
      >
        <div>
          <textarea
            ref={textareaRef}
            style={{ ...textareaStyle, minHeight: 140, opacity: value.enabled ? 1 : 0.6 }}
            value={value.text || meta.default}
            onChange={(e) => onChange({ text: e.target.value })}
            disabled={!value.enabled}
            placeholder={meta.default}
          />
          <div
            className="flex items-center"
            style={{ flexWrap: "wrap", gap: 6, marginTop: 8 }}
          >
            {meta.placeholders.map((ph) => (
              <button
                key={ph}
                type="button"
                onClick={() => insertPlaceholder(ph)}
                disabled={!value.enabled}
                style={{
                  fontSize: 11,
                  padding: "3px 8px",
                  borderRadius: 999,
                  border: "1px solid var(--border)",
                  background: "var(--bg-overlay)",
                  color: "var(--text-secondary)",
                  cursor: value.enabled ? "pointer" : "not-allowed",
                  fontFamily: "monospace",
                }}
                title={`Inserir ${ph}`}
              >
                {ph}
              </button>
            ))}
            <button
              type="button"
              onClick={onReset}
              style={{
                fontSize: 11,
                padding: "3px 8px",
                borderRadius: 999,
                border: "1px solid var(--border)",
                background: "transparent",
                color: "var(--text-muted)",
                cursor: "pointer",
                marginLeft: "auto",
              }}
            >
              Restaurar padrão
            </button>
          </div>
        </div>
        <div>
          <div
            style={{
              fontSize: 11,
              fontWeight: 600,
              textTransform: "uppercase",
              letterSpacing: "0.05em",
              color: "var(--text-muted)",
              marginBottom: 6,
            }}
          >
            Preview
          </div>
          <div
            style={{
              minHeight: 140,
              padding: 12,
              borderRadius: 8,
              background: "color-mix(in oklab, var(--brand-400) 6%, var(--bg-overlay))",
              border: "1px solid var(--border)",
              fontSize: 13,
              color: "var(--text-primary)",
              whiteSpace: "pre-wrap",
              wordBreak: "break-word",
              fontFamily:
                "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
              opacity: value.enabled ? 1 : 0.6,
            }}
          >
            {preview}
          </div>
        </div>
      </div>
    </div>
  );
}
