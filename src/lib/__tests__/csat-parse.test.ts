import { describe, it, expect } from "vitest";
import { parseCsatRating } from "@/lib/csat";

describe("parseCsatRating — nota reconhecida", () => {
  it.each([
    ["5", 5],
    ["1", 1],
    [" 3 ", 3],
    ["5!", 5],
    ["4.", 4],
    ["nota 5", 5],
    ["Nota: 4", 4],
    ["dou 3", 3],
  ])("%j → %i", (input, expected) => {
    expect(parseCsatRating(input)).toEqual({ kind: "rating", rating: expected });
  });

  it("aceita nota com comentário curto — é nota com contexto, não reclamação", () => {
    expect(parseCsatRating("4 mas demorou")).toEqual({ kind: "rating", rating: 4 });
  });

  it.each([
    ["cinco", 5],
    ["Três", 3],
    ["tres", 3],
    ["quatro estrelas", 4],
    ["dois", 2],
  ])("por extenso %j → %i", (input, expected) => {
    expect(parseCsatRating(input)).toEqual({ kind: "rating", rating: expected });
  });

  it("conta estrelas", () => {
    expect(parseCsatRating("⭐⭐⭐⭐")).toEqual({ kind: "rating", rating: 4 });
    expect(parseCsatRating("⭐⭐⭐⭐⭐")).toEqual({ kind: "rating", rating: 5 });
  });
});

describe("parseCsatRating — fora da faixa", () => {
  it.each([["10"], ["0"], ["7"], ["vcs sao 10"]])("%j é out_of_range", (input) => {
    expect(parseCsatRating(input).kind).toBe("out_of_range");
  });
});

describe("parseCsatRating — guard de unidade", () => {
  // O falso positivo mais provável na prática: o cliente pede um tempo e
  // levaria uma nota. Sem este guard, "5 minutos" vira nota 5.
  it.each([
    ["5 minutos"],
    ["5 min"],
    ["me da 2 horas"],
    ["R$ 5"],
    ["custa 5 reais"],
    ["as 15h"],
    ["3 dias"],
  ])("%j não é nota", (input) => {
    expect(parseCsatRating(input)).toEqual({ kind: "none" });
  });
});

describe("parseCsatRating — não é resposta de pesquisa", () => {
  it.each([
    ["quero remarcar pra terca"],
    ["obrigado!"],
    ["👍"],
    [""],
    ["   "],
    ["bom dia, tudo bem?"],
  ])("%j → none", (input) => {
    expect(parseCsatRating(input)).toEqual({ kind: "none" });
  });

  it("texto longo com número é reclamação, não nota", () => {
    const longo =
      "olha eu acho que o atendimento foi 5 mas na verdade queria reclamar de outra coisa que aconteceu";
    expect(parseCsatRating(longo)).toEqual({ kind: "none" });
  });

  it("palavra contendo 'um' não vira nota 1", () => {
    // Sem \b no regex, "algum" e "nenhum" virariam nota 1.
    expect(parseCsatRating("algum problema")).toEqual({ kind: "none" });
    expect(parseCsatRating("nenhum")).toEqual({ kind: "none" });
  });

  it("entrada inválida não estoura", () => {
    expect(parseCsatRating(null as any)).toEqual({ kind: "none" });
    expect(parseCsatRating(undefined as any)).toEqual({ kind: "none" });
  });
});
