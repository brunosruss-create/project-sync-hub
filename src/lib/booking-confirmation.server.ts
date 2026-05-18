// Helpers server-only para confirmação WhatsApp e criação de agendamento pela IA.
// Reusa o client Evolution já existente em src/lib/evolution.server.ts.
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { evo, instanceNameForOwner } from "@/lib/evolution.server";
import { MESSAGE_DEFAULTS, type MessageKey } from "@/lib/message-defaults";
import { renderTemplate } from "@/lib/message-templates";

type ProfileLite = {
  id: string;
  business_name: string | null;
  business_timezone: string | null;
};

type ServiceLite = {
  id: string;
  name: string;
  duration_minutes: number;
  price_cents: number;
};

type ProfessionalLite = {
  id: string;
  name: string;
} | null;

type ClientLite = {
  client_name: string;
  client_phone: string;
};

type AppointmentLite = {
  id: string;
  starts_at: string;
};

// Garante parse como UTC mesmo quando a string vier sem offset
// (Postgres timestamptz às vezes serializa "2026-…T11:00:00" sem 'Z').
function toUtcDate(iso: string): Date {
  if (/Z$|[+-]\d{2}:?\d{2}$/.test(iso)) return new Date(iso);
  return new Date(iso.replace(" ", "T") + "Z");
}

function formatDateBR(iso: string, tz: string): string {
  try {
    return new Intl.DateTimeFormat("pt-BR", {
      timeZone: tz,
      weekday: "long",
      day: "2-digit",
      month: "long",
      year: "numeric",
    }).format(toUtcDate(iso));
  } catch {
    return toUtcDate(iso).toLocaleDateString("pt-BR");
  }
}

