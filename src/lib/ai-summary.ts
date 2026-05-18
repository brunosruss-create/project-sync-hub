// ════════════════════════════════════════════════════════════
// Sumarização progressiva do histórico de conversa por contato.
// - getContactAiSummary: leitura simples para injetar no prompt da IA.
// - maybeUpdateAiSummary: gera/atualiza o resumo em background quando o
//   contato passa do limiar de mensagens. Falha silenciosa — nunca quebra
//   o fluxo principal de resposta da IA.
// ════════════════════════════════════════════════════════════

import { supabaseAdmin } from "@/integrations/supabase/client.server";

const SUMMARY_THRESHOLD = 80; // só sumariza acima desse total
const MESSAGES_TO_SUMMARIZE = 60; // quantidade de msgs antigas resumidas por vez
const MIN_DELTA_TO_REFRESH = 20; // só re-sumariza se chegaram N msgs novas
const MIN_OLD_MESSAGES = 20; // não vale a pena resumir poucas msgs

export async function getContactAiSummary(
  contactId: string,
  ownerUserId: string,
): Promise<string> {
  try {
    const { data } = await supabaseAdmin
      .from("contacts")
      .select("ai_summary")
      .eq("id", contactId)
      .eq("owner_user_id", ownerUserId)
      .maybeSingle();
    const s = (data as any)?.ai_summary;
    return typeof s === "string" ? s.trim() : "";
  } catch {
    return "";
  }
}

export async function maybeUpdateAiSummary(
  contactId: string,
  ownerUserId: string,
  totalMessageCount: number,
): Promise<void> {
  try {
    if (!totalMessageCount || totalMessageCount < SUMMARY_THRESHOLD) return;

    const { data: contact } = await supabaseAdmin
      .from("contacts")
      .select("ai_summary, ai_summary_message_count")
      .eq("id", contactId)
      .eq("owner_user_id", ownerUserId)
      .maybeSingle();

    const lastCount = Number((contact as any)?.ai_summary_message_count ?? 0);
    if (totalMessageCount - lastCount < MIN_DELTA_TO_REFRESH) return;

    // Busca config global da IA (mesmo schema usado em ai-respond.server.ts).
    const { data: globalRows } = await supabaseAdmin
      .from("global_settings")
      .select("key,value")
      .in("key", ["gemini_api_key", "gemini_model"]);
    const g = Object.fromEntries(
      (globalRows ?? []).map((r: any) => [r.key, r.value ?? ""]),
    ) as Record<string, string>;
    if (!g.gemini_api_key) return;
    const model = g.gemini_model || "gemini-3.1-flash-lite";

    // Mensagens antigas a resumir (as MAIS antigas do contato).
    const { data: oldMessages } = await supabaseAdmin
      .from("messages")
      .select("direction,content,created_at")
      .eq("owner_user_id", ownerUserId)
      .eq("contact_id", contactId)
      .order("created_at", { ascending: true })
      .limit(MESSAGES_TO_SUMMARIZE);

    const msgs = (oldMessages ?? []).filter(
      (m: any) => m?.content && String(m.content).trim().length > 0,
    );
    if (msgs.length < MIN_OLD_MESSAGES) return;

    const conversationText = msgs
      .map(
        (m: any) =>
          `${m.direction === "inbound" ? "Cliente" : "Atendente"}: ${String(
            m.content,
          ).slice(0, 500)}`,
      )
      .join("\n");

    const existingSummary = ((contact as any)?.ai_summary ?? "").trim();
    const previousBlock = existingSummary
      ? `\n\nResumo anterior (deve ser preservado/condensado):\n${existingSummary}`
      : "";

    const prompt =
      `Você é um assistente que resume conversas de WhatsApp entre um negócio e seu cliente.\n` +
      `Gere um resumo OBJETIVO em no máximo 200 palavras, em português, sem saudações.\n` +
      `Foque em: dados pessoais relevantes do cliente, preferências, histórico de serviços/agendamentos, ` +
      `reclamações, e qualquer informação útil para atendimentos futuros.\n` +
      `Se houver "Resumo anterior", incorpore as informações dele no novo resumo (não duplicar, não perder).` +
      `${previousBlock}\n\nConversa a resumir:\n${conversationText}`;

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${g.gemini_api_key}`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.3, maxOutputTokens: 600 },
      }),
    });
    if (!res.ok) return;
    const data = await res.json();
    const summary = String(
      data?.candidates?.[0]?.content?.parts?.[0]?.text ?? "",
    ).trim();
    if (!summary) return;

    await supabaseAdmin
      .from("contacts")
      .update({
        ai_summary: summary,
        ai_summary_updated_at: new Date().toISOString(),
        ai_summary_message_count: totalMessageCount,
      })
      .eq("id", contactId)
      .eq("owner_user_id", ownerUserId);
  } catch (e: any) {
    console.error("[ai-summary]", e?.message ?? e);
  }
}
