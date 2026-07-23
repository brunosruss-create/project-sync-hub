// Helpers server-only para confirmação WhatsApp e criação de agendamento pela IA.
// Reusa o client Evolution já existente em src/lib/evolution.server.ts.
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { evo, instanceNameForOwner } from "@/lib/evolution.server";
import {
  MESSAGE_DEFAULTS,
  BOOKING_CONFIRMED_BATCH_DEFAULT,
  type MessageKey,
} from "@/lib/message-defaults";
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
  buffer_minutes?: number;
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

// Offset (minutos) de uma timezone IANA num instante específico.
function tzOffsetMinutes(date: Date, tz: string): number {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const parts = Object.fromEntries(
    dtf
      .formatToParts(date)
      .filter((p) => p.type !== "literal")
      .map((p) => [p.type, p.value]),
  ) as Record<string, string>;
  const asUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour === "24" ? "0" : parts.hour),
    Number(parts.minute),
    Number(parts.second),
  );
  return (asUtc - date.getTime()) / 60000;
}

// Parser tolerante para datas vindas da IA. Aceita:
//   2026-05-23T14:00:00-03:00 / +00:00 / Z  (já com offset → usado como vem)
//   2026-05-23T14:00:00 / 2026-05-23T14:00 / 2026-05-23 14:00
//   23/05/2026 14:00
// Sem offset → interpreta como horário local da timezone do negócio.
export function parseAiDate(input: string | null | undefined, tz: string): Date | null {
  if (!input) return null;
  const raw = String(input).trim();
  if (!raw) return null;

  // Já tem offset/Z — confia no parser nativo.
  if (/Z$|[+-]\d{2}:?\d{2}$/.test(raw)) {
    const d = new Date(raw);
    return Number.isNaN(d.getTime()) ? null : d;
  }

  // dd/mm/yyyy hh:mm
  const br = raw.match(/^(\d{2})\/(\d{2})\/(\d{4})[ T](\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  // yyyy-mm-dd[ T]hh:mm[:ss]
  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{1,2}):(\d{2})(?::(\d{2}))?$/);

  let y: number, mo: number, d: number, h: number, mi: number, s: number;
  if (br) {
    [, , , , , ,] = br;
    d = Number(br[1]);
    mo = Number(br[2]);
    y = Number(br[3]);
    h = Number(br[4]);
    mi = Number(br[5]);
    s = Number(br[6] ?? 0);
  } else if (iso) {
    y = Number(iso[1]);
    mo = Number(iso[2]);
    d = Number(iso[3]);
    h = Number(iso[4]);
    mi = Number(iso[5]);
    s = Number(iso[6] ?? 0);
  } else {
    const fallback = new Date(raw);
    return Number.isNaN(fallback.getTime()) ? null : fallback;
  }

  // Constrói um Date interpretando os componentes como hora local de `tz`.
  // Estratégia: começa em UTC com os componentes, depois corrige pelo offset
  // da tz NAQUELE instante (cobre horário de verão automaticamente).
  const asUtcGuess = Date.UTC(y, mo - 1, d, h, mi, s);
  const offsetMin = tzOffsetMinutes(new Date(asUtcGuess), tz);
  return new Date(asUtcGuess - offsetMin * 60000);
}

