// Observabilidade do módulo AI_Content_Generation — só super_admin.
// Lista Content_Jobs recentes cross-workspace com duração, provedores e custo.

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
  if (!data) throw new Error("Acesso negado — super_admin apenas");
}

const ListSchema = z.object({
  limit: z.number().int().min(1).max(200).default(50),
  status: z.enum(["pending", "running", "completed", "failed"]).optional(),
});

/**
 * Lista Content_Jobs recentes cross-workspace. Requirement 16.3.
 * Só disponível para super_admin.
 */
export const listContentJobsForOps = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => ListSchema.parse(input))
  .handler(async ({ data, context }) => {
    await assertSuperAdmin(context.userId);

    let query = supabaseAdmin
      .from("content_jobs")
      .select(
        "id,owner_user_id,brief_id,status,stage,error_message,image_provider_used,ai_text_model,cost_estimate_cents,duration_ms,started_at,completed_at,created_at",
      )
      .order("created_at", { ascending: false })
      .limit(data.limit);
    if (data.status) query = query.eq("status", data.status);
    const { data: rows, error } = await query;
    if (error) throw new Error(error.message);

    return {
      jobs: (rows ?? []).map((r) => {
        const row = r as Record<string, unknown>;
        return {
          id: row.id as string,
          ownerUserId: row.owner_user_id as string,
          briefId: row.brief_id as string,
          status: row.status as string,
          stage: (row.stage as string | null) ?? null,
          errorMessage: (row.error_message as string | null) ?? null,
          imageProvider: (row.image_provider_used as string | null) ?? null,
          aiTextModel: (row.ai_text_model as string | null) ?? null,
          costCents: (row.cost_estimate_cents as number) ?? 0,
          durationMs: (row.duration_ms as number | null) ?? null,
          startedAt: row.started_at as string | null,
          completedAt: row.completed_at as string | null,
          createdAt: row.created_at as string,
        };
      }),
    };
  });

/**
 * Sumário de custo agregado — total gasto e distribuição por provedor.
 */
export const getContentCostSummary = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertSuperAdmin(context.userId);
    const { data, error } = await supabaseAdmin
      .from("content_jobs")
      .select("cost_estimate_cents,image_provider_used,status");
    if (error) throw new Error(error.message);
    const rows = (data ?? []) as Array<{
      cost_estimate_cents: number;
      image_provider_used: string | null;
      status: string;
    }>;
    const totalCents = rows.reduce((acc, r) => acc + (r.cost_estimate_cents ?? 0), 0);
    const byProvider = rows.reduce<Record<string, number>>((acc, r) => {
      const p = r.image_provider_used ?? "none";
      acc[p] = (acc[p] ?? 0) + 1;
      return acc;
    }, {});
    const byStatus = rows.reduce<Record<string, number>>((acc, r) => {
      acc[r.status] = (acc[r.status] ?? 0) + 1;
      return acc;
    }, {});
    return {
      totalCents,
      totalJobs: rows.length,
      byProvider,
      byStatus,
    };
  });
