import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { evo } from "@/lib/evolution.server";
import { renderTemplate } from "@/lib/message-templates";
import {
  loadTemplate,
  getConnectedInstance,
  normalizePhone,
  persistOutboundMessage,
} from "@/lib/booking-confirmation.server";

/** Depois disso, perguntar "como foi o atendimento?" é pior do que não perguntar. */
const MAX_STALENESS_MS = 12 * 60 * 60 * 1000;
/** Tentativas de reagendamento quando o WhatsApp está desconectado. */
const MAX_DISCONNECT_RETRIES = 3;
const RETRY_DELAY_MS = 30 * 60 * 1000;

async function setStatus(surveyId: string, patch: Record<string, unknown>) {
  const { error } = await supabaseAdmin.from("csat_surveys").update(patch).eq("id", surveyId);
  if (error) console.warn("[csat] falha ao atualizar pesquisa:", surveyId, error.message);
}

/**
 * Envia a pesquisa de satisfação. Chamada pelo worker no job `csat_send`.
 *
 * Nunca lança por motivo de negócio (template desligado, WhatsApp caído,
 * conversa reaberta) — nesses casos marca a pesquisa e retorna. Lançar faria o
 * worker reprocessar até 5 vezes uma decisão que não vai mudar.
 */
export async function sendCsatSurvey(args: {
  surveyId: string;
  scheduledAt: string;
  attempts: number;
}): Promise<void> {
  const { surveyId, scheduledAt, attempts } = args;
  if (!surveyId) {
    console.warn("[csat] job sem survey_id no payload, ignorando");
    return;
  }

  const { data: survey, error } = await supabaseAdmin
    .from("csat_surveys")
    .select("id, owner_user_id, contact_id, status")
    .eq("id", surveyId)
    .maybeSingle();
  if (error) throw new Error(`csat: falha ao carregar pesquisa — ${error.message}`);
  if (!survey) {
    // Contato apagado leva a pesquisa junto (FK cascade). Nada a fazer.
    return;
  }

  // 1) Só envia pesquisa que ainda está agendada. Reentrância (job repetido
  //    por retry) não pode gerar segunda mensagem ao cliente.
  if (survey.status !== "pending") return;

  // 2) Worker parado a noite toda: a pergunta perdeu a validade.
  const atrasoMs = Date.now() - new Date(scheduledAt).getTime();
  if (atrasoMs > MAX_STALENESS_MS) {
    await setStatus(surveyId, { status: "cancelled" });
    console.warn("[csat] pesquisa cancelada por atraso:", surveyId, `${Math.round(atrasoMs / 3600000)}h`);
    return;
  }

  // 3) A guarda que evita a pior falha de UX da feature: se o cliente voltou a
  //    falar, a conversa saiu de "resolvida" — e perguntar "como foi o
  //    atendimento?" no meio de uma conversa nova é pior que não perguntar.
  const { data: contact } = await supabaseAdmin
    .from("contacts")
    .select("id, phone, kanban_column")
    .eq("id", survey.contact_id)
    .maybeSingle();
  if (!contact || contact.kanban_column !== "resolved") {
    await setStatus(surveyId, { status: "cancelled" });
    return;
  }

  // 4) Dono desligou a pesquisa entre o agendamento e o envio.
  const tpl = await loadTemplate(survey.owner_user_id, "csat_survey");
  if (!tpl.enabled) {
    await setStatus(surveyId, { status: "cancelled" });
    return;
  }

  // 5) WhatsApp desconectado: reagenda algumas vezes antes de desistir. Não é
  //    erro do job (não deve virar dead-letter nem disparar alerta).
  const instanceName = await getConnectedInstance(survey.owner_user_id);
  if (!instanceName) {
    if (attempts >= MAX_DISCONNECT_RETRIES) {
      await setStatus(surveyId, { status: "expired" });
      return;
    }
    await supabaseAdmin
      .from("message_jobs")
      .update({
        status: "pending",
        scheduled_at: new Date(Date.now() + RETRY_DELAY_MS).toISOString(),
      })
      .eq("job_type", "csat_send")
      .eq("contact_id", survey.contact_id)
      .eq("status", "processing");
    return;
  }

  // 6) Envio.
  const { data: profile } = await supabaseAdmin
    .from("profiles")
    .select("business_name")
    .eq("id", survey.owner_user_id)
    .maybeSingle();
  const { data: contactName } = await supabaseAdmin
    .from("contacts")
    .select("name")
    .eq("id", survey.contact_id)
    .maybeSingle();

  const text = renderTemplate(tpl.text, {
    cliente: (contactName?.name ?? "").split(" ")[0] ?? "",
    negocio: (profile as any)?.business_name ?? "",
  });

  let waMessageId: string | null = null;
  const r: any = await evo.sendText(instanceName, {
    number: normalizePhone(contact.phone as string),
    text,
  });
  waMessageId = r?.key?.id ?? r?.messageId ?? null;

  // 7) Sem isto a mensagem sai no WhatsApp real e SOME do inbox — o atendente
  //    nunca veria que a pesquisa foi enviada, e a resposta do cliente
  //    apareceria solta, sem contexto.
  await persistOutboundMessage(survey.owner_user_id, survey.contact_id, text, waMessageId);

  // 8) Só agora vira `sent` — é o único estado que aceita nota. Antes disso,
  //    qualquer mensagem do cliente seria interpretada como resposta.
  await setStatus(surveyId, { status: "sent", sent_at: new Date().toISOString() });
}