// Acha o agendamento ativo (não cancelado/concluído) do contato.
// Retorna { kind: 'one', id } / { kind: 'many' } / { kind: 'none' }.
async function resolveActiveAppointment(
  ownerUserId: string,
  contactId: string | null,
): Promise<{ kind: "one"; id: string } | { kind: "many" } | { kind: "none" }> {
  if (!contactId) return { kind: "none" };
  const nowMinus1h = new Date(Date.now() - 3600_000).toISOString();
  const { data } = await supabaseAdmin
    .from("appointments")
    .select("id,starts_at,status")
    .eq("owner_user_id", ownerUserId)
    .eq("contact_id", contactId)
    .gte("starts_at", nowMinus1h)
    .not("status", "in", "(cancelled,completed)")
    .order("starts_at", { ascending: true })
    .limit(3);
  const rows = data ?? [];
  if (rows.length === 0) return { kind: "none" };
  if (rows.length === 1) return { kind: "one", id: rows[0].id };
  return { kind: "many" };
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
    typeof row[cols.enabled] === "boolean" ? (row[cols.enabled] as boolean) : cols.defaultEnabled;
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
    service_id?: string | null;
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
): Promise<{
  ok: boolean;
  reason?: string;
  appointment_id?: string;
  starts_at?: string;
  ends_at?: string;
  buffer_minutes?: number;
  service_name?: string;
  professional_name?: string | null;
  client_name?: string;
  client_phone?: string;
}> {
  if (!data.starts_at || (!data.service_name && !data.service_id)) {
    console.warn("[booking create] missing_fields", {
      has_starts_at: !!data.starts_at,
      has_service_name: !!data.service_name,
      has_service_id: !!data.service_id,
      payload_keys: Object.keys(data),
    });
    return { ok: false, reason: "missing_fields" };
  }

  // 1. Resolver serviço — preferir service_id quando vier (caminho interno do reschedule),
  // senão buscar por nome (case-insensitive).
  let serviceRow: ServiceLite | null = null;
  if (data.service_id) {
    const { data: s } = await supabaseAdmin
      .from("services")
      .select("id,name,duration_minutes,price_cents,buffer_minutes")
      .eq("id", data.service_id)
      .eq("owner_user_id", profile.id)
      .maybeSingle();
    serviceRow = s ?? null;
  }
  if (!serviceRow && data.service_name) {
    const { data: s } = await supabaseAdmin
      .from("services")
      .select("id,name,duration_minutes,price_cents,buffer_minutes")
      .eq("owner_user_id", profile.id)
      .ilike("name", data.service_name)
      .maybeSingle();
    serviceRow = s ?? null;
  }
  if (!serviceRow) return { ok: false, reason: "service_not_found" };

  const tzCreate = profile.business_timezone || "America/Sao_Paulo";
  const startsAt = parseAiDate(data.starts_at, tzCreate);
  if (!startsAt) return { ok: false, reason: "bad_date" };
  const endsAt = new Date(startsAt.getTime() + serviceRow.duration_minutes * 60_000);
  const bufferMinutes = serviceRow.buffer_minutes ?? 0;
  const bufferMs = bufferMinutes * 60_000;

  // 2. Profissional. Se a IA não passou um: com exatamente 1 ativo, atribui
  //    automaticamente; com 0, segue sem profissional (negócio sem
  //    profissionais cadastrados — comportamento pré-existente e legítimo);
  //    com 2+ ativos e nenhum informado, RECUSA a criação — criar com
  //    professional_id null nesse caso pularia o anti-conflito de horário
  //    inteiro (bug de segurança: permitia sobrepor agendamentos do mesmo
  //    profissional sem checagem nenhuma).
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
      .eq("is_active", true);
    if (pros && pros.length === 1) professional = pros[0];
    else if (pros && pros.length >= 2) {
      return { ok: false, reason: "professional_required" };
    }
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

  // 4. Anti-conflito — janela inflada pelo buffer do serviço sendo criado
  // agora, dos dois lados do seu próprio horário.
  if (professional) {
    const { data: conflict } = await supabaseAdmin
      .from("appointments")
      .select("id")
      .eq("owner_user_id", profile.id)
      .eq("professional_id", professional.id)
      .lt("starts_at", new Date(endsAt.getTime() + bufferMs).toISOString())
      .gt("ends_at", new Date(startsAt.getTime() - bufferMs).toISOString())
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
      client_name: resolvedName || null,
    })
    .select("id,starts_at,ends_at")
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

  // 7. Confirmação WA (pode ser suprimida quando chamado dentro do reschedule
  // ou de um lote — nesse caso quem manda a mensagem é quem chamou)
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

  return {
    ok: true,
    appointment_id: appt.id,
    starts_at: appt.starts_at,
    ends_at: appt.ends_at,
    buffer_minutes: bufferMinutes,
    service_name: serviceRow.name,
    professional_name: professional?.name ?? null,
    client_name: resolvedName || "Cliente",
    client_phone: resolvedPhone,
  };
}

type BatchItemInput = Parameters<typeof createAppointmentFromAI>[0];
type BatchItemResult = Awaited<ReturnType<typeof createAppointmentFromAI>> & {
  requested_starts_at?: string;
  requested_item: BatchItemInput;
};

