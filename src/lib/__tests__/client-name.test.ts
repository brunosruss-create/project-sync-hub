// Bug real: agendamento em lote pra 2 pessoas foi criado com
// client_name "Mãe do Bruno" — a IA não perguntou o nome real apesar da
// regra no prompt. Aqui o enforcement fica em código.
import { describe, it, expect } from "vitest";
import { looksLikeGenericName } from "@/lib/client-name";

describe("looksLikeGenericName", () => {
  it("pega o caso exato que vazou em produção", () => {
    expect(looksLikeGenericName("Mãe do Bruno")).toBe(true);
  });

  it("pega parentesco sozinho, com e sem acento", () => {
    for (const v of ["mãe", "mae", "Pai", "esposa", "filha", "irmão", "avó", "sogra", "tia"]) {
      expect(looksLikeGenericName(v)).toBe(true);
    }
  });

  it("pega descrição possessiva", () => {
    expect(looksLikeGenericName("minha esposa")).toBe(true);
    expect(looksLikeGenericName("meu filho mais novo")).toBe(true);
    expect(looksLikeGenericName("Minha Filha")).toBe(true);
  });

  it("pega parentesco com complemento", () => {
    expect(looksLikeGenericName("filha da Ana")).toBe(true);
    expect(looksLikeGenericName("amigo do trabalho")).toBe(true);
  });

  it("NÃO bloqueia nomes reais", () => {
    for (const v of [
      "Maria",
      "Ana Paula",
      "Bruno Russo",
      "Gabriela",
      "João Pedro da Silva",
      "Dr Pedro",
      "Jaqueline",
    ]) {
      expect(looksLikeGenericName(v)).toBe(false);
    }
  });

  it("NÃO bloqueia nome real que contém a palavra fora da primeira posição", () => {
    // "Ana Maria" — 'maria' não é parentesco, mas garante que só a 1ª palavra manda
    expect(looksLikeGenericName("Ana Maria da Silva")).toBe(false);
    expect(looksLikeGenericName("Silvana Amiga")).toBe(false);
  });

  it("vazio/nulo não é considerado genérico (cai no fallback do contato)", () => {
    expect(looksLikeGenericName("")).toBe(false);
    expect(looksLikeGenericName(null)).toBe(false);
    expect(looksLikeGenericName(undefined)).toBe(false);
  });
});
