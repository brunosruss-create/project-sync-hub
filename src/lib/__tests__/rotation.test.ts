import { describe, it, expect } from "vitest";
import {
  expandSlots,
  pickFromSlots,
  slotsSignature,
  describeRotation,
  type RotationMember,
} from "@/lib/rotation";

const A = "agent-a";
const B = "agent-b";
const C = "agent-c";

/** O caso que o usuário descreveu: 3 atendentes em 2-2-1. */
const DOIS_DOIS_UM: RotationMember[] = [
  { userId: A, weight: 2 },
  { userId: B, weight: 2 },
  { userId: C, weight: 1 },
];

describe("expandSlots", () => {
  it("expande 2-2-1 em blocos, nesta ordem exata", () => {
    // Contrato pedido pelo usuário — se alguém trocar para round-robin suave
    // (A,B,A,B,C) este teste acusa.
    expect(expandSlots(DOIS_DOIS_UM)).toEqual([A, A, B, B, C]);
  });

  it("lista vazia vira nenhum slot", () => {
    expect(expandSlots([])).toEqual([]);
  });

  it("um atendente sozinho fica com todos os slots", () => {
    expect(expandSlots([{ userId: A, weight: 1 }])).toEqual([A]);
    expect(expandSlots([{ userId: A, weight: 3 }])).toEqual([A, A, A]);
  });

  it("pesos iguais viram round-robin puro", () => {
    expect(
      expandSlots([
        { userId: A, weight: 1 },
        { userId: B, weight: 1 },
        { userId: C, weight: 1 },
      ]),
    ).toEqual([A, B, C]);
  });

  it("peso inválido cai para 1 em vez de sumir ou estourar", () => {
    // O check do banco protege, mas a função não confia no banco.
    const slots = expandSlots([
      { userId: A, weight: 0 },
      { userId: B, weight: -5 },
      { userId: C, weight: Number.NaN },
    ]);
    expect(slots).toEqual([A, B, C]);
  });

  it("peso acima do máximo é limitado a 100", () => {
    expect(expandSlots([{ userId: A, weight: 999 }])).toHaveLength(100);
  });

  it("ignora entrada sem userId", () => {
    expect(expandSlots([{ userId: "", weight: 3 }])).toEqual([]);
  });
});

describe("pickFromSlots", () => {
  const slots = expandSlots(DOIS_DOIS_UM);

  it("contador 1 devolve o PRIMEIRO slot", () => {
    // O RPC devolve 1 na primeira chamada. Sem o `- 1`, o primeiro
    // atendimento do ciclo iria para o slot errado — é o off-by-one clássico.
    expect(pickFromSlots(slots, 1)).toBe(A);
  });

  it("percorre o ciclo 2-2-1 e volta tudo de novo", () => {
    const primeiraVolta = [1, 2, 3, 4, 5].map((c) => pickFromSlots(slots, c));
    expect(primeiraVolta).toEqual([A, A, B, B, C]);

    // "e volta tudo de novo" — a parte literal do pedido.
    const segundaVolta = [6, 7, 8, 9, 10].map((c) => pickFromSlots(slots, c));
    expect(segundaVolta).toEqual([A, A, B, B, C]);
  });

  it("sem slots devolve null, não undefined nem exceção", () => {
    expect(pickFromSlots([], 1)).toBeNull();
  });

  it("contador gigante continua dentro da faixa", () => {
    const escolhido = pickFromSlots(slots, Number.MAX_SAFE_INTEGER);
    expect(slots).toContain(escolhido);
  });

  it("contador 0 ou negativo não gera índice negativo", () => {
    expect(slots).toContain(pickFromSlots(slots, 0));
    expect(slots).toContain(pickFromSlots(slots, -3));
  });

  it("contador inválido devolve null", () => {
    expect(pickFromSlots(slots, Number.NaN)).toBeNull();
  });
});

describe("slotsSignature", () => {
  it("muda quando um peso muda", () => {
    const antes = slotsSignature(DOIS_DOIS_UM);
    const depois = slotsSignature([
      { userId: A, weight: 3 },
      { userId: B, weight: 2 },
      { userId: C, weight: 1 },
    ]);
    expect(depois).not.toBe(antes);
  });

  it("muda quando a ordem muda", () => {
    // A ordem define os slots, então reordenar é mudança de configuração.
    const antes = slotsSignature(DOIS_DOIS_UM);
    const depois = slotsSignature([
      { userId: B, weight: 2 },
      { userId: A, weight: 2 },
      { userId: C, weight: 1 },
    ]);
    expect(depois).not.toBe(antes);
  });

  it("muda quando um atendente entra ou sai", () => {
    const semC = slotsSignature(DOIS_DOIS_UM.slice(0, 2));
    expect(semC).not.toBe(slotsSignature(DOIS_DOIS_UM));
  });

  it("é estável para a mesma configuração", () => {
    expect(slotsSignature(DOIS_DOIS_UM)).toBe(slotsSignature([...DOIS_DOIS_UM]));
  });
});

describe("describeRotation", () => {
  it("o ciclo tem o tamanho da soma dos pesos", () => {
    expect(describeRotation(DOIS_DOIS_UM)).toEqual({ totalWeight: 5, eligibleCount: 3 });
  });

  it("lista vazia não divide por zero em quem consumir", () => {
    expect(describeRotation([])).toEqual({ totalWeight: 0, eligibleCount: 0 });
  });
});
