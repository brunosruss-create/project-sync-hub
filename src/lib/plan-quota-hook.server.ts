// Plan_Quota_Hook — ponto único de decisão para limites por plano.
//
// Nesta fase, sempre retorna permitido. Trocar o corpo desta função no futuro
// implementa enforcement real de plano sem mudar nenhum call site.
// Requirements 15.5, 15.6.

import type { UsageMetric } from "@/features/content-generation/types";

export type QuotaMetric = UsageMetric | "content_brief_submit" | "asset_approve";

export interface QuotaCheckResult {
  allowed: boolean;
  reason?: string;
  remaining?: number;
}

/**
 * Verifica se um workspace pode consumir um determinado metric no período atual.
 * Nesta fase, sempre retorna { allowed: true }. Substituir por consulta real
 * a planos/limites quando o modelo de cobrança for definido.
 */
export async function checkQuota(
  _workspaceOwnerId: string,
  _metric: QuotaMetric,
): Promise<QuotaCheckResult> {
  return { allowed: true };
}

/**
 * Consulta e joga erro descritivo se negado. Usado em call sites que preferem
 * lançamento imediato à checagem manual.
 */
export async function enforceQuota(
  workspaceOwnerId: string,
  metric: QuotaMetric,
): Promise<void> {
  const result = await checkQuota(workspaceOwnerId, metric);
  if (!result.allowed) {
    throw new Error(
      `Limite do plano atingido para ${metric}${result.reason ? `: ${result.reason}` : ""}`,
    );
  }
}
