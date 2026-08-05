// Mapeamento tipado de social_posts.

export type SocialPostStatus = "draft" | "scheduled" | "publishing" | "published" | "failed" | "partially_published";

export interface SocialPost {
  id: string;
  ownerUserId: string;
  createdBy: string;
  baseText: string;
  status: SocialPostStatus;
  createdAt: Date;
  updatedAt: Date;
  targets?: SocialPostTargetSummary[];
}

export interface SocialPostTargetSummary {
  id: string;
  platform: string;
  postType: string;
  status: string;
  scheduledFor: string | null;
  publishedAt: string | null;
  errorMessage: string | null;
}

export function mapPostRow(r: any): SocialPost {
  return {
    id: r.id,
    ownerUserId: r.owner_user_id,
    createdBy: r.created_by,
    baseText: r.base_text ?? "",
    status: r.status ?? "draft",
    createdAt: new Date(r.created_at),
    updatedAt: new Date(r.updated_at),
    targets: Array.isArray(r.targets) ? r.targets : undefined,
  };
}
