import { describe, it, expect } from "vitest";
import {
  formatCPF,
  formatCNPJ,
  isValidCPF,
  isValidCNPJ,
  formatDocument,
  isValidDocument,
} from "@/lib/cpf-cnpj";

describe("isValidCPF", () => {
  it("aceita CPF válido conhecido", () => {
    expect(isValidCPF("111.444.777-35")).toBe(true);
  });

  it("rejeita dígito verificador errado", () => {
    expect(isValidCPF("111.444.777-34")).toBe(false);
  });

  it("rejeita todos os dígitos iguais (formato válido, mas é fraude/teste)", () => {
    expect(isValidCPF("111.111.111-11")).toBe(false);
    expect(isValidCPF("000.000.000-00")).toBe(false);
  });

  it("rejeita vazio ou só formatação", () => {
    expect(isValidCPF("")).toBe(false);
    expect(isValidCPF("...")).toBe(false);
    expect(isValidCPF("-")).toBe(false);
  });

  it("rejeita tamanho errado", () => {
    expect(isValidCPF("123.456.789-0")).toBe(false); // 10 dígitos
    expect(isValidCPF("111.444.777-355")).toBe(false); // 12 dígitos
  });
});

describe("isValidCNPJ", () => {
  it("aceita CNPJ válido conhecido", () => {
    expect(isValidCNPJ("11.444.777/0001-61")).toBe(true);
  });

  it("rejeita dígito verificador errado", () => {
    expect(isValidCNPJ("11.444.777/0001-60")).toBe(false);
  });

  it("rejeita todos os dígitos iguais", () => {
    expect(isValidCNPJ("11.111.111/1111-11")).toBe(false);
  });

  it("rejeita vazio ou tamanho errado", () => {
    expect(isValidCNPJ("")).toBe(false);
    expect(isValidCNPJ("11.444.777/0001-6")).toBe(false); // 13 dígitos
  });
});

describe("formatCPF", () => {
  it("formata progressivamente conforme a digitação", () => {
    expect(formatCPF("111")).toBe("111");
    expect(formatCPF("111444")).toBe("111.444");
    expect(formatCPF("111444777")).toBe("111.444.777");
    expect(formatCPF("11144477735")).toBe("111.444.777-35");
  });

  it("trunca além de 11 dígitos", () => {
    expect(formatCPF("111444777351234")).toBe("111.444.777-35");
  });

  it("ignora caracteres não numéricos na entrada", () => {
    expect(formatCPF("111.444.777-35")).toBe("111.444.777-35");
  });
});

describe("formatCNPJ", () => {
  it("formata progressivamente conforme a digitação", () => {
    expect(formatCNPJ("11")).toBe("11");
    expect(formatCNPJ("11444")).toBe("11.444");
    expect(formatCNPJ("11444777")).toBe("11.444.777");
    expect(formatCNPJ("114447770001")).toBe("11.444.777/0001");
    expect(formatCNPJ("11444777000161")).toBe("11.444.777/0001-61");
  });

  it("trunca além de 14 dígitos", () => {
    expect(formatCNPJ("11444777000161999")).toBe("11.444.777/0001-61");
  });
});

describe("formatDocument / isValidDocument (dispatch por tipo)", () => {
  it("despacha pra CPF", () => {
    expect(formatDocument("11144477735", "pessoa_fisica")).toBe("111.444.777-35");
    expect(isValidDocument("111.444.777-35", "pessoa_fisica")).toBe(true);
  });

  it("despacha pra CNPJ", () => {
    expect(formatDocument("11444777000161", "pessoa_juridica")).toBe("11.444.777/0001-61");
    expect(isValidDocument("11.444.777/0001-61", "pessoa_juridica")).toBe(true);
  });

  it("CPF válido não passa como CNPJ (tamanho incompatível) e vice-versa", () => {
    expect(isValidDocument("111.444.777-35", "pessoa_juridica")).toBe(false);
    expect(isValidDocument("11.444.777/0001-61", "pessoa_fisica")).toBe(false);
  });
});
