import { supabaseAdmin } from "@/integrations/supabase/client.server";

/**
 * Resolve o DONO do workspace a partir do usuário logado.
 *
 * Por que isto existe: quase todo dado do produto é escopado por
 * `owner_user_id = <dono do workspace>`, não pelo id de quem está logado. Um
 * atendente convidado tem `userId` próprio, mas os contatos, mensagens e a
 * instância do WhatsApp pertencem ao dono. Usar `context.userId` direto nessas
 * queries faz o atendente não achar nada — foi exatamente o que quebrava o
 * envio de mensagem para quem não é dono.
 *
 * Havia três variações disto espalhadas (`getOwnerId` em
 * professionals.functions.ts, `resolveOwnerId` em assignment.functions.ts e
 * `getOwnerId` em team.functions.ts, este último retornando o próprio userId).
 * Esta é a versão server-only, com `supabaseAdmin`, para os handlers que já
 * usam service role.
 *
 * Fallback para o próprio `userId`: cobre o dono recém-criado, cuja linha
 * auto-referente em `workspace_members` é inserida por trigger no signup.
 */
export async function resolveWorkspaceOwnerId(userId: string): Promise<string> {
  const { data, error } = await supabaseAdmin
    .from("workspace_members")
    .select("workspace_owner_id")
    .eq("member_user_id", userId)
    .eq("active", true)
    .limit(1)
    .maybeSingle();
  if (error) {
    throw new Error(`Falha ao identificar workspace: ${error.message}`);
  }
  return (data?.workspace_owner_id as string) ?? userId;
}
