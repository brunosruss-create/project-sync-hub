// Jornada por profissional: normalização dos dois formatos que convivem,
// herança (profissional → negócio) e validação de slot (incluindo o caso em
// que o atendimento COMEÇA dentro do expediente mas TERMINA fora).
import { describe, it, expect } from "vitest";
import {
  normalizeHours,
  effectiveHours,
  isWithinWorkingHours,
  describeHours,
  parseHM,
} from "@/lib/working-hours";

const TZ = "America/Sao_Paulo";

/** Helper: Date a partir de wall-clock em -03:00 (horário de Brasília). */
const at = (iso: string) => new Date(`${iso}-03:00`);

describe("parseHM", () => {
  it("aceita HH:MM e devolve minutos desde a meia-noite", () => {
    expect(parseHM("09:30")).toBe(570);
    expect(parseHM("00:00")).toBe(0);
    expect(parseHM("23:59")).toBe(1439);
  });

  it("rejeita lixo e horas inválidas", () => {
    expect(parseHM("")).toBeNull();
    expect(parseHM("banana")).toBeNull();
    expect(parseHM("25:00")).toBeNull();
    expect(parseHM("10:75")).toBeNull();
    expect(parseHM(null)).toBeNull();
  });
});

describe("normalizeHours", () => {
  it("converte o formato legado (start/end) para ranges", () => {
    const out = normalizeHours({ mon: { active: true, start: "08:00", end: "18:00" } });
    expect(out).toEqual({ mon: { active: true, ranges: [{ start: "08:00", end: "18:00" }] } });
  });

  it("aceita `enabled` além de `active` (variação que já existe no banco)", () => {
    const out = normalizeHours({ tue: { enabled: true, start: "09:00", end: "17:00" } });
    expect(out?.tue.active).toBe(true);
  });

  it("preserva múltiplos blocos e os ordena por horário de início", () => {
    const out = normalizeHours({
      wed: {
        active: true,
        ranges: [
          { start: "14:00", end: "18:00" },
          { start: "09:00", end: "12:00" },
        ],
      },
    });
    expect(out?.wed.ranges).toEqual([
      { start: "09:00", end: "12:00" },
      { start: "14:00", end: "18:00" },
    ]);
  });

  it("trata `end: 00:00` como fim do dia (23:59), não como meia-noite inicial", () => {
    const out = normalizeHours({ fri: { active: true, start: "18:00", end: "00:00" } });
    expect(out?.fri.ranges).toEqual([{ start: "18:00", end: "23:59" }]);
  });

  it("normaliza chaves em português e por extenso", () => {
    const out = normalizeHours({ "segunda-feira": { active: true, start: "08:00", end: "12:00" } });
    expect(out?.mon.active).toBe(true);
  });

  it("dia ativo sem faixa válida vira inativo (não dá pra trabalhar num vazio)", () => {
    const out = normalizeHours({ mon: { active: true, start: "18:00", end: "09:00" } });
    expect(out?.mon.active).toBe(false);
  });

  it("devolve null quando não há nada configurado", () => {
    expect(normalizeHours(null)).toBeNull();
    expect(normalizeHours(undefined)).toBeNull();
    expect(normalizeHours({})).toBeNull();
  });
});

describe("effectiveHours — herança profissional → negócio", () => {
  const business = { mon: { active: true, start: "08:00", end: "18:00" } };

  it("sem jornada própria (NULL), herda o horário do negócio", () => {
    const out = effectiveHours(null, business);
    expect(out?.mon.ranges).toEqual([{ start: "08:00", end: "18:00" }]);
  });

  it("com jornada própria, ignora completamente o horário do negócio", () => {
    const own = { mon: { active: true, ranges: [{ start: "13:00", end: "17:00" }] } };
    const out = effectiveHours(own, business);
    expect(out?.mon.ranges).toEqual([{ start: "13:00", end: "17:00" }]);
  });

  it("nada configurado dos dois lados = null (sem restrição)", () => {
    expect(effectiveHours(null, null)).toBeNull();
  });
});

