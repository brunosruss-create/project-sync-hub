import * as React from "react";
import { createFileRoute } from "@tanstack/react-router";
import { toast } from "sonner";
import { Upload } from "lucide-react";
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

export const Route = createFileRoute("/_authenticated/settings/workspace")({
  component: () => (
    <ManagerOnly>
      <WorkspacePage />
    </ManagerOnly>
  ),
});

const DAYS = [
  { key: "mon", label: "Segunda" },
  { key: "tue", label: "Terça" },
  { key: "wed", label: "Quarta" },
  { key: "thu", label: "Quinta" },
  { key: "fri", label: "Sexta" },
  { key: "sat", label: "Sábado" },
  { key: "sun", label: "Domingo" },
] as const;

type Hours = Record<string, { active: boolean; start: string; end: string }>;

function WorkspacePage() {
  const [name, setName] = React.useState("Meu Negócio");
  const [segment, setSegment] = React.useState("Mecânico");
  const [address, setAddress] = React.useState("");
  const [phone, setPhone] = React.useState("");
  const [site, setSite] = React.useState("");
  const [tz, setTz] = React.useState("America/Sao_Paulo");
  const [welcome, setWelcome] = React.useState(
    "Olá! Bem-vindo(a). Em instantes um atendente irá responder.",
  );
  const [hours, setHours] = React.useState<Hours>(() =>
    Object.fromEntries(
      DAYS.map((d) => [
        d.key,
        { active: d.key !== "sun", start: "08:00", end: "18:00" },
      ]),
    ),
  );
  const [saving, setSaving] = React.useState(false);

  const handleSave = async () => {
    setSaving(true);
    await new Promise((r) => setTimeout(r, 600));
    setSaving(false);
    toast.success("Configurações do negócio salvas");
  };

  return (
    <SettingsLayout
      title="Negócio"
      description="Identidade, horários e mensagens automáticas do seu workspace."
      footer={
        <>
          <button style={buttonSecondary}>Cancelar</button>
          <button style={buttonPrimary} onClick={handleSave} disabled={saving}>
            {saving ? "Salvando…" : "Salvar alterações"}
          </button>
        </>
      }
    >
      <FieldGroup label="Identidade">
        <div className="flex items-center gap-4">
          <div
            style={{
              width: 64,
              height: 64,
              borderRadius: 12,
              background: "var(--bg-overlay)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontWeight: 600,
              fontSize: 20,
            }}
          >
            {name.charAt(0).toUpperCase()}
          </div>
          <button
            style={buttonSecondary}
            className="flex items-center gap-2"
            onClick={() => toast("Upload de logo em breve")}
          >
            <Upload size={14} /> Enviar logo
          </button>
        </div>
        <Field label="Nome do negócio">
          <input style={inputStyle} value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label="Segmento">
          <select style={inputStyle} value={segment} onChange={(e) => setSegment(e.target.value)}>
            <option>Mecânico</option>
            <option>Clínica</option>
            <option>Dentista</option>
            <option>Outro</option>
          </select>
        </Field>
      </FieldGroup>

      <FieldGroup label="Contato">
        <Field label="Endereço">
          <input style={inputStyle} value={address} onChange={(e) => setAddress(e.target.value)} />
        </Field>
        <Field label="Telefone comercial">
          <input style={inputStyle} value={phone} onChange={(e) => setPhone(e.target.value)} />
        </Field>
        <Field label="Site">
          <input
            style={inputStyle}
            value={site}
            onChange={(e) => setSite(e.target.value)}
            placeholder="https://"
          />
        </Field>
      </FieldGroup>

      <FieldGroup label="Horários de funcionamento">
        <div
          className="flex flex-col"
          style={{
            border: "1px solid var(--border)",
            borderRadius: 8,
            overflow: "hidden",
          }}
        >
          {DAYS.map((d, i) => {
            const h = hours[d.key];
            return (
              <div
                key={d.key}
                className="flex items-center gap-3"
                style={{
                  padding: "10px 12px",
                  borderTop: i === 0 ? 0 : "1px solid var(--border)",
                  background: h.active ? "transparent" : "var(--bg-overlay)",
                }}
              >
                <label className="flex items-center gap-2" style={{ width: 130, fontSize: 13 }}>
                  <input
                    type="checkbox"
                    checked={h.active}
                    onChange={(e) =>
                      setHours({ ...hours, [d.key]: { ...h, active: e.target.checked } })
                    }
                  />
                  {d.label}
                </label>
                <input
                  type="time"
                  value={h.start}
                  disabled={!h.active}
                  onChange={(e) =>
                    setHours({ ...hours, [d.key]: { ...h, start: e.target.value } })
                  }
                  style={{ ...inputStyle, width: 110, height: 32 }}
                />
                <span style={{ fontSize: 12, color: "var(--text-muted)" }}>até</span>
                <input
                  type="time"
                  value={h.end}
                  disabled={!h.active}
                  onChange={(e) => setHours({ ...hours, [d.key]: { ...h, end: e.target.value } })}
                  style={{ ...inputStyle, width: 110, height: 32 }}
                />
                {!h.active && (
                  <span style={{ fontSize: 12, color: "var(--text-muted)", marginLeft: "auto" }}>
                    Fechado
                  </span>
                )}
              </div>
            );
          })}
        </div>
        <Field label="Fuso horário">
          <select style={inputStyle} value={tz} onChange={(e) => setTz(e.target.value)}>
            <option value="America/Sao_Paulo">America/Sao_Paulo (GMT-3)</option>
            <option value="America/Manaus">America/Manaus (GMT-4)</option>
            <option value="America/Belem">America/Belem (GMT-3)</option>
          </select>
        </Field>
      </FieldGroup>

      <FieldGroup label="Mensagem de boas-vindas">
        <Field hint="Enviada automaticamente no primeiro contato.">
          <textarea
            style={textareaStyle}
            value={welcome}
            onChange={(e) => setWelcome(e.target.value)}
            rows={4}
          />
        </Field>
      </FieldGroup>
    </SettingsLayout>
  );
}
