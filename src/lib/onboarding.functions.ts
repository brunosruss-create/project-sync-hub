import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export type BusinessHours = Record<
  string,
  { active: boolean; start: string; end: string }
>;

function readOutOfHoursEnabled(row: any, direct?: boolean | null): boolean {
  if (typeof direct === "boolean") return direct;
  const marker = row?.ai_working_hours?.__out_of_hours?.enabled;
  // Default seguro: false. Se o usuario nunca configurou explicitamente,
  // NAO enviamos a mensagem fora do horario (evita spam).
  return typeof marker === "boolean" ? marker : false;
}

function mergeOutOfHoursMarker(hours: unknown, enabled: boolean) {
  const base = hours && typeof hours === "object" && !Array.isArray(hours) ? hours : {};
  return { ...base, __out_of_hours: { enabled } };
}

// ============= LIST PUBLIC ACTIVE SEGMENTS (onboarding) =============
export const listActiveSegments = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const { data } = await supabaseAdmin
      .from("ai_segments")
      .select(
        "id,name,slug,description,icon,sort_order,default_assistant_name,suggested_services",
      )
      .eq("is_active", true)
      .order("sort_order", { ascending: true });
    return { segments: data ?? [] };
  });

// ============= GET ONBOARDING STATUS =============
export const getOnboardingStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data } = await supabaseAdmin
      .from("profiles")
      .select("onboarding_completed,segment_id,business_name")
      .eq("id", context.userId)
      .maybeSingle();
    return {
      completed: data?.onboarding_completed ?? false,
      segment_id: data?.segment_id ?? null,
      business_name: data?.business_name ?? null,
    };
  });

// ============= COMPLETE ONBOARDING =============
export const completeOnboarding = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        business_name: z.string().min(1).max(120),
        business_description: z.string().max(500).optional(),
        segment_id: z.string().uuid(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const userId = context.userId;

    const { data: segment } = await supabaseAdmin
      .from("ai_segments")
      .select(
        "id,default_assistant_name,default_tone,default_transfer_keywords,default_transfer_after_messages,suggested_services",
      )
      .eq("id", data.segment_id)
      .maybeSingle();
    if (!segment) throw new Error("Segmento inválido");

    // Update profile com defaults do segmento + ativa IA
    const { error: pErr } = await supabaseAdmin
      .from("profiles")
      .update({
        onboarding_completed: true,
        business_name: data.business_name,
        business_description: data.business_description ?? null,
        segment_id: segment.id,
        ai_enabled: true,
        ai_assistant_name: segment.default_assistant_name ?? "Sofia",
        ai_tone: segment.default_tone ?? "Amigável",
        ai_transfer_keywords:
          segment.default_transfer_keywords ?? ["humano", "atendente", "reclamação"],
        ai_transfer_after_messages: segment.default_transfer_after_messages ?? 5,
      })
      .eq("id", userId);
    if (pErr) throw new Error(pErr.message);

    // Cria serviços sugeridos (se não houver nenhum ainda)
    const { count: existingCount } = await supabaseAdmin
      .from("services")
      .select("id", { count: "exact", head: true })
      .eq("owner_user_id", userId);

    const suggested = Array.isArray(segment.suggested_services)
      ? (segment.suggested_services as Array<{
          name: string;
          duration_minutes: number;
          price_cents: number;
        }>)
      : [];

    let createdServices = 0;
    if ((existingCount ?? 0) === 0 && suggested.length > 0) {
      const rows = suggested.map((s) => ({
        owner_user_id: userId,
        name: s.name,
        description: "",
        duration_minutes: s.duration_minutes,
        price_cents: s.price_cents,
        emoji: "🔧",
        color: "#25C880",
        status: "active",
      }));
      const { error: sErr, count } = await supabaseAdmin
        .from("services")
        .insert(rows, { count: "exact" });
      if (!sErr) createdServices = count ?? rows.length;
    }

    return { ok: true, services_created: createdServices };
  });

