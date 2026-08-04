import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { evo } from "@/lib/evolution.server";
import { runAiResponse, type AiRunResult } from "@/lib/ai-respond.server";
import { getContactAiSummary, maybeUpdateAiSummary } from "@/lib/ai-summary";
import { renderTemplate } from "@/lib/message-templates";
// Import estático (e não dinâmico dentro do if) porque o `vi.mock` dos testes é
// içado e só intercepta a resolução do módulo no topo.
import { pickNextAgent } from "@/lib/rotation.server";
import { sendZernioToContact } from "@/lib/zernio.server";

export type MessageJobPayload = {
  phone: string;
  pushName: string | null;
  mediaType: "text" | "audio" | "image";
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
  // Canais Zernio não usam presença (composing) do Evolution e a saudação da IA
  // já é integrada quando habilitada — pula o welcome estático aqui.
  if (instanceName.startsWith("zernio:")) return;
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
  // `is_internal` NÃO pode faltar aqui: nota interna é anotação privada da
  // equipe e a linha 120 abaixo mapeia tudo que não é inbound para "assistant"
  // — ou seja, sem este filtro a IA leria a nota como fala própria e poderia
  // repeti-la ao cliente no WhatsApp.
  //
  // Falha FECHADA de propósito: se a coluna ainda não existe no banco
  // (migration não aplicada), devolvemos histórico vazio em vez de refazer a
  // query sem o filtro. Perder contexto degrada a resposta; vazar nota privada
  // para o cliente é irreversível.
  const { data: history, error: historyError } = await supabaseAdmin
    .from("messages")
    .select("direction,content,message_type,created_at")
    .eq("owner_user_id", ownerUserId)
    .eq("contact_id", contactId)
    .eq("is_internal", false)
    .order("created_at", { ascending: false })
    .limit(100);
  if (historyError) {
    console.error(
      "[ai-context] histórico não carregado, seguindo SEM contexto (nunca sem o filtro de nota):",
      historyError.message,
    );
  }
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
  // Mesmo filtro do histórico acima, e não por higiene: este count é o gatilho
  // do resumo (aos 80) e é comparado em ai-summary.ts com o total já resumido.
  // Se as duas contas usarem definições diferentes de "mensagem", o refresh do
  // resumo desanda.
  const { count: totalCount } = await supabaseAdmin
    .from("messages")
    .select("id", { count: "exact", head: true })
    .eq("owner_user_id", ownerUserId)
    .eq("contact_id", contactId)
    .eq("is_internal", false);
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

    // Roteamento por canal: instance_name "zernio:<channel>" (gravado pelo
    // webhook da Zernio ao enfileirar) → API oficial (WhatsApp Cloud/Instagram).
    // Qualquer outro valor → Evolution (fluxo antigo, intocado).
    if (instanceName.startsWith("zernio:")) {
      const channel = instanceName.slice("zernio:".length) as "whatsapp_cloud" | "instagram";
      try {
        // sendZernioToContact já persiste a mensagem (com is_ai quando sentBy=null).
        await sendZernioToContact({
          ownerUserId,
          contactId,
          channel,
          text: responseText,
          sentBy: null,
        });
      } catch (e: any) {
        console.error(`[${logPrefix}] envio Zernio falhou:`, e?.message ?? e);
      }
    } else {
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
    }

    await supabaseAdmin
      .from("contacts")
      .update({
        last_message: responseText,
        last_message_at: new Date().toISOString(),
        last_direction: "outbound",
      })
      .eq("id", contactId);
    if (ai.action === "transfer_to_human") {
      // Rodízio ponderado: escolhe o próximo atendente da fila do workspace.
      // Try/catch obrigatório — se isto propagasse, o worker marcaria o job
      // como erro e reprocessaria a IA INTEIRA até 5 vezes (job-worker.ts),
      // e o cliente receberia a mensagem de transferência repetida. Falha aqui
      // degrada para o comportamento anterior: sem responsável.
      let assigned: string | null = null;
      try {
        assigned = await pickNextAgent(ownerUserId);
      } catch (e: any) {
        console.warn(`[${logPrefix}] rodízio falhou, seguindo sem atribuir:`, e?.message ?? e);
      }
      // Um update só, não dois: além de poupar round-trip, é o que mantém o
      // contrato coberto por transfer-message.test.ts.
      // `assigned_agent_id` só entra se houver alguém — nunca sobrescrever com
      // null. (Aqui o contato não tem responsável: se tivesse, `humanInControl`
      // no webhook teria impedido a IA de rodar.)
      await supabaseAdmin
        .from("contacts")
        .update({
          kanban_column: "waiting",
          is_unread: true,
          ...(assigned ? { assigned_agent_id: assigned } : {}),
        })
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

async function processImageJob(job: MessageJobInput) {
  const { workspaceOwnerId, contactId, instanceName, payload } = job;
  const { phone, pushName, caption, mediaUrl, mediaMime, waMessageId } = payload;
  if (!mediaUrl) return;

  await maybeSendWelcomeMessage(workspaceOwnerId, contactId, instanceName, phone, pushName);

  try {
    const imgResp = await fetch(mediaUrl);
    if (!imgResp.ok) {
      console.error("[evolution ai image] download falhou:", imgResp.status);
      return;
    }
    const buf = new Uint8Array(await imgResp.arrayBuffer());
    const MAX_BYTES = 15 * 1024 * 1024;
    if (buf.byteLength > MAX_BYTES) {
      console.warn("[evolution ai image] arquivo grande, ignorando", buf.byteLength);
      return;
    }
    let bin = "";
    for (let i = 0; i < buf.length; i++) bin += String.fromCharCode(buf[i]);
    const b64 = btoa(bin);
    // Gemini aceita jpeg/png/webp/heic/heif. WhatsApp manda quase sempre jpeg.
    const mime = (mediaMime ?? "image/jpeg").split(";")[0].trim() || "image/jpeg";

    const { conversation_history, aiSummary } = await buildConversationContext(
      workspaceOwnerId,
      contactId,
    );
    const ai = await runAiResponse({
      workspace_owner_id: workspaceOwnerId,
      contact_id: contactId,
      message: caption?.trim() || "[imagem do cliente]",
      conversation_history,
      ai_summary: aiSummary,
      wa_message_id: waMessageId ?? null,
      contact_name: pushName ?? null,
      contact_phone: phone,
      image: { data: b64, mimeType: mime },
    });
    await sendAiReplyAndPersist(
      instanceName,
      workspaceOwnerId,
      contactId,
      phone,
      ai,
      "evolution ai image",
    );
  } catch (e: any) {
    console.error("[evolution ai image] erro:", e?.message ?? e);
  }
}

/** Processa 1 job da fila `message_jobs`: gera e envia a resposta da IA. */
export async function processMessageJob(job: MessageJobInput): Promise<void> {
  if (job.payload.mediaType === "text") {
    await processTextJob(job);
  } else if (job.payload.mediaType === "audio") {
    await processAudioJob(job);
  } else if (job.payload.mediaType === "image") {
    await processImageJob(job);
  }
}
