import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { evo } from "@/lib/evolution.server";
import { runAiResponse, type AiRunResult } from "@/lib/ai-respond.server";
import { getContactAiSummary, maybeUpdateAiSummary } from "@/lib/ai-summary";
import { renderTemplate } from "@/lib/message-templates";

export type MessageJobPayload = {
  phone: string;
  pushName: string | null;
  mediaType: "text" | "audio";
  caption: string;
  mediaUrl?: string | null;
  mediaMime?: string | null;
  waMessageId?: string | null;
};

export type MessageJobInput = {
  workspaceOwnerId: string;
  contactId: string;
  instanceName: string;
  payload: MessageJobPayload;
};

const TYPING_BASE_MS = 1000;
const TYPING_MS_PER_50_CHARS = 1000;
const TYPING_MAX_MS = 12_000;

// Evita responder em milissegundos (sinal claro de robô pro WhatsApp):
// mostra "digitando..." e espera um tempo proporcional ao tamanho do texto,
// como uma pessoa digitando de verdade faria.
function computeTypingDelayMs(text: string): number {
  const extra = Math.floor(text.length / 50) * TYPING_MS_PER_50_CHARS;
  return Math.min(TYPING_BASE_MS + extra, TYPING_MAX_MS);
}

async function simulateTyping(instanceName: string, phone: string, text: string) {
  const delayMs = computeTypingDelayMs(text);
  try {
    await evo.sendPresence(instanceName, { number: phone, presence: "composing", delay: delayMs });
  } catch (e: any) {
    console.warn("[evolution presence] sendPresence falhou:", e?.message ?? e);
  }
  await new Promise((resolve) => setTimeout(resolve, delayMs));
}

async function maybeSendWelcomeMessage(
  ownerUserId: string,
  contactId: string,
  instanceName: string,
  phone: string,
  pushName: string | null,
) {
  try {
    const { data: profileWelcome } = await supabaseAdmin
      .from("profiles")
      .select("welcome_message,welcome_message_enabled,business_name,ai_enabled")
      .eq("id", ownerUserId)
      .maybeSingle();
    const rawWelcome = (profileWelcome as any)?.welcome_message?.trim?.();
    const welcomeEnabled = (profileWelcome as any)?.welcome_message_enabled === true;
    const aiEnabled = (profileWelcome as any)?.ai_enabled === true;
    // Quando a IA está ativa, ela mesma faz a saudação (com nome do
    // assistente + negócio). Suprimimos o welcome estático para evitar
    // duas saudações duplicadas e contraditórias.
    if (!welcomeEnabled || !rawWelcome || aiEnabled) return;

    const { count: outboundCount } = await supabaseAdmin
      .from("messages")
      .select("id", { count: "exact", head: true })
      .eq("contact_id", contactId)
      .eq("direction", "outbound");
    if ((outboundCount ?? 0) !== 0) return;

    const welcomeText = renderTemplate(rawWelcome, {
      cliente: pushName ?? "",
      negocio: (profileWelcome as any)?.business_name ?? "nosso estabelecimento",
    });
    let waMessageId: string | null = null;
    try {
      await simulateTyping(instanceName, phone, welcomeText);
      const r: any = await evo.sendText(instanceName, { number: phone, text: welcomeText });
      waMessageId = r?.key?.id ?? r?.messageId ?? null;
    } catch (e: any) {
      console.error("[evolution welcome] sendText falhou:", e?.message ?? e);
    }
    await supabaseAdmin.from("messages").insert({
      owner_user_id: ownerUserId,
      contact_id: contactId,
      direction: "outbound",
      content: welcomeText,
      message_type: "text",
      status: "sent",
      whatsapp_message_id: waMessageId,
      is_ai: true,
    });
    await supabaseAdmin
      .from("contacts")
      .update({
        last_message: welcomeText,
        last_message_at: new Date().toISOString(),
        last_direction: "outbound",
      })
      .eq("id", contactId);
  } catch (e: any) {
    console.error("[evolution welcome] erro:", e?.message ?? e);
  }
}

async function buildConversationContext(ownerUserId: string, contactId: string) {
  const { data: history } = await supabaseAdmin
    .from("messages")
    .select("direction,content,message_type,created_at")
    .eq("owner_user_id", ownerUserId)
    .eq("contact_id", contactId)
    .order("created_at", { ascending: false })
    .limit(100);
  const conversation_history = (history ?? [])
    .reverse()
    .map((h) => {
      const role = h.direction === "inbound" ? ("user" as const) : ("assistant" as const);
      let content = String(h.content ?? "").trim();
      // Mensagem de foto: só a legenda (ou vazio) não deixa claro pra IA que
      // uma imagem foi trocada. Sem isto, a IA manda a foto num turno e no
      // seguinte jura que "não tem fotos" — não vê no histórico que já
      // enviou. Marca explicitamente quem enviou a imagem.
      if (h.message_type === "image") {
        const legenda = content ? ` (legenda: "${content}")` : "";
        content =
          role === "assistant"
            ? `[Você já enviou uma foto do serviço para o cliente nesta conversa${legenda}. Não diga que não tem fotos.]`
            : `[O cliente enviou uma foto${legenda}]`;
      }
      return { role, content };
    })
    .filter((m) => m.content.length > 0)
    .map((m) => ({ role: m.role, content: m.content.slice(0, 2000) }));
  // remove a mensagem atual do histórico (já vai como `message`)
  if (conversation_history.length > 0) conversation_history.pop();

  // ── Memória de longo prazo: resumo + sumarização em background ──
  const { count: totalCount } = await supabaseAdmin
    .from("messages")
    .select("id", { count: "exact", head: true })
    .eq("owner_user_id", ownerUserId)
    .eq("contact_id", contactId);
  const aiSummary = await getContactAiSummary(contactId, ownerUserId);
  if (totalCount && totalCount > 80) {
    maybeUpdateAiSummary(contactId, ownerUserId, totalCount).catch((err) =>
      console.error("[ai-summary]", err?.message ?? err),
    );
  }

  return { conversation_history, aiSummary };
}

