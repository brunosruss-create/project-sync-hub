// Fase 9: Executor de mensagens agendadas (chamado pelo job-worker).
//
// Server-only (importa `supabaseAdmin` e a fila de envio Zernio/Evolution).
// Não expor em código de cliente — a lógica é a mesma que o Composer usa
// pra enviar em tempo real, só que disparada pelo `scheduled_at` do job.

import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { evo } from "@/lib/evolution.server";
import { sendMediaToContact } from "@/lib/evolution.server";
import { sendZernioToContact } from "@/lib/zernio.server";

export type ScheduledSendPayload = {
  text: string | null;
  mediaUrl: string | null;
  mediaMime: string | null;
  mediaName: string | null;
  sentBy: string | null;
};

/**
 * Dispara o envio agendado. Erros aqui viram falha do job (retry com backoff
 * pelo worker). Se o contato ou o canal mudou entre agendar e disparar, a
 * lógica interna de sendZernioToContact/evo.sendText já lida com "contato
 * sem telefone" ou "canal desconectado" retornando erro descritivo — ficam
 * como `last_error` no job.
 */
export async function runScheduledSend(params: {
  workspaceOwnerId: string;
  contactId: string;
  instanceName: string;
  payload: ScheduledSendPayload;
}): Promise<void> {
  const { workspaceOwnerId, contactId, instanceName, payload } = params;

  // Zernio (WhatsApp Cloud / Instagram): instance_name = "zernio:<channel>"
  if (instanceName.startsWith("zernio:")) {
    const channel = instanceName.slice("zernio:".length) as
      | "whatsapp_cloud"
      | "instagram";
    await sendZernioToContact({
      ownerUserId: workspaceOwnerId,
      contactId,
      channel,
      text: payload.text ?? undefined,
      attachment: payload.mediaUrl
        ? {
            url: payload.mediaUrl,
            mime: payload.mediaMime ?? "application/octet-stream",
            name: payload.mediaName ?? undefined,
          }
        : undefined,
      sentBy: payload.sentBy,
    });
    return;
  }

  // Evolution (WhatsApp QR): fluxo tradicional.
  if (payload.mediaUrl) {
    await sendMediaToContact({
      ownerUserId: workspaceOwnerId,
      contactId,
      url: payload.mediaUrl,
      mime: payload.mediaMime ?? "application/octet-stream",
      name: payload.mediaName ?? `media-${Date.now()}`,
      caption: payload.text ?? undefined,
      sentBy: payload.sentBy,
    });
    return;
  }

  if (!payload.text) {
    throw new Error("Agendamento sem texto nem mídia — nada a enviar.");
  }

  // Envio de texto puro precisa passar pelo evo.sendText e persistir na
  // tabela messages (o job-worker não persiste sozinho).
  const { data: contact, error: ce } = await supabaseAdmin
    .from("contacts")
    .select("id,phone")
    .eq("id", contactId)
    .eq("owner_user_id", workspaceOwnerId)
    .maybeSingle();
  if (ce || !contact?.phone) {
    throw new Error("Contato sem telefone.");
  }
  const number = String(contact.phone).replace(/\D/g, "");
  let externalId: string | null = null;
  try {
    const r: any = await evo.sendText(instanceName, {
      number,
      text: payload.text,
    });
    externalId = r?.key?.id ?? r?.messageId ?? null;
  } catch (e: any) {
    throw new Error(`Falha ao enviar texto: ${e?.message ?? e}`);
  }
  await supabaseAdmin.from("messages").insert({
    owner_user_id: workspaceOwnerId,
    contact_id: contactId,
    direction: "outbound",
    content: payload.text,
    message_type: "text",
    status: "sent",
    sent_by: payload.sentBy ?? null,
    whatsapp_message_id: externalId,
  });
}
