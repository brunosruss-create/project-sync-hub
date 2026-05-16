import * as React from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  Bot,
  Send,
  X,
  ArrowRight,
  CheckCircle2,
  UserCircle,
} from "lucide-react";

import { ManagerOnly } from "@/components/manager-only";
import {
  getWorkspaceAiConfig,
  updateWorkspaceAiConfig,
  getWorkspaceAiStats,
} from "@/lib/onboarding.functions";
import { aiRespond } from "@/lib/ai-respond.functions";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/ai-agent")({
  component: () => (
    <ManagerOnly>
      <AIAgentPage />
    </ManagerOnly>
  ),
});

const TONES = ["Formal", "Amigável", "Casual"] as const;
type Tone = (typeof TONES)[number];

// UI key (Seg/Ter/...) ↔ chave persistida no banco (monday/tuesday/...)
const DAYS = [
  { key: "monday", label: "Seg" },
  { key: "tuesday", label: "Ter" },
  { key: "wednesday", label: "Qua" },
  { key: "thursday", label: "Qui" },
  { key: "friday", label: "Sex" },
  { key: "saturday", label: "Sáb" },
  { key: "sunday", label: "Dom" },
] as const;

type DayCfg = { enabled: boolean; start: string; end: string };
type WorkingHours = Record<string, DayCfg>;

const DEFAULT_HOURS: WorkingHours = Object.fromEntries(
  DAYS.map((d) => [
    d.key,
    { enabled: d.key !== "sunday", start: "08:00", end: "20:00" },
  ]),
);

