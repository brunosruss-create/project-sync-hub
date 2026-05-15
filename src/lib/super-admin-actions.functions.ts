import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

type AppRole = "super_admin" | "manager" | "agent";

async function assertSuperAdmin(userId: string) {
  const { data: r } = await supabaseAdmin
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "super_admin")
    .maybeSingle();
  if (!r) throw new Error("Acesso negado");
}

async function audit(
  actorId: string,
  actorEmail: string | null,
  action: string,
  resourceType: string,
  resourceId: string,
  metadata: Record<string, unknown> = {},
) {
  await supabaseAdmin.from("audit_logs").insert({
    actor_id: actorId,
    actor_email: actorEmail,
    action,
    resource_type: resourceType,
    resource_id: resourceId,
    metadata,
  });
}

// ============================================================
// READ: workspace detail (summary, members, contacts, audit)
// ============================================================

export const getWorkspaceDetail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ ownerId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertSuperAdmin(context.userId);
    const ownerId = data.ownerId;

    const [
      { data: ownerUser },
      { data: profile },
      { data: members },
      { count: contactCount },
      { data: contacts },
      { data: instance },
      { count: apptCount },
      { count: monthMessages },
      { data: auditRows },
    ] = await Promise.all([
      supabaseAdmin.auth.admin.getUserById(ownerId),
      supabaseAdmin
        .from("profiles")
        .select("id, email, full_name, plan, is_blocked")
        .eq("id", ownerId)
        .maybeSingle(),
      supabaseAdmin
        .from("workspace_members")
        .select("member_user_id, active, created_at, workspace_owner_id")
        .eq("workspace_owner_id", ownerId),
      supabaseAdmin
        .from("contacts")
        .select("id", { count: "exact", head: true })
        .eq("owner_user_id", ownerId),
      supabaseAdmin
        .from("contacts")
        .select("id, name, phone, kanban_column, last_message, last_message_at, created_at")
        .eq("owner_user_id", ownerId)
        .order("last_message_at", { ascending: false, nullsFirst: false })
        .limit(50),
      supabaseAdmin
        .from("whatsapp_instances")
        .select("id, instance_name, status, phone_number, updated_at, created_at")
        .eq("owner_user_id", ownerId)
        .maybeSingle(),
      supabaseAdmin
        .from("appointments")
        .select("id", { count: "exact", head: true })
        .eq("owner_user_id", ownerId),
      supabaseAdmin
        .from("messages")
        .select("id", { count: "exact", head: true })
        .eq("owner_user_id", ownerId)
        .gte(
          "created_at",
          new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString(),
        ),
      supabaseAdmin
        .from("audit_logs")
        .select("id, action, resource_type, resource_id, actor_email, metadata, created_at")
        .eq("resource_id", ownerId)
        .order("created_at", { ascending: false })
        .limit(5),
    ]);

    // Profiles for members
    const memberIds = (members ?? []).map((m) => m.member_user_id);
    const [{ data: memberProfiles }, { data: roles }] = await Promise.all([
      memberIds.length
        ? supabaseAdmin
            .from("profiles")
            .select("id, email, full_name, is_blocked")
            .in("id", memberIds)
        : Promise.resolve({ data: [] as Array<{ id: string; email: string | null; full_name: string | null; is_blocked: boolean }> }),
      memberIds.length
        ? supabaseAdmin.from("user_roles").select("user_id, role").in("user_id", memberIds)
        : Promise.resolve({ data: [] as Array<{ user_id: string; role: AppRole }> }),
    ]);

    const profileMap = new Map((memberProfiles ?? []).map((p) => [p.id, p]));
    const roleMap = new Map<string, AppRole>();
    for (const r of roles ?? []) {
      const prev = roleMap.get(r.user_id);
      if (!prev || r.role === "super_admin" || (r.role === "manager" && prev === "agent")) {
        roleMap.set(r.user_id, r.role as AppRole);
      }
    }

    // Auth fallback emails
    const memberAuth = await Promise.all(
      memberIds.map(async (id) => {
        const { data: u } = await supabaseAdmin.auth.admin.getUserById(id);
        return { id, email: u?.user?.email ?? null };
      }),
    );
    const authEmailMap = new Map(memberAuth.map((m) => [m.id, m.email]));

    return {
      owner: {
        id: ownerId,
        email: ownerUser?.user?.email ?? profile?.email ?? null,
        full_name:
          (ownerUser?.user?.user_metadata as { full_name?: string } | null)?.full_name ??
          profile?.full_name ??
          null,
        created_at: ownerUser?.user?.created_at ?? null,
        plan: profile?.plan ?? "trial",
      },
      summary: {
        contacts: contactCount ?? 0,
        messages_month: monthMessages ?? 0,
        appointments: apptCount ?? 0,
        members: members?.length ?? 0,
      },
      whatsapp: instance
        ? {
            instance_name: instance.instance_name,
            status: instance.status,
            phone_number: instance.phone_number ?? null,
            updated_at: instance.updated_at,
            created_at: instance.created_at,
          }
        : null,
      members: (members ?? []).map((m) => ({
        member_user_id: m.member_user_id,
        active: m.active,
        is_owner: m.member_user_id === m.workspace_owner_id,
        email:
          profileMap.get(m.member_user_id)?.email ??
          authEmailMap.get(m.member_user_id) ??
          null,
        full_name: profileMap.get(m.member_user_id)?.full_name ?? null,
        is_blocked: profileMap.get(m.member_user_id)?.is_blocked ?? false,
        role: roleMap.get(m.member_user_id) ?? "agent",
        created_at: m.created_at,
      })),
      contacts: contacts ?? [],
      audit: auditRows ?? [],
    };
  });

