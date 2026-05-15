import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

async function assertSuperAdmin(userId: string) {
  const { data } = await supabaseAdmin
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "super_admin")
    .maybeSingle();
  if (!data) throw new Error("Acesso negado");
}

const SETTING_KEYS = [
  "gemini_api_key",
  "gemini_model",
  "gemini_temperature",
  "gemini_max_tokens",
  "ai_base_prompt",
] as const;

// ============= READ GLOBAL SETTINGS =============
export const getAiGlobalSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertSuperAdmin(context.userId);
    const { data } = await supabaseAdmin
      .from("global_settings")
      .select("key,value,description")
      .in("key", SETTING_KEYS as unknown as string[]);
    const map: Record<string, { value: string; description: string | null }> = {};
    for (const r of data ?? []) {
      map[r.key] = { value: r.value ?? "", description: r.description ?? null };
    }
    return { settings: map };
  });

// ============= UPDATE GLOBAL SETTINGS =============
export const updateAiGlobalSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        gemini_api_key: z.string().optional(),
        gemini_model: z.string().min(1).max(100).optional(),
        gemini_temperature: z.string().optional(),
        gemini_max_tokens: z.string().optional(),
        ai_base_prompt: z.string().min(1).max(20000).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertSuperAdmin(context.userId);
    const rows = Object.entries(data)
      .filter(([_, v]) => v !== undefined)
      .map(([key, value]) => ({
        key,
        value: String(value),
        updated_at: new Date().toISOString(),
      }));
    if (rows.length === 0) return { ok: true };
    const { error } = await supabaseAdmin.from("global_settings").upsert(rows);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ============= TEST GEMINI =============
export const testGeminiConnection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertSuperAdmin(context.userId);
    const { data } = await supabaseAdmin
      .from("global_settings")
      .select("key,value")
      .in("key", ["gemini_api_key", "gemini_model"]);
    const map = Object.fromEntries((data ?? []).map((r) => [r.key, r.value ?? ""]));
    const apiKey = map.gemini_api_key;
    const model = map.gemini_model || "gemini-1.5-flash";
    if (!apiKey) return { ok: false, error: "API key não configurada" };
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: "ping" }] }],
          generationConfig: { maxOutputTokens: 5 },
        }),
      });
      if (!res.ok) {
        const t = await res.text();
        return { ok: false, error: `HTTP ${res.status}: ${t.slice(0, 200)}` };
      }
      return { ok: true, model };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : String(e) };
    }
  });

// ============= LIST SEGMENTS =============
export const listAiSegments = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertSuperAdmin(context.userId);
    const { data: segments } = await supabaseAdmin
      .from("ai_segments")
      .select("*")
      .order("sort_order", { ascending: true });
    // Contagem de workspaces por segmento
    const { data: counts } = await supabaseAdmin
      .from("profiles")
      .select("segment_id");
    const countMap = new Map<string, number>();
    for (const r of counts ?? []) {
      if (r.segment_id) countMap.set(r.segment_id, (countMap.get(r.segment_id) ?? 0) + 1);
    }
    return {
      segments: (segments ?? []).map((s) => ({
        ...s,
        workspace_count: countMap.get(s.id) ?? 0,
      })),
    };
  });

const SegmentInputSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().min(1).max(120),
  slug: z.string().min(1).max(80).regex(/^[a-z0-9_]+$/),
  description: z.string().max(500).optional().nullable(),
  icon: z.string().max(8).optional(),
  is_active: z.boolean().optional(),
  sort_order: z.number().int().min(0).max(999).optional(),
  segment_prompt: z.string().min(1).max(20000),
  default_assistant_name: z.string().max(80).optional(),
  default_tone: z.string().max(40).optional(),
  default_transfer_keywords: z.array(z.string().max(40)).max(40).optional(),
  default_transfer_after_messages: z.number().int().min(1).max(50).optional(),
  suggested_services: z
    .array(
      z.object({
        name: z.string().min(1).max(120),
        duration_minutes: z.number().int().min(1).max(1440),
        price_cents: z.number().int().min(0).max(100_000_00),
      }),
    )
    .max(50)
    .optional(),
});