function AIAgentPage() {
  const qc = useQueryClient();
  const getConfigFn = useServerFn(getWorkspaceAiConfig);
  const updateConfigFn = useServerFn(updateWorkspaceAiConfig);
  const getStatsFn = useServerFn(getWorkspaceAiStats);
  const aiRespondFn = useServerFn(aiRespond);

  const configQ = useQuery({
    queryKey: ["workspace-ai-config"],
    queryFn: () => getConfigFn(),
  });
  const statsQ = useQuery({
    queryKey: ["workspace-ai-stats"],
    queryFn: () => getStatsFn(),
    refetchInterval: 60_000,
  });
  const servicesQ = useQuery({
    queryKey: ["my-services"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("services")
        .select("id,name")
        .order("name");
      if (error) throw new Error(error.message);
      return data ?? [];
    },
  });

  const [active, setActive] = React.useState(true);
  const [name, setName] = React.useState("Sofia");
  const [tone, setTone] = React.useState<Tone>("Amigável");
  const [prompt, setPrompt] = React.useState("");
  const [maxMessages, setMaxMessages] = React.useState(5);
  const [keywords, setKeywords] = React.useState<string[]>([]);
  const [kwInput, setKwInput] = React.useState("");
  const [autoSchedule, setAutoSchedule] = React.useState(false);
  const [scheduleInstr, setScheduleInstr] = React.useState("");
  const [enabledServices, setEnabledServices] = React.useState<string[]>([]);
  const [hours, setHours] = React.useState<WorkingHours>(DEFAULT_HOURS);
  const [offHoursEnabled, setOffHoursEnabled] = React.useState(true);
  const [offHoursMsg, setOffHoursMsg] = React.useState("");
  const [timezone, setTimezone] = React.useState("America/Sao_Paulo");
  const [tester, setTester] = React.useState(false);
  const [hydrated, setHydrated] = React.useState(false);

  // === NOVOS CAMPOS COMPORTAMENTAIS ===
  const [introduceByName, setIntroduceByName] = React.useState(true);
  const [declareAsAi, setDeclareAsAi] = React.useState(false);
  const [mentionBusiness, setMentionBusiness] = React.useState(true);
  const [multipleProfs, setMultipleProfs] = React.useState(false);
  const [pricePolicy, setPricePolicy] = React.useState<
    "always" | "on_request" | "never"
  >("on_request");
  const [canReschedule, setCanReschedule] = React.useState(false);
  const [canCancel, setCanCancel] = React.useState(false);
  const [minAdvanceHours, setMinAdvanceHours] = React.useState(2);
  const [maxQuestions, setMaxQuestions] = React.useState(1);

  // Hidrata form quando config chega
  React.useEffect(() => {
    const c = configQ.data?.config;
    if (!c || hydrated) return;
    setActive(!!c.ai_enabled);
    setName(c.ai_assistant_name ?? "Sofia");
    setTone(((c.ai_tone as Tone) ?? "Amigável") as Tone);
    setPrompt(c.ai_custom_prompt ?? "");
    setMaxMessages(c.ai_transfer_after_messages ?? 5);
    setKeywords(
      Array.isArray(c.ai_transfer_keywords) ? (c.ai_transfer_keywords as string[]) : [],
    );
    setAutoSchedule(!!c.ai_schedule_enabled);
    setScheduleInstr(c.ai_schedule_instruction ?? "");
    const wh = (c.ai_working_hours ?? null) as WorkingHours | null;
    setHours(wh ? { ...DEFAULT_HOURS, ...wh } : DEFAULT_HOURS);
    setOffHoursEnabled(c.ai_out_of_hours_enabled ?? false);
    setOffHoursMsg(c.ai_out_of_hours_message ?? "");
    const cAny = c as Record<string, unknown>;
    const ids = cAny.ai_enabled_service_ids;
    if (Array.isArray(ids)) setEnabledServices(ids as string[]);
    const tz =
      (cAny.ai_timezone as string | undefined) ||
      (cAny.business_timezone as string | undefined) ||
      "America/Sao_Paulo";
    setTimezone(tz);
    // Novos campos comportamentais
    setIntroduceByName((cAny.ai_introduce_by_name as boolean | undefined) ?? true);
    setDeclareAsAi((cAny.ai_declare_as_ai as boolean | undefined) ?? false);
    setMentionBusiness((cAny.ai_mention_business_name as boolean | undefined) ?? true);
    setMultipleProfs((cAny.ai_has_multiple_professionals as boolean | undefined) ?? false);
    setPricePolicy(
      ((cAny.ai_price_disclosure_policy as
        | "always"
        | "on_request"
        | "never"
        | undefined) ?? "on_request"),
    );
    setCanReschedule((cAny.ai_can_reschedule as boolean | undefined) ?? false);
    setCanCancel((cAny.ai_can_cancel as boolean | undefined) ?? false);
    setMinAdvanceHours((cAny.ai_min_advance_hours as number | undefined) ?? 2);
    setMaxQuestions((cAny.ai_max_questions_per_message as number | undefined) ?? 1);
    setHydrated(true);
  }, [configQ.data, hydrated]);

  const saveMutation = useMutation({
    mutationFn: () =>
      updateConfigFn({
        data: {
          ai_enabled: active,
          ai_assistant_name: name,
          ai_tone: tone,
          ai_custom_prompt: prompt || null,
          ai_transfer_keywords: keywords,
          ai_transfer_after_messages: maxMessages,
          ai_schedule_enabled: autoSchedule,
          ai_schedule_instruction: scheduleInstr || null,
          ai_working_hours: hours,
          ai_out_of_hours_enabled: offHoursEnabled,
          ai_out_of_hours_message: offHoursMsg,
          ai_enabled_service_ids: enabledServices,
          ai_timezone: timezone,
          ai_introduce_by_name: introduceByName,
          ai_declare_as_ai: declareAsAi,
          ai_mention_business_name: mentionBusiness,
          ai_has_multiple_professionals: multipleProfs,
          ai_price_disclosure_policy: pricePolicy,
          ai_can_reschedule: canReschedule,
          ai_can_cancel: canCancel,
          ai_min_advance_hours: minAdvanceHours,
          ai_max_questions_per_message: maxQuestions,
        },
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["workspace-ai-config"] });
      qc.invalidateQueries({ queryKey: ["workspace-profile"] });
      toast.success("Configuração do agente salva");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro ao salvar"),
  });

  const stats = [
    { label: "Atendimentos hoje", value: String(statsQ.data?.messages_today ?? 0) },
    { label: "Transferências", value: String(statsQ.data?.transfers_today ?? 0) },
    { label: "Erros", value: String(statsQ.data?.errors_today ?? 0) },
  ];

  const addKeyword = () => {
    const v = kwInput.trim();
    if (!v) return;
    if (!keywords.includes(v)) setKeywords([...keywords, v]);
    setKwInput("");
  };

  const toggleService = (id: string) =>
    setEnabledServices((arr) =>
      arr.includes(id) ? arr.filter((x) => x !== id) : [...arr, id],
    );

  return (
    <div className="flex flex-col" style={{ gap: 24, maxWidth: 960 }}>
      <header>
        <h1 style={{ fontSize: 22, fontWeight: 600, letterSpacing: "-0.015em" }}>
          Agente IA
        </h1>
        <p style={{ marginTop: 4, fontSize: 13, color: "var(--text-muted)" }}>
          Configure como o assistente atende seus clientes automaticamente.
        </p>
      </header>

      {/* STATUS */}
      <Card>
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <div
              style={{
                width: 44,
                height: 44,
                borderRadius: 12,
                background: active
                  ? "color-mix(in oklab, #10B981 18%, transparent)"
                  : "var(--bg-overlay)",
                color: active ? "#10B981" : "var(--text-muted)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Bot size={22} />
            </div>
            <div>
              <div style={{ fontSize: 15, fontWeight: 600 }}>
                {active ? "Agente IA ativo" : "Agente IA pausado"}
              </div>
              <div className="flex items-center gap-2" style={{ marginTop: 4 }}>
                <span
                  className="pulse-dot"
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: 999,
                    background: active ? "#10B981" : "var(--text-muted)",
                    display: "inline-block",
                  }}
                />
                <span style={{ fontSize: 12, color: "var(--text-muted)" }}>
                  {active ? "Respondendo em tempo real" : "Aguardando ativação"}
                </span>
              </div>
            </div>
          </div>
          <BigToggle value={active} onChange={setActive} />
        </div>

        <div
          style={{
            marginTop: 20,
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
            gap: 12,
          }}
        >
          {stats.map((s) => (
            <div
              key={s.label}
              style={{
                padding: 12,
                borderRadius: 8,
                background: "var(--bg-overlay)",
              }}
            >
              <div style={{ fontSize: 11, color: "var(--text-muted)" }}>{s.label}</div>
              <div style={{ marginTop: 4, fontSize: 20, fontWeight: 600 }}>{s.value}</div>
            </div>
          ))}
        </div>
      </Card>

      {/* PERSONALIDADE */}
      <Section title="Personalidade do agente">
        <Card>
          <div className="grid gap-3 md:grid-cols-2">
            <Field label="Nome do assistente">
              <input
                style={input}
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </Field>
            <Field label="Tom de voz">
              <select
                style={input}
                value={tone}
                onChange={(e) => setTone(e.target.value as Tone)}
              >
                {TONES.map((t) => (
                  <option key={t}>{t}</option>
                ))}
              </select>
            </Field>
          </div>
          <div style={{ marginTop: 12 }}>
            <Field label="Instruções específicas (opcional)">
              <textarea
                style={{
                  ...input,
                  height: 180,
                  padding: 12,
                  fontFamily: "var(--font-mono, ui-monospace, monospace)",
                  fontSize: 12,
                  lineHeight: 1.6,
                  resize: "vertical",
                }}
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="Use para regras específicas do seu negócio. O prompt base e o do segmento são aplicados automaticamente."
              />
          </Field>
          </div>
          {configQ.data?.segment?.segment_prompt && (
            <div style={{ marginTop: 16 }}>
              <Field
                label={`Prompt do segmento (${configQ.data.segment.icon ?? ""} ${configQ.data.segment.name}) — aplicado pelo Super Admin`}
              >
                <textarea
                  readOnly
                  value={configQ.data.segment.segment_prompt}
                  style={{
                    ...input,
                    height: 140,
                    padding: 12,
                    fontFamily: "var(--font-mono, ui-monospace, monospace)",
                    fontSize: 12,
                    lineHeight: 1.6,
                    background: "var(--bg-overlay)",
                    color: "var(--text-muted)",
                    cursor: "default",
                    resize: "vertical",
                  }}
                />
              </Field>
              <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 6 }}>
                Esse prompt é gerenciado em Super Admin → IA → Segmentos e se aplica a todos os workspaces deste segmento.
              </div>
            </div>
          )}
          <div className="flex justify-end" style={{ marginTop: 12 }}>
            <button
              style={btnSecondary}
              className="flex items-center gap-2"
              onClick={() => setTester(true)}
            >
              <Send size={14} /> Testar agente
            </button>
          </div>
        </Card>
      </Section>

      {/* COMPORTAMENTO DO AGENTE */}
      <Section title="Comportamento do agente">
        <Card>
          <ToggleRow
            label="A IA se apresenta pelo nome ao cliente?"
            value={introduceByName}
            onChange={setIntroduceByName}
          />
          <ToggleRow
            label="A IA menciona o nome do negócio na apresentação?"
            value={mentionBusiness}
            onChange={setMentionBusiness}
          />
          <ToggleRow
            label="A IA se declara como agente virtual se perguntada?"
            value={declareAsAi}
            onChange={setDeclareAsAi}
            hint="Quando desligado, a IA evita confirmar espontaneamente que é uma IA."
          />
          <ToggleRow
            label="Este negócio tem mais de um profissional?"
            value={multipleProfs}
            onChange={setMultipleProfs}
            hint="Se desligado, a IA não pergunta com qual profissional o cliente quer ser atendido."
          />
          <div style={{ marginTop: 12 }}>
            <Field label="Quando a IA pode informar preços?">
              <select
                style={input}
                value={pricePolicy}
                onChange={(e) =>
                  setPricePolicy(
                    e.target.value as "always" | "on_request" | "never",
                  )
                }
              >
                <option value="always">Sempre, proativamente</option>
                <option value="on_request">Apenas quando o cliente perguntar</option>
                <option value="never">Nunca — direcionar para atendente</option>
              </select>
            </Field>
          </div>
          <div className="grid gap-3 md:grid-cols-2" style={{ marginTop: 12 }}>
            <Field label="Máximo de perguntas por mensagem (recomendado: 1)">
              <input
                style={input}
                type="number"
                min={1}
                max={5}
                value={maxQuestions}
                onChange={(e) =>
                  setMaxQuestions(Math.max(1, Number(e.target.value) || 1))
                }
              />
            </Field>
          </div>
        </Card>
      </Section>

      {/* FLUXO */}
      <Section title="Fluxo de atendimento">
        <Card>
          <FlowDiagram />
          <div className="grid gap-3 md:grid-cols-2" style={{ marginTop: 20 }}>
            <Field label="Transferir após N mensagens sem resolução">
              <input
                style={input}
                type="number"
                min={1}
                max={20}
                value={maxMessages}
                onChange={(e) => setMaxMessages(Number(e.target.value))}
              />
            </Field>
            <Field label="Palavras-chave que disparam transferência">
              <div
                className="flex flex-wrap gap-1"
                style={{
                  padding: 6,
                  border: "1px solid var(--border)",
                  borderRadius: 6,
                  background: "var(--bg-surface)",
                  minHeight: 36,
                }}
              >
                {keywords.map((k) => (
                  <span
                    key={k}
                    className="inline-flex items-center gap-1"
                    style={{
                      padding: "2px 8px",
                      borderRadius: 999,
                      background: "var(--bg-overlay)",
                      fontSize: 12,
                    }}
                  >
                    {k}
                    <button
                      onClick={() => setKeywords(keywords.filter((x) => x !== k))}
                      style={{
                        background: "transparent",
                        border: 0,
                        cursor: "pointer",
                        color: "var(--text-muted)",
                        display: "inline-flex",
                      }}
                    >
                      <X size={10} />
                    </button>
                  </span>
                ))}
                <input
                  value={kwInput}
                  onChange={(e) => setKwInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      addKeyword();
                    }
                  }}
                  placeholder="adicionar…"
                  style={{
                    flex: 1,
                    minWidth: 80,
                    border: 0,
                    outline: 0,
                    background: "transparent",
                    fontSize: 12,
                    color: "var(--text-primary)",
                  }}
                />
              </div>
            </Field>
          </div>
        </Card>
      </Section>

      {/* AGENDAMENTO */}
      <Section title="Agendamento automático">
        <Card>
          <div className="flex items-start justify-between gap-4">
            <div>
              <div style={{ fontSize: 14, fontWeight: 500 }}>
                Agente pode agendar horários automaticamente
              </div>
              <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 4 }}>
                A IA consultará a agenda e confirmará horários com o cliente.
              </div>
            </div>
            <SmallToggle value={autoSchedule} onChange={setAutoSchedule} />
          </div>

          {autoSchedule && (
            <>
              <div style={{ marginTop: 16 }}>
                <Field label="Instrução de agendamento">
                  <textarea
                    style={{ ...input, height: 80, padding: 10, resize: "vertical" }}
                    value={scheduleInstr}
                    onChange={(e) => setScheduleInstr(e.target.value)}
                  />
                </Field>
              </div>
              <div style={{ marginTop: 12 }}>
                <Field label="Antecedência mínima para agendamento (horas)">
                  <input
                    style={input}
                    type="number"
                    min={0}
                    max={720}
                    value={minAdvanceHours}
                    onChange={(e) =>
                      setMinAdvanceHours(Math.max(0, Number(e.target.value) || 0))
                    }
                  />
                </Field>
              </div>
              <div style={{ marginTop: 12 }}>
                <ToggleRow
                  label="A IA pode reagendar horários já marcados?"
                  value={canReschedule}
                  onChange={setCanReschedule}
                />
                <ToggleRow
                  label="A IA pode cancelar agendamentos?"
                  value={canCancel}
                  onChange={setCanCancel}
                />
              </div>
              <div style={{ marginTop: 16 }}>
                <Field label="Serviços que o agente pode agendar">
                  {servicesQ.isLoading ? (
                    <div style={{ fontSize: 12, color: "var(--text-muted)" }}>
                      Carregando serviços…
                    </div>
                  ) : (servicesQ.data ?? []).length === 0 ? (
                    <div style={{ fontSize: 12, color: "var(--text-muted)" }}>
                      Nenhum serviço cadastrado ainda. Cadastre em “Serviços”.
                    </div>
                  ) : (
                    <div className="grid gap-2 md:grid-cols-2">
                      {(servicesQ.data ?? []).map((s) => {
                        const checked = enabledServices.includes(s.id);
                        return (
                          <label
                            key={s.id}
                            className="flex items-center gap-2"
                            style={{
                              padding: "8px 10px",
                              border: "1px solid var(--border)",
                              borderRadius: 6,
                              fontSize: 13,
                              cursor: "pointer",
                              background: checked
                                ? "color-mix(in oklab, var(--brand-400) 8%, transparent)"
                                : "transparent",
                            }}
                          >
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => toggleService(s.id)}
                            />
                            {s.name}
                          </label>
                        );
                      })}
                    </div>
                  )}
                </Field>
              </div>
            </>
          )}
        </Card>
      </Section>

      {/* HORÁRIO IA */}
      <Section title="Horário de atendimento da IA">
        <Card>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "100px 1fr 1fr",
              gap: 8,
              alignItems: "center",
            }}
          >
            {DAYS.map((d) => {
              const h = hours[d.key] ?? DEFAULT_HOURS[d.key];
              return (
                <React.Fragment key={d.key}>
                  <label className="flex items-center gap-2" style={{ fontSize: 13 }}>
                    <input
                      type="checkbox"
                      checked={h.enabled}
                      onChange={(e) =>
                        setHours({
                          ...hours,
                          [d.key]: { ...h, enabled: e.target.checked },
                        })
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
                    disabled={!h.enabled}
                    onChange={(e) =>
                      setHours({ ...hours, [d.key]: { ...h, start: e.target.value } })
                    }
                    style={{ ...input, height: 32 }}
                  />
                  <input
                    type="text"
                    inputMode="numeric"
                    pattern="^([01][0-9]|2[0-3]):[0-5][0-9]$"
                    placeholder="23:00"
                    maxLength={5}
                    value={h.end}
                    disabled={!h.enabled}
                    onChange={(e) =>
                      setHours({ ...hours, [d.key]: { ...h, end: e.target.value } })
                    }
                    style={{ ...input, height: 32 }}
                  />
                </React.Fragment>
              );
            })}
          </div>

          <div style={{ marginTop: 16 }}>
            <Field label="Fuso horário">
              <select
                style={input}
                value={timezone}
                onChange={(e) => setTimezone(e.target.value)}
              >
                <option value="America/Sao_Paulo">America/Sao_Paulo (GMT-3)</option>
                <option value="America/Manaus">America/Manaus (GMT-4)</option>
                <option value="America/Belem">America/Belem (GMT-3)</option>
                <option value="America/Fortaleza">America/Fortaleza (GMT-3)</option>
                <option value="America/Recife">America/Recife (GMT-3)</option>
                <option value="America/Cuiaba">America/Cuiaba (GMT-4)</option>
                <option value="America/Rio_Branco">America/Rio_Branco (GMT-5)</option>
              </select>
            </Field>
          </div>

          <div style={{ marginTop: 16 }}>
            <label className="flex items-center gap-2" style={{ fontSize: 13, marginBottom: 12 }}>
              <input
                type="checkbox"
                checked={offHoursEnabled}
                onChange={(e) => setOffHoursEnabled(e.target.checked)}
              />
              Enviar mensagem fora do horário
            </label>
            {/* Mensagem fora do horário é configurada em Configurações → Negócio */}
          </div>
        </Card>
      </Section>

      <div
        className="sticky bottom-0 flex justify-end gap-2"
        style={{
          padding: "12px 0",
          borderTop: "1px solid var(--border)",
          background: "var(--bg-base)",
        }}
      >
        <button
          style={btnSecondary}
          onClick={() => {
            setHydrated(false);
            qc.invalidateQueries({ queryKey: ["workspace-ai-config"] });
          }}
        >
          Cancelar
        </button>
        <button
          style={btnPrimary}
          disabled={saveMutation.isPending}
          onClick={() => saveMutation.mutate()}
        >
          {saveMutation.isPending ? "Salvando…" : "Salvar alterações"}
        </button>
      </div>

      {tester && (
        <TesterModal
          name={name}
          aiRespondFn={aiRespondFn}
          onClose={() => setTester(false)}
        />
      )}
    </div>
  );
}

