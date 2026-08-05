// Fase 5 (estendida): auto-reply de ausência — fonte única de verdade.
//
// Antes vivia só dentro do webhook da Zernio (whatsapp_cloud/instagram).
// Extraído pra cá porque o webhook da Evolution (WhatsApp QR) passou a
// precisar da MESMA lógica — mesmo toggle (`msg_away_enabled`), mesmo texto
// (`msg_away_text`), mesmo dedup de 6h. Duplicar isso nos dois arquivos seria
// o tipo de coisa que diverge silenciosamente na próxima mudança.
//
// Server-only (supabaseAdmin). Não decide COMO enviar — cada canal (Zernio,
// Evolution) tem seu próprio client de envio; esta função só decide SE deve
// enviar e monta o texto.

import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { MESSAGE_DEFAULTS } from "@/lib/message-defaults";
import { renderTemplate } from "@/lib/message-templates";

const DEDUP_WINDOW_MS = 6 * 60 * 60 * 1000; // 6h

export type AwayCheckResult =
  | { shouldSend: true; text: string }
  | { shouldSend: false; reason: "ai_enabled" | "disabled" | "recent_outbound" | "human_in_control" };

/**
 * Decide se a mensagem de ausência deve disparar para este contato, e já
 * monta o texto renderizado. Não envia nem persiste — quem chama faz isso
 * (cada canal tem seu client de envio próprio).
 *
 * Degradação aberta: se as colunas msg_away_* ainda não existem neste banco
 * (migration pendente), lê só ai_enabled/business_name e trata como desligado
 * — nunca dispara por engano.
 */
export async function checkAwayReply(params: {
  ownerUserId: string;
  contactId: string;
  humanInControl: boolean;
  clienteName: string | null;
}): Promise<AwayCheckResult> {
  if (params.humanInControl) return { shouldSend: false, reason: "human_in_control" };

  let prof: any = null;
  const { data: prof1, error: prof1Err } = await supabaseAdmin
    .from("profiles")
    .select("ai_enabled,msg_away_enabled,msg_away_text,business_name")
    .eq("id", params.ownerUserId)
    .maybeSingle();
  if (
    prof1Err &&
    /Could not find the '(\w+)' column|column .* does not exist/i.test(prof1Err.message)
  ) {
    const { data: prof2 } = await supabaseAdmin
      .from("profiles")
      .select("ai_enabled,business_name")
      .eq("id", params.ownerUserId)
      .maybeSingle();
    prof = prof2;
  } else {
    prof = prof1;
  }

  const aiEnabled = prof?.ai_enabled === true;
  if (aiEnabled) return { shouldSend: false, reason: "ai_enabled" };

  const awayEnabled = prof?.msg_away_enabled === true;
  if (!awayEnabled) return { shouldSend: false, reason: "disabled" };

  const sinceIso = new Date(Date.now() - DEDUP_WINDOW_MS).toISOString();
  const { data: recent } = await supabaseAdmin
    .from("messages")
    .select("id")
    .eq("owner_user_id", params.ownerUserId)
    .eq("contact_id", params.contactId)
    .eq("direction", "outbound")
    .gte("created_at", sinceIso)
    .limit(1);
  if (recent && recent.length > 0) {
    return { shouldSend: false, reason: "recent_outbound" };
  }

  const tpl =
    (typeof prof?.msg_away_text === "string" && prof.msg_away_text.trim()) ||
    MESSAGE_DEFAULTS.away.default;
  const text = renderTemplate(tpl, {
    cliente: params.clienteName ?? "",
    negocio: prof?.business_name ?? "",
  });

  return { shouldSend: true, text };
}