// ============= GET WORKSPACE AI CONFIG (for /ai-agent page) =============
export const getWorkspaceAiConfig = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data } = await supabaseAdmin
      .from("profiles")
      .select(
        "ai_enabled,ai_assistant_name,ai_tone,ai_custom_prompt,ai_transfer_keywords,ai_transfer_after_messages,ai_schedule_enabled,ai_schedule_instruction,ai_working_hours,ai_out_of_hours_message,ai_enabled_service_ids,ai_timezone,business_name,business_description,business_timezone,segment_id,ai_introduce_by_name,ai_declare_as_ai,ai_mention_business_name,ai_has_multiple_professionals,ai_price_disclosure_policy,ai_can_reschedule,ai_can_cancel,ai_min_advance_hours,ai_required_fields,ai_max_questions_per_message",
      )
      .eq("id", context.userId)
      .maybeSingle();
    const { data: outOfHoursToggle } = await supabaseAdmin
      .from("profiles")
      .select("ai_out_of_hours_enabled")
      .eq("id", context.userId)
      .maybeSingle();
    let segment: {
      id: string;
      name: string;
      icon: string | null;
      segment_prompt: string;
    } | null = null;
    if (data?.segment_id) {
      const { data: s } = await supabaseAdmin
        .from("ai_segments")
        .select("id,name,icon,segment_prompt")
        .eq("id", data.segment_id)
        .maybeSingle();
      segment = s ?? null;
    }
    return {
      config: data
        ? {
            ...data,
            ai_out_of_hours_enabled:
              readOutOfHoursEnabled(data, outOfHoursToggle?.ai_out_of_hours_enabled),
          }
        : data,
      segment,
    };
  });

// ============= UPDATE WORKSPACE AI CONFIG =============
export const updateWorkspaceAiConfig = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        ai_enabled: z.boolean().optional(),
        ai_assistant_name: z.string().max(80).optional(),
        ai_tone: z.string().max(40).optional(),
        ai_custom_prompt: z.string().max(8000).optional().nullable(),
        ai_transfer_keywords: z.array(z.string().max(40)).max(40).optional(),
        ai_transfer_after_messages: z.number().int().min(1).max(50).optional(),
        ai_schedule_enabled: z.boolean().optional(),
        ai_schedule_instruction: z.string().max(2000).optional().nullable(),
        ai_working_hours: z.record(z.string(), z.any()).optional(),
        ai_out_of_hours_enabled: z.boolean().optional(),
        ai_out_of_hours_message: z.string().max(1000).optional(),
        ai_enabled_service_ids: z.array(z.string().uuid()).max(200).optional(),
        ai_timezone: z.string().min(1).max(64).optional(),
        // Comportamento (novos)
        ai_introduce_by_name: z.boolean().optional(),
        ai_declare_as_ai: z.boolean().optional(),
        ai_mention_business_name: z.boolean().optional(),
        ai_has_multiple_professionals: z.boolean().optional(),
        ai_price_disclosure_policy: z
          .enum(["always", "on_request", "never"])
          .optional(),
        ai_can_reschedule: z.boolean().optional(),
        ai_can_cancel: z.boolean().optional(),
        ai_min_advance_hours: z.number().int().min(0).max(720).optional(),
        ai_required_fields: z.array(z.string().max(64)).max(40).optional(),
        ai_max_questions_per_message: z.number().int().min(1).max(5).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    // Se o usuario mexeu no toggle "fora do horario", garantimos que tanto
    // a coluna real quanto o marcador no JSON ai_working_hours fiquem
    // sincronizados. Isso protege contra o caso da coluna nao existir
    // ainda no banco (fallback) e contra divergencias entre as 2 telas.
    const payload: Record<string, unknown> = { ...data };
    if (typeof data.ai_out_of_hours_enabled === "boolean") {
      payload.ai_working_hours = mergeOutOfHoursMarker(
        data.ai_working_hours ?? null,
        data.ai_out_of_hours_enabled,
      );
    }
    const { error } = await supabaseAdmin
      .from("profiles")
      .update(payload)
      .eq("id", context.userId);
    if (error && "ai_out_of_hours_enabled" in payload) {
      // Coluna nao existe no banco -> grava apenas no JSON.
      const { ai_out_of_hours_enabled: _omit, ...fallbackData } = payload;
      const { error: fallbackError } = await supabaseAdmin
        .from("profiles")
        .update(fallbackData)
        .eq("id", context.userId);
      if (!fallbackError && error.message.includes("ai_out_of_hours_enabled")) {
        return { ok: true };
      }
    }
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ============= GET WORKSPACE PROFILE (settings/workspace page) =============
export const getWorkspaceProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data } = await supabaseAdmin
      .from("profiles")
      .select(
        "business_name,business_description,segment_id,business_hours,business_timezone,welcome_message,ai_working_hours,business_address,business_phone,business_website,business_logo_url,business_cep,business_street,business_address_number,business_address_complement,business_neighborhood,business_city,business_state,booking_slug,booking_enabled,booking_title,booking_description,booking_service_ids",
      )
      .eq("id", context.userId)
      .maybeSingle();
    // welcome_message_enabled e uma coluna nova; lemos em select separado
    // para tolerar o caso da migration ainda nao ter rodado.
    let welcomeEnabled = false;
    {
      const { data: row, error } = await supabaseAdmin
        .from("profiles")
        .select("welcome_message_enabled")
        .eq("id", context.userId)
        .maybeSingle();
      if (!error && row && typeof (row as any).welcome_message_enabled === "boolean") {
        welcomeEnabled = (row as any).welcome_message_enabled;
      }
    }
    return {
      business_name: data?.business_name ?? "",
      business_description: data?.business_description ?? "",
      segment_id: data?.segment_id ?? null,
      business_hours: (data?.business_hours as BusinessHours | null) ?? null,
      business_timezone: data?.business_timezone ?? "America/Sao_Paulo",
      welcome_message: data?.welcome_message ?? "",
      welcome_message_enabled: welcomeEnabled,
      business_address: data?.business_address ?? "",
      business_phone: data?.business_phone ?? "",
      business_website: data?.business_website ?? "",
      business_logo_url: data?.business_logo_url ?? "",
      business_cep: (data as any)?.business_cep ?? "",
      business_street: (data as any)?.business_street ?? "",
      business_address_number: (data as any)?.business_address_number ?? "",
      business_address_complement: (data as any)?.business_address_complement ?? "",
      business_neighborhood: (data as any)?.business_neighborhood ?? "",
      business_city: (data as any)?.business_city ?? "",
      business_state: (data as any)?.business_state ?? "",
      booking_slug: (data as any)?.booking_slug ?? null,
      booking_enabled: (data as any)?.booking_enabled ?? false,
      booking_title: (data as any)?.booking_title ?? "",
      booking_description: (data as any)?.booking_description ?? "",
      booking_service_ids: ((data as any)?.booking_service_ids as string[] | null) ?? [],
      booking_ai_send: await (async () => {
        const { data: row } = await supabaseAdmin
          .from("profiles")
          .select("booking_ai_send")
          .eq("id", context.userId)
          .maybeSingle();
        const v = (row as any)?.booking_ai_send;
        return typeof v === "boolean" ? v : true;
      })(),
    };
  });

