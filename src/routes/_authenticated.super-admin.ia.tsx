import * as React from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  getAiGlobalSettings,
  updateAiGlobalSettings,
  testGeminiConnection,
  listAiSegments,
  toggleAiSegment,
  upsertAiSegment,
  getAiUsageMetrics,
} from "@/lib/ai-admin.functions";
import { adminCard, adminInput, adminBtn, adminBtnGhost } from "./_authenticated.super-admin";

export const Route = createFileRoute("/_authenticated/super-admin/ia")({
  component: SuperAdminAIPage,
});

type Tab = "gemini" | "segments" | "usage";

function SuperAdminAIPage() {
  const [tab, setTab] = React.useState<Tab>("gemini");
  return (
    <div className="flex flex-col" style={{ gap: 16 }}>
      <div>
        <h2 style={{ fontSize: 20, fontWeight: 600 }}>Inteligência Artificial</h2>
        <p style={{ fontSize: 13, color: "rgba(255,255,255,0.5)", marginTop: 4 }}>
          Configure o Gemini, segmentos e acompanhe o consumo.
        </p>
      </div>
      <div className="flex gap-1" style={{ borderBottom: "1px solid #1F1F23" }}>
        {([
          ["gemini", "Configuração Gemini"],
          ["segments", "Segmentos"],
          ["usage", "Consumo"],
        ] as const).map(([k, label]) => (
          <button
            key={k}
            onClick={() => setTab(k)}
            style={{
              ...adminBtnGhost,
              border: 0,
              borderBottom: tab === k ? "2px solid #7C3AED" : "2px solid transparent",
              borderRadius: 0,
              color: tab === k ? "#fff" : "rgba(255,255,255,0.6)",
            }}
          >
            {label}
          </button>
        ))}
      </div>
      {tab === "gemini" && <GeminiTab />}
      {tab === "segments" && <SegmentsTab />}
      {tab === "usage" && <UsageTab />}
    </div>
  );
}

function GeminiTab() {
  const fetchFn = useServerFn(getAiGlobalSettings);
  const updateFn = useServerFn(updateAiGlobalSettings);
  const testFn = useServerFn(testGeminiConnection);
  const q = useQuery({ queryKey: ["ai-globals"], queryFn: () => fetchFn() });
  const [form, setForm] = React.useState<Record<string, string>>({});
  React.useEffect(() => {
    if (q.data?.settings) {
      setForm({
        gemini_api_key: q.data.settings.gemini_api_key?.value ?? "",
        gemini_model: q.data.settings.gemini_model?.value ?? "gemini-2.5-flash",
        gemini_temperature: q.data.settings.gemini_temperature?.value ?? "0.7",
        gemini_max_tokens: q.data.settings.gemini_max_tokens?.value ?? "1000",
        ai_base_prompt: q.data.settings.ai_base_prompt?.value ?? "",
      });
    }
  }, [q.data]);
  const [testing, setTesting] = React.useState(false);
  const [status, setStatus] = React.useState<{ ok: boolean; msg: string } | null>(null);

  const save = async () => {
    try {
      await updateFn({ data: form });
      toast.success("Configurações salvas");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao salvar");
    }
  };
  const test = async () => {
    setTesting(true);
    setStatus(null);
    try {
      const r = await testFn();
      setStatus({ ok: r.ok, msg: r.ok ? `Conectado (${r.model})` : r.error ?? "Erro" });
    } finally {
      setTesting(false);
    }
  };

  if (q.isLoading) return <p style={{ fontSize: 13, opacity: 0.6 }}>Carregando…</p>;

  return (
    <div className="flex flex-col" style={{ gap: 16 }}>
      <div style={adminCard}>
        <div className="flex items-center justify-between gap-3">
          <div>
            <div style={{ fontSize: 13, fontWeight: 600 }}>Status da conexão</div>
            <div
              style={{
                marginTop: 6,
                fontSize: 12,
                color: status?.ok ? "#10B981" : status ? "#F87171" : "rgba(255,255,255,0.5)",
              }}
            >
              {status ? (status.ok ? `● ${status.msg}` : `✕ ${status.msg}`) : "Não testado"}
            </div>
          </div>
          <button style={adminBtn} onClick={test} disabled={testing}>
            {testing ? "Testando…" : "Testar agora"}
          </button>
        </div>
      </div>

      <div style={adminCard}>
        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 12 }}>Credenciais</div>
        <Field label="API Key do Google Gemini">
          <input
            type="password"
            style={adminInput}
            value={form.gemini_api_key ?? ""}
            onChange={(e) => setForm({ ...form, gemini_api_key: e.target.value })}
            placeholder="AIzaSy…"
          />
        </Field>
        <Field label="Modelo">
          <select
            style={adminInput}
            value={form.gemini_model ?? ""}
            onChange={(e) => setForm({ ...form, gemini_model: e.target.value })}
          >
            <option value="gemini-2.5-flash">Gemini 2.5 Flash (recomendado — rápido e barato)</option>
            <option value="gemini-2.5-pro">Gemini 2.5 Pro (qualidade máxima)</option>
            <option value="gemini-2.0-flash">Gemini 2.0 Flash</option>
            <option value="gemini-1.5-flash">Gemini 1.5 Flash (legado)</option>
            <option value="gemini-1.5-pro">Gemini 1.5 Pro (legado)</option>
          </select>
        </Field>
        <div className="grid gap-3" style={{ gridTemplateColumns: "1fr 1fr" }}>
          <Field label={`Temperatura (${form.gemini_temperature})`}>
            <input
              type="range"
              min={0}
              max={1}
              step={0.1}
              value={parseFloat(form.gemini_temperature ?? "0.7")}
              onChange={(e) => setForm({ ...form, gemini_temperature: e.target.value })}
            />
          </Field>
          <Field label="Máximo de tokens">
            <input
              type="number"
              min={200}
              max={2000}
              style={adminInput}
              value={form.gemini_max_tokens ?? ""}
              onChange={(e) => setForm({ ...form, gemini_max_tokens: e.target.value })}
            />
          </Field>
        </div>
      </div>

      <div style={adminCard}>
        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6 }}>Prompt base universal</div>
        <p style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", marginBottom: 8 }}>
          Aplicado a TODOS os workspaces como camada 1.
        </p>
        <textarea
          ref={(el) => {
            if (el) {
              el.style.height = "auto";
              el.style.height = el.scrollHeight + "px";
            }
          }}
          style={{
            ...adminInput,
            width: "100%",
            display: "block",
            minHeight: 200,
            padding: 10,
            fontFamily: "monospace",
            fontSize: 12,
            resize: "vertical",
            overflow: "hidden",
            boxSizing: "border-box",
          }}
          value={form.ai_base_prompt ?? ""}
          onChange={(e) => {
            setForm({ ...form, ai_base_prompt: e.target.value });
            e.currentTarget.style.height = "auto";
            e.currentTarget.style.height = e.currentTarget.scrollHeight + "px";
          }}
        />
      </div>

      <div className="flex justify-end">
        <button style={adminBtn} onClick={save}>Salvar configurações</button>
      </div>
    </div>
  );
}

