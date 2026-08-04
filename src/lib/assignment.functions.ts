import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { pickNextAgent } from "@/lib/rotation.server";

type AppRole = "manager" | "agent";

export type AssignableMember = {
  user_id: string;
  email: string;
  full_name: string | null;
  role: AppRole;
  is_self: boolean;
  is_owner: boolean;
  department_id: string | null;
};

async function resolveOwnerId(authedSupabase: any, userId: string): Promise<string> {
  // Use the authed client so RLS-defined SQL function runs as the current user.
  const { data, error } = await authedSupabase.rpc("get_my_workspace_owner");
  if (error) throw new Error(error.message);
  return (data as string) || userId;
}

/**
 * Quem pode receber conversa neste workspace. **Fonte única** — havia cinco
 * consultas independentes a `workspace_members` respondendo esta pergunta
 * (tela de Equipe, seletor de transferência, rodízio, guardas de manager,
 * super-admin), e cada feature nova precisava lembrar de todas.
 *
 * Sem `department_id` no banco (migration não aplicada), degrada ABERTO: volta
 * a lista sem departamento em vez de deixar a transferência inteira sem
 * opções.
 */
export async function fetchAssignableMembers(
  ownerId: string,
  currentUserId: string,
): Promise<AssignableMember[]> {
  const COLS = "member_user_id, active, workspace_owner_id, created_at";
  const build = (cols: string) =>
    supabaseAdmin
      .from("workspace_members")
      .select(cols)
      .eq("workspace_owner_id", ownerId)
      .eq("active", true)
      .order("created_at", { ascending: true });

  let { data: members, error } = await build(`${COLS}, department_id`);
  if (error && /department_id/i.test(error.message ?? "")) {
    const retry = await build(COLS);
    members = retry.data as any;
    error = retry.error;
  }
  if (error) throw new Error(error.message);
  if (!members || members.length === 0) return [];

  const ids = members.map((m: any) => m.member_user_id);
  const [{ data: roles }, { data: profiles }] = await Promise.all([
    supabaseAdmin.from("user_roles").select("user_id, role").in("user_id", ids),
    supabaseAdmin.from("profiles").select("id, email, full_name").in("id", ids),
  ]);

  const roleMap = new Map<string, AppRole>();
  for (const r of roles ?? []) {
    const prev = roleMap.get(r.user_id);
    if (!prev || r.role === "manager") roleMap.set(r.user_id, r.role as AppRole);
  }
  const profileMap = new Map<string, { email: string | null; full_name: string | null }>();
  for (const p of profiles ?? []) {
    profileMap.set(p.id, { email: p.email, full_name: p.full_name });
  }

  // Fallback emails from auth.users for members without a profile email.
  const missingEmail: string[] = ids.filter((id: string) => !profileMap.get(id)?.email);
  const authEmails = new Map<string, string>();
  for (const id of missingEmail) {
    const { data: u } = await supabaseAdmin.auth.admin.getUserById(id);
    if (u?.user?.email) authEmails.set(id, u.user.email);
  }

  return members.map((m: any) => {
    const profile = profileMap.get(m.member_user_id);
    return {
      user_id: m.member_user_id,
      email: profile?.email || authEmails.get(m.member_user_id) || "",
      full_name: profile?.full_name ?? null,
      role: roleMap.get(m.member_user_id) ?? "agent",
      is_self: m.member_user_id === currentUserId,
      is_owner: m.member_user_id === m.workspace_owner_id,
      department_id: m.department_id ?? null,
    };
  });
}

export const listAssignableMembers = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<AssignableMember[]> => {
    const { userId, supabase } = context;
    const ownerId = await resolveOwnerId(supabase, userId);
    return fetchAssignableMembers(ownerId, userId);
  });

const assignSchema = z.object({
  contactId: z.string().uuid(),
  agentUserId: z.string().uuid().nullable(),
  /**
   * Departamento de destino. `undefined` = não mexe (transferência só de
   * pessoa); `null` = tira o departamento. Quando vem departamento sem
   * pessoa, o rodízio daquele departamento escolhe.
   */
  departmentId: z.string().uuid().nullable().optional(),
});