// ============= UPDATE BOOKING CONFIG =============
export const updateBookingConfig = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        booking_enabled: z.boolean().optional(),
        booking_slug: z
          .string()
          .min(3)
          .max(60)
          .regex(/^[a-z0-9-]+$/, "Use apenas letras minúsculas, números e hífens")
          .optional(),
        booking_title: z.string().max(120).optional(),
        booking_description: z.string().max(500).optional(),
        booking_service_ids: z.array(z.string()).max(200).optional(),
        booking_ai_send: z.boolean().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { booking_ai_send, ...profileUpdate } = data;
    // Se mudou slug, garantir unicidade
    if (data.booking_slug) {
      const { data: clash } = await supabaseAdmin
        .from("profiles")
        .select("id")
        .eq("booking_slug", data.booking_slug)
        .neq("id", context.userId)
        .maybeSingle();
      if (clash) throw new Error("Esse link já está em uso. Escolha outro.");
    }
    const { error } = await supabaseAdmin
      .from("profiles")
      .update(profileUpdate)
      .eq("id", context.userId);
    if (error) throw new Error(error.message);
    if (typeof booking_ai_send === "boolean") {
      const { error: aiSendError } = await supabaseAdmin
        .from("profiles")
        .update({ booking_ai_send })
        .eq("id", context.userId);
      if (aiSendError && !aiSendError.message.includes("booking_ai_send")) {
        throw new Error(aiSendError.message);
      }
    }
    return { ok: true };
  });

const HoursSchema = z
  .record(
    z.string(),
    z.object({
      active: z.boolean(),
      start: z.string().regex(/^\d{2}:\d{2}$/),
      end: z.string().regex(/^\d{2}:\d{2}$/),
    }),
  )
  .optional();

