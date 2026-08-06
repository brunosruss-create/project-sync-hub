// Mapeamento tipado de content_jobs.

import type { ContentJob, ImageProvider, JobStage, JobStatus } from "./types";

export function mapJobRow(r: any): ContentJob {
  return {
    id: r.id,
    ownerUserId: r.owner_user_id,
    briefId: r.brief_id,
    status: (r.status ?? "pending") as JobStatus,
    stage: (r.stage as JobStage | null) ?? null,
    errorMessage: r.error_message ?? null,
    imageProviderUsed: (r.image_provider_used as ImageProvider | null) ?? null,
    aiTextModel: r.ai_text_model ?? null,
    costEstimateCents: r.cost_estimate_cents ?? 0,
    durationMs: r.duration_ms ?? null,
    startedAt: r.started_at ? new Date(r.started_at) : null,
    completedAt: r.completed_at ? new Date(r.completed_at) : null,
    createdAt: new Date(r.created_at),
  };
}
