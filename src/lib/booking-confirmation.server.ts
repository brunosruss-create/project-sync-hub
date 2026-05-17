// Helpers server-only para confirmação WhatsApp e criação de agendamento pela IA.
// Reusa o client Evolution já existente em src/lib/evolution.server.ts.
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { evo, instanceNameForOwner } from "@/lib/evolution.server";

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

function formatDateBR(iso: string, tz: string): string {
  try {
    return new Intl.DateTimeFormat("pt-BR", {
      timeZone: tz,
      weekday: "long",
      day: "2-digit",
      month: "long",
      year: "numeric",
    }).format(new Date(iso));
  } catch {
    return new Date(iso).toLocaleDateString("pt-BR");
  }
}

function formatTimeBR(iso: string, tz: string): string {
  try {
    return new Intl.DateTimeFormat("pt-BR", {
      timeZone: tz,
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(new Date(iso));
  } catch {
    return new Date(iso).toLocaleTimeString("pt-BR", {
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

export async function sendBookingReschedule(args: {
  profile: ProfileLite;
  appointment: AppointmentLite;
  service: ServiceLite;
  professional: ProfessionalLite;
  client: ClientLite;
}) {
  const { profile, appointment, service, professional, client } = args;
  try {
    const instanceName = await getConnectedInstance(profile.id);
    if (!instanceName) return;
    const tz = profile.business_timezone || "America/Sao_Paulo";
    const dateFormatted = formatDateBR(appointment.starts_at, tz);
    const timeFormatted = formatTimeBR(appointment.starts_at, tz);
    const professionalName = professional?.name ?? "nosso profissional";
    const businessName = profile.business_name ?? "nosso estabelecimento";
    const msg =
      `Olá ${client.client_name}! 🔄\n\n` +
      `Seu agendamento em *${businessName}* foi *reagendado*:\n\n` +
      `📅 *${dateFormatted} às ${timeFormatted}*\n` +
      `💼 ${service.name}\n` +
      `👤 ${professionalName}\n\n` +
      `Até lá! 😊`;
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
    const instanceName = await getConnectedInstance(profile.id);
    if (!instanceName) return;
    const tz = profile.business_timezone || "America/Sao_Paulo";
    const dateFormatted = formatDateBR(appointment.starts_at, tz);
    const timeFormatted = formatTimeBR(appointment.starts_at, tz);
    const businessName = profile.business_name ?? "nosso estabelecimento";
    const msg =
      `Olá ${client.client_name}.\n\n` +
      `Seu agendamento em *${businessName}* foi *cancelado*:\n\n` +
      `📅 ${dateFormatted} às ${timeFormatted}\n` +
      `💼 ${service.name}\n\n` +
      `Caso queira remarcar, é só responder esta mensagem. 🙏`;
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
    const instanceName = instanceNameForOwner(profile.id);
    const { data: inst } = await supabaseAdmin
      .from("whatsapp_instances")
      .select("status")
      .eq("instance_name", instanceName)
      .maybeSingle();
    if (!inst || inst.status !== "connected") return; // sem WA conectado — não falhar
    const tz = profile.business_timezone || "America/Sao_Paulo";
    const dateFormatted = formatDateBR(appointment.starts_at, tz);
    const timeFormatted = formatTimeBR(appointment.starts_at, tz);
    const professionalName = professional?.name ?? "nosso profissional";
    const businessName = profile.business_name ?? "nosso estabelecimento";
    const msg =
      `Olá ${client.client_name}! ✅\n\n` +
      `Seu agendamento em *${businessName}* foi confirmado:\n\n` +
      `📅 *${dateFormatted} às ${timeFormatted}*\n` +
      `💼 ${service.name}\n` +
      `👤 ${professionalName}\n\n` +
      `Até lá! 😊`;
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
    notes?: string;
  },
  profile: { id: string; business_timezone: string | null; business_name: string | null },
): Promise<{ ok: boolean; reason?: string }> {
  if (!data.starts_at || !data.client_name || !data.client_phone || !data.service_name) {
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

  // 2. Profissional (opcional)
  let professional: { id: string; name: string } | null = null;
  if (data.professional_id) {
    const { data: pr } = await supabaseAdmin
      .from("professionals")
      .select("id,name")
      .eq("id", data.professional_id)
      .eq("owner_user_id", profile.id)
      .maybeSingle();
    professional = pr ?? null;
  }

  // 3. Contato (upsert por telefone)
  const phone = normalizePhone(data.client_phone);
  const { data: existingContact } = await supabaseAdmin
    .from("contacts")
    .select("id")
    .eq("owner_user_id", profile.id)
    .eq("phone", phone)
    .maybeSingle();
  let contactId = existingContact?.id ?? null;
  if (!contactId) {
    const { data: newC, error: ce } = await supabaseAdmin
      .from("contacts")
      .insert({ owner_user_id: profile.id, name: data.client_name, phone })
      .select("id")
      .single();
    if (ce || !newC) return { ok: false, reason: "contact_create_failed" };
    contactId = newC.id;
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

  // 7. Confirmação WA
  await sendBookingConfirmation({
    profile: {
      id: profile.id,
      business_name: profile.business_name,
      business_timezone: profile.business_timezone,
    },
    appointment: appt,
    service: serviceRow,
    professional,
    client: { client_name: data.client_name, client_phone: data.client_phone },
  });

  return { ok: true };
}
