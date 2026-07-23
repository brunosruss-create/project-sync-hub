import { describe, it, expect } from "vitest";
import { overlap, type Appointment } from "@/features/schedule/data";

function appt(startH: number, endH: number): Appointment {
  const base = new Date(2026, 6, 24, 0, 0, 0, 0);
  return {
    id: "x",
    contact_id: "c",
    service_id: "s",
    agent_id: "a",
    starts_at: new Date(base.getTime() + startH * 3_600_000),
    ends_at: new Date(base.getTime() + endH * 3_600_000),
    status: "scheduled",
    notes: "",
    notify_whatsapp: true,
  };
}

describe("overlap()", () => {
  it("sem buffer: agendamentos consecutivos exatos (fim=início) não conflitam", () => {
    const a = appt(9, 9.5); // 09:00–09:30
    const b = appt(9.5, 10); // 09:30–10:00
    expect(overlap(a, b)).toBe(false);
  });

  it("sem buffer: horários sobrepostos conflitam", () => {
    const a = appt(9, 9.5);
    const b = appt(9.25, 9.75);
    expect(overlap(a, b)).toBe(true);
  });

  it("com buffer: agendamentos consecutivos exatos passam a conflitar", () => {
    const a = appt(9, 9.5); // termina 09:30
    const b = appt(9.5, 10); // começa exatamente onde a termina
    const bufferMs = 15 * 60_000; // 15 min de intervalo exigido
    expect(overlap(a, b, bufferMs)).toBe(true);
  });

  it("com buffer: horário fora da janela de buffer não conflita", () => {
    const a = appt(9, 9.5); // termina 09:30
    const b = appt(9.75, 10.25); // começa 09:45, 15min depois do fim de a
    const bufferMs = 15 * 60_000;
    expect(overlap(a, b, bufferMs)).toBe(false);
  });
});
