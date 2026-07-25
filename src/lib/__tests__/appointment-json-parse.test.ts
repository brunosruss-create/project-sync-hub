// Testes do parsing resiliente do bloco APPOINTMENT_JSON — cobre o bug real
// relatado (IA emitindo 2 marcadores na mesma resposta, o que quebrava o
// regex antigo e virava um "problema técnico" genérico).
import { describe, it, expect } from "vitest";
import {
  extractAppointmentPayloads,
  extractJsonBlocks,
  stripProtocolBlocks,
} from "@/lib/appointment-json";

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

// Bug real em produção: o cliente pediu pra remarcar 2 agendamentos, a IA
// emitiu RESCHEDULE_JSON com um ARRAY, o regex antigo só aceitava objeto
// (/RESCHEDULE_JSON:(\{...\})/) e não casou — então o bloco nunca foi
// processado NEM removido: o JSON cru, com uuids, foi enviado no WhatsApp do
// cliente e a remarcação não aconteceu.
describe("extractJsonBlocks — RESCHEDULE_JSON / CANCEL_JSON", () => {
  it("extrai array de remarcações (o caso que vazou em produção)", () => {
    const text =
      'Reagendado!\n\nRESCHEDULE_JSON:[{"appointment_id":"5e32f990-2f2a-49c2-a569-cd9276b3c32b","new_starts_at":"2026-07-27T10:00:00-03:00"},{"appointment_id":"b9f09da6-ec73-49d4-8c32-39f17233d448","new_starts_at":"2026-07-27T10:30:00-03:00"}]';
    const r = extractJsonBlocks(text, "RESCHEDULE_JSON:")!;
    expect(r.malformedCount).toBe(0);
    expect(r.payloads).toHaveLength(2);
    expect(r.payloads[1].new_starts_at).toBe("2026-07-27T10:30:00-03:00");
    // e o cliente vê só a frase, nunca o protocolo
    expect(r.cleanedText).toBe("Reagendado!");
    expect(r.cleanedText).not.toContain("RESCHEDULE_JSON");
  });

  it("objeto único continua funcionando (retrocompatível)", () => {
    const text = 'Reagendado!\nRESCHEDULE_JSON:{"appointment_id":"abc","new_starts_at":"x"}';
    const r = extractJsonBlocks(text, "RESCHEDULE_JSON:")!;
    expect(r.payloads).toHaveLength(1);
    expect(r.cleanedText).toBe("Reagendado!");
  });

  it("mesmo com JSON quebrado, o bloco NUNCA sobra no texto do cliente", () => {
    const text = "Cancelado!\nCANCEL_JSON:{isso não é json";
    const r = extractJsonBlocks(text, "CANCEL_JSON:")!;
    expect(r.payloads).toHaveLength(0);
    expect(r.malformedCount).toBe(1);
    expect(r.cleanedText).toBe("Cancelado!");
  });
});

describe("stripProtocolBlocks — rede de segurança final", () => {
  it("remove RESCHEDULE_JSON em array", () => {
    expect(
      stripProtocolBlocks('Reagendado!\nRESCHEDULE_JSON:[{"appointment_id":"a"}]'),
    ).toBe("Reagendado!");
  });

  it("remove qualquer marcador de protocolo, inclusive um futuro/desconhecido", () => {
    expect(stripProtocolBlocks('Ok!\nQUALQUER_OUTRO_JSON:{"x":1}')).toBe("Ok!");
    expect(stripProtocolBlocks('Ok!\nCANCEL_JSON:{"x":1}')).toBe("Ok!");
    expect(stripProtocolBlocks('Ok!\nAPPOINTMENT_JSON:{"x":1}')).toBe("Ok!");
  });

  it("não mexe em texto normal", () => {
    expect(stripProtocolBlocks("Pronto, agendado!")).toBe("Pronto, agendado!");
    // não pode comer texto legítimo que só contenha maiúsculas
    expect(stripProtocolBlocks("Confirmado para SEGUNDA-FEIRA às 10h")).toBe(
      "Confirmado para SEGUNDA-FEIRA às 10h",
    );
  });
});