describe("isWithinWorkingHours", () => {
  // Seg/Qua: 09–12 e 14–18 (com almoço). Ter: folga.
  const hours = normalizeHours({
    mon: {
      active: true,
      ranges: [
        { start: "09:00", end: "12:00" },
        { start: "14:00", end: "18:00" },
      ],
    },
    tue: { active: false, ranges: [] },
    wed: {
      active: true,
      ranges: [
        { start: "09:00", end: "12:00" },
        { start: "14:00", end: "18:00" },
      ],
    },
  });

  it("aceita slot inteiramente dentro de um bloco", () => {
    // Segunda 2026-07-27, 10:00 + 30min
    expect(isWithinWorkingHours(hours, at("2026-07-27T10:00:00"), TZ, 30)).toEqual({ ok: true });
  });

  it("aceita slot que termina exatamente no fim do bloco", () => {
    expect(isWithinWorkingHours(hours, at("2026-07-27T17:30:00"), TZ, 30)).toEqual({ ok: true });
  });

  it("RECUSA slot que começa dentro mas termina fora do bloco", () => {
    // 11:30 + 60min = 12:30, mas o bloco da manhã fecha 12:00
    const r = isWithinWorkingHours(hours, at("2026-07-27T11:30:00"), TZ, 60);
    expect(r.ok).toBe(false);
  });

  it("RECUSA slot que cai no intervalo de almoço", () => {
    const r = isWithinWorkingHours(hours, at("2026-07-27T12:30:00"), TZ, 30);
    expect(r).toEqual({ ok: false, reason: "outside_ranges" });
  });

  it("RECUSA dia de folga", () => {
    // Terça 2026-07-28
    const r = isWithinWorkingHours(hours, at("2026-07-28T10:00:00"), TZ, 30);
    expect(r).toEqual({ ok: false, reason: "day_off" });
  });

  it("RECUSA dia sequer presente na configuração (domingo)", () => {
    // Domingo 2026-07-26
    const r = isWithinWorkingHours(hours, at("2026-07-26T10:00:00"), TZ, 30);
    expect(r).toEqual({ ok: false, reason: "day_off" });
  });

  it("aceita no segundo bloco do dia (tarde)", () => {
    expect(isWithinWorkingHours(hours, at("2026-07-27T14:00:00"), TZ, 60)).toEqual({ ok: true });
  });

  it("sem jornada configurada (null), não inventa restrição", () => {
    expect(isWithinWorkingHours(null, at("2026-07-26T03:00:00"), TZ, 30)).toEqual({ ok: true });
  });

  it("respeita o fuso do negócio, não o fuso do servidor", () => {
    // 12:00 UTC de segunda = 09:00 em São Paulo → dentro do expediente.
    const utcNoon = new Date("2026-07-27T12:00:00Z");
    expect(isWithinWorkingHours(hours, utcNoon, TZ, 30)).toEqual({ ok: true });
    // 11:00 UTC = 08:00 em São Paulo → ainda fechado.
    const utcEleven = new Date("2026-07-27T11:00:00Z");
    expect(isWithinWorkingHours(hours, utcEleven, TZ, 30).ok).toBe(false);
  });
});

describe("describeHours", () => {
  it("agrupa dias com o mesmo horário", () => {
    const hours = normalizeHours({
      mon: { active: true, start: "09:00", end: "18:00" },
      tue: { active: true, start: "09:00", end: "18:00" },
      sat: { active: true, start: "09:00", end: "13:00" },
    });
    expect(describeHours(hours)).toBe("Seg, Ter 09:00–18:00; Sáb 09:00–13:00");
  });

  it("mostra os dois blocos quando há intervalo", () => {
    const hours = normalizeHours({
      mon: {
        active: true,
        ranges: [
          { start: "09:00", end: "12:00" },
          { start: "14:00", end: "18:00" },
        ],
      },
    });
    expect(describeHours(hours)).toBe("Seg 09:00–12:00 e 14:00–18:00");
  });

  it("string vazia quando não há jornada", () => {
    expect(describeHours(null)).toBe("");
  });
});
