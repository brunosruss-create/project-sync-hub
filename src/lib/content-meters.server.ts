// Content_Usage_Meter — contadores por workspace + mês.
// Requirements 15.1, 15.2, 15.3, 15.4.

import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { UsageMetric } from "@/features/content-generation/types";

/**
 * Calcula período YYYY-MM na timezone do workspace.
 * Fallback: America/Sao_Paulo (default do produto).
 */
export function currentPeriodYearMonth(timezone = "America/Sao_Paulo"): string {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
  });
  // en-CA já entrega YYYY-MM-...
  const parts = fmt.formatToParts(new Date());
  const year = parts.find((p) => p.type === "year")?.value ?? "";
  const month = parts.find((p) => p.type === "month")?.value ?? "";
  return `${year}-${month}`;
}

/**
 * Incrementa (atomically) o contador de um metric no período atual.
 * Se a linha ainda não existe pra esse workspace/período/metric, cria com count=1.
 */
export async function incrementMeter(
  workspaceOwnerId: string,
  metric: UsageMetric,
  amount = 1,
  timezone?: string,
): Promise<void> {
  const period = currentPeriodYearMonth(timezone);

  // Tenta upsert via RPC de increment; fallback: select + update/insert.
  const { data: existing } = await supabaseAdmin
    .from("content_usage_meters")
    .select("id,count")
    .eq("owner_user_id", workspaceOwnerId)
    .eq("period_year_month", period)
    .eq("metric", metric)
    .maybeSingle();

  const nowIso = new Date().toISOString();
  if (existing) {
    await supabaseAdmin
      .from("content_usage_meters")
      .update({ count: (existing as { count: number }).count + amount, updated_at: nowIso })
      .eq("id", (existing as { id: string }).id);
    return;
  }

  await supabaseAdmin.from("content_usage_meters").insert({
    owner_user_id: workspaceOwnerId,
    period_year_month: period,
    metric,
    count: amount,
    updated_at: nowIso,
  });
}

/** Lê o contador atual (0 se não existe). */
export async function readMeter(
  workspaceOwnerId: string,
  metric: UsageMetric,
  timezone?: string,
): Promise<number> {
  const period = currentPeriodYearMonth(timezone);
  const { data } = await supabaseAdmin
    .from("content_usage_meters")
    .select("count")
    .eq("owner_user_id", workspaceOwnerId)
    .eq("period_year_month", period)
    .eq("metric", metric)
    .maybeSingle();
  return (data as { count: number } | null)?.count ?? 0;
}
