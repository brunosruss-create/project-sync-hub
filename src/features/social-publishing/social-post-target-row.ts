// Mapeamento tipado de social_post_targets.

import type { SocialPlatform, PostType } from "@/lib/social-post-validation";

export type PostTargetStatus = "draft" | "scheduled" | "publishing" | "published" | "failed";

export interface SocialPostTarget {
  id: string;
  postId: string;
  ownerUserId: string;
  connectionId: string;
  platform: SocialPlatform;
  postType: PostType;
  text: string;
  mediaUrls: string[];
  status: PostTargetStatus;
  scheduledFor: Date | null;
  timezone: string | null;
  zernioPostId: string | null;
  zernioTargetId: string | null;
  platformPostId: string | null;
  publishedAt: Date | null;
  errorMessage: string | null;
  createdAt: Date;
}

export function mapPostTargetRow(r: any): SocialPostTarget {
  return {
    id: r.id,
    postId: r.post_id,
    ownerUserId: r.owner_user_id,
    connectionId: r.social_account_connection_id,
    platform: r.platform,
    postType: r.post_type ?? "feed",
    text: r.text ?? "",
    mediaUrls: Array.isArray(r.media_urls) ? r.media_urls : [],
    status: r.status ?? "draft",
    scheduledFor: r.scheduled_for ? new Date(r.scheduled_for) : null,
    timezone: r.timezone ?? null,
    zernioPostId: r.zernio_post_id ?? null,
    zernioTargetId: r.zernio_target_id ?? null,
    platformPostId: r.platform_post_id ?? null,
    publishedAt: r.published_at ? new Date(r.published_at) : null,
    errorMessage: r.error_message ?? null,
    createdAt: new Date(r.created_at),
  };
}