// ============= UPDATE WORKSPACE PROFILE =============
// Salva nome, segmento, horários do negócio, fuso e mensagem de boas-vindas.
// Para trocar segmento aplicando defaults da IA use updateWorkspaceSegmentWithDefaults.
export const updateWorkspaceProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        business_name: z.string().min(1).max(120),
        segment_id: z.string().uuid(),
        business_hours: HoursSchema,
        business_timezone: z.string().min(1).max(64).optional(),
        welcome_message: z.string().max(2000).optional(),
        welcome_message_enabled: z.boolean().optional(),
        business_address: z.string().max(300).optional(),
        business_phone: z.string().max(40).optional(),
        business_website: z.string().max(300).optional(),
        business_logo_url: z.string().max(500).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: seg } = await supabaseAdmin
      .from("ai_segments")
      .select("id")
      .eq("id", data.segment_id)
      .eq("is_active", true)
      .maybeSingle();
    if (!seg) throw new Error("Segmento inválido ou inativo");
    const update: Record<string, unknown> = {
      business_name: data.business_name,
      segment_id: data.segment_id,
    };
    if (data.business_hours !== undefined) update.business_hours = data.business_hours;
    if (data.business_timezone !== undefined) {
      update.business_timezone = data.business_timezone;
      // mantém ai_timezone alinhado quando o usuário não setou um diferente
      update.ai_timezone = data.business_timezone;
    }
    if (data.welcome_message !== undefined) update.welcome_message = data.welcome_message;
    if (data.welcome_message_enabled !== undefined) {
      update.welcome_message_enabled = data.welcome_message_enabled;
    }
    if (data.business_address !== undefined) update.business_address = data.business_address;
    if (data.business_phone !== undefined) update.business_phone = data.business_phone;
    if (data.business_website !== undefined) update.business_website = data.business_website;
    if (data.business_logo_url !== undefined) update.business_logo_url = data.business_logo_url;
    const { error } = await supabaseAdmin
      .from("profiles")
      .update(update)
      .eq("id", context.userId);
    if (error && "welcome_message_enabled" in update) {
      // Coluna ainda nao existe -> remove e tenta de novo sem ela.
      const { welcome_message_enabled: _omit, ...fallbackUpdate } = update;
      const { error: fallbackError } = await supabaseAdmin
        .from("profiles")
        .update(fallbackUpdate)
        .eq("id", context.userId);
      if (!fallbackError && error.message.includes("welcome_message_enabled")) {
        return { ok: true };
      }
    }
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ============= UPDATE SEGMENT + APLICAR DEFAULTS DA IA =============
// Usado ao trocar o segmento: sobrescreve nome do assistente, tom,
// palavras-chave de transferência e contagem de mensagens com os defaults
// do segmento alvo.
export const updateWorkspaceSegmentWithDefaults = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        business_name: z.string().min(1).max(120),
        segment_id: z.string().uuid(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: segment } = await supabaseAdmin
      .from("ai_segments")
      .select(
        "id,default_assistant_name,default_tone,default_transfer_keywords,default_transfer_after_messages",
      )
      .eq("id", data.segment_id)
      .eq("is_active", true)
      .maybeSingle();
    if (!segment) throw new Error("Segmento inválido ou inativo");
    const { error } = await supabaseAdmin
      .from("profiles")
      .update({
        business_name: data.business_name,
        segment_id: segment.id,
        ai_enabled: true,
        ai_assistant_name: segment.default_assistant_name ?? "Sofia",
        ai_tone: segment.default_tone ?? "Amigável",
        ai_transfer_keywords:
          segment.default_transfer_keywords ?? ["humano", "atendente", "reclamação"],
        ai_transfer_after_messages: segment.default_transfer_after_messages ?? 5,
      })
      .eq("id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ============= MÉTRICAS DA IA DO WORKSPACE (página /ai-agent) =============
export const getWorkspaceAiStats = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const since = today.toISOString();
    const [{ count: messages }, { count: transfers }, { count: errors }] =
      await Promise.all([
        supabaseAdmin
          .from("ai_usage_logs")
          .select("id", { count: "exact", head: true })
          .eq("workspace_owner_id", context.userId)
          .eq("action", "send_message")
          .gte("created_at", since),
        supabaseAdmin
          .from("ai_usage_logs")
          .select("id", { count: "exact", head: true })
          .eq("workspace_owner_id", context.userId)
          .eq("action", "transfer_to_human")
          .gte("created_at", since),
        supabaseAdmin
          .from("ai_usage_logs")
          .select("id", { count: "exact", head: true })
          .eq("workspace_owner_id", context.userId)
          .eq("action", "error")
          .gte("created_at", since),
      ]);
    return {
      messages_today: messages ?? 0,
      transfers_today: transfers ?? 0,
      errors_today: errors ?? 0,
    };
  });