function formatTimeBR(iso: string, tz: string): string {
  try {
    return new Intl.DateTimeFormat("pt-BR", {
      timeZone: tz,
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(toUtcDate(iso));
  } catch {
    return toUtcDate(iso).toLocaleTimeString("pt-BR", {
      hour: "2-digit",
      minute: "2-digit",
    });
  }
}

export function normalizePhone(raw: string): string {
  const digits = String(raw ?? "").replace(/\D/g, "");
  if (!digits) return "";
  if (digits.startsWith("55")) return digits;
  return `55${digits}`;
}

async function getConnectedInstance(ownerId: string): Promise<string | null> {
  const instanceName = instanceNameForOwner(ownerId);
  const { data: inst } = await supabaseAdmin
    .from("whatsapp_instances")
    .select("status")
    .eq("instance_name", instanceName)
    .maybeSingle();
  if (!inst || inst.status !== "connected") return null;
  return instanceName;
}

// Lê o template + flag de uma mensagem do profile, usando os defaults
// de message-defaults.ts como fallback. Retorna null se a mensagem
// estiver explicitamente desativada.
type TemplateColumns = {
  text: string; // nome da coluna *_text/message
  enabled: string; // nome da coluna *_enabled
  defaultEnabled: boolean;
};
const TEMPLATE_COLS: Record<MessageKey, TemplateColumns> = {
  welcome: {
    text: "welcome_message",
    enabled: "welcome_message_enabled",
    defaultEnabled: false,
  },
  out_of_hours: {
    text: "ai_out_of_hours_message",
    enabled: "ai_out_of_hours_enabled",
    defaultEnabled: false,
  },
  transfer: {
    text: "msg_transfer_text",
    enabled: "msg_transfer_enabled",
    defaultEnabled: true,
  },
  booking_confirmed: {
    text: "msg_booking_confirmed_text",
    enabled: "msg_booking_confirmed_enabled",
    defaultEnabled: true,
  },
  booking_rescheduled: {
    text: "msg_booking_rescheduled_text",
    enabled: "msg_booking_rescheduled_enabled",
    defaultEnabled: true,
  },
  booking_cancelled: {
    text: "msg_booking_cancelled_text",
    enabled: "msg_booking_cancelled_enabled",
    defaultEnabled: true,
  },
};

async function loadTemplate(
  ownerId: string,
  key: MessageKey,
): Promise<{ enabled: boolean; text: string }> {
  const cols = TEMPLATE_COLS[key];
  const { data } = await supabaseAdmin
    .from("profiles")
    .select(`${cols.text},${cols.enabled}`)
    .eq("id", ownerId)
    .maybeSingle();
  const row = (data ?? {}) as Record<string, unknown>;
  const text =
    typeof row[cols.text] === "string" && (row[cols.text] as string).trim()
      ? (row[cols.text] as string)
      : MESSAGE_DEFAULTS[key].default;
  const enabled =
    typeof row[cols.enabled] === "boolean"
      ? (row[cols.enabled] as boolean)
      : cols.defaultEnabled;
  return { enabled, text };
}

export async function sendBookingReschedule(args: {
  profile: ProfileLite;
  appointment: AppointmentLite;
  service: ServiceLite;
  professional: ProfessionalLite;
  client: ClientLite;
}) {
  const { profile, appointment, service, professional, client } = args;
  try {
    const tpl = await loadTemplate(profile.id, "booking_rescheduled");
    if (!tpl.enabled) return;
    const instanceName = await getConnectedInstance(profile.id);
    if (!instanceName) return;
    const tz = profile.business_timezone || "America/Sao_Paulo";
    const msg = renderTemplate(tpl.text, {
      cliente: client.client_name,
      negocio: profile.business_name ?? "nosso estabelecimento",
      data: formatDateBR(appointment.starts_at, tz),
      hora: formatTimeBR(appointment.starts_at, tz),
      servico: service.name,
      profissional: professional?.name ?? "nosso profissional",
    });
    const number = normalizePhone(client.client_phone);
    await evo.sendText(instanceName, { number, text: msg });
  } catch (e) {
    console.warn("[booking] reagendamento WhatsApp falhou:", (e as Error)?.message ?? e);
  }
}

export async function sendBookingCancellation(args: {
  profile: ProfileLite;
  appointment: AppointmentLite;
  service: ServiceLite;
  client: ClientLite;
}) {
  const { profile, appointment, service, client } = args;
  try {
    const tpl = await loadTemplate(profile.id, "booking_cancelled");
    if (!tpl.enabled) return;
    const instanceName = await getConnectedInstance(profile.id);
    if (!instanceName) return;
    const tz = profile.business_timezone || "America/Sao_Paulo";
    const msg = renderTemplate(tpl.text, {
      cliente: client.client_name,
      negocio: profile.business_name ?? "nosso estabelecimento",
      data: formatDateBR(appointment.starts_at, tz),
      hora: formatTimeBR(appointment.starts_at, tz),
      servico: service.name,
    });
    const number = normalizePhone(client.client_phone);
    await evo.sendText(instanceName, { number, text: msg });
  } catch (e) {
    console.warn("[booking] cancelamento WhatsApp falhou:", (e as Error)?.message ?? e);
  }
}

export async function sendBookingConfirmation(args: {
  profile: ProfileLite;
  appointment: AppointmentLite;
  service: ServiceLite;
  professional: ProfessionalLite;
  client: ClientLite;
}) {
  const { profile, appointment, service, professional, client } = args;
  try {
    const tpl = await loadTemplate(profile.id, "booking_confirmed");
    if (!tpl.enabled) return;
    const instanceName = await getConnectedInstance(profile.id);
    if (!instanceName) return;
    const tz = profile.business_timezone || "America/Sao_Paulo";
    const msg = renderTemplate(tpl.text, {
      cliente: client.client_name,
      negocio: profile.business_name ?? "nosso estabelecimento",
      data: formatDateBR(appointment.starts_at, tz),
      hora: formatTimeBR(appointment.starts_at, tz),
      servico: service.name,
      profissional: professional?.name ?? "nosso profissional",
    });
    const number = normalizePhone(client.client_phone);
    await evo.sendText(instanceName, { number, text: msg });
  } catch (e) {
    console.warn("[booking] confirmação WhatsApp falhou:", (e as Error)?.message ?? e);
  }
}

// Usado pelo pós-processamento do ai-respond para criar appointment real
// quando a IA emite o bloco APPOINTMENT_JSON ao final da resposta.
export async function createAppointmentFromAI(
  data: {
    service_name?: string;
    professional_id?: string | null;
    starts_at?: string;
    client_name?: string;
    client_phone?: string;
    /** Contact id já conhecido (vindo do webhook WhatsApp). Preferido ao lookup por telefone. */
    contact_id?: string | null;
    notes?: string;
    silent?: boolean;
  },
  profile: { id: string; business_timezone: string | null; business_name: string | null },
): Promise<{ ok: boolean; reason?: string; appointment_id?: string }> {
  if (!data.starts_at || !data.service_name) {
    return { ok: false, reason: "missing_fields" };
  }

  // 1. Resolver serviço pelo nome (case-insensitive)
  const { data: serviceRow } = await supabaseAdmin
    .from("services")
    .select("id,name,duration_minutes,price_cents")
    .eq("owner_user_id", profile.id)
    .ilike("name", data.service_name)
    .maybeSingle();
  if (!serviceRow) return { ok: false, reason: "service_not_found" };

  const startsAt = new Date(data.starts_at);
  if (Number.isNaN(startsAt.getTime())) return { ok: false, reason: "bad_date" };
  const endsAt = new Date(startsAt.getTime() + serviceRow.duration_minutes * 60_000);

  // 2. Profissional (opcional). Se a IA não passou um, e existir só 1 ativo,
  //    atribui automaticamente para manter a agenda consistente.
  let professional: { id: string; name: string } | null = null;
  if (data.professional_id) {
    const { data: pr } = await supabaseAdmin
      .from("professionals")
      .select("id,name")
      .eq("id", data.professional_id)
      .eq("owner_user_id", profile.id)
      .maybeSingle();
    professional = pr ?? null;
  } else {
    const { data: pros } = await supabaseAdmin
      .from("professionals")
      .select("id,name")
      .eq("owner_user_id", profile.id)
      .eq("is_active", true)
      .limit(2);
    if (pros && pros.length === 1) professional = pros[0];
  }

  // 3. Contato — preferimos o contact_id passado pelo webhook (conversa atual);
  //    fallback faz upsert por telefone.
  let contactId: string | null = null;
  let resolvedName = (data.client_name ?? "").trim();
  let resolvedPhone = normalizePhone(data.client_phone ?? "");

  if (data.contact_id) {
    const { data: existing } = await supabaseAdmin
      .from("contacts")
      .select("id,name,phone")
      .eq("id", data.contact_id)
      .eq("owner_user_id", profile.id)
      .maybeSingle();
    if (existing) {
      contactId = existing.id;
      if (!resolvedName) resolvedName = existing.name ?? "";
      if (!resolvedPhone) resolvedPhone = normalizePhone(existing.phone ?? "");
    }
  }

  if (!contactId) {
    if (!resolvedPhone) return { ok: false, reason: "missing_phone" };
    const { data: existingContact } = await supabaseAdmin
      .from("contacts")
      .select("id,name")
      .eq("owner_user_id", profile.id)
      .eq("phone", resolvedPhone)
      .maybeSingle();
    if (existingContact) {
      contactId = existingContact.id;
      if (!resolvedName) resolvedName = existingContact.name ?? "";
    } else {
      const { data: newC, error: ce } = await supabaseAdmin
        .from("contacts")
        .insert({
          owner_user_id: profile.id,
          name: resolvedName || resolvedPhone,
          phone: resolvedPhone,
        })
        .select("id")
        .single();
      if (ce || !newC) return { ok: false, reason: "contact_create_failed" };
      contactId = newC.id;
    }
  }

  // 4. Anti-conflito
  if (professional) {
    const { data: conflict } = await supabaseAdmin
      .from("appointments")
      .select("id")
      .eq("owner_user_id", profile.id)
      .eq("professional_id", professional.id)
      .lt("starts_at", endsAt.toISOString())
      .gt("ends_at", startsAt.toISOString())
      .neq("status", "cancelled")
      .maybeSingle();
    if (conflict) return { ok: false, reason: "slot_taken" };
  }

  // 5. Cria appointment
  const { data: appt, error: aerr } = await supabaseAdmin
    .from("appointments")
    .insert({
      owner_user_id: profile.id,
      contact_id: contactId,
      professional_id: professional?.id ?? null,
      service_id: serviceRow.id,
      starts_at: startsAt.toISOString(),
      ends_at: endsAt.toISOString(),
      status: "scheduled",
      notes: data.notes ?? "",
      notify_whatsapp: true,
    })
    .select("id,starts_at")
    .single();
  if (aerr || !appt) return { ok: false, reason: "appointment_create_failed" };

  // 6. appointment_services
  await supabaseAdmin.from("appointment_services").insert({
    appointment_id: appt.id,
    owner_user_id: profile.id,
    service_id: serviceRow.id,
    price_cents: serviceRow.price_cents,
    duration_minutes: serviceRow.duration_minutes,
  });

  // 7. Confirmação WA (pode ser suprimida quando chamado dentro do reschedule)
  if (!data.silent) {
    await sendBookingConfirmation({
      profile: {
        id: profile.id,
        business_name: profile.business_name,
        business_timezone: profile.business_timezone,
      },
      appointment: appt,
      service: serviceRow,
      professional,
      client: { client_name: resolvedName || "Cliente", client_phone: resolvedPhone },
    });
  }

  return { ok: true, appointment_id: appt.id };
}

// Reagendamento via IA: muda starts_at/ends_at de um appointment existente.
export async function rescheduleAppointmentFromAI(
  data: { appointment_id?: string; new_starts_at?: string; contact_id?: string | null },
  profile: { id: string; business_timezone: string | null; business_name: string | null },
): Promise<{ ok: boolean; reason?: string }> {
  if (!data.appointment_id || !data.new_starts_at) {
    return { ok: false, reason: "missing_fields" };
  }
  const newStart = new Date(data.new_starts_at);
  if (Number.isNaN(newStart.getTime())) return { ok: false, reason: "bad_date" };
  if (newStart.getTime() < Date.now() - 60_000) return { ok: false, reason: "past_date" };

  // 1. Busca appointment + serviço + profissional + contato
  const { data: apptRaw } = await supabaseAdmin
    .from("appointments")
    .select(
      "id, contact_id, professional_id, service_id, status, starts_at, ends_at, " +
        "services(id,name,duration_minutes,price_cents), " +
        "professionals(id,name), " +
        "contacts(name,phone)",
    )
    .eq("id", data.appointment_id)
    .eq("owner_user_id", profile.id)
    .maybeSingle();
  const appt = apptRaw as any;
  if (!appt) return { ok: false, reason: "appointment_not_found" };
  if (appt.status === "cancelled") return { ok: false, reason: "already_cancelled" };
  // Escopo do contato: se a IA passou contact_id, precisa bater.
  if (data.contact_id && appt.contact_id && data.contact_id !== appt.contact_id) {
    return { ok: false, reason: "contact_mismatch" };
  }

  const svc = (appt as any).services as ServiceLite | null;
  if (!svc) return { ok: false, reason: "service_missing" };
  const newEnd = new Date(newStart.getTime() + svc.duration_minutes * 60_000);

  // 2. Anti-conflito (mesmo profissional, exclui o próprio appointment)
  if (appt.professional_id) {
    const { data: conflict } = await supabaseAdmin
      .from("appointments")
      .select("id")
      .eq("owner_user_id", profile.id)
      .eq("professional_id", appt.professional_id)
      .lt("starts_at", newEnd.toISOString())
      .gt("ends_at", newStart.toISOString())
      .neq("status", "cancelled")
      .neq("id", appt.id)
      .maybeSingle();
    if (conflict) return { ok: false, reason: "slot_taken" };
  }

  // 3. Update
  const { error: uerr } = await supabaseAdmin
    .from("appointments")
    .update({
      starts_at: newStart.toISOString(),
      ends_at: newEnd.toISOString(),
    })
    .eq("id", appt.id)
    .eq("owner_user_id", profile.id);
  if (uerr) return { ok: false, reason: "update_failed" };

  // 4. Confirmação WhatsApp
  const contact = (appt as any).contacts as { name: string; phone: string } | null;
  const professional = ((appt as any).professionals as { id: string; name: string } | null) ?? null;
  if (contact) {
    await sendBookingReschedule({
      profile: {
        id: profile.id,
        business_name: profile.business_name,
        business_timezone: profile.business_timezone,
      },
      appointment: { id: appt.id, starts_at: newStart.toISOString() },
      service: svc,
      professional,
      client: { client_name: contact.name, client_phone: contact.phone },
    });
  }
  return { ok: true };
}

// Cancelamento via IA: marca appointment como cancelled.
export async function cancelAppointmentFromAI(
  data: { appointment_id?: string; reason?: string; contact_id?: string | null; silent?: boolean },
  profile: { id: string; business_timezone: string | null; business_name: string | null },
): Promise<{ ok: boolean; reason?: string; previous_status?: string; previous_notes?: string }> {
  if (!data.appointment_id) return { ok: false, reason: "missing_fields" };

  const { data: apptRaw } = await supabaseAdmin
    .from("appointments")
    .select(
      "id, contact_id, status, starts_at, notes, " +
        "services(id,name,duration_minutes,price_cents), " +
        "contacts(name,phone)",
    )
    .eq("id", data.appointment_id)
    .eq("owner_user_id", profile.id)
    .maybeSingle();
  const appt = apptRaw as any;
  if (!appt) return { ok: false, reason: "appointment_not_found" };
  if (appt.status === "cancelled") return { ok: false, reason: "already_cancelled" };
  if (data.contact_id && appt.contact_id && data.contact_id !== appt.contact_id) {
    return { ok: false, reason: "contact_mismatch" };
  }

  const previousStatus = appt.status as string;
  const previousNotes = (appt.notes ?? "") as string;
  const notesAppend = data.reason ? `\n[IA cancelou: ${data.reason}]` : "\n[IA cancelou]";
  const { error: uerr } = await supabaseAdmin
    .from("appointments")
    .update({
      status: "cancelled",
      notes: previousNotes + notesAppend,
    })
    .eq("id", appt.id)
    .eq("owner_user_id", profile.id);
  if (uerr) return { ok: false, reason: "update_failed" };

  const svc = (appt as any).services as ServiceLite | null;
  const contact = (appt as any).contacts as { name: string; phone: string } | null;
  if (!data.silent && svc && contact) {
    await sendBookingCancellation({
      profile: {
        id: profile.id,
        business_name: profile.business_name,
        business_timezone: profile.business_timezone,
      },
      appointment: { id: appt.id, starts_at: appt.starts_at },
      service: svc,
      client: { client_name: contact.name, client_phone: contact.phone },
    });
  }
  return { ok: true, previous_status: previousStatus, previous_notes: previousNotes };
}
