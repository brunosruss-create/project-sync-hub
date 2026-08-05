// Mapeamento tipado de social_publishing_permissions.

export type PermissionScope = "member" | "role";

export interface SocialPublishingPermission {
  id: string;
  ownerUserId: string;
  scope: PermissionScope;
  memberUserId: string | null;
  role: "manager" | "agent" | null;
  createEditDraft: boolean;
  connectAccount: boolean;
  schedule: boolean;
  publishNow: boolean;
}

export function mapPermissionRow(r: any): SocialPublishingPermission {
  return {
    id: r.id,
    ownerUserId: r.owner_user_id,
    scope: r.scope,
    memberUserId: r.member_user_id ?? null,
    role: r.role ?? null,
    createEditDraft: !!r.create_edit_draft,
    connectAccount: !!r.connect_account,
    schedule: !!r.schedule,
    publishNow: !!r.publish_now,
  };
}