// Cria N agendamentos pedidos no mesmo turno de conversa (ex.: cliente pede
// um horário pra ele e um pra um familiar). Corrige o bug relatado onde a IA
// "confirmava" 2 agendamentos mas só 1 era criado de fato: aqui cada item é
// realmente executado, e a mensagem final ao cliente (sendBookingConfirmationBatch)
// reflete exatamente o que foi persistido — nunca promete mais do que aconteceu.
//
// Itens que pedem o MESMO profissional + MESMO horário nominal são agrupados
// e encadeados sequencialmente (o 2º começa onde o 1º termina, considerando
// duração + buffer do serviço) — evita literalmente sobrepor dois
// atendimentos no mesmo instante. Itens com horários já distintos entre si
// não são tocados.
export async function createAppointmentBatchFromAI(
  items: BatchItemInput[],
  profile: { id: string; business_timezone: string | null; business_name: string | null },
): Promise<{
  results: BatchItemResult[];
  allFailed: boolean;
  anyFailed: boolean;
  summaryTextForAi: string;
}> {
  const groupKey = (it: BatchItemInput) => `${it.professional_id ?? "auto"}|${it.starts_at ?? ""}`;
  const groups = new Map<string, number[]>();
  items.forEach((it, idx) => {
    const key = groupKey(it);
    const arr = groups.get(key) ?? [];
    arr.push(idx);
    groups.set(key, arr);
  });

  const results: BatchItemResult[] = new Array(items.length);

  // Processa grupo por grupo, e dentro de cada grupo em ordem — sequencial
  // (não Promise.all) de propósito: cada criação precisa estar persistida
  // antes da próxima decidir seu horário/checar conflito.
  for (const idxs of groups.values()) {
    let cursorIso: string | undefined;
    for (const idx of idxs) {
      const original = items[idx];
      const payload: BatchItemInput = { ...original, silent: true };
      if (cursorIso) payload.starts_at = cursorIso;
      const r = await createAppointmentFromAI(payload, profile);
      results[idx] = { ...r, requested_starts_at: payload.starts_at, requested_item: original };
      if (r.ok && r.ends_at) {
        const bufferMs = (r.buffer_minutes ?? 0) * 60_000;
        cursorIso = new Date(new Date(r.ends_at).getTime() + bufferMs).toISOString();
      }
      // Falhou (ex.: slot_taken): não avança o cursor — o próximo item do
      // grupo tenta o horário nominal original (ou o último cursor válido).
    }
  }

  const allFailed = results.every((r) => !r.ok);
  const anyFailed = results.some((r) => !r.ok);

  if (results.some((r) => r.ok)) {
    await sendBookingConfirmationBatch({ profile, results });
  }

  const okCount = results.filter((r) => r.ok).length;
  const summaryTextForAi =
    anyFailed && !allFailed
      ? `Consegui agendar ${okCount} de ${results.length} — já te mando os detalhes.`
      : "Pronto, agendado!";

  return { results, allFailed, anyFailed, summaryTextForAi };
}

// Mensagem única agregada ao cliente com TODOS os agendamentos do lote —
// reflete os horários REAIS atribuídos (já ajustados/encadeados quando
// aplicável) e avisa explicitamente qualquer item que não pôde ser criado.
async function sendBookingConfirmationBatch(args: {
  profile: { id: string; business_name: string | null; business_timezone: string | null };
  results: BatchItemResult[];
}) {
  const { profile, results } = args;
  try {
    const tpl = await loadTemplate(profile.id, "booking_confirmed");
    if (!tpl.enabled) return;
    const instanceName = await getConnectedInstance(profile.id);
    if (!instanceName) return;
    const tz = profile.business_timezone || "America/Sao_Paulo";

    const okResults = results.filter((r) => r.ok && r.starts_at);
    if (okResults.length === 0) return;
    const phone = normalizePhone(okResults[0].client_phone ?? "");
    if (!phone) return;
    const cliente = okResults[0].client_name || "Cliente";

    const linhas = okResults.map(
      (r) =>
        `- ${r.service_name} para ${r.client_name || cliente} às ${formatTimeBR(r.starts_at!, tz)} do dia ${formatDateBR(r.starts_at!, tz)}${r.professional_name ? ` com ${r.professional_name}` : ""}`,
    );
    const falhas = results.filter((r) => !r.ok);
    for (const f of falhas) {
      const nomeServico = f.requested_item?.service_name ?? "um dos serviços";
      linhas.push(
        `⚠️ Não consegui agendar: ${nomeServico} (${f.reason === "slot_taken" ? "horário ficou ocupado" : "não deu pra confirmar"}) — me avise se quiser tentar outro horário.`,
      );
    }

    const msg = renderTemplate(BOOKING_CONFIRMED_BATCH_DEFAULT, {
      cliente,
      negocio: profile.business_name ?? "nosso estabelecimento",
      lista: linhas.join("\n"),
    });
    await evo.sendText(instanceName, { number: phone, text: msg });
  } catch (e) {
    console.warn("[booking] confirmação em lote WhatsApp falhou:", (e as Error)?.message ?? e);
  }
}

