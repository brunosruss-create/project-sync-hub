// Permissões do módulo de publicação em redes sociais.
// Isolado do módulo de mensageria — usa papéis existentes (manager/agent) como
// INPUT para resolver defaults, mas todo estado de permissão fica na tabela
// social_publishing_permissions, nunca em tabelas de mensageria.

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export type SocialAction = "create_edit_draft" | "connect_account" | "schedule" | "publish_now";

const ALL_ACTIONS: SocialAction[] = ["create_edit_draft", "connect_account", "schedule", "publish_now"];

type PermissionSet = Record<SocialAction, boolean>;

// Defaults hardcoded conforme Requirement 8 AC#2:
// Manager: tudo liberado. Agent: só criar/editar rascunho.
const DEFAULTS: Record<"manager" | "agent", PermissionSet> = {
  manager: { create_edit_draft: true, connect_account: true, schedule: true, publish_now: true },
  agent: { create_edit_draft: true, connect_account: false, schedule: false, publish_now: false },
};

/**
 * Resolve as permissões efetivas de um membro no módulo de publicação.
 * Precedência: override de membro > override de papel > default do papel.
 */
export async function resolvePermissions(
  workspaceOwnerId: string,
  memberUserId: string,
): Promise<PermissionSet> {
  // Descobre o papel do membro (manager se é o dono do workspace; senão busca em workspace_members)
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
    if ((member as any)?.role === "manager") role = "manager";
  }

  // 1. Busca override específico do membro
  const { data: memberOverride } = await supabaseAdmin
    .from("social_publishing_permissions")
    .select("create_edit_draft,connect_account,schedule,publish_now")
    .eq("owner_user_id", workspaceOwnerId)
    .eq("scope", "member")
    .eq("member_user_id", memberUserId)
    .maybeSingle();
  if (memberOverride) {
    return {
      create_edit_draft: !!(memberOverride as any).create_edit_draft,
      connect_account: !!(memberOverride as any).connect_account,
      schedule: !!(memberOverride as any).schedule,
      publish_now: !!(memberOverride as any).publish_now,
    };
  }

  // 2. Busca override do papel
  const { data: roleOverride } = await supabaseAdmin
    .from("social_publishing_permissions")
    .select("create_edit_draft,connect_account,schedule,publish_now")
    .eq("owner_user_id", workspaceOwnerId)
    .eq("scope", "role")
    .eq("role", role)
    .maybeSingle();
  if (roleOverride) {
    return {
      create_edit_draft: !!(roleOverride as any).create_edit_draft,
      connect_account: !!(roleOverride as any).connect_account,
      schedule: !!(roleOverride as any).schedule,
      publish_now: !!(roleOverride as any).publish_now,
    };
  }

  // 3. Default hardcoded
  return DEFAULTS[role];
}

/**
 * Verifica se o membro pode executar a ação. Lança erro se não.
 */
export async function assertCan(
  workspaceOwnerId: string,
  memberUserId: string,
  action: SocialAction,
): Promise<void> {
  const perms = await resolvePermissions(workspaceOwnerId, memberUserId);
  if (!perms[action]) {
    const labels: Record<SocialAction, string> = {
      create_edit_draft: "criar/editar rascunhos",
      connect_account: "conectar/desconectar contas",
      schedule: "agendar publicações",
      publish_now: "publicar imediatamente",
    };
    throw new Error(
      `Você não tem permissão para ${labels[action]}. Peça a um Manager para liberar essa ação.`,
    );
  }
}

// ============================================================
// Server functions expostas pra UI
// ============================================================

/** Retorna as permissões efetivas do membro autenticado. */
export const getMyPublishingPermissions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    // Resolve o workspace owner: se é o dono, usa o próprio id.
    // Se é membro de um workspace, precisa saber quem é o dono.
    const { data: member } = await supabaseAdmin
      .from("workspace_members")
      .select("owner_user_id")
      .eq("user_id", context.userId)
      .maybeSingle();
    const ownerUserId = (member as any)?.owner_user_id ?? context.userId;
    return resolvePermissions(ownerUserId, context.userId);
  });

const UpdatePermsSchema = z.object({
  scope: z.enum(["member", "role"]),
  /** memberUserId (quando scope=member) ou role (quando scope=role) */
  targetId: z.string().min(1),
  permissions: z.object({
    create_edit_draft: z.boolean(),
    connect_account: z.boolean(),
    schedule: z.boolean(),
    publish_now: z.boolean(),
  }),
});

/** Atualiza permissões (somente Managers). */
export const updatePublishingPermissions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => UpdatePermsSchema.parse(input))
  .handler(async ({ data, context }) => {
    // Só managers podem alterar permissões
    const ownerUserId = context.userId;
    // Verifica se é manager (dono do workspace ou papel manager)
    const perms = await resolvePermissions(ownerUserId, context.userId);
    if (!perms.connect_account) {
      // Só managers teriam connect_account=true por default
      throw new Error("Somente Managers podem alterar permissões.");
    }

    const row: Record<string, unknown> = {
      owner_user_id: ownerUserId,
      scope: data.scope,
      create_edit_draft: data.permissions.create_edit_draft,
      connect_account: data.permissions.connect_account,
      schedule: data.permissions.schedule,
      publish_now: data.permissions.publish_now,
      updated_at: new Date().toISOString(),
    };
    if (data.scope === "member") {
      row.member_user_id = data.targetId;
    } else {
      row.role = data.targetId;
    }

    // Upsert: se já existe override pra esse scope+target, atualiza.
    const filter: Record<string, unknown> = {
      owner_user_id: ownerUserId,
      scope: data.scope,
    };
    if (data.scope === "member") filter.member_user_id = data.targetId;
    else filter.role = data.targetId;

    const { data: existing } = await supabaseAdmin
      .from("social_publishing_permissions")
      .select("id")
      .match(filter)
      .maybeSingle();

    if (existing) {
      await supabaseAdmin
        .from("social_publishing_permissions")
        .update(row)
        .eq("id", (existing as any).id);
    } else {
      await supabaseAdmin.from("social_publishing_permissions").insert(row);
    }

    return { ok: true };
  });

/** Lista configuração de permissões do workspace (pra tela de settings). */
export const getPublishingPermissionsConfig = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: rows } = await supabaseAdmin
      .from("social_publishing_permissions")
      .select("id,scope,member_user_id,role,create_edit_draft,connect_account,schedule,publish_now")
      .eq("owner_user_id", context.userId);
    return { overrides: rows ?? [], defaults: DEFAULTS };
  });
