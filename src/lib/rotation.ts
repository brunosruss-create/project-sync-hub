/**
 * Rodízio ponderado de conversas — lógica pura.
 *
 * Sem nenhum import de Supabase de propósito: o I/O vive em
 * `rotation.server.ts`, e a UI da tela de Equipe importa daqui para descrever
 * a proporção. Testado em `__tests__/rotation.test.ts`.
 */

export type RotationMember = {
  userId: string;
  /** 1 a 100. Peso 2 = recebe o dobro de conversas de quem tem 1. */
  weight: number;
};

/** Peso fora da faixa vira 1 — a função não confia no banco. */
function safeWeight(w: unknown): number {
  const n = Math.floor(Number(w));
  if (!Number.isFinite(n) || n < 1) return 1;
  return Math.min(n, 100);
}

/**
 * Expande os pesos em slots. Pesos 2,2,1 viram [A, A, B, B, C].
 *
 * Distribuição EM BLOCO, não intercalada — é o que o usuário descreveu
 * ("2 atendimentos para o primeiro, 2 para o segundo, 1 para o terceiro, e
 * volta tudo de novo"). A alternativa seria round-robin ponderado suave
 * (A, B, A, B, C), que espalha melhor em janelas curtas mas contradiz o pedido
 * e é mais difícil de explicar na tela. Para trocar, basta reescrever ESTA
 * função — o contador, o RPC e o gatilho não mudam.
 *
 * A ordem da entrada define a ordem dos slots, então quem chama precisa
 * garantir ordenação estável (ver rotation.server.ts).
 */
export function expandSlots(members: RotationMember[]): string[] {
  const slots: string[] = [];
  for (const m of members ?? []) {
    if (!m?.userId) continue;
    const w = safeWeight(m.weight);
    for (let i = 0; i < w; i++) slots.push(m.userId);
  }
  return slots;
}

/**
 * Escolhe o slot correspondente ao contador.
 *
 * O contador vem do RPC `next_rotation_counter`, que devolve 1 na primeira
 * chamada — daí o `- 1`. A dupla modulagem protege contra contador negativo,
 * que produziria índice negativo e `undefined`.
 */
export function pickFromSlots(slots: string[], counter: number): string | null {
  const n = slots?.length ?? 0;
  if (n === 0) return null;
  const c = Math.floor(Number(counter));
  if (!Number.isFinite(c)) return null;
  const idx = (((c - 1) % n) + n) % n;
  return slots[idx] ?? null;
}

/**
 * Assinatura da configuração vigente. Quando ela muda, o RPC reinicia o ciclo
 * do primeiro slot — senão alterar um peso deslocaria o mapeamento no meio do
 * ciclo e alguém receberia duas seguidas ou seria pulado.
 *
 * Sensível à ORDEM de propósito: a ordem é o que define os slots.
 */
export function slotsSignature(members: RotationMember[]): string {
  return (members ?? [])
    .filter((m) => m?.userId)
    .map((m) => `${m.userId}:${safeWeight(m.weight)}`)
    .join("|");
}

/**
 * Descreve a proporção para a UI. `totalWeight` é o tamanho do ciclo: com
 * 2-2-1, "a cada 5 conversas, este recebe 2".
 */
export function describeRotation(members: RotationMember[]): {
  totalWeight: number;
  eligibleCount: number;
} {
  const valid = (members ?? []).filter((m) => m?.userId);
  return {
    totalWeight: valid.reduce((sum, m) => sum + safeWeight(m.weight), 0),
    eligibleCount: valid.length,
  };
}