function SegmentsTab() {
  const listFn = useServerFn(listAiSegments);
  const toggleFn = useServerFn(toggleAiSegment);
  const upsertFn = useServerFn(upsertAiSegment);
  const q = useQuery({ queryKey: ["ai-segments"], queryFn: () => listFn() });
  const [editing, setEditing] = React.useState<any>(null);

  if (q.isLoading) return <p style={{ fontSize: 13, opacity: 0.6 }}>Carregando…</p>;

  return (
    <div className="flex flex-col" style={{ gap: 12 }}>
      <div
        className="grid gap-3"
        style={{ gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))" }}
      >
        {(q.data?.segments ?? []).map((s: any) => (
          <div key={s.id} style={adminCard}>
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-2">
                <span style={{ fontSize: 22 }}>{s.icon}</span>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>{s.name}</div>
                  <div style={{ fontSize: 11, color: "rgba(255,255,255,0.5)" }}>
                    {s.description}
                  </div>
                </div>
              </div>
              <input
                type="checkbox"
                checked={s.is_active}
                onChange={async (e) => {
                  await toggleFn({ data: { id: s.id, active: e.target.checked } });
                  q.refetch();
                }}
              />
            </div>
            <div style={{ marginTop: 10, fontSize: 11, color: "rgba(255,255,255,0.5)" }}>
              {s.workspace_count} workspace(s) usando
            </div>
            <div style={{ marginTop: 10 }}>
              <button style={adminBtnGhost} onClick={() => setEditing(s)}>
                Editar prompt
              </button>
            </div>
          </div>
        ))}
      </div>

      {editing && (
        <SegmentEditor
          segment={editing}
          onClose={() => setEditing(null)}
          onSave={async (payload) => {
            try {
              await upsertFn({ data: payload });
              toast.success("Segmento salvo");
              setEditing(null);
              q.refetch();
            } catch (e) {
              toast.error(e instanceof Error ? e.message : "Erro");
            }
          }}
        />
      )}
    </div>
  );
}

