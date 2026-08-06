// Permissões do módulo AI_Content_Generation.
// Isolado do módulo de mensageria e do módulo de publicação em redes sociais.
// Reusa papéis existentes (manager/agent) como INPUT; estado de permissão vive
// em content_publishing_permissions.

import { supabaseAdmin } from "@/integrations/supabase/client.server";

export type ContentAction =
  | "brand_edit"
  | "brief_create"
  | "asset_approve"
  | "publish_immediate"
  | "ai_image_optin";

export type ContentPermissionSet = Record<ContentAction, boolean>;

// Defaults conforme Requirement 13.2.
// Manager: tudo liberado. Agent: só cria brief e aprova (pra postar precisa
// de publish_immediate, que é do manager).
const DEFAULTS: Record<"manager" | "agent", ContentPermissionSet> = {
  manager: {
    brand_edit: true,
    brief_create: true,
    asset_approve: true,
    publish_immediate: true,
    ai_image_optin: true,
  },
  agent: {
    brand_edit: false,
    brief_create: true,
    asset_approve: true,
    publish_immediate: false,
    ai_image_optin: false,
  },
};

/**
 * Resolve permissões efetivas: override de membro > override de papel > default.
 */
export async function resolveContentPermissions(
  workspaceOwnerId: string,
  memberUserId: string,
): Promise<ContentPermissionSet> {
  let role: "manager" | "agent" = "agent";
  if (memberUserId === workspaceOwnerId) {
    role = "manager";
  } else {
    const { data: member } = await supabaseAdmin
      .from("workspace_members")
      .select("role")
      .eq("owner_user_id", workspaceOwnerId)
      .eq("user_id", memberUserId)
      .maybeSingle();
    if ((member as { role?: string } | null)?.role === "manager") role = "manager";
  }

  // 1. Override do membro
  const { data: memberOverride } = await supabaseAdmin
    .from("content_publishing_permissions")
    .select(
      "can_brand_edit,can_brief_create,can_asset_approve,can_publish_immediate,can_ai_image_optin",
    )
    .eq("owner_user_id", workspaceOwnerId)
    .eq("scope", "member")
    .eq("member_user_id", memberUserId)
    .maybeSingle();
  if (memberOverride) {
    const m = memberOverride as Record<string, boolean>;
    return {
      brand_edit: !!m.can_brand_edit,
      brief_create: !!m.can_brief_create,
      asset_approve: !!m.can_asset_approve,
      publish_immediate: !!m.can_publish_immediate,
      ai_image_optin: !!m.can_ai_image_optin,
    };
  }

  // 2. Override do papel
  const { data: roleOverride } = await supabaseAdmin
    .from("content_publishing_permissions")
    .select(
      "can_brand_edit,can_brief_create,can_asset_approve,can_publish_immediate,can_ai_image_optin",
    )
    .eq("owner_user_id", workspaceOwnerId)
    .eq("scope", "role")
    .eq("role", role)
    .maybeSingle();
  if (roleOverride) {
    const r = roleOverride as Record<string, boolean>;
    return {
      brand_edit: !!r.can_brand_edit,
      brief_create: !!r.can_brief_create,
      asset_approve: !!r.can_asset_approve,
      publish_immediate: !!r.can_publish_immediate,
      ai_image_optin: !!r.can_ai_image_optin,
    };
  }

  return DEFAULTS[role];
}

/**
 * Verifica se o membro pode executar a ação. Lança erro se não.
 */
export async function assertContentCan(
  workspaceOwnerId: string,
  memberUserId: string,
  action: ContentAction,
): Promise<void> {
  const perms = await resolveContentPermissions(workspaceOwnerId, memberUserId);
  if (!perms[action]) {
    const labels: Record<ContentAction, string> = {
      brand_edit: "editar o Brand Kit",
      brief_create: "criar briefs de conteúdo",
      asset_approve: "aprovar posts gerados",
      publish_immediate: "publicar imediatamente",
      ai_image_optin: "usar geração de imagem por IA",
    };
    throw new Error(
      `Você não tem permissão para ${labels[action]}. Peça a um Manager para liberar essa ação.`,
    );
  }
}

/**
 * Resolve owner do workspace do membro autenticado.
 * Retorna o próprio userId se ele é dono; senão consulta workspace_members.
 */
export async function resolveWorkspaceOwner(memberUserId: string): Promise<string> {
  const { data: member } = await supabaseAdmin
    .from("workspace_members")
    .select("owner_user_id")
    .eq("user_id", memberUserId)
    .maybeSingle();
  return (member as { owner_user_id?: string } | null)?.owner_user_id ?? memberUserId;
}