function FlowDiagram() {
  const node: React.CSSProperties = {
    padding: "10px 14px",
    border: "1px solid var(--border)",
    borderRadius: 8,
    background: "var(--bg-overlay)",
    fontSize: 12,
    fontWeight: 500,
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    whiteSpace: "nowrap",
  };
  return (
    <div className="flex items-center flex-wrap" style={{ gap: 8 }}>
      <div style={node}>
        <UserCircle size={14} /> Cliente envia mensagem
      </div>
      <ArrowRight size={14} style={{ color: "var(--text-muted)" }} />
      <div
        style={{
          ...node,
          background: "color-mix(in oklab, var(--brand-400) 12%, transparent)",
          borderColor: "var(--brand-400)",
          color: "var(--brand-400)",
        }}
      >
        <Bot size={14} /> IA responde
      </div>
      <ArrowRight size={14} style={{ color: "var(--text-muted)" }} />
      <div className="flex flex-col" style={{ gap: 6 }}>
        <div
          style={{
            ...node,
            color: "#10B981",
            borderColor: "color-mix(in oklab, #10B981 40%, var(--border))",
          }}
        >
          <CheckCircle2 size={14} /> Resolvido
        </div>
        <div
          style={{
            ...node,
            color: "#F59E0B",
            borderColor: "color-mix(in oklab, #F59E0B 40%, var(--border))",
          }}
        >
          <UserCircle size={14} /> Transferir para humano
        </div>
      </div>
    </div>
  );
}

