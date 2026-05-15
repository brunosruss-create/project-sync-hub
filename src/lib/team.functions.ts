import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

type AppRole = "manager" | "agent";

export type TeamMember = {
  id: string;                  // workspace_members.id
  member_user_id: string;
  email: string;
  full_name: string | null;
  role: AppRole;
  active: boolean;
  is_owner: boolean;           // true if member_user_id === workspace_owner_id
  created_at: string;
};

async function assertManager(userId: string) {
  // Source of truth: o usuário é manager se ele é dono de algum workspace
  // (workspace_members.workspace_owner_id = member_user_id).
  const { data, error } = await supabaseAdmin
    .from("workspace_members")
    .select("workspace_owner_id")
    .eq("workspace_owner_id", userId)
    .eq("member_user_id", userId)
    .eq("active", true)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Apenas managers podem gerenciar a equipe.");
}

async function getOwnerId(userId: string): Promise<string> {
  // The caller is a manager → owner = themself.
  return userId;
}

export const listTeamMembers = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<TeamMember[]> => {
    const { userId } = context;
    await assertManager(userId);
    const ownerId = await getOwnerId(userId);

    const { data: members, error } = await supabaseAdmin
      .from("workspace_members")
      .select("id, member_user_id, active, created_at, workspace_owner_id")
      .eq("workspace_owner_id", ownerId)
      .order("created_at", { ascending: true });
    if (error) throw new Error(error.message);

    if (!members || members.length === 0) return [];

    const ids = members.map((m) => m.member_user_id);
    const [{ data: roles }, { data: profiles }] = await Promise.all([
      supabaseAdmin.from("user_roles").select("user_id, role").in("user_id", ids),
      supabaseAdmin.from("profiles").select("id, email, full_name").in("id", ids),
    ]);

    // Fetch emails from auth for users without a profile email
    const authEmails = new Map<string, string>();
    for (const id of ids) {
      const { data: u } = await supabaseAdmin.auth.admin.getUserById(id);
      if (u?.user?.email) authEmails.set(id, u.user.email);
    }

    const roleMap = new Map<string, AppRole>();
    for (const r of roles ?? []) {
      const prev = roleMap.get(r.user_id);
      // manager wins over agent
      if (!prev || r.role === "manager") roleMap.set(r.user_id, r.role as AppRole);
    }
    const profileMap = new Map<string, { email: string | null; full_name: string | null }>();
    for (const p of profiles ?? []) {
      profileMap.set(p.id, { email: p.email, full_name: p.full_name });
    }

    return members.map((m) => {
      const profile = profileMap.get(m.member_user_id);
      return {
        id: m.id,
        member_user_id: m.member_user_id,
        email: profile?.email || authEmails.get(m.member_user_id) || "",
        full_name: profile?.full_name ?? null,
        role: roleMap.get(m.member_user_id) ?? "agent",
        active: m.active,
        is_owner: m.member_user_id === m.workspace_owner_id,
        created_at: m.created_at,
      };
    });
  });

const createSchema = z.object({
  email: z.string().email().max(255),
  password: z.string().min(6).max(72),
  full_name: z.string().min(1).max(120),
  role: z.enum(["manager", "agent"]),
});

export const createTeamMember = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => createSchema.parse(input))
  .handler(async ({ data, context }): Promise<{ ok: true; member_user_id: string }> => {
    const { userId } = context;
    await assertManager(userId);
    const ownerId = await getOwnerId(userId);

    // 1) Create auth user (email pre-confirmed; agent can log in immediately)
    const { data: created, error: authErr } = await supabaseAdmin.auth.admin.createUser({
      email: data.email,
      password: data.password,
      email_confirm: true,
      user_metadata: { full_name: data.full_name },
    });
    if (authErr || !created.user) {
      throw new Error(authErr?.message || "Falha ao criar usuário.");
    }
    const newUserId = created.user.id;

    try {
      // 2) Insert profile (trigger may handle this, but make sure)
      await supabaseAdmin.from("profiles").upsert({
        id: newUserId,
        email: data.email,
        full_name: data.full_name,
      });

      // 3) Set role — replace any auto-created 'manager' role from trigger
      await supabaseAdmin.from("user_roles").delete().eq("user_id", newUserId);
      await supabaseAdmin.from("user_roles").insert({
        user_id: newUserId,
        role: data.role,
      });

      // 4) Add to this workspace; remove any auto-created self-workspace
      await supabaseAdmin
        .from("workspace_members")
        .delete()
        .eq("member_user_id", newUserId);
      const { error: memErr } = await supabaseAdmin.from("workspace_members").insert({
        workspace_owner_id: ownerId,
        member_user_id: newUserId,
        active: true,
      });
      if (memErr) throw new Error(memErr.message);

      return { ok: true, member_user_id: newUserId };
    } catch (e) {
      // Rollback: delete the auth user we just created
      await supabaseAdmin.auth.admin.deleteUser(newUserId).catch(() => {});
      throw e;
    }
  });

const updateSchema = z.object({
  member_user_id: z.string().uuid(),
  active: z.boolean().optional(),
  role: z.enum(["manager", "agent"]).optional(),
});

export const updateTeamMember = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => updateSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { userId } = context;
    await assertManager(userId);
    const ownerId = await getOwnerId(userId);

    if (data.member_user_id === ownerId) {
      throw new Error("Você não pode alterar o próprio dono do workspace.");
    }

    // Ensure target belongs to this workspace
    const { data: row } = await supabaseAdmin
      .from("workspace_members")
      .select("id")
      .eq("workspace_owner_id", ownerId)
      .eq("member_user_id", data.member_user_id)
      .maybeSingle();
    if (!row) throw new Error("Membro não pertence a este workspace.");

    if (typeof data.active === "boolean") {
      const { error } = await supabaseAdmin
        .from("workspace_members")
        .update({ active: data.active })
        .eq("id", row.id);
      if (error) throw new Error(error.message);
    }

    if (data.role) {
      await supabaseAdmin.from("user_roles").delete().eq("user_id", data.member_user_id);
      await supabaseAdmin.from("user_roles").insert({
        user_id: data.member_user_id,
        role: data.role,
      });
    }

    return { ok: true };
  });

const removeSchema = z.object({ member_user_id: z.string().uuid() });

export const removeTeamMember = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => removeSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { userId } = context;
    await assertManager(userId);
    const ownerId = await getOwnerId(userId);

    if (data.member_user_id === ownerId) {
      throw new Error("Você não pode remover o próprio dono do workspace.");
    }

    // Remove from workspace
    await supabaseAdmin
      .from("workspace_members")
      .delete()
      .eq("workspace_owner_id", ownerId)
      .eq("member_user_id", data.member_user_id);

    // Remove role
    await supabaseAdmin.from("user_roles").delete().eq("user_id", data.member_user_id);

    // Delete the auth user (preserves nothing — agente é descartado)
    await supabaseAdmin.auth.admin.deleteUser(data.member_user_id).catch(() => {});

    return { ok: true };
  });
