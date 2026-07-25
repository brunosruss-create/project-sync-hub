// Disponibilidade de slot: o cálculo que o modal e a grade da Agenda passaram a
// compartilhar. Os dois casos que motivaram o módulo estão cobertos aqui —
// agendamento criado pela IA (só `professional_id`) e navegador em fuso
// diferente do negócio.
import { describe, it, expect } from "vitest";
import {
  computeSlotStates,
  dayWindowUtc,
  isSlotBlocked,
  slotToUtc,
  type BusyAppointment,
} from "@/lib/appointment-availability";
import { normalizeHours } from "@/lib/working-hours";

const TZ = "America/Sao_Paulo";
const DATE = "2026-07-25"; // sábado do print

/** Wall-clock de Brasília (-03:00) → instante UTC, do jeito que o banco guarda. */
const at = (hm: string) => new Date(`${DATE}T${hm}:00-03:00`).toISOString();

const PRO_A = "11111111-1111-4111-8111-111111111111";
const PRO_B = "22222222-2222-4222-8222-222222222222";

/** Longe do dia testado, para `past` não interferir. */
const NOW = new Date("2026-07-20T12:00:00-03:00");

const base = {
  slots: ["08:00", "08:30", "09:00", "09:30", "10:00"],
  dateIso: DATE,
  tz: TZ,
  professionalId: PRO_A,
  blockMin: 30,
  bufferMin: 0,
  hours: null,
  now: NOW,
};

const appt = (over: Partial<BusyAppointment> = {}): BusyAppointment => ({
  id: "appt-1",
  starts_at: at("09:00"),
  ends_at: at("09:30"),
  professional_id: PRO_A,
  ...over,
});

describe("slotToUtc", () => {
  it("lê o horário no fuso do negócio, não no do navegador", () => {
    expect(slotToUtc(DATE, "09:00", TZ).toISOString()).toBe("2026-07-25T12:00:00.000Z");
  });
});

describe("dayWindowUtc", () => {
  it("cobre o dia inteiro do negócio", () => {
    const { from, to } = dayWindowUtc(DATE, TZ);
    expect(from.toISOString()).toBe("2026-07-25T03:00:00.000Z");
    expect(to.toISOString()).toBe("2026-07-26T03:00:00.000Z");
  });

  it("vira o mês sem estourar", () => {
    const { to } = dayWindowUtc("2026-07-31", TZ);
    expect(to.toISOString()).toBe("2026-08-01T03:00:00.000Z");
  });
});

describe("computeSlotStates — ocupado", () => {
  it("marca como ocupado o slot tomado por um agendamento do mesmo profissional", () => {
    const st = computeSlotStates({ ...base, busy: [appt()] });
    expect(st.get("09:00")?.busy).toBe(true);
    expect(st.get("10:00")?.busy).toBe(false);
  });

  it("é o bug do print: agendamento criado pela IA ocupa o slot", () => {
    // A IA grava só `professional_id`. A versão antiga comparava `agent_id`,
    // que vinha nulo, então nada casava e o horário aparecia livre.
    const st = computeSlotStates({ ...base, busy: [appt({ professional_id: PRO_A })] });
    expect(st.get("09:00")?.busy).toBe(true);
  });

  it("ignora agendamento de outro profissional", () => {
    const st = computeSlotStates({ ...base, busy: [appt({ professional_id: PRO_B })] });
    expect(st.get("09:00")?.busy).toBe(false);
  });

  it("ignora agendamento sem profissional (legado)", () => {
    const st = computeSlotStates({ ...base, busy: [appt({ professional_id: null })] });
    expect(st.get("09:00")?.busy).toBe(false);
  });

  it("não marca nada quando nenhum profissional foi escolhido", () => {
    const st = computeSlotStates({ ...base, professionalId: "", busy: [appt()] });
    expect(st.get("09:00")?.busy).toBe(false);
  });

  it("em modo edição o próprio agendamento não conflita consigo mesmo", () => {
    const st = computeSlotStates({ ...base, busy: [appt()], ignoreId: "appt-1" });
    expect(st.get("09:00")?.busy).toBe(false);
  });

  it("bloqueia o slot anterior quando o atendimento avança sobre o ocupado", () => {
    // 08:30 + 60min termina 09:30, em cima do agendamento das 09:00.
    const st = computeSlotStates({ ...base, blockMin: 60, busy: [appt()] });
    expect(st.get("08:30")?.busy).toBe(true);
  });

  it("o buffer do serviço infla a janela de conflito dos dois lados", () => {
    const semBuffer = computeSlotStates({ ...base, busy: [appt()] });
    expect(semBuffer.get("09:30")?.busy).toBe(false);

    const comBuffer = computeSlotStates({ ...base, bufferMin: 15, busy: [appt()] });
    expect(comBuffer.get("09:30")?.busy).toBe(true);
  });

  it("descarta datas ilegíveis em vez de marcar o dia inteiro", () => {
    const st = computeSlotStates({ ...base, busy: [appt({ starts_at: "banana" })] });
    expect(st.get("09:00")?.busy).toBe(false);
  });
});

describe("computeSlotStates — fuso do navegador", () => {
  it("não desliza quando o navegador está longe do fuso do negócio", () => {
    // Este é o segundo bug: o cálculo antigo montava o slot com o fuso do
    // navegador e comparava contra instantes UTC. Aqui o resultado tem que ser
    // idêntico ao do teste acima, rode a suíte no fuso que rodar.
    const st = computeSlotStates({ ...base, busy: [appt()] });
    expect(st.get("09:00")?.busy).toBe(true);
    expect(st.get("08:00")?.busy).toBe(false);
    expect(st.get("10:00")?.busy).toBe(false);
  });
});

describe("computeSlotStates — passado", () => {
  it("marca como passado só o que já aconteceu no fuso do negócio", () => {
    const st = computeSlotStates({
      ...base,
      busy: [],
      now: new Date(`${DATE}T09:10:00-03:00`),
    });
    expect(st.get("09:00")?.past).toBe(true);
    expect(st.get("09:30")?.past).toBe(false);
  });
});

describe("computeSlotStates — jornada", () => {
  const hours = normalizeHours({ sat: { active: true, start: "09:00", end: "10:00" } });

  it("sinaliza o que está fora da jornada do profissional", () => {
    const st = computeSlotStates({ ...base, busy: [], hours });
    expect(st.get("08:00")?.outside).toBe(true);
    expect(st.get("09:00")?.outside).toBe(false);
  });

  it("exige que o atendimento inteiro caiba na faixa", () => {
    // 09:30 + 60min termina 10:30, depois do fim do expediente às 10:00.
    const st = computeSlotStates({ ...base, busy: [], hours, blockMin: 60 });
    expect(st.get("09:30")?.outside).toBe(true);
  });

  it("sem jornada configurada não inventa restrição", () => {
    const st = computeSlotStates({ ...base, busy: [], hours: null });
    expect(st.get("08:00")?.outside).toBe(false);
  });

  it("fora da jornada não bloqueia — encaixe manual continua permitido", () => {
    const st = computeSlotStates({ ...base, busy: [], hours });
    expect(isSlotBlocked(st.get("08:00"))).toBe(false);
  });
});

describe("isSlotBlocked", () => {
  it("bloqueia ocupado e passado", () => {
    expect(isSlotBlocked({ busy: true, past: false, outside: false })).toBe(true);
    expect(isSlotBlocked({ busy: false, past: true, outside: false })).toBe(true);
    expect(isSlotBlocked({ busy: false, past: false, outside: true })).toBe(false);
    expect(isSlotBlocked(undefined)).toBe(false);
  });
});
