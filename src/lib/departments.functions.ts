import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { resolveWorkspaceOwnerId } from "@/lib/workspace.server";

/**
 * Departamentos (Vendas, Financeiro, Suporte…). Agrupam membros da equipe e
 * são o primeiro passo da transferência: escolhe-se o departamento e, se
 * ninguém for escolhido, o rodízio daquele departamento decide.
 *
 * Um membro pertence a no máximo um departamento (`workspace_members.department_id`).
 */
export type Department = {
  id: string;
  owner_user_id: string;
  name: string;
  color: string | null;
  position: number;
  is_active: boolean;
  created_at: string;
  /** Quantos membros ativos — só no `listDepartments`, para a tela. */
  member_count?: number;
};

const COLS = "id,owner_user_id,name,color,position,is_active,created_at";

async function assertManager(supabase: any, userId: string) {
  const { data, error } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "manager")
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Apenas managers podem gerenciar departamentos.");
}

/**
 * Sem a tabela no banco (migration não aplicada) devolve lista vazia em vez de
 * derrubar a tela: sem departamento nenhum, o app inteiro se comporta como
 * antes de a feature existir.
 */
export const listDepartments = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<Department[]> => {
    const { supabase, userId } = context;
    const ownerId = await resolveWorkspaceOwnerId(userId);

    const { data, error } = await supabaseAdmin
      .from("departments")
      .select(COLS)
      .eq("owner_user_id", ownerId)
      .order("position", { ascending: true })
      .order("created_at", { ascending: true });
    if (error) {
      console.warn("[departments] indisponível:", error.message);
      return [];
    }

    const rows = (data ?? []) as Department[];
    if (rows.length === 0) return rows;

    // Contagem por departamento numa consulta só — N+1 aqui seria uma query
    // por departamento a cada abertura da tela.
    const { data: members } = await supabaseAdmin
      .from("workspace_members")
      .select("department_id")
      .eq("workspace_owner_id", ownerId)
      .eq("active", true);
    const counts = new Map<string, number>();
    for (const m of members ?? []) {
      const id = (m as any).department_id;
      if (id) counts.set(id, (counts.get(id) ?? 0) + 1);
    }
    return rows.map((d) => ({ ...d, member_count: counts.get(d.id) ?? 0 }));
  });

const createSchema = z.object({
  name: z.string().min(1).max(60),
  color: z.string().max(20).optional().nullable(),
});

export const createDepartment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => createSchema.parse(input))
  .handler(async ({ data, context }): Promise<Department> => {
    const { supabase, userId } = context;
    await assertManager(supabase, userId);
    const ownerId = await resolveWorkspaceOwnerId(userId);
    if (ownerId !== userId) {
      throw new Error("Apenas o dono do workspace pode criar departamentos.");
    }

    // Entra no fim da lista.
    const { data: last } = await supabaseAdmin
      .from("departments")
      .select("position")
      .eq("owner_user_id", ownerId)
      .order("position", { ascending: false })
      .limit(1)
      .maybeSingle();

    const { data: row, error } = await supabaseAdmin
      .from("departments")
      .insert({
        owner_user_id: ownerId,
        name: data.name.trim(),
        color: data.color ?? null,
        position: ((last as any)?.position ?? -1) + 1,
      })
      .select(COLS)
      .single();
    if (error) {
      // Índice único por (owner, lower(name)).
      if (/duplicate key|unique/i.test(error.message)) {
        throw new Error("Já existe um departamento com esse nome.");
      }
      throw new Error(error.message);
    }
    return row as Department;
  });

const updateSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(60).optional(),
  color: z.string().max(20).nullable().optional(),
  is_active: z.boolean().optional(),
  position: z.number().int().min(0).max(9999).optional(),
});

export const updateDepartment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => updateSchema.parse(input))
  .handler(async ({ data, context }): Promise<Department> => {
    const { supabase, userId } = context;
    await assertManager(supabase, userId);
    const ownerId = await resolveWorkspaceOwnerId(userId);
    const { id, ...patch } = data;
    if (typeof patch.name === "string") patch.name = patch.name.trim();

    const { data: row, error } = await supabaseAdmin
      .from("departments")
      .update(patch)
      .eq("id", id)
      .eq("owner_user_id", ownerId)
      .select(COLS)
      .single();
    if (error) {
      if (/duplicate key|unique/i.test(error.message)) {
        throw new Error("Já existe um departamento com esse nome.");
      }
      throw new Error(error.message);
    }
    return row as Department;
  });

const deleteSchema = z.object({ id: z.string().uuid() });

/**
 * Apagar não apaga membro nem conversa: as FKs são `on delete set null`, então
 * ambos voltam para "sem departamento".
 */
export const deleteDepartment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => deleteSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertManager(supabase, userId);
    const ownerId = await resolveWorkspaceOwnerId(userId);

    const { error } = await supabaseAdmin
      .from("departments")
      .delete()
      .eq("id", data.id)
      .eq("owner_user_id", ownerId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