// Reagendamento via IA: cancela o antigo + cria um novo (mesmo serviço, profissional
// e contato), com rollback se a criação falhar. Reaproveita os fluxos que já funcionam.
export async function rescheduleAppointmentFromAI(
  data: { appointment_id?: string; new_starts_at?: string; contact_id?: string | null },
  profile: { id: string; business_timezone: string | null; business_name: string | null },
): Promise<{ ok: boolean; reason?: string }> {
  const tzR = profile.business_timezone || "America/Sao_Paulo";
  if (!data.new_starts_at) return { ok: false, reason: "missing_fields" };
  const newStart = parseAiDate(data.new_starts_at, tzR);
  if (!newStart) return { ok: false, reason: "bad_date" };
  if (newStart.getTime() < Date.now() - 60_000) return { ok: false, reason: "past_date" };

  // 1. Resolve appointment_id — se a IA não mandou, ou mandou um cancelado/
  // concluído/de outro contato, tentamos achar o ativo do contato atual.
  let apptId = data.appointment_id ?? "";
  let needsResolve = !apptId;
  if (apptId) {
    const { data: check } = await supabaseAdmin
      .from("appointments")
      .select("id,status,contact_id")
      .eq("id", apptId)
      .eq("owner_user_id", profile.id)
      .maybeSingle();
    if (!check) needsResolve = true;
    else if (check.status === "cancelled" || check.status === "completed") needsResolve = true;
    else if (data.contact_id && check.contact_id && check.contact_id !== data.contact_id)
      needsResolve = true;
  }
  if (needsResolve) {
    const r = await resolveActiveAppointment(profile.id, data.contact_id ?? null);
    if (r.kind === "none") return { ok: false, reason: "no_active_appointment" };
    if (r.kind === "many") return { ok: false, reason: "ambiguous_appointment" };
    apptId = r.id;
  }

  const { data: apptRaw } = await supabaseAdmin
    .from("appointments")
    .select(
      "id, contact_id, professional_id, service_id, status, starts_at, " +
        "services(id,name,duration_minutes,price_cents), " +
        "contacts(name,phone)",
    )
    .eq("id", apptId)
    .eq("owner_user_id", profile.id)
    .maybeSingle();
  const oldAppt = apptRaw as any;
  if (!oldAppt) return { ok: false, reason: "appointment_not_found" };
  if (oldAppt.status === "cancelled") return { ok: false, reason: "already_cancelled" };
  const oldStartsAt = oldAppt.starts_at as string;

  // Normaliza embed: PostgREST pode devolver o relacionamento como objeto OU array
  // dependendo de como ele resolve a FK. Sem isso, svc.name vira undefined e
  // cascateia como "missing_fields" em createAppointmentFromAI.
  const svcRaw = oldAppt.services as ServiceLite | ServiceLite[] | null;
  let svc: ServiceLite | null = Array.isArray(svcRaw) ? (svcRaw[0] ?? null) : svcRaw;
  const contactRaw = oldAppt.contacts as
    { name: string; phone: string } | { name: string; phone: string }[] | null;
  const contact = Array.isArray(contactRaw) ? (contactRaw[0] ?? null) : contactRaw;

  console.log("[booking reschedule] oldAppt shape", {
    appt_id: oldAppt.id,
    services_is_array: Array.isArray(svcRaw),
    service_id: oldAppt.service_id,
    service_name: svc?.name ?? null,
    contact_present: !!contact,
  });

  // Fallback: se o embed falhou (sem name/duration), busca direto pela FK.
  if ((!svc || !svc.name || !svc.duration_minutes) && oldAppt.service_id) {
    const { data: fetched } = await supabaseAdmin
      .from("services")
      .select("id,name,duration_minutes,price_cents")
      .eq("id", oldAppt.service_id)
      .eq("owner_user_id", profile.id)
      .maybeSingle();
    if (fetched) svc = fetched as ServiceLite;
  }
  if (!svc) return { ok: false, reason: "service_missing" };

  // 2. Cancela o antigo (silencioso — sem WhatsApp de cancelamento)
  const cancelRes = await cancelAppointmentFromAI(
    {
      appointment_id: oldAppt.id,
      contact_id: data.contact_id ?? null,
      reason: "reagendamento",
      silent: true,
    },
    profile,
  );
  if (!cancelRes.ok) return { ok: false, reason: `cancel:${cancelRes.reason ?? "failed"}` };

  // 3. Cria o novo no horário pedido (silencioso — não envia confirmação normal)
  const createRes = await createAppointmentFromAI(
    {
      service_id: svc.id,
      service_name: svc.name,
      professional_id: oldAppt.professional_id ?? null,
      starts_at: newStart.toISOString(),
      client_name: contact?.name ?? "",
      client_phone: contact?.phone ?? "",
      contact_id: oldAppt.contact_id ?? null,
      notes: `Reagendado de ${oldStartsAt}`,
      silent: true,
    },
    profile,
  );

  if (!createRes.ok) {
    // 3a. ROLLBACK — reverte o cancelamento para o estado anterior.
    await supabaseAdmin
      .from("appointments")
      .update({
        status: cancelRes.previous_status ?? "scheduled",
        notes: cancelRes.previous_notes ?? "",
      })
      .eq("id", oldAppt.id)
      .eq("owner_user_id", profile.id);
    return { ok: false, reason: `create:${createRes.reason ?? "failed"}` };
  }

  // 4. Envia a única mensagem de reagendamento (antigo → novo).
  if (contact) {
    await sendBookingReschedule({
      profile: {
        id: profile.id,
        business_name: profile.business_name,
        business_timezone: profile.business_timezone,
      },
      appointment: {
        id: createRes.appointment_id ?? oldAppt.id,
        starts_at: newStart.toISOString(),
      },
      service: svc,
      professional: null,
      client: contact
        ? { client_name: contact.name, client_phone: contact.phone }
        : { client_name: "Cliente", client_phone: "" },
    });
  }
  return { ok: true };
}

