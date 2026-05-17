import * as React from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
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
import {
  listActiveSegments,
  getWorkspaceProfile,
  updateWorkspaceProfile,
  updateWorkspaceSegmentWithDefaults,
} from "@/lib/onboarding.functions";

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
  const qc = useQueryClient();
  const listSegmentsFn = useServerFn(listActiveSegments);
  const getProfileFn = useServerFn(getWorkspaceProfile);
  const updateProfileFn = useServerFn(updateWorkspaceProfile);
  const updateSegmentDefaultsFn = useServerFn(updateWorkspaceSegmentWithDefaults);

  const segmentsQ = useQuery({
    queryKey: ["active-segments"],
    queryFn: () => listSegmentsFn(),
  });
  const profileQ = useQuery({
    queryKey: ["workspace-profile"],
    queryFn: () => getProfileFn(),
  });

  const [name, setName] = React.useState("");
  const [segmentId, setSegmentId] = React.useState<string>("");
  const [cep, setCep] = React.useState("");
  const [street, setStreet] = React.useState("");
  const [number, setNumber] = React.useState("");
  const [complement, setComplement] = React.useState("");
  const [neighborhood, setNeighborhood] = React.useState("");
  const [city, setCity] = React.useState("");
  const [stateUf, setStateUf] = React.useState("");
  const [cepLoading, setCepLoading] = React.useState(false);
  const [cepError, setCepError] = React.useState<string | null>(null);
  const [phone, setPhone] = React.useState("");
  const [site, setSite] = React.useState("");
  const [tz, setTz] = React.useState("America/Sao_Paulo");
  const [welcomeEnabled, setWelcomeEnabled] = React.useState(false);
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
  const [confirmSwitch, setConfirmSwitch] = React.useState<null | {
    name: string;
  }>(null);

  // Hidrata estado quando o perfil carrega
  React.useEffect(() => {
    const p = profileQ.data as
      | {
          business_name?: string;
          segment_id?: string | null;
          business_hours?: Hours | null;
          business_timezone?: string;
          welcome_message?: string;
          welcome_message_enabled?: boolean;
          business_address?: string;
          business_phone?: string;
          business_website?: string;
          business_cep?: string;
          business_street?: string;
          business_address_number?: string;
          business_address_complement?: string;
          business_neighborhood?: string;
          business_city?: string;
          business_state?: string;
        }
      | undefined;
    if (!p) return;
    setName(p.business_name || "Meu Negócio");
    setSegmentId(p.segment_id ?? "");
    if (p.business_hours && typeof p.business_hours === "object") {
      setHours((prev) => ({ ...prev, ...p.business_hours }));
    }
    if (p.business_timezone) setTz(p.business_timezone);
    if (typeof p.welcome_message === "string" && p.welcome_message.length > 0) {
      setWelcome(p.welcome_message);
    }
    setWelcomeEnabled(p.welcome_message_enabled ?? false);
    // Fallback: se business_street vazio mas business_address legado preenchido, usa.
    const streetFromNew = p.business_street ?? "";
    setStreet(streetFromNew || p.business_address || "");
    setCep(p.business_cep ?? "");
    setNumber(p.business_address_number ?? "");
    setComplement(p.business_address_complement ?? "");
    setNeighborhood(p.business_neighborhood ?? "");
    setCity(p.business_city ?? "");
    setStateUf(p.business_state ?? "");
    if (typeof p.business_phone === "string") setPhone(p.business_phone);
    if (typeof p.business_website === "string") setSite(p.business_website);
  }, [profileQ.data]);

  // ViaCEP lookup quando CEP completa 8 dígitos
  const lookupCep = React.useCallback(async (raw: string) => {
    const clean = raw.replace(/\D/g, "");
    if (clean.length !== 8) return;
    setCepLoading(true);
    setCepError(null);
    try {
      const res = await fetch(`https://viacep.com.br/ws/${clean}/json/`);
      const json = (await res.json()) as {
        erro?: boolean;
        logradouro?: string;
        bairro?: string;
        localidade?: string;
        uf?: string;
      };
      if (json.erro) {
        setCepError("CEP não encontrado");
        return;
      }
      if (json.logradouro) setStreet(json.logradouro);
      if (json.bairro) setNeighborhood(json.bairro);
      if (json.localidade) setCity(json.localidade);
      if (json.uf) setStateUf(json.uf);
    } catch {
      setCepError("Falha ao buscar CEP");
    } finally {
      setCepLoading(false);
    }
  }, []);

  const handleCepChange = (v: string) => {
    const digits = v.replace(/\D/g, "").slice(0, 8);
    const masked = digits.length > 5 ? `${digits.slice(0, 5)}-${digits.slice(5)}` : digits;
    setCep(masked);
    setCepError(null);
    if (digits.length === 8) void lookupCep(digits);
  };

  const segments = segmentsQ.data?.segments ?? [];
  const selectedSegment = segments.find((s) => s.id === segmentId);
  const currentSegmentId =
    (profileQ.data as { segment_id?: string | null } | undefined)?.segment_id ?? null;
  const segmentChanged = !!currentSegmentId && segmentId !== currentSegmentId;

  const persist = async (applyDefaults: boolean) => {
    setSaving(true);
    try {
      if (applyDefaults) {
        await updateSegmentDefaultsFn({
          data: { business_name: name.trim(), segment_id: segmentId },
        });
      }
      // Sempre salva nome + horários + fuso + boas-vindas
      await updateProfileFn({
        data: {
          business_name: name.trim(),
          segment_id: segmentId,
          business_hours: hours,
          business_timezone: tz,
          welcome_message: welcome,
          welcome_message_enabled: welcomeEnabled,
          business_address: address.trim(),
          business_phone: phone.trim(),
          business_website: site.trim(),
        },
      });
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["workspace-profile"] }),
        qc.invalidateQueries({ queryKey: ["workspace-ai-config"] }),
      ]);
      toast.success(
        applyDefaults
          ? "Segmento atualizado e defaults da IA aplicados"
          : "Configurações do negócio salvas",
      );
      setConfirmSwitch(null);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao salvar");
    } finally {
      setSaving(false);
    }
  };

  const handleSave = async () => {
    if (!segmentId) {
      toast.error("Selecione um segmento");
      return;
    }
    if (!name.trim()) {
      toast.error("Informe o nome do negócio");
      return;
    }
    if (segmentChanged) {
      setConfirmSwitch({ name: selectedSegment?.name ?? "novo segmento" });
      return;
    }
    await persist(false);
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
          <select
            style={inputStyle}
            value={segmentId}
            onChange={(e) => setSegmentId(e.target.value)}
            disabled={segmentsQ.isLoading}
          >
            <option value="" disabled>
              {segmentsQ.isLoading ? "Carregando…" : "Selecione um segmento"}
            </option>
            {segments.map((s) => (
              <option key={s.id} value={s.id}>
                {s.icon ? `${s.icon} ` : ""}
                {s.name}
              </option>
            ))}
          </select>
          {selectedSegment?.description && (
            <span style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 4 }}>
              {selectedSegment.description}
            </span>
          )}
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
                  type="text"
                  inputMode="numeric"
                  pattern="^([01][0-9]|2[0-3]):[0-5][0-9]$"
                  placeholder="00:00"
                  maxLength={5}
                  value={h.start}
                  disabled={!h.active}
                  onChange={(e) =>
                    setHours({ ...hours, [d.key]: { ...h, start: e.target.value } })
                  }
                  style={{ ...inputStyle, width: 110, height: 32 }}
                />
                <span style={{ fontSize: 12, color: "var(--text-muted)" }}>até</span>
                <input
                  type="text"
                  inputMode="numeric"
                  pattern="^([01][0-9]|2[0-3]):[0-5][0-9]$"
                  placeholder="23:00"
                  maxLength={5}
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
        <label className="flex items-center gap-2" style={{ fontSize: 13 }}>
          <input
            type="checkbox"
            checked={welcomeEnabled}
            onChange={(e) => setWelcomeEnabled(e.target.checked)}
          />
          Enviar mensagem de boas-vindas no primeiro contato
        </label>
        <Field hint="Enviada automaticamente no primeiro contato do cliente.">
          <textarea
            style={textareaStyle}
            value={welcome}
            disabled={!welcomeEnabled}
            onChange={(e) => setWelcome(e.target.value)}
            rows={4}
          />
        </Field>
      </FieldGroup>

      {confirmSwitch && (
        <div
          onClick={() => !saving && setConfirmSwitch(null)}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.5)",
            zIndex: 60,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 16,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: "var(--bg-surface)",
              border: "1px solid var(--border)",
              borderRadius: 12,
              maxWidth: 460,
              width: "100%",
              padding: 20,
            }}
          >
            <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 8 }}>
              Trocar para “{confirmSwitch.name}”?
            </h3>
            <p style={{ fontSize: 13, color: "var(--text-muted)", lineHeight: 1.5 }}>
              Os defaults da IA (nome do assistente, tom de voz, palavras-chave de
              transferência e número de mensagens antes de transferir) serão
              substituídos pelos do novo segmento. Suas customizações atuais serão
              sobrescritas.
            </p>
            <div className="flex justify-end gap-2" style={{ marginTop: 20 }}>
              <button
                style={buttonSecondary}
                disabled={saving}
                onClick={() => setConfirmSwitch(null)}
              >
                Cancelar
              </button>
              <button
                style={buttonPrimary}
                disabled={saving}
                onClick={() => persist(true)}
              >
                {saving ? "Aplicando…" : "Sim, trocar segmento"}
              </button>
            </div>
          </div>
        </div>
      )}
    </SettingsLayout>
  );
}
