// Mapeamento tipado de social_account_connections.
// Convenção do projeto: sem tipos gerados do Supabase, o shape vive aqui.

import type { SocialPlatform } from "@/lib/social-post-validation";

export type ConnectionStatus = "connecting" | "connected" | "expired" | "disconnected";

export interface SocialAccountConnection {
  id: string;
  ownerUserId: string;
  platform: SocialPlatform;
  zernioProfileId: string;
  accountId: string | null;
  accountName: string | null;
  status: ConnectionStatus;
  connectedAt: Date | null;
  createdAt: Date;
}

export function mapConnectionRow(r: any): SocialAccountConnection {
  return {
    id: r.id,
    ownerUserId: r.owner_user_id,
    platform: r.platform,
    zernioProfileId: r.zernio_profile_id,
    accountId: r.account_id ?? null,
    accountName: r.account_name ?? null,
    status: r.status ?? "disconnected",
    connectedAt: r.connected_at ? new Date(r.connected_at) : null,
    createdAt: new Date(r.created_at),
  };
}
