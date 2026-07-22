// Testes do parser de datas que a IA gera para agendamentos.
// Erro aqui = cliente agendado no horário errado, então cobrimos os formatos
// aceitos + fuso local do negócio + entradas inválidas.
import { describe, it, expect, vi } from "vitest";

// booking-confirmation.server importa supabaseAdmin + evolution no topo do
// módulo. parseAiDate não usa nenhum dos dois, então mockamos para o import
// não depender de env/rede.
vi.mock("@/integrations/supabase/client.server", () => ({ supabaseAdmin: {} }));
vi.mock("@/lib/evolution.server", () => ({
  evo: {},
  instanceNameForOwner: () => "zf_test",
}));

import { parseAiDate } from "@/lib/booking-confirmation.server";

const SP = "America/Sao_Paulo"; // UTC-3, sem horário de verão desde 2019

describe("parseAiDate", () => {
  it("respeita offset explícito (-03:00)", () => {
    const d = parseAiDate("2026-05-23T14:00:00-03:00", SP);
    expect(d?.toISOString()).toBe("2026-05-23T17:00:00.000Z");
  });

  it("respeita Z (UTC) explícito", () => {
    const d = parseAiDate("2026-05-23T14:00:00Z", SP);
    expect(d?.toISOString()).toBe("2026-05-23T14:00:00.000Z");
  });

  it("interpreta ISO sem offset como hora LOCAL do negócio", () => {
    // 14:00 em São Paulo (-03:00) = 17:00 UTC
    const d = parseAiDate("2026-05-23T14:00:00", SP);
    expect(d?.toISOString()).toBe("2026-05-23T17:00:00.000Z");
  });

  it("aceita ISO sem segundos", () => {
    const d = parseAiDate("2026-05-23T14:00", SP);
    expect(d?.toISOString()).toBe("2026-05-23T17:00:00.000Z");
  });

  it("aceita formato brasileiro dd/mm/yyyy hh:mm como hora local", () => {
    const d = parseAiDate("23/05/2026 14:00", SP);
    expect(d?.toISOString()).toBe("2026-05-23T17:00:00.000Z");
  });

  it("aceita 'yyyy-mm-dd hh:mm' com espaço", () => {
    const d = parseAiDate("2026-05-23 09:30", SP);
    expect(d?.toISOString()).toBe("2026-05-23T12:30:00.000Z");
  });

  it("usa o fuso do negócio, não o do servidor", () => {
    // Mesma parede de relógio, fuso diferente → instante diferente.
    const sp = parseAiDate("2026-05-23T14:00:00", SP);
    const utc = parseAiDate("2026-05-23T14:00:00", "UTC");
    expect(sp?.toISOString()).toBe("2026-05-23T17:00:00.000Z");
    expect(utc?.toISOString()).toBe("2026-05-23T14:00:00.000Z");
  });

  it("retorna null para entradas vazias/nulas", () => {
    expect(parseAiDate(null, SP)).toBeNull();
    expect(parseAiDate(undefined, SP)).toBeNull();
    expect(parseAiDate("", SP)).toBeNull();
    expect(parseAiDate("   ", SP)).toBeNull();
  });

  it("retorna null para texto que não é data", () => {
    expect(parseAiDate("amanhã de tarde", SP)).toBeNull();
    expect(parseAiDate("banana", SP)).toBeNull();
  });
});
