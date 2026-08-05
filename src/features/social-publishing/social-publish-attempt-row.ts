// Mapeamento tipado de social_publish_attempts.

export type AttemptResult = "pending" | "success" | "failure";

export interface SocialPublishAttempt {
  id: string;
  postTargetId: string;
  ownerUserId: string;
  attemptNumber: number;
  result: AttemptResult;
  errorMessage: string | null;
  startedAt: Date;
  finishedAt: Date | null;
}

export function mapAttemptRow(r: any): SocialPublishAttempt {
  return {
    id: r.id,
    postTargetId: r.post_target_id,
    ownerUserId: r.owner_user_id,
    attemptNumber: r.attempt_number ?? 1,
    result: r.result ?? "pending",
    errorMessage: r.error_message ?? null,
    startedAt: new Date(r.started_at),
    finishedAt: r.finished_at ? new Date(r.finished_at) : null,
  };
}