// ============================================================
// MUTATIONS
// ============================================================

export const setUserRole = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        userId: z.string().uuid(),
        role: z.enum(["super_admin", "manager", "agent"]),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertSuperAdmin(context.userId);
    if (data.userId === context.userId && data.role !== "super_admin") {
      throw new Error("Você não pode rebaixar o próprio super admin.");
    }

    const { data: prev } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", data.userId);

    await supabaseAdmin.from("user_roles").delete().eq("user_id", data.userId);
    const { error } = await supabaseAdmin
      .from("user_roles")
      .insert({ user_id: data.userId, role: data.role });
    if (error) throw new Error(error.message);

    await audit(context.userId, context.user.email ?? null, "set_role", "user", data.userId, {
      previous: prev?.map((r) => r.role) ?? [],
      new: data.role,
    });

    return { ok: true };
  });

export const setUserBlocked = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ userId: z.string().uuid(), blocked: z.boolean() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertSuperAdmin(context.userId);
    if (data.userId === context.userId && data.blocked) {
      throw new Error("Você não pode bloquear a si mesmo.");
    }

    const { error } = await supabaseAdmin
      .from("profiles")
      .update({ is_blocked: data.blocked })
      .eq("id", data.userId);
    if (error) throw new Error(error.message);

    await audit(
      context.userId,
      context.user.email ?? null,
      data.blocked ? "block_user" : "unblock_user",
      "user",
      data.userId,
      {},
    );

    return { ok: true };
  });

export const resetUserPassword = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ userId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    await assertSuperAdmin(context.userId);

    const { data: u } = await supabaseAdmin.auth.admin.getUserById(data.userId);
    const email = u?.user?.email;
    if (!email) throw new Error("Usuário sem email cadastrado.");

    const { error } = await supabaseAdmin.auth.admin.generateLink({
      type: "recovery",
      email,
    });
    if (error) throw new Error(error.message);

    await audit(context.userId, context.user.email ?? null, "reset_password", "user", data.userId, {
      target_email: email,
    });

    return { ok: true, email };
  });

export const setWorkspacePlan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        ownerId: z.string().uuid(),
        plan: z.enum(["trial", "starter", "pro", "enterprise"]),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertSuperAdmin(context.userId);

    const { error } = await supabaseAdmin
      .from("profiles")
      .update({ plan: data.plan })
      .eq("id", data.ownerId);
    if (error) throw new Error(error.message);

    await audit(
      context.userId,
      context.user.email ?? null,
      "set_plan",
      "workspace",
      data.ownerId,
      { plan: data.plan },
    );

    return { ok: true };
  });

export const suspendWorkspace = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ ownerId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    await assertSuperAdmin(context.userId);
    if (data.ownerId === context.userId) {
      throw new Error("Você não pode suspender o próprio workspace.");
    }

    const { data: members } = await supabaseAdmin
      .from("workspace_members")
      .select("member_user_id")
      .eq("workspace_owner_id", data.ownerId);

    const ids = (members ?? []).map((m) => m.member_user_id);
    if (ids.length) {
      await supabaseAdmin.from("profiles").update({ is_blocked: true }).in("id", ids);
    }

    await audit(
      context.userId,
      context.user.email ?? null,
      "suspend_workspace",
      "workspace",
      data.ownerId,
      { blocked_users: ids.length },
    );

    return { ok: true, blocked: ids.length };
  });

export const deleteWorkspace = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        ownerId: z.string().uuid(),
        confirmEmail: z.string().email(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertSuperAdmin(context.userId);
    if (data.ownerId === context.userId) {
      throw new Error("Você não pode deletar o próprio workspace.");
    }

    const { data: u } = await supabaseAdmin.auth.admin.getUserById(data.ownerId);
    const email = u?.user?.email;
    if (!email || email.toLowerCase() !== data.confirmEmail.toLowerCase()) {
      throw new Error("Email de confirmação não confere.");
    }

    // Deleta membros (cascata via FK em auth.users.delete deve limpar workspace_members,
    // mas só removemos os registros — não deletamos as auth.users dos agentes para preservar histórico).
    await supabaseAdmin.from("workspace_members").delete().eq("workspace_owner_id", data.ownerId);
    await supabaseAdmin.auth.admin.deleteUser(data.ownerId).catch(() => {});

    await audit(
      context.userId,
      context.user.email ?? null,
      "delete_workspace",
      "workspace",
      data.ownerId,
      { owner_email: email },
    );

    return { ok: true };
  });
