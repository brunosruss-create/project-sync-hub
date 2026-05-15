import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type Professional = {
  id: string;
  owner_user_id: string;
  name: string;
  role: string;
  phone: string;
  email: string;
  avatar_url: string | null;
  avatar_color: string | null;
  linked_user_id: string | null;
  is_active: boolean;
  created_at: string;
};

async function getOwnerId(supabase: any): Promise<string> {
  const { data, error } = await supabase.rpc("get_my_workspace_owner");
  if (error || !data) throw new Error(error?.message || "workspace owner não encontrado");
  return data as string;
}

async function assertManager(supabase: any, userId: string) {
  const { data, error } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "manager")
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Apenas managers podem gerenciar profissionais.");
}

export const listProfessionals = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<Professional[]> => {
    const { supabase } = context;
    const ownerId = await getOwnerId(supabase);
    const { data, error } = await supabase
      .from("professionals")
      .select("*")
      .eq("owner_user_id", ownerId)
      .order("created_at", { ascending: true });
    if (error) throw new Error(error.message);
    return (data ?? []) as Professional[];
  });

const createSchema = z.object({
  name: z.string().min(1).max(120),
  role: z.string().max(80).optional().default(""),
  phone: z.string().max(40).optional().default(""),
  email: z.string().email().max(255).optional().or(z.literal("")).default(""),
  avatar_url: z.string().url().max(500).nullable().optional(),
  avatar_color: z.string().max(20).nullable().optional(),
  linked_user_id: z.string().uuid().nullable().optional(),
  is_active: z.boolean().optional().default(true),
});

export const createProfessional = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => createSchema.parse(input))
  .handler(async ({ data, context }): Promise<Professional> => {
    const { supabase, userId } = context;
    await assertManager(supabase, userId);
    const ownerId = await getOwnerId(supabase);
    if (ownerId !== userId) {
      throw new Error("Apenas o dono do workspace pode cadastrar profissionais.");
    }
    const { data: row, error } = await supabase
      .from("professionals")
      .insert({
        owner_user_id: ownerId,
        name: data.name,
        role: data.role ?? "",
        phone: data.phone ?? "",
        email: data.email ?? "",
        avatar_url: data.avatar_url ?? null,
        avatar_color: data.avatar_color ?? null,
        linked_user_id: data.linked_user_id ?? null,
        is_active: data.is_active ?? true,
      })
      .select("*")
      .single();
    if (error || !row) throw new Error(error?.message || "Falha ao criar profissional");
    return row as Professional;
  });

const updateSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(120).optional(),
  role: z.string().max(80).optional(),
  phone: z.string().max(40).optional(),
  email: z.string().email().max(255).or(z.literal("")).optional(),
  avatar_url: z.string().url().max(500).nullable().optional(),
  avatar_color: z.string().max(20).nullable().optional(),
  linked_user_id: z.string().uuid().nullable().optional(),
  is_active: z.boolean().optional(),
});

export const updateProfessional = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => updateSchema.parse(input))
  .handler(async ({ data, context }): Promise<Professional> => {
    const { supabase, userId } = context;
    await assertManager(supabase, userId);
    const { id, ...patch } = data;
    const { data: row, error } = await supabase
      .from("professionals")
      .update(patch)
      .eq("id", id)
      .eq("owner_user_id", userId)
      .select("*")
      .single();
    if (error || !row) throw new Error(error?.message || "Falha ao atualizar");
    return row as Professional;
  });

const deleteSchema = z.object({ id: z.string().uuid() });

export const deleteProfessional = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => deleteSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertManager(supabase, userId);
    const { error } = await supabase
      .from("professionals")
      .delete()
      .eq("id", data.id)
      .eq("owner_user_id", userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
