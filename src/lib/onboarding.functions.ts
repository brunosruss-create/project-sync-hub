import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

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

    // Update profile com defaults do segmento
    const { error: pErr } = await supabaseAdmin
      .from("profiles")
      .update({
        onboarding_completed: true,
        business_name: data.business_name,
        business_description: data.business_description ?? null,
        segment_id: segment.id,
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
        "ai_enabled,ai_assistant_name,ai_tone,ai_custom_prompt,ai_transfer_keywords,ai_transfer_after_messages,ai_schedule_enabled,ai_schedule_instruction,ai_working_hours,ai_out_of_hours_message,business_name,business_description,segment_id",
      )
      .eq("id", context.userId)
      .maybeSingle();
    return { config: data };
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
        ai_out_of_hours_message: z.string().max(1000).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { error } = await supabaseAdmin
      .from("profiles")
      .update(data)
      .eq("id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ============= GET WORKSPACE PROFILE (settings/workspace page) =============
export const getWorkspaceProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data } = await supabaseAdmin
      .from("profiles")
      .select("business_name,business_description,segment_id")
      .eq("id", context.userId)
      .maybeSingle();
    return {
      business_name: data?.business_name ?? "",
      business_description: data?.business_description ?? "",
      segment_id: data?.segment_id ?? null,
    };
  });

// ============= UPDATE WORKSPACE PROFILE =============
export const updateWorkspaceProfile = createServerFn({ method: "POST" })
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
    // valida segmento ativo
    const { data: seg } = await supabaseAdmin
      .from("ai_segments")
      .select("id")
      .eq("id", data.segment_id)
      .eq("is_active", true)
      .maybeSingle();
    if (!seg) throw new Error("Segmento inválido ou inativo");
    const { error } = await supabaseAdmin
      .from("profiles")
      .update({
        business_name: data.business_name,
        segment_id: data.segment_id,
      })
      .eq("id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