// ============= UPSERT SEGMENT =============
export const upsertAiSegment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => SegmentInputSchema.parse(input))
  .handler(async ({ data, context }) => {
    await assertSuperAdmin(context.userId);
    const payload = {
      ...data,
      suggested_services: data.suggested_services ?? [],
      updated_at: new Date().toISOString(),
    };
    if (data.id) {
      const { error } = await supabaseAdmin
        .from("ai_segments")
        .update(payload)
        .eq("id", data.id);
      if (error) throw new Error(error.message);
      return { ok: true, id: data.id };
    }
    const { data: ins, error } = await supabaseAdmin
      .from("ai_segments")
      .insert(payload)
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { ok: true, id: ins.id };
  });

// ============= TOGGLE SEGMENT ACTIVE =============
export const toggleAiSegment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ id: z.string().uuid(), active: z.boolean() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertSuperAdmin(context.userId);
    const { error } = await supabaseAdmin
      .from("ai_segments")
      .update({ is_active: data.active, updated_at: new Date().toISOString() })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ============= AI USAGE METRICS =============
export const getAiUsageMetrics = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertSuperAdmin(context.userId);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
    const last30 = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const [{ count: msgsToday }, { data: monthRows }, { data: dailyRows }, { count: aiActive }] =
      await Promise.all([
        supabaseAdmin
          .from("ai_usage_logs")
          .select("id", { count: "exact", head: true })
          .gte("created_at", today.toISOString()),
        supabaseAdmin
          .from("ai_usage_logs")
          .select("tokens_total,cost_estimate_cents")
          .gte("created_at", monthStart.toISOString()),
        supabaseAdmin
          .from("ai_usage_logs")
          .select("created_at")
          .gte("created_at", last30.toISOString())
          .order("created_at", { ascending: true }),
        supabaseAdmin
          .from("profiles")
          .select("id", { count: "exact", head: true })
          .eq("ai_enabled", true),
      ]);

    const tokensMonth = (monthRows ?? []).reduce((a, r) => a + (r.tokens_total ?? 0), 0);
    const costCents = (monthRows ?? []).reduce((a, r) => a + (r.cost_estimate_cents ?? 0), 0);

    // bucket por dia
    const buckets = new Map<string, number>();
    for (const r of dailyRows ?? []) {
      const d = new Date(r.created_at).toISOString().slice(0, 10);
      buckets.set(d, (buckets.get(d) ?? 0) + 1);
    }
    const daily = Array.from(buckets.entries()).map(([date, count]) => ({ date, count }));

    // top workspaces
    const { data: usage } = await supabaseAdmin
      .from("ai_usage_logs")
      .select("workspace_owner_id,tokens_total")
      .gte("created_at", monthStart.toISOString());
    const wsMap = new Map<string, number>();
    for (const r of usage ?? []) {
      wsMap.set(r.workspace_owner_id, (wsMap.get(r.workspace_owner_id) ?? 0) + (r.tokens_total ?? 0));
    }
    const top = [...wsMap.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10);
    const topIds = top.map((t) => t[0]);
    const emails = await Promise.all(
      topIds.map(async (id) => {
        const { data: u } = await supabaseAdmin.auth.admin.getUserById(id);
        return [id, u?.user?.email ?? null] as const;
      }),
    );
    const emailMap = new Map(emails);

    return {
      messages_today: msgsToday ?? 0,
      tokens_month: tokensMonth,
      cost_month_usd: (costCents / 100).toFixed(2),
      ai_active_workspaces: aiActive ?? 0,
      daily,
      top_workspaces: top.map(([id, tokens]) => ({
        workspace_owner_id: id,
        email: emailMap.get(id) ?? null,
        tokens_total: tokens,
      })),
    };
  });
