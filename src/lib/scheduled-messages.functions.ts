// Fase 9: Mensagens agendadas (server functions).
//
// Guarda a mensagem como um job na fila do worker com `job_type='scheduled_send'`
// e `scheduled_at = <momento futuro>`. O worker existente já respeita o
// scheduled_at; a única mudança lá é reconhecer o novo tipo (ver job-worker.ts).
//
// Sem tabela extra de propósito: adicionar uma segunda tabela ("scheduled_messages")
// duplicaria estado e obrigaria sincronização quando o disparo acontecesse.

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export type ScheduledMessage = {
  id: string;
  contactId: string;
  scheduledAt: string;
  text: string | null;
  mediaUrl: string | null;
  mediaMime: string | null;
  mediaName: string | null;
  sentBy: string | null;
  status: "pending" | "processing" | "done" | "error";
  lastError: string | null;
};

const CreateSchema = z.object({
  contactId: z.string().uuid(),
  scheduledAt: z.string().datetime(),
  text: z.string().max(4096).optional().nullable(),
  media: z
    .object({
      url: z.string().url(),
      mime: z.string().max(200),
      name: z.string().max(200).optional().nullable(),
    })
    .optional()
    .nullable(),
});

/**
 * Agenda o envio para um contato. Precisa de pelo menos texto OU mídia.
 * Data mínima: agora + 30s (pra evitar corrida com o poll do worker; dispararia
 * na hora de qualquer jeito).
 */
export const scheduleMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => CreateSchema.parse(input))
  .handler(async ({ data, context }) => {
    if (!data.text && !data.media) {
      throw new Error("Informe um texto ou mídia para agendar.");
    }
    const when = new Date(data.scheduledAt);
    if (Number.isNaN(when.getTime())) {
      throw new Error("Data inválida.");
    }
    const minWhen = new Date(Date.now() + 30_000);
    if (when < minWhen) {
      throw new Error("O horário precisa ser pelo menos 30 segundos no futuro.");
    }

    // Confirma que o contato pertence ao workspace do usuário. Como o server
    // usa service_role (bypassa RLS), a checagem explícita é o que protege.
    const { data: contact } = await supabaseAdmin
      .from("contacts")
      .select("id,channel")
      .eq("id", data.contactId)
      .eq("owner_user_id", context.userId)
      .maybeSingle();
    if (!contact?.id) throw new Error("Contato não encontrado neste workspace.");

    // Roteamento: canais Zernio usam `zernio:<channel>`; Evolution usa a
    // instance_name padrão do workspace (compat com o worker existente).
    const ch = (contact as any).channel as string | null;
    const instanceName =
      ch === "whatsapp_cloud" || ch === "instagram"
        ? `zernio:${ch}`
        : `whatsapp_${context.userId.replaceAll("-", "").slice(0, 12)}`;

    const payload = {
      text: data.text ?? null,
      mediaUrl: data.media?.url ?? null,
      mediaMime: data.media?.mime ?? null,
      mediaName: data.media?.name ?? null,
      sentBy: context.userId,
    };

    const { data: created, error } = await supabaseAdmin
      .from("message_jobs")
      .insert({
        workspace_owner_id: context.userId,
        contact_id: data.contactId,
        instance_name: instanceName,
        payload,
        job_type: "scheduled_send",
        scheduled_at: when.toISOString(),
        status: "pending",
      })
      .select("id")
      .single();

    if (error) throw new Error(error.message);
    return { id: created.id as string };
  });

const ListSchema = z.object({ contactId: z.string().uuid() });

/** Lista mensagens agendadas pendentes para um contato (ordem cronológica). */
export const listScheduledMessages = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => ListSchema.parse(input))
  .handler(async ({ data, context }): Promise<{ items: ScheduledMessage[] }> => {
    const { data: rows, error } = await supabaseAdmin
      .from("message_jobs")
      .select("id,contact_id,scheduled_at,payload,status,last_error")
      .eq("workspace_owner_id", context.userId)
      .eq("contact_id", data.contactId)
      .eq("job_type", "scheduled_send")
      .in("status", ["pending", "processing"])
      .order("scheduled_at", { ascending: true });
    if (error) throw new Error(error.message);
    const items: ScheduledMessage[] = (rows ?? []).map((r: any) => ({
      id: r.id,
      contactId: r.contact_id,
      scheduledAt: r.scheduled_at,
      text: r.payload?.text ?? null,
      mediaUrl: r.payload?.mediaUrl ?? null,
      mediaMime: r.payload?.mediaMime ?? null,
      mediaName: r.payload?.mediaName ?? null,
      sentBy: r.payload?.sentBy ?? null,
      status: r.status,
      lastError: r.last_error ?? null,
    }));
    return { items };
  });

const CancelSchema = z.object({ id: z.string().uuid() });

/** Cancela um agendamento. Só funciona enquanto o job está `pending`. */
export const cancelScheduledMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => CancelSchema.parse(input))
  .handler(async ({ data, context }) => {
    // Delete direto: sem histórico útil pra manter (o disparo real gera
    // linha em `messages`). Segurança: filtra por owner + job_type + status.
    const { error, count } = await supabaseAdmin
      .from("message_jobs")
      .delete({ count: "exact" })
      .eq("id", data.id)
      .eq("workspace_owner_id", context.userId)
      .eq("job_type", "scheduled_send")
      .eq("status", "pending");
    if (error) throw new Error(error.message);
    if (!count) {
      throw new Error("Este agendamento não pode mais ser cancelado (já disparou).");
    }
    return { ok: true };
  });
