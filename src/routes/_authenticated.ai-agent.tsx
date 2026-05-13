import * as React from "react";
import { createFileRoute } from "@tanstack/react-router";
import { toast } from "sonner";
import {
  Bot,
  Send,
  Plus,
  X,
  ArrowRight,
  CheckCircle2,
  UserCircle,
} from "lucide-react";

export const Route = createFileRoute("/_authenticated/ai-agent")({
  component: AIAgentPage,
});

const TONES = ["Formal", "Amigável", "Casual"] as const;
type Tone = (typeof TONES)[number];

const SERVICES_MOCK = [
  { id: "s1", name: "Revisão de óleo" },
  { id: "s2", name: "Diagnóstico elétrico" },
  { id: "s3", name: "Alinhamento" },
  { id: "s4", name: "Troca de pastilhas" },
  { id: "s5", name: "Lavagem completa" },
];

const DAYS = [
  { key: "mon", label: "Seg" },
  { key: "tue", label: "Ter" },
  { key: "wed", label: "Qua" },
  { key: "thu", label: "Qui" },
  { key: "fri", label: "Sex" },
  { key: "sat", label: "Sáb" },
  { key: "sun", label: "Dom" },
] as const;

function AIAgentPage() {
  const [active, setActive] = React.useState(true);
  const [name, setName] = React.useState("Sofia");
  const [tone, setTone] = React.useState<Tone>("Amigável");
  const [prompt, setPrompt] = React.useState(
    `Você é a Sofia, assistente virtual de uma oficina mecânica.
Seja cordial, objetiva e use linguagem simples.
Sempre confirme placa do veículo e modelo antes de sugerir serviços.
Se o cliente pedir algo fora do seu escopo, transfira para um atendente humano.`,
  );
  const [maxMessages, setMaxMessages] = React.useState(5);
  const [keywords, setKeywords] = React.useState<string[]>([
    "humano",
    "atendente",
    "reclamação",
  ]);
  const [kwInput, setKwInput] = React.useState("");
  const [autoSchedule, setAutoSchedule] = React.useState(true);
  const [scheduleInstr, setScheduleInstr] = React.useState(
    "Ofereça sempre 2 horários disponíveis nos próximos 3 dias úteis e confirme com o cliente.",
  );
  const [enabledServices, setEnabledServices] = React.useState<string[]>(["s1", "s3"]);
  const [hours, setHours] = React.useState<Record<string, { active: boolean; start: string; end: string }>>(
    () =>
      Object.fromEntries(
        DAYS.map((d) => [
          d.key,
          { active: d.key !== "sun", start: "08:00", end: "20:00" },
        ]),
      ),
  );
  const [offHoursMsg, setOffHoursMsg] = React.useState(
    "Olá! No momento estamos fora do horário de atendimento. Retornaremos a partir das 8h.",
  );
  const [tester, setTester] = React.useState(false);

  const stats = [
    { label: "Atendimentos hoje", value: "47" },
    { label: "Taxa de resolução", value: "82%" },
    { label: "Satisfação", value: "4.7" },
  ];

  const addKeyword = () => {
    const v = kwInput.trim();
    if (!v) return;
    if (!keywords.includes(v)) setKeywords([...keywords, v]);
    setKwInput("");
  };

  const toggleService = (id: string) =>
    setEnabledServices((arr) => (arr.includes(id) ? arr.filter((x) => x !== id) : [...arr, id]));

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
            <Field label="Prompt principal">
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
                placeholder="Ex: Você é a Sofia, assistente da clínica X. Seja cordial..."
              />
            </Field>
          </div>
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
              <div style={{ marginTop: 16 }}>
                <Field label="Serviços que o agente pode agendar">
                  <div className="grid gap-2 md:grid-cols-2">
                    {SERVICES_MOCK.map((s) => {
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
              const h = hours[d.key];
              return (
                <React.Fragment key={d.key}>
                  <label className="flex items-center gap-2" style={{ fontSize: 13 }}>
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
                    style={{ ...input, height: 32 }}
                  />
                  <input
                    type="time"
                    value={h.end}
                    disabled={!h.active}
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
            <Field label="Mensagem fora do horário">
              <textarea
                style={{ ...input, height: 80, padding: 10, resize: "vertical" }}
                value={offHoursMsg}
                onChange={(e) => setOffHoursMsg(e.target.value)}
              />
            </Field>
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
        <button style={btnSecondary}>Cancelar</button>
        <button
          style={btnPrimary}
          onClick={() => toast.success("Configuração do agente salva")}
        >
          Salvar alterações
        </button>
      </div>

      {tester && <TesterModal name={name} onClose={() => setTester(false)} />}
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
        <div style={{ ...node, color: "#10B981", borderColor: "color-mix(in oklab, #10B981 40%, var(--border))" }}>
          <CheckCircle2 size={14} /> Resolvido
        </div>
        <div style={{ ...node, color: "#F59E0B", borderColor: "color-mix(in oklab, #F59E0B 40%, var(--border))" }}>
          <UserCircle size={14} /> Transferir para humano
        </div>
      </div>
    </div>
  );
}

function TesterModal({ name, onClose }: { name: string; onClose: () => void }) {
  const [messages, setMessages] = React.useState<{ role: "user" | "bot"; text: string }[]>([
    { role: "bot", text: `Olá! Sou ${name}. Como posso te ajudar hoje?` },
  ]);
  const [input, setInput] = React.useState("");

  const send = () => {
    const v = input.trim();
    if (!v) return;
    setMessages((m) => [...m, { role: "user", text: v }]);
    setInput("");
    setTimeout(() => {
      setMessages((m) => [
        ...m,
        {
          role: "bot",
          text: `Entendi, você disse "${v}". (Resposta simulada — conecte o agente para usar IA real.)`,
        },
      ]);
    }, 600);
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
            style={{ background: "transparent", border: 0, color: "var(--text-muted)", cursor: "pointer" }}
          >
            <X size={16} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto" style={{ padding: 14, display: "flex", flexDirection: "column", gap: 8 }}>
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
                background:
                  m.role === "user" ? "var(--brand-400)" : "var(--bg-overlay)",
                color: m.role === "user" ? "#fff" : "var(--text-primary)",
              }}
            >
              {m.text}
            </div>
          ))}
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
          />
          <button style={btnPrimary} onClick={send}>
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
      <h2 style={{ fontSize: 13, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--text-muted)" }}>
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
