import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Respostas rápidas: textos pré-salvos que o atendente insere no composer.
 *
 * Diferente das mensagens automáticas (`messages.functions.ts`), que são um
 * conjunto fixo de 6 chaves em colunas de `profiles`, estas são uma lista de
 * tamanho variável por workspace — daí tabela própria.
 *
 * O corpo aceita as mesmas variáveis das mensagens automáticas: {{cliente}} e
 * {{negocio}}, renderizadas por `renderTemplate` no momento da inserção.
 */
export type QuickReply = {
  id: string;
  owner_user_id: string;
  title: string;
  /** Atalho digitável, sem a barra. Ex.: "bomdia" → o agente digita /bomdia. */
  shortcut: string;
  body: string;
  sort_order: number;
  is_active: boolean;
  created_at: string;
};

async function getOwnerId(supabase: any, userId: string): Promise<string> {
  const { data, error } = await supabase
    .from("workspace_members")
    .select("workspace_owner_id")
    .eq("member_user_id", userId)
    .eq("active", true)
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`Falha ao identificar workspace: ${error.message}`);
  return (data?.workspace_owner_id as string) ?? userId;
}

async function assertManager(supabase: any, userId: string) {
  const { data, error } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "manager")
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Apenas managers podem gerenciar respostas rápidas.");
}

/**
 * Leitura liberada para todo membro do workspace — o atendente precisa usar as
 * respostas, mesmo não podendo editá-las. A RLS já garante o escopo por
 * workspace; aqui filtramos por owner só para não depender exclusivamente dela.
 */
export const listQuickReplies = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<QuickReply[]> => {
    const { supabase, userId } = context;
    const ownerId = await getOwnerId(supabase, userId);
    const { data, error } = await supabase
      .from("quick_replies")
      .select("*")
      .eq("owner_user_id", ownerId)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true });
    if (error) throw new Error(error.message);
    return (data ?? []) as QuickReply[];
  });

// Atalho sem barra e sem espaço: a barra é digitada pelo agente e o parser do
// composer separa por espaço.
const shortcutSchema = z
  .string()
  .max(40)
  .regex(/^[a-z0-9_-]*$/i, "Use apenas letras, números, hífen ou underscore.")
  .optional()
  .default("");

const createSchema = z.object({
  title: z.string().min(1).max(120),
  shortcut: shortcutSchema,
  body: z.string().min(1).max(4096),
  sort_order: z.number().int().min(0).max(9999).optional().default(0),
  is_active: z.boolean().optional().default(true),
});

export const createQuickReply = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => createSchema.parse(input))
  .handler(async ({ data, context }): Promise<QuickReply> => {
    const { supabase, userId } = context;
    await assertManager(supabase, userId);
    const ownerId = await getOwnerId(supabase, userId);
    if (ownerId !== userId) {
      throw new Error("Apenas o dono do workspace pode criar respostas rápidas.");
    }
    const { data: row, error } = await supabase
      .from("quick_replies")
      .insert({
        owner_user_id: ownerId,
        title: data.title,
        shortcut: (data.shortcut ?? "").toLowerCase(),
        body: data.body,
        sort_order: data.sort_order ?? 0,
        is_active: data.is_active ?? true,
      })
      .select("*")
      .single();
    if (error || !row) throw new Error(error?.message || "Falha ao criar resposta rápida");
    return row as QuickReply;
  });

const updateSchema = z.object({
  id: z.string().uuid(),
  title: z.string().min(1).max(120).optional(),
  shortcut: shortcutSchema,
  body: z.string().min(1).max(4096).optional(),
  sort_order: z.number().int().min(0).max(9999).optional(),
  is_active: z.boolean().optional(),
});

export const updateQuickReply = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => updateSchema.parse(input))
  .handler(async ({ data, context }): Promise<QuickReply> => {
    const { supabase, userId } = context;
    await assertManager(supabase, userId);
    const ownerId = await getOwnerId(supabase, userId);
    const { id, ...patch } = data;
    if (typeof patch.shortcut === "string") patch.shortcut = patch.shortcut.toLowerCase();
    const { data: row, error } = await supabase
      .from("quick_replies")
      .update(patch)
      .eq("id", id)
      .eq("owner_user_id", ownerId)
      .select("*")
      .single();
    if (error || !row) throw new Error(error?.message || "Falha ao atualizar");
    return row as QuickReply;
  });

const deleteSchema = z.object({ id: z.string().uuid() });

export const deleteQuickReply = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => deleteSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertManager(supabase, userId);
    const ownerId = await getOwnerId(supabase, userId);
    const { error } = await supabase
      .from("quick_replies")
      .delete()
      .eq("id", data.id)
      .eq("owner_user_id", ownerId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
