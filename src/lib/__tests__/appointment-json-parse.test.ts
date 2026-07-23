// Testes do parsing resiliente do bloco APPOINTMENT_JSON — cobre o bug real
// relatado (IA emitindo 2 marcadores na mesma resposta, o que quebrava o
// regex antigo e virava um "problema técnico" genérico).
import { describe, it, expect } from "vitest";
import { extractAppointmentPayloads } from "@/lib/appointment-json";

describe("extractAppointmentPayloads", () => {
  it("retorna null quando não há marcador", () => {
    expect(extractAppointmentPayloads("Olá, tudo bem?")).toBeNull();
  });

  it("extrai um objeto único (formato retrocompatível)", () => {
    const text =
      'Pronto, agendado!\nAPPOINTMENT_JSON:{"service_name":"Corte","starts_at":"2026-07-24T09:00:00-03:00"}';
    const r = extractAppointmentPayloads(text)!;
    expect(r.malformedCount).toBe(0);
    expect(r.payloads).toHaveLength(1);
    expect(r.payloads[0].service_name).toBe("Corte");
    expect(r.cleanedText).toBe("Pronto, agendado!");
  });

  it("extrai um array com 2 itens (lote)", () => {
    const text =
      'Pronto!\nAPPOINTMENT_JSON:[{"service_name":"Corte","client_name":"Bruno"},{"service_name":"Corte","client_name":"Gabriela"}]';
    const r = extractAppointmentPayloads(text)!;
    expect(r.malformedCount).toBe(0);
    expect(r.payloads).toHaveLength(2);
    expect(r.payloads.map((p) => p.client_name)).toEqual(["Bruno", "Gabriela"]);
  });

  it("caso defensivo: 2 marcadores separados na mesma resposta (violação da regra de prompt)", () => {
    const text =
      'APPOINTMENT_JSON:{"service_name":"Corte","client_name":"Bruno"}APPOINTMENT_JSON:{"service_name":"Corte","client_name":"Gabriela"}';
    const r = extractAppointmentPayloads(text)!;
    // cada marcador é um segmento independente — nenhum corrompe o outro
    expect(r.malformedCount).toBe(0);
    expect(r.payloads).toHaveLength(2);
    expect(r.payloads.map((p) => p.client_name)).toEqual(["Bruno", "Gabriela"]);
  });

  it("JSON malformado no final vira malformedCount, sem lançar exceção", () => {
    const text = 'Pronto!\nAPPOINTMENT_JSON:{"service_name":"Corte", oops isso não é json}';
    const r = extractAppointmentPayloads(text)!;
    expect(r.payloads).toHaveLength(0);
    expect(r.malformedCount).toBe(1);
  });

  it("1 segmento válido + 1 malformado — mantém o válido, conta o malformado", () => {
    const text = 'APPOINTMENT_JSON:{"service_name":"Corte"}APPOINTMENT_JSON:{quebrado';
    const r = extractAppointmentPayloads(text)!;
    expect(r.payloads).toHaveLength(1);
    expect(r.payloads[0].service_name).toBe("Corte");
    expect(r.malformedCount).toBe(1);
  });
});
