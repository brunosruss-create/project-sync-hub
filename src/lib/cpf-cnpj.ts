// Formatação e validação de CPF/CNPJ — dados fiscais do negócio
// (Configurações → Negócio), não do usuário pessoal. Validação real de
// dígito verificador, não apenas formato — string com 11/14 dígitos que
// "parece" um documento mas tem checksum errado (ou todos os dígitos
// iguais, ex. 111.111.111-11) é rejeitada.

export type DocumentType = "pessoa_fisica" | "pessoa_juridica";

export function onlyDigits(value: string): string {
  return value.replace(/\D/g, "");
}

export function formatCPF(value: string): string {
  const d = onlyDigits(value).slice(0, 11);
  if (d.length <= 3) return d;
  if (d.length <= 6) return `${d.slice(0, 3)}.${d.slice(3)}`;
  if (d.length <= 9) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6)}`;
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
}

export function formatCNPJ(value: string): string {
  const d = onlyDigits(value).slice(0, 14);
  if (d.length <= 2) return d;
  if (d.length <= 5) return `${d.slice(0, 2)}.${d.slice(2)}`;
  if (d.length <= 8) return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5)}`;
  if (d.length <= 12) return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8)}`;
  return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
}

function checkDigit(digits: number[], weights: number[]): number {
  const sum = digits.reduce((acc, digit, i) => acc + digit * weights[i], 0);
  const rest = sum % 11;
  return rest < 2 ? 0 : 11 - rest;
}

export function isValidCPF(value: string): boolean {
  const d = onlyDigits(value);
  if (d.length !== 11) return false;
  if (/^(\d)\1{10}$/.test(d)) return false; // todos os dígitos iguais — sempre inválido

  const nums = d.split("").map(Number);
  const dv1 = checkDigit(nums.slice(0, 9), [10, 9, 8, 7, 6, 5, 4, 3, 2]);
  if (dv1 !== nums[9]) return false;
  const dv2 = checkDigit(nums.slice(0, 10), [11, 10, 9, 8, 7, 6, 5, 4, 3, 2]);
  return dv2 === nums[10];
}

export function isValidCNPJ(value: string): boolean {
  const d = onlyDigits(value);
  if (d.length !== 14) return false;
  if (/^(\d)\1{13}$/.test(d)) return false;

  const nums = d.split("").map(Number);
  const dv1 = checkDigit(nums.slice(0, 12), [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  if (dv1 !== nums[12]) return false;
  const dv2 = checkDigit(nums.slice(0, 13), [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  return dv2 === nums[13];
}

export function formatDocument(value: string, type: DocumentType): string {
  return type === "pessoa_juridica" ? formatCNPJ(value) : formatCPF(value);
}

export function isValidDocument(value: string, type: DocumentType): boolean {
  return type === "pessoa_juridica" ? isValidCNPJ(value) : isValidCPF(value);
}