type Msg = { role: "user" | "bot"; text: string };

function TesterModal({
  name,
  aiRespondFn,
  onClose,
}: {
  name: string;
  aiRespondFn: ReturnType<typeof useServerFn<typeof aiRespond>>;
  onClose: () => void;
}) {
  const [messages, setMessages] = React.useState<Msg[]>([
    { role: "bot", text: `Olá! Sou ${name}. Como posso te ajudar hoje?` },
  ]);
  const [input, setInput] = React.useState("");
  const [sending, setSending] = React.useState(false);

  const send = async () => {
    const v = input.trim();
    if (!v || sending) return;
    setMessages((m) => [...m, { role: "user", text: v }]);
    setInput("");
    setSending(true);
    try {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) throw new Error("Sessão expirada");
      const history = messages.map((m) => ({
        role: m.role === "user" ? ("user" as const) : ("assistant" as const),
        content: m.text,
      }));
      const res = await aiRespondFn({
        data: {
          workspace_owner_id: u.user.id,
          message: v,
          conversation_history: history,
          preview: true,
        },
      });
      let text = "";
      if (res.action === "send_message") text = res.response;
      else if (res.action === "send_out_of_hours") text = res.response;
      else if (res.action === "transfer_to_human") text = res.response;
      else if (res.action === "skip") text = `(Pulado: ${res.reason})`;
      else if (res.action === "error") text = `(Erro: ${res.error})`;
      setMessages((m) => [...m, { role: "bot", text }]);
    } catch (e) {
      setMessages((m) => [
        ...m,
        { role: "bot", text: `(Erro: ${e instanceof Error ? e.message : String(e)})` },
      ]);
    } finally {
      setSending(false);
    }
  };

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.5)",
        zIndex: 50,
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
          width: "100%",
          maxWidth: 460,
          height: 560,
          display: "flex",
          flexDirection: "column",
        }}
      >
        <div
          className="flex items-center justify-between"
          style={{ padding: 14, borderBottom: "1px solid var(--border)" }}
        >
          <div className="flex items-center gap-2">
            <Bot size={16} style={{ color: "var(--brand-400)" }} />
            <span style={{ fontSize: 14, fontWeight: 600 }}>Testar {name}</span>
          </div>
          <button
            onClick={onClose}
            style={{
              background: "transparent",
              border: 0,
              color: "var(--text-muted)",
              cursor: "pointer",
            }}
          >
            <X size={16} />
          </button>
        </div>
        <div
          className="flex-1 overflow-y-auto"
          style={{ padding: 14, display: "flex", flexDirection: "column", gap: 8 }}
        >
          {messages.map((m, i) => (
            <div
              key={i}
              style={{
                alignSelf: m.role === "user" ? "flex-end" : "flex-start",
                maxWidth: "75%",
                padding: "8px 12px",
                fontSize: 13,
                borderRadius:
                  m.role === "user" ? "12px 2px 12px 12px" : "2px 12px 12px 12px",
                background: m.role === "user" ? "var(--brand-400)" : "var(--bg-overlay)",
                color: m.role === "user" ? "#fff" : "var(--text-primary)",
                whiteSpace: "pre-wrap",
              }}
            >
              {m.text}
            </div>
          ))}
          {sending && (
            <div style={{ fontSize: 12, color: "var(--text-muted)" }}>digitando…</div>
          )}
        </div>
        <div
          className="flex items-center gap-2"
          style={{ padding: 12, borderTop: "1px solid var(--border)" }}
        >
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && send()}
            placeholder="Digite uma mensagem…"
            style={{ ...inputBase, flex: 1 }}
            disabled={sending}
          />
          <button style={btnPrimary} onClick={send} disabled={sending}>
            <Send size={14} />
          </button>
        </div>
      </div>
    </div>
  );
}