export async function sendAiReplyAndPersist(
  instanceName: string,
  ownerUserId: string,
  contactId: string,
  phone: string,
  ai: AiRunResult,
  logPrefix: string,
) {
  if (
    ai.action === "send_message" ||
    ai.action === "send_out_of_hours" ||
    ai.action === "transfer_to_human"
  ) {
    const responseText = ai.response?.trim();
    if (!responseText) return;
    let waMessageId: string | null = null;
    try {
      await simulateTyping(instanceName, phone, responseText);
      const r: any = await evo.sendText(instanceName, { number: phone, text: responseText });
      waMessageId = r?.key?.id ?? r?.messageId ?? null;
    } catch (e: any) {
      console.error(`[${logPrefix}] sendText falhou:`, e?.message ?? e);
    }
    await supabaseAdmin.from("messages").insert({
      owner_user_id: ownerUserId,
      contact_id: contactId,
      direction: "outbound",
      content: responseText,
      message_type: "text",
      status: "sent",
      whatsapp_message_id: waMessageId,
      is_ai: true,
    });
    await supabaseAdmin
      .from("contacts")
      .update({
        last_message: responseText,
        last_message_at: new Date().toISOString(),
        last_direction: "outbound",
      })
      .eq("id", contactId);
    if (ai.action === "transfer_to_human") {
      // Além de enviar o aviso, deixa em waiting/unread para um humano assumir.
      await supabaseAdmin
        .from("contacts")
        .update({ kanban_column: "waiting", is_unread: true })
        .eq("id", contactId);
    }
  } else {
    console.log(`[${logPrefix}] skipped`, ai);
  }
}

async function processTextJob(job: MessageJobInput) {
  const { workspaceOwnerId, contactId, instanceName, payload } = job;
  const { phone, pushName, caption, waMessageId } = payload;

  await maybeSendWelcomeMessage(workspaceOwnerId, contactId, instanceName, phone, pushName);

  try {
    const { conversation_history, aiSummary } = await buildConversationContext(
      workspaceOwnerId,
      contactId,
    );
    const ai = await runAiResponse({
      workspace_owner_id: workspaceOwnerId,
      contact_id: contactId,
      message: caption,
      conversation_history,
      ai_summary: aiSummary,
      wa_message_id: waMessageId ?? null,
      contact_name: pushName ?? null,
      contact_phone: phone,
    });
    await sendAiReplyAndPersist(
      instanceName,
      workspaceOwnerId,
      contactId,
      phone,
      ai,
      "evolution ai",
    );
  } catch (e: any) {
    console.error("[evolution ai] erro:", e?.message ?? e);
  }
}

async function processAudioJob(job: MessageJobInput) {
  const { workspaceOwnerId, contactId, instanceName, payload } = job;
  const { phone, pushName, caption, mediaUrl, mediaMime, waMessageId } = payload;
  if (!mediaUrl) return;

  try {
    const audioResp = await fetch(mediaUrl);
    if (!audioResp.ok) {
      console.error("[evolution ai audio] download falhou:", audioResp.status);
      return;
    }
    const buf = new Uint8Array(await audioResp.arrayBuffer());
    const MAX_BYTES = 15 * 1024 * 1024;
    if (buf.byteLength > MAX_BYTES) {
      console.warn("[evolution ai audio] arquivo grande, ignorando", buf.byteLength);
      return;
    }
    let bin = "";
    for (let i = 0; i < buf.length; i++) bin += String.fromCharCode(buf[i]);
    const b64 = btoa(bin);
    const rawMime = (mediaMime ?? "audio/ogg").toLowerCase();
    const mime = rawMime.startsWith("audio/ogg")
      ? "audio/ogg"
      : rawMime.split(";")[0].trim() || "audio/ogg";

    const { conversation_history, aiSummary } = await buildConversationContext(
      workspaceOwnerId,
      contactId,
    );
    const ai = await runAiResponse({
      workspace_owner_id: workspaceOwnerId,
      contact_id: contactId,
      message: caption?.trim() || "[áudio do cliente]",
      conversation_history,
      ai_summary: aiSummary,
      wa_message_id: waMessageId ?? null,
      contact_name: pushName ?? null,
      contact_phone: phone,
      audio: { data: b64, mimeType: mime },
    });
    await sendAiReplyAndPersist(
      instanceName,
      workspaceOwnerId,
      contactId,
      phone,
      ai,
      "evolution ai audio",
    );
  } catch (e: any) {
    console.error("[evolution ai audio] erro:", e?.message ?? e);
  }
}

/** Processa 1 job da fila `message_jobs`: gera e envia a resposta da IA. */
export async function processMessageJob(job: MessageJobInput): Promise<void> {
  if (job.payload.mediaType === "text") {
    await processTextJob(job);
  } else if (job.payload.mediaType === "audio") {
    await processAudioJob(job);
  }
}
