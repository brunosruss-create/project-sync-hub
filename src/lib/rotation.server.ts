import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { expandSlots, pickFromSlots, slotsSignature, type RotationMember } from "@/lib/rotation";

/**
 * Escolhe o próximo atendente do rodízio ponderado do workspace.
 *
 * Retorna `null` quando ninguém está elegível — nesse caso o chamador NÃO deve
 * atribuir, preservando o comportamento anterior (conversa fica em "waiting"
 * sem responsável e a IA continua respondendo). É o default de todo workspace
 * solo, já que o dono nasce fora do rodízio.
 *
 * Roda no worker, com service role. Não reaproveita `listAssignableMembers`
 * (assignment.functions.ts) de propósito: aquela é uma server fn com middleware
 * de auth e guard de manager, e não existe request nem sessão aqui.
 */
export async function pickNextAgent(
  ownerId: string,
  /**
   * Restringe o rodízio a um departamento. `null`/ausente = workspace inteiro
   * (comportamento de antes dos departamentos). Cada departamento tem o
   * próprio ciclo — ver `department_key` em `rotation_state`.
   */
  departmentId?: string | null,
): Promise<string | null> {
  const COLS = "member_user_id, rotation_weight, created_at";
  const build = (cols: string) => {
    let q = supabaseAdmin
      .from("workspace_members")
      .select(cols)
      .eq("workspace_owner_id", ownerId)
      .eq("active", true)
      .eq("rotation_enabled", true);
    if (departmentId) q = q.eq("department_id", departmentId);
    return (
      q
        // `created_at` sozinho NÃO é ordenação estável: é `timestamptz default
        // now()` e `now()` é o tempo da TRANSAÇÃO, então os backfills que
        // inseriram vários membros de uma vez têm timestamps idênticos. Sem o
        // desempate por id, o Postgres pode devolver ordens diferentes entre
        // chamadas e os slots trocariam de dono no meio do ciclo.
        .order("created_at", { ascending: true })
        .order("member_user_id", { ascending: true })
    );
  };

  let { data, error } = await build(COLS);
  // Sem a coluna no banco, o rodízio do workspace inteiro continua girando —
  // só o recorte por departamento é ignorado.
  if (error && /department_id/i.test(error.message ?? "")) {
    const retry = await supabaseAdmin
      .from("workspace_members")
      .select(COLS)
      .eq("workspace_owner_id", ownerId)
      .eq("active", true)
      .eq("rotation_enabled", true)
      .order("created_at", { ascending: true })
      .order("member_user_id", { ascending: true });
    data = retry.data as any;
    error = retry.error;
  }

  if (error) throw new Error(`rodízio: falha ao listar elegíveis — ${error.message}`);

  const members: RotationMember[] = (data ?? []).map((m: any) => ({
    userId: m.member_user_id as string,
    weight: m.rotation_weight as number,
  }));
  if (members.length === 0) return null;

  const slots = expandSlots(members);
  if (slots.length === 0) return null;

  // O contador é incrementado ANTES de a conversa ser gravada, de propósito: se
  // a gravação falhar, aquele atendente perde a vez. O inverso (gravar e depois
  // incrementar) abriria a janela para várias conversas simultâneas caírem no
  // mesmo atendente — exatamente o que o RPC atômico existe para evitar.
  const { data: counter, error: rpcError } = await supabaseAdmin.rpc("next_rotation_counter", {
    p_owner_id: ownerId,
    p_signature: slotsSignature(members),
    p_department_id: departmentId ?? null,
  });
  if (rpcError) throw new Error(`rodízio: falha ao avançar o ciclo — ${rpcError.message}`);

  return pickFromSlots(slots, Number(counter));
}

/**
 * Rodízio para workspace SEM IA, no momento em que a conversa cai em
 * "Aguardando" (contato novo, ou conversa resolvida/arquivada que recebe
 * mensagem de novo).
 *
 * Por que existe separado de `pickNextAgent`: o gatilho principal é o handoff
 * da IA (`transfer_to_human`), mas ele nunca acontece quando `ai_enabled` é
 * false — `runAiResponse` devolve `skip` antes. Sem isto, o rodízio ficaria
 * amarrado à IA por acidente de implementação, e quem desliga o robô nunca
 * teria distribuição.
 *
 * Devolve `null` (não atribui) quando:
 * - a IA está LIGADA — nesse caso quem distribui é o handoff; atribuir aqui
 *   desligaria o robô logo na primeira mensagem, que é o oposto do desejado;
 * - não há ninguém no rodízio;
 * - qualquer falha — nunca propaga, para não derrubar a ingestão de mensagens.
 */
export async function pickAgentForWaiting(
  ownerId: string,
  departmentId?: string | null,
): Promise<string | null> {
  try {
    const { data: profile, error } = await supabaseAdmin
      .from("profiles")
      .select("ai_enabled")
      .eq("id", ownerId)
      .maybeSingle();
    // Na dúvida (erro na leitura), não atribui: assumir "IA desligada" por
    // engano silenciaria o robô de quem depende dele.
    if (error || !profile || (profile as any).ai_enabled !== false) return null;

    return await pickNextAgent(ownerId, departmentId);
  } catch (e: any) {
    console.warn("[rodízio] falha ao atribuir na entrada em Aguardando:", e?.message ?? e);
    return null;
  }
}