const inputBase: React.CSSProperties = {
  height: 36,
  padding: "0 10px",
  borderRadius: 6,
  border: "1px solid var(--border)",
  background: "var(--bg-surface)",
  color: "var(--text-primary)",
  fontSize: 13,
  outline: "none",
  width: "100%",
};
const input = inputBase;
const btnPrimary: React.CSSProperties = {
  height: 36,
  padding: "0 14px",
  borderRadius: 6,
  background: "var(--brand-400)",
  color: "#fff",
  fontSize: 13,
  fontWeight: 500,
  border: 0,
  cursor: "pointer",
};
const btnSecondary: React.CSSProperties = {
  ...btnPrimary,
  background: "transparent",
  color: "var(--text-primary)",
  border: "1px solid var(--border)",
};

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        padding: 20,
        borderRadius: 10,
        background: "var(--bg-surface)",
        border: "1px solid var(--border)",
      }}
    >
      {children}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col" style={{ gap: 10 }}>
      <h2
        style={{
          fontSize: 13,
          fontWeight: 600,
          textTransform: "uppercase",
          letterSpacing: "0.05em",
          color: "var(--text-muted)",
        }}
      >
        {title}
      </h2>
      {children}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col" style={{ gap: 6 }}>
      <span style={{ fontSize: 12, fontWeight: 500 }}>{label}</span>
      {children}
    </label>
  );
}