// Cancelamento via IA: marca appointment como cancelled.
export async function cancelAppointmentFromAI(
  data: { appointment_id?: string; reason?: string; contact_id?: string | null; silent?: boolean },
  profile: { id: string; business_timezone: string | null; business_name: string | null },
): Promise<{ ok: boolean; reason?: string; previous_status?: string; previous_notes?: string }> {
  // Resolve appointment_id quando a IA não mandou ou mandou um inválido/cancelado.
  let cancelId = data.appointment_id ?? "";
  let needsResolve = !cancelId;
  if (cancelId) {
    const { data: check } = await supabaseAdmin
      .from("appointments")
      .select("id,status,contact_id")
      .eq("id", cancelId)
      .eq("owner_user_id", profile.id)
      .maybeSingle();
    if (!check) needsResolve = true;
    else if (check.status === "cancelled" || check.status === "completed") needsResolve = true;
    else if (data.contact_id && check.contact_id && check.contact_id !== data.contact_id)
      needsResolve = true;
  }
  if (needsResolve) {
    const r = await resolveActiveAppointment(profile.id, data.contact_id ?? null);
    if (r.kind === "none") return { ok: false, reason: "no_active_appointment" };
    if (r.kind === "many") return { ok: false, reason: "ambiguous_appointment" };
    cancelId = r.id;
  }

  const { data: apptRaw } = await supabaseAdmin
    .from("appointments")
    .select(
      "id, contact_id, status, starts_at, notes, " +
        "services(id,name,duration_minutes,price_cents), " +
        "contacts(name,phone)",
    )
    .eq("id", cancelId)
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
