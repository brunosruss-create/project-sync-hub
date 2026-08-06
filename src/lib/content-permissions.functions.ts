// Server functions expostas pra UI de permissões do módulo AI_Content_Generation.

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  resolveContentPermissions,
  resolveWorkspaceOwner,
} from "@/lib/content-permissions.server";

const ContentPermsSchema = z.object({
  scope: z.enum(["member", "role"]),
  memberUserId: z.string().uuid().optional(),
  role: z.enum(["manager", "agent"]).optional(),
  canBrandEdit: z.boolean(),
  canBriefCreate: z.boolean(),
  canAssetApprove: z.boolean(),
  canPublishImmediate: z.boolean(),
  canAiImageOptin: z.boolean(),
});

/** Retorna as permissões efetivas do usuário autenticado. */
export const getMyContentPermissions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const workspaceOwnerId = await resolveWorkspaceOwner(context.userId);
    const perms = await resolveContentPermissions(workspaceOwnerId, context.userId);
    return {
      permissions: perms,
      isManager: context.userId === workspaceOwnerId,
    };
  });

/** Lista os overrides configurados no workspace. Manager only. */
export const listContentPermissions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const workspaceOwnerId = await resolveWorkspaceOwner(context.userId);
    if (context.userId !== workspaceOwnerId) {
      throw new Error("Somente o Manager pode listar permissões");
    }
    const { data, error } = await supabaseAdmin
      .from("content_publishing_permissions")
      .select("*")
      .eq("owner_user_id", workspaceOwnerId)
      .order("scope", { ascending: true });
    if (error) throw new Error(error.message);
    return { permissions: data ?? [] };
  });

/**
 * Cria ou atualiza um override de permissão. Manager only.
 * Se scope=member: exige memberUserId. Se scope=role: exige role.
 */
export const upsertContentPermission = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => ContentPermsSchema.parse(input))
  .handler(async ({ data, context }) => {
    const workspaceOwnerId = await resolveWorkspaceOwner(context.userId);
    if (context.userId !== workspaceOwnerId) {
      throw new Error("Somente o Manager pode configurar permissões");
    }
    if (data.scope === "member" && !data.memberUserId) {
      throw new Error("memberUserId é obrigatório quando scope=member");
    }
    if (data.scope === "role" && !data.role) {
      throw new Error("role é obrigatório quando scope=role");
    }
    const payload = {
      owner_user_id: workspaceOwnerId,
      scope: data.scope,
      member_user_id: data.scope === "member" ? data.memberUserId : null,
      role: data.scope === "role" ? data.role : null,
      can_brand_edit: data.canBrandEdit,
      can_brief_create: data.canBriefCreate,
      can_asset_approve: data.canAssetApprove,
      can_publish_immediate: data.canPublishImmediate,
      can_ai_image_optin: data.canAiImageOptin,
      updated_at: new Date().toISOString(),
    };
    const onConflict = data.scope === "member" ? "owner_user_id,member_user_id" : "owner_user_id,role";
    const { error } = await supabaseAdmin
      .from("content_publishing_permissions")
      .upsert(payload, { onConflict });
    if (error) throw new Error(error.message);
    return { ok: true };
  });
