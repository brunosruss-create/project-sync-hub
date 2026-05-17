import * as React from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Copy, ExternalLink } from "lucide-react";
import {
  SettingsLayout,
  FieldGroup,
  Field,
  inputStyle,
  textareaStyle,
  buttonPrimary,
  buttonSecondary,
} from "@/features/settings/settings-layout";
import { ManagerOnly } from "@/components/manager-only";
import { getWorkspaceProfile, updateBookingConfig } from "@/lib/onboarding.functions";
import { getBookingUrl } from "@/lib/booking-url";

export const Route = createFileRoute("/_authenticated/settings/booking")({
  component: () => (
    <ManagerOnly>
      <BookingPage />
    </ManagerOnly>
  ),
});

function BookingPage() {
  const qc = useQueryClient();
  const getProfileFn = useServerFn(getWorkspaceProfile);
  const updateFn = useServerFn(updateBookingConfig);

  const profileQ = useQuery({
    queryKey: ["workspace-profile"],
    queryFn: () => getProfileFn(),
  });

  const [enabled, setEnabled] = React.useState(false);
  const [aiSend, setAiSend] = React.useState(true);
  const [slug, setSlug] = React.useState("");
  const [title, setTitle] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    const p = profileQ.data as any;
    if (!p) return;
    setEnabled(!!p.booking_enabled);
    setAiSend(p.booking_ai_send !== false);
    setSlug(p.booking_slug ?? "");
    setTitle(p.booking_title ?? "");
    setDescription(p.booking_description ?? "");
  }, [profileQ.data]);

  const url = slug ? getBookingUrl(slug) : "";

  const save = async () => {
    if (!slug.trim()) {
      toast.error("Defina um identificador para o link");
      return;
    }
    setSaving(true);
    try {
      await updateFn({
        data: {
          booking_enabled: enabled,
          booking_ai_send: aiSend,
          booking_slug: slug.trim().toLowerCase(),
          booking_title: title.trim(),
          booking_description: description.trim(),
        },
      });
      await qc.invalidateQueries({ queryKey: ["workspace-profile"] });
      toast.success("Link de agendamento atualizado");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao salvar");
    } finally {
      setSaving(false);
    }
  };

  const copy = () => {
    if (!url) return;
    navigator.clipboard.writeText(url);
    toast.success("Link copiado");
  };

  return (
    <SettingsLayout
      title="Link público de agendamento"
      description="Permita que clientes agendem sozinhos por um link compartilhável."
      footer={
        <>
          <button style={buttonSecondary}>Cancelar</button>
          <button style={buttonPrimary} onClick={save} disabled={saving}>
            {saving ? "Salvando…" : "Salvar alterações"}
          </button>
        </>
      }
    >
      <FieldGroup label="Status">
        <label className="flex items-center gap-2" style={{ fontSize: 13 }}>
          <input
            type="checkbox"
            checked={enabled}
            onChange={(e) => setEnabled(e.target.checked)}
          />
          Permitir que clientes agendem por este link
        </label>
      </FieldGroup>

      <FieldGroup label="Endereço do link">
        <Field
          label="Identificador (slug)"
          hint="Use letras minúsculas, números e hífens. Ex: clinica-bela-vista"
        >
          <input
            style={inputStyle}
            value={slug}
            onChange={(e) =>
              setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))
            }
            placeholder="meu-negocio"
            maxLength={60}
          />
        </Field>
        {url && (
          <div
            className="flex items-center"
            style={{
              gap: 8,
              padding: "10px 12px",
              background: "var(--bg-overlay)",
              border: "1px solid var(--border)",
              borderRadius: 8,
              fontSize: 13,
            }}
          >
            <span className="flex-1 truncate font-mono" style={{ color: "var(--text-primary)" }}>
              {url}
            </span>
            <button style={buttonSecondary} onClick={copy} title="Copiar">
              <Copy size={13} />
            </button>
            <a
              style={buttonSecondary}
              href={url}
              target="_blank"
              rel="noreferrer"
              title="Abrir"
            >
              <ExternalLink size={13} />
            </a>
          </div>
        )}
      </FieldGroup>

      <FieldGroup label="Conteúdo da página">
        <Field label="Título exibido ao cliente">
          <input
            style={inputStyle}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Agende seu horário"
            maxLength={120}
          />
        </Field>
        <Field label="Descrição">
          <textarea
            style={textareaStyle}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Escolha um serviço e horário disponível."
            rows={3}
            maxLength={500}
          />
        </Field>
      </FieldGroup>
    </SettingsLayout>
  );
}
