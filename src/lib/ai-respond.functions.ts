import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

type WorkingHours = Record<
  string,
  { enabled: boolean; start: string; end: string }
>;

const DAY_KEYS = [
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
] as const;

function isWithinHours(hours: WorkingHours | null | undefined): boolean {
  if (!hours) return true;
  const now = new Date();
  const day = DAY_KEYS[now.getDay()];
  const cfg = hours[day];
  if (!cfg || !cfg.enabled) return false;
  const [sh, sm] = (cfg.start ?? "00:00").split(":").map(Number);
  const [eh, em] = (cfg.end ?? "23:59").split(":").map(Number);
  const minutes = now.getHours() * 60 + now.getMinutes();
  return minutes >= sh * 60 + sm && minutes <= eh * 60 + em;
}

function buildWorkspaceLayer(p: any): string {
  const parts: string[] = [];
  if (p.ai_assistant_name) parts.push(`Você se chama ${p.ai_assistant_name}.`);
  if (p.ai_tone) parts.push(`Seu tom de voz é: ${p.ai_tone}.`);
  if (p.business_name) parts.push(`Você atende: ${p.business_name}.`);
  if (p.business_description) parts.push(`Sobre o negócio: ${p.business_description}`);
  if (p.ai_custom_prompt) parts.push(`Instruções específicas: ${p.ai_custom_prompt}`);
  if (p.ai_schedule_enabled && p.ai_schedule_instruction) {
    parts.push(`Para agendamentos: ${p.ai_schedule_instruction}`);
  }
  return parts.join("\n");
}

// Custo aproximado Gemini 3.1 Flash-Lite: $0.25 / 1M input, $1.50 / 1M output (cents)
function estimateCostCents(input: number, output: number) {
  const cents = (input / 1_000_000) * 25 + (output / 1_000_000) * 150;
  return Math.max(1, Math.round(cents));
}

export const aiRespond = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        workspace_owner_id: z.string().uuid(),
        contact_id: z.string().uuid().optional(),
        message: z.string().min(1).max(8000),
        conversation_history: z
          .array(
            z.object({
              role: z.enum(["user", "assistant"]),
              content: z.string().max(8000),
            }),
          )
          .max(50)
          .default([]),
        preview: z.boolean().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    // 1) Globals
    const { data: globalRows } = await supabaseAdmin
      .from("global_settings")
      .select("key,value")
      .in("key", [
        "gemini_api_key",
        "gemini_model",
        "gemini_temperature",
        "gemini_max_tokens",
        "ai_base_prompt",
      ]);
    const g = Object.fromEntries((globalRows ?? []).map((r) => [r.key, r.value ?? ""]));
    if (!g.gemini_api_key) {
      return { action: "skip" as const, reason: "Gemini não configurado" };
    }

    // 2) Profile + segment
    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("*")
      .eq("id", data.workspace_owner_id)
      .maybeSingle();
    if (!profile) return { action: "skip" as const, reason: "Workspace não encontrado" };
    if (!profile.ai_enabled) return { action: "skip" as const, reason: "IA desativada" };

    const { data: segment } = profile.segment_id
      ? await supabaseAdmin
          .from("ai_segments")
          .select("segment_prompt,default_transfer_keywords,id")
          .eq("id", profile.segment_id)
          .maybeSingle()
      : { data: null };

    // 3) Horário
    if (!isWithinHours(profile.ai_working_hours as WorkingHours)) {
      const out = profile.ai_out_of_hours_message ?? "Estamos fora do horário de atendimento.";
      if (!data.preview) {
        await supabaseAdmin.from("ai_usage_logs").insert({
          workspace_owner_id: data.workspace_owner_id,
          segment_id: segment?.id ?? null,
          contact_id: data.contact_id ?? null,
          action: "send_out_of_hours",
        });
      }
      return { action: "send_out_of_hours" as const, response: out };
    }

    // 4) Transferência
    const allKws = [
      ...(segment?.default_transfer_keywords ?? []),
      ...((profile.ai_transfer_keywords as string[] | null) ?? []),
    ].map((s) => s.toLowerCase());
    const lower = data.message.toLowerCase();
    if (allKws.some((kw) => kw && lower.includes(kw))) {
      if (!data.preview) {
        await supabaseAdmin.from("ai_usage_logs").insert({
          workspace_owner_id: data.workspace_owner_id,
          segment_id: segment?.id ?? null,
          contact_id: data.contact_id ?? null,
          action: "transfer_to_human",
        });
      }
      return {
        action: "transfer_to_human" as const,
        response: "Entendi! Vou passar você para um atendente humano agora. Aguarde um momento.",
      };
    }

    // 5) Prompt 3 camadas
    const finalPrompt = [g.ai_base_prompt, segment?.segment_prompt ?? "", buildWorkspaceLayer(profile)]
      .filter(Boolean)
      .join("\n\n---\n\n");

    // 6) Chamar Gemini
    const model = g.gemini_model || "gemini-2.5-flash";
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${g.gemini_api_key}`;
    const contents = [
      ...data.conversation_history.map((m) => ({
        role: m.role === "user" ? "user" : "model",
        parts: [{ text: m.content }],
      })),
      { role: "user", parts: [{ text: data.message }] },
    ];
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents,
          systemInstruction: { parts: [{ text: finalPrompt }] },
          generationConfig: {
            temperature: parseFloat(g.gemini_temperature || "0.7"),
            maxOutputTokens: parseInt(g.gemini_max_tokens || "1000", 10),
            topP: 0.95,
          },
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        if (!data.preview) {
          await supabaseAdmin.from("ai_usage_logs").insert({
            workspace_owner_id: data.workspace_owner_id,
            segment_id: segment?.id ?? null,
            contact_id: data.contact_id ?? null,
            action: "error",
            error_message: JSON.stringify(json).slice(0, 500),
          });
        }
        return { action: "error" as const, error: `HTTP ${res.status}` };
      }
      const text = json.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
      const usage = json.usageMetadata ?? {};
      const tokensIn = usage.promptTokenCount ?? 0;
      const tokensOut = usage.candidatesTokenCount ?? 0;
      const tokensTotal = usage.totalTokenCount ?? tokensIn + tokensOut;
      const costCents = estimateCostCents(tokensIn, tokensOut);
      if (!data.preview) {
        await supabaseAdmin.from("ai_usage_logs").insert({
          workspace_owner_id: data.workspace_owner_id,
          segment_id: segment?.id ?? null,
          contact_id: data.contact_id ?? null,
          action: "send_message",
          tokens_input: tokensIn,
          tokens_output: tokensOut,
          tokens_total: tokensTotal,
          cost_estimate_cents: costCents,
        });
      }
      return {
        action: "send_message" as const,
        response: text,
        tokens_total: tokensTotal,
      };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (!data.preview) {
        await supabaseAdmin.from("ai_usage_logs").insert({
          workspace_owner_id: data.workspace_owner_id,
          segment_id: segment?.id ?? null,
          contact_id: data.contact_id ?? null,
          action: "error",
          error_message: msg.slice(0, 500),
        });
      }
      return { action: "error" as const, error: msg };
    }
  });