export const assignContact = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => assignSchema.parse(input))
  .handler(
    async ({
      data,
      context,
    }): Promise<{
      ok: true;
      contactId: string;
      agentUserId: string | null;
      assignedTo: { user_id: string; full_name: string | null; email: string } | null;
    }> => {
      const { userId, supabase } = context;
      const ownerId = await resolveOwnerId(supabase, userId);

      // Only managers (donos de workspace) can transfer/assign conversations.
      const { data: isManager } = await supabaseAdmin
        .from("workspace_members")
        .select("workspace_owner_id")
        .eq("workspace_owner_id", userId)
        .eq("member_user_id", userId)
        .eq("active", true)
        .maybeSingle();
      if (!isManager) {
        throw new Error("Apenas managers podem transferir conversas.");
      }

      // 1) Confirm the contact belongs to this workspace.
      const { data: contactRow, error: contactErr } = await supabaseAdmin
        .from("contacts")
        .select("id, owner_user_id")
        .eq("id", data.contactId)
        .maybeSingle();
      if (contactErr) throw new Error(contactErr.message);
      if (!contactRow) throw new Error("Conversa não encontrada.");
      if (contactRow.owner_user_id !== ownerId) {
        throw new Error("Você não tem acesso a esta conversa.");
      }

      // 2) Departamento sem pessoa: o rodízio daquele departamento escolhe.
      // Se ninguém estiver elegível, a conversa fica no departamento sem
      // responsável — melhor que travar a transferência.
      let agentUserId = data.agentUserId;
      if (!agentUserId && data.departmentId) {
        try {
          agentUserId = await pickNextAgent(ownerId, data.departmentId);
        } catch (e) {
          console.warn("[assign] rodízio do departamento falhou:", e);
        }
      }

      // 3) If assigning, confirm the target is an active member of this workspace.
      let assignedTo: { user_id: string; full_name: string | null; email: string } | null = null;
      if (agentUserId) {
        const { data: member, error: memberErr } = await supabaseAdmin
          .from("workspace_members")
          .select("member_user_id, active")
          .eq("workspace_owner_id", ownerId)
          .eq("member_user_id", agentUserId)
          .maybeSingle();
        if (memberErr) throw new Error(memberErr.message);
        if (!member || !member.active) {
          throw new Error("Membro inválido para este workspace.");
        }
        const { data: profile } = await supabaseAdmin
          .from("profiles")
          .select("id, email, full_name")
          .eq("id", agentUserId)
          .maybeSingle();
        let email = profile?.email ?? "";
        if (!email) {
          const { data: u } = await supabaseAdmin.auth.admin.getUserById(agentUserId);
          email = u?.user?.email ?? "";
        }
        assignedTo = {
          user_id: agentUserId,
          full_name: profile?.full_name ?? null,
          email,
        };
      }

      // 4) Persist.
      const patch: Record<string, unknown> = { assigned_agent_id: agentUserId };
      if (data.departmentId !== undefined) patch.department_id = data.departmentId;

      let { error: updErr } = await supabaseAdmin
        .from("contacts")
        .update(patch)
        .eq("id", data.contactId);
      // Degradação aberta: sem a coluna no banco, transferir por pessoa
      // continua funcionando — só o departamento é ignorado.
      if (updErr && /department_id/i.test(updErr.message ?? "")) {
        const retry = await supabaseAdmin
          .from("contacts")
          .update({ assigned_agent_id: agentUserId })
          .eq("id", data.contactId);
        updErr = retry.error;
      }
      if (updErr) throw new Error(updErr.message);

      // 5) Rastro na conversa. O código que fazia isto virou órfão quando o
      // modal novo assumiu (ficou em useContactActions.transferToAgent, sem
      // nenhum chamador), então na prática NENHUMA transferência aparecia no
      // histórico. Falha aqui não desfaz a transferência: a atribuição já
      // está gravada, e perder o aviso é menos grave que perder o destino.
      try {
        const nome = assignedTo
          ? assignedTo.full_name || assignedTo.email || "outro atendente"
          : null;
        const texto = nome
          ? `Conversa transferida para ${nome}`
          : "Conversa devolvida para a fila";
        await supabaseAdmin.from("messages").insert({
          owner_user_id: ownerId,
          contact_id: data.contactId,
          direction: "system",
          message_type: "system",
          content: texto,
          status: "sent",
          is_ai: false,
        });
      } catch (e) {
        console.warn("[assign] aviso de transferência não registrado:", e);
      }

      return {
        ok: true,
        contactId: data.contactId,
        agentUserId,
        assignedTo,
      };
    },
  );
