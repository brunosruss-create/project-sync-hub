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
  /** Recebe conversas do rodízio automático. Dono nasce fora. */
  rotation_enabled: boolean;
  /** Peso no rodízio: 2 = o dobro de conversas de quem tem 1. */
  rotation_weight: number;
  /** Departamento do membro. `null` = sem departamento. */
  department_id: string | null;
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

    // Degradação aberta: sem as colunas de rodízio no banco (migration ainda
    // não aplicada), a query inteira falharia e a tela de Equipe ficaria
    // inacessível. Melhor listar os membros sem a configuração de rodízio do
    // que não listar nada — a UI esconde os controles quando os campos vêm
    // com o default.
    const COLS_BASE = "id, member_user_id, active, created_at, workspace_owner_id";
    // Dois degraus de degradação: primeiro tenta tudo, depois sem
    // `department_id` (migration de departamentos pendente), por último sem as
    // colunas de rodízio. Um degrau só faria a tela sumir quando falta apenas
    // a coluna mais nova.
    let { data: members, error } = await supabaseAdmin
      .from("workspace_members")
      .select(`${COLS_BASE}, rotation_enabled, rotation_weight, department_id`)
      .eq("workspace_owner_id", ownerId)
      .order("created_at", { ascending: true });
    if (error && /department_id/i.test(error.message ?? "")) {
      const retry = await supabaseAdmin
        .from("workspace_members")
        .select(`${COLS_BASE}, rotation_enabled, rotation_weight`)
        .eq("workspace_owner_id", ownerId)
        .order("created_at", { ascending: true });
      members = retry.data as any;
      error = retry.error;
    }
    if (error && /rotation_/i.test(error.message ?? "")) {
      const retry = await supabaseAdmin
        .from("workspace_members")
        .select(COLS_BASE)
        .eq("workspace_owner_id", ownerId)
        .order("created_at", { ascending: true });
      members = retry.data as any;
      error = retry.error;
    }
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
        rotation_enabled: !!(m as any).rotation_enabled,
        rotation_weight: Number((m as any).rotation_weight ?? 1),
        department_id: ((m as any).department_id as string | null) ?? null,
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
  rotation_enabled: z.boolean().optional(),
  rotation_weight: z.number().int().min(1).max(100).optional(),
  /** `null` tira o membro do departamento; ausente não mexe. */
  department_id: z.string().uuid().nullable().optional(),
});

export const updateTeamMember = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => updateSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { userId } = context;
    await assertManager(userId);
    const ownerId = await getOwnerId(userId);

    // O dono não pode se desativar nem mudar o próprio papel — isso o trancaria
    // fora do workspace. Mas PODE ajustar a própria participação no rodízio,
    // senão seria impossível se incluir na distribuição pela tela de Equipe.
    const touchesPrivileged = typeof data.active === "boolean" || !!data.role;
    if (data.member_user_id === ownerId && touchesPrivileged) {
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

    // Um update só com o que veio — antes o `active` ia sozinho e cada campo
    // novo custaria mais um round-trip.
    const patch: Record<string, unknown> = {};
    if (typeof data.active === "boolean") patch.active = data.active;
    if (typeof data.rotation_enabled === "boolean") patch.rotation_enabled = data.rotation_enabled;
    if (typeof data.rotation_weight === "number") patch.rotation_weight = data.rotation_weight;
    if (data.department_id !== undefined) patch.department_id = data.department_id;
    if (Object.keys(patch).length > 0) {
      let { error } = await supabaseAdmin
        .from("workspace_members")
        .update(patch)
        .eq("id", row.id);
      // Degradação aberta: sem a coluna, mexer em rodízio/ativo continua
      // funcionando — só o departamento é ignorado.
      if (error && /department_id/i.test(error.message ?? "")) {
        const { department_id: _ignorado, ...semDepartamento } = patch;
        if (Object.keys(semDepartamento).length > 0) {
          const retry = await supabaseAdmin
            .from("workspace_members")
            .update(semDepartamento)
            .eq("id", row.id);
          error = retry.error;
        } else {
          error = null;
        }
      }
      if (error) throw new Error(error.message);
    }

    // Desativar um atendente precisa soltar as conversas dele.
    //
    // Sem isto elas ficam órfãs de um jeito difícil de perceber: com
    // `active = false`, `get_my_workspace_owner()` cai no fallback e devolve o
    // próprio uid do agente, então `contacts.owner_user_id` deixa de bater e
    // ELE não vê mais nada; os outros agentes também não, porque a conversa
    // segue atribuída a ele; e a IA fica desligada, porque `humanInControl`
    // olha justamente `assigned_agent_id`. Resultado: cliente sem resposta de
    // ninguém. Já era bug antes do rodízio — agora seria a porta de entrada
    // principal para ele.
    //
    // (`removeTeamMember` não precisa disto: apaga o auth user e o
    // `on delete set null` da FK limpa sozinho.)
    if (data.active === false) {
      const { error: releaseError } = await supabaseAdmin
        .from("contacts")
        .update({ assigned_agent_id: null })
        .eq("owner_user_id", ownerId)
        .eq("assigned_agent_id", data.member_user_id);
      if (releaseError) {
        console.warn("[team] conversas não liberadas ao desativar:", releaseError.message);
      }
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