function BigToggle({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      onClick={() => onChange(!value)}
      style={{
        width: 64,
        height: 34,
        borderRadius: 999,
        border: 0,
        background: value ? "#10B981" : "var(--border)",
        position: "relative",
        cursor: "pointer",
        transition: "background 0.2s",
      }}
    >
      <span
        style={{
          position: "absolute",
          top: 3,
          left: value ? 33 : 3,
          width: 28,
          height: 28,
          borderRadius: 999,
          background: "#fff",
          transition: "left 0.2s",
          boxShadow: "0 1px 3px rgba(0,0,0,0.2)",
        }}
      />
    </button>
  );
}

function ToggleRow({
  label,
  value,
  onChange,
  hint,
}: {
  label: string;
  value: boolean;
  onChange: (v: boolean) => void;
  hint?: string;
}) {
  return (
    <div
      className="flex items-start justify-between gap-4"
      style={{ padding: "8px 0" }}
    >
      <div>
        <div style={{ fontSize: 13, fontWeight: 500 }}>{label}</div>
        {hint && (
          <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 2 }}>
            {hint}
          </div>
        )}
      </div>
      <SmallToggle value={value} onChange={onChange} />
    </div>
  );
}

function SmallToggle({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      onClick={() => onChange(!value)}
      style={{
        width: 36,
        height: 20,
        borderRadius: 999,
        border: 0,
        background: value ? "var(--brand-400)" : "var(--border)",
        position: "relative",
        cursor: "pointer",
        flexShrink: 0,
      }}
    >
      <span
        style={{
          position: "absolute",
          top: 2,
          left: value ? 18 : 2,
          width: 16,
          height: 16,
          borderRadius: 999,
          background: "#fff",
          transition: "left 0.15s",
        }}
      />
    </button>
  );
}