function SegmentEditor({
  segment,
  onClose,
  onSave,
}: {
  segment: any;
  onClose: () => void;
  onSave: (p: any) => void;
}) {
  const [s, setS] = React.useState({
    id: segment.id,
    name: segment.name,
    slug: segment.slug,
    description: segment.description ?? "",
    icon: segment.icon ?? "🏢",
    is_active: segment.is_active,
    segment_prompt: segment.segment_prompt,
    default_assistant_name: segment.default_assistant_name ?? "Sofia",
    default_tone: segment.default_tone ?? "Amigável",
    default_transfer_keywords: segment.default_transfer_keywords ?? [],
  });
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.7)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 50,
      }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 640,
          maxHeight: "85vh",
          overflow: "auto",
          background: "#0A0A0A",
          border: "1px solid #1F1F23",
          borderRadius: 10,
          padding: 20,
        }}
      >
        <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 16 }}>
          Editar: {segment.name}
        </div>
        <div className="grid gap-3" style={{ gridTemplateColumns: "60px 1fr" }}>
          <Field label="Ícone">
            <input
              maxLength={4}
              style={adminInput}
              value={s.icon}
              onChange={(e) => setS({ ...s, icon: e.target.value })}
            />
          </Field>
          <Field label="Nome">
            <input
              style={adminInput}
              value={s.name}
              onChange={(e) => setS({ ...s, name: e.target.value })}
            />
          </Field>
        </div>
        <Field label="Descrição">
          <input
            style={adminInput}
            value={s.description}
            onChange={(e) => setS({ ...s, description: e.target.value })}
          />
        </Field>
        <Field label="Nome padrão do assistente">
          <input
            style={adminInput}
            value={s.default_assistant_name}
            onChange={(e) => setS({ ...s, default_assistant_name: e.target.value })}
          />
        </Field>
        <Field label="Prompt do segmento (camada 2)">
          <textarea
            style={{ ...adminInput, height: 240, padding: 10, fontFamily: "monospace", fontSize: 12 }}
            value={s.segment_prompt}
            onChange={(e) => setS({ ...s, segment_prompt: e.target.value })}
          />
        </Field>
        <Field label="Palavras de transferência (separadas por vírgula)">
          <input
            style={adminInput}
            value={s.default_transfer_keywords.join(", ")}
            onChange={(e) =>
              setS({
                ...s,
                default_transfer_keywords: e.target.value
                  .split(",")
                  .map((x) => x.trim())
                  .filter(Boolean),
              })
            }
          />
        </Field>
        <div className="flex justify-end gap-2" style={{ marginTop: 16 }}>
          <button style={adminBtnGhost} onClick={onClose}>Cancelar</button>
          <button style={adminBtn} onClick={() => onSave(s)}>Salvar</button>
        </div>
      </div>
    </div>
  );
}

function UsageTab() {
  const fn = useServerFn(getAiUsageMetrics);
  const q = useQuery({ queryKey: ["ai-usage"], queryFn: () => fn() });
  if (q.isLoading) return <p style={{ fontSize: 13, opacity: 0.6 }}>Carregando…</p>;
  const m = q.data;
  if (!m) return null;
  return (
    <div className="flex flex-col" style={{ gap: 16 }}>
      <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))" }}>
        <Stat label="Mensagens IA hoje" value={m.messages_today} />
        <Stat label="Tokens (mês)" value={m.tokens_month.toLocaleString()} />
        <Stat label="Custo estimado (USD)" value={`$${m.cost_month_usd}`} />
        <Stat label="Workspaces com IA ativa" value={m.ai_active_workspaces} />
      </div>
      <div style={adminCard}>
        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>Top 10 workspaces (mês)</div>
        <table style={{ width: "100%", fontSize: 12 }}>
          <thead>
            <tr style={{ color: "rgba(255,255,255,0.5)", textAlign: "left" }}>
              <th style={{ padding: 6 }}>Email</th>
              <th style={{ padding: 6 }}>Tokens</th>
            </tr>
          </thead>
          <tbody>
            {m.top_workspaces.map((w) => (
              <tr key={w.workspace_owner_id} style={{ borderTop: "1px solid #1F1F23" }}>
                <td style={{ padding: 6 }}>{w.email ?? w.workspace_owner_id.slice(0, 8)}</td>
                <td style={{ padding: 6 }}>{w.tokens_total.toLocaleString()}</td>
              </tr>
            ))}
            {m.top_workspaces.length === 0 && (
              <tr><td colSpan={2} style={{ padding: 12, textAlign: "center", opacity: 0.5 }}>Sem dados ainda</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div style={adminCard}>
      <div style={{ fontSize: 11, color: "rgba(255,255,255,0.5)" }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 600, marginTop: 6 }}>{value}</div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col" style={{ gap: 4, marginBottom: 12 }}>
      <span style={{ fontSize: 11, color: "rgba(255,255,255,0.6)" }}>{label}</span>
      {children}
    </label>
  );
}
