// Testes do lote de agendamentos (bug real: cliente pede 2 horários no mesmo
// turno — ex. "os dois às 9h" — e só 1 era criado, mas a IA "confirmava" os 2).
// Cobre: encadeamento automático de horário (duração + buffer), preservação
// de horários já distintos, e o bloqueio de segurança quando o profissional
// é ambíguo (2+ ativos, nenhum informado) — que antes pulava o anti-conflito
// inteiro.
import { describe, it, expect, beforeEach, vi } from "vitest";

// ─── Mock do supabaseAdmin com fila programável por (tabela, operação) ───
type Op = "select" | "insert" | "update";
type Result = { data?: unknown; error?: unknown };
const queue = new Map<string, Result[]>();
const calls: Array<{ table: string; op: Op; payload?: unknown; filters: Record<string, unknown> }> =
  [];

function key(table: string, op: Op) {
  return `${table}:${op}`;
}
function enqueue(table: string, op: Op, result: Result) {
  const k = key(table, op);
  if (!queue.has(k)) queue.set(k, []);
  queue.get(k)!.push(result);
}
function takeResult(table: string, op: Op): Result {
  const k = key(table, op);
  const arr = queue.get(k);
  if (!arr || arr.length === 0) throw new Error(`No fixture queued for ${k}`);
  return arr.shift()!;
}

function builder(table: string) {
  const filters: Record<string, unknown> = {};
  let op: Op = "select";
  let payload: unknown;

  const self: any = {
    select: () => self,
    insert: (p: unknown) => {
      op = "insert";
      payload = p;
      return self;
    },
    update: (p: unknown) => {
      op = "update";
      payload = p;
      return self;
    },
    eq: (c: string, v: unknown) => {
      filters[`eq:${c}`] = v;
      return self;
    },
    ilike: (c: string, v: unknown) => {
      filters[`ilike:${c}`] = v;
      return self;
    },
    lt: (c: string, v: unknown) => {
      filters[`lt:${c}`] = v;
      return self;
    },
    gt: (c: string, v: unknown) => {
      filters[`gt:${c}`] = v;
      return self;
    },
    neq: (c: string, v: unknown) => {
      filters[`neq:${c}`] = v;
      return self;
    },
    order: () => self,
    limit: () => self,
    maybeSingle: () => {
      calls.push({ table, op, payload, filters: { ...filters } });
      return Promise.resolve(takeResult(table, op));
    },
    single: () => {
      calls.push({ table, op, payload, filters: { ...filters } });
      return Promise.resolve(takeResult(table, op));
    },
    then: (resolve: (v: Result) => unknown, reject: (e: unknown) => unknown) => {
      try {
        calls.push({ table, op, payload, filters: { ...filters } });
        return Promise.resolve(takeResult(table, op)).then(resolve, reject);
      } catch (e) {
        return Promise.reject(e).then(resolve as any, reject);
      }
    },
  };
  return self;
}

vi.mock("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: { from: (table: string) => builder(table) },
}));

vi.mock("@/lib/evolution.server", () => ({
  evo: { sendText: vi.fn(async () => ({ ok: true })) },
  instanceNameForOwner: (id: string) => `inst-${id}`,
}));

vi.mock("@/lib/message-templates", () => ({
  renderTemplate: (t: string, vars: Record<string, unknown>) =>
    t.replace(/\{\{\s*(\w+)\s*\}\}/g, (_: string, k: string) => String(vars[k] ?? "")),
}));

vi.mock("@/lib/message-defaults", () => ({
  MESSAGE_DEFAULTS: {
    booking_confirmed: { default: "ok {{cliente}}" },
  },
  BOOKING_CONFIRMED_BATCH_DEFAULT: "Olá {{cliente}}! {{negocio}}\n{{lista}}",
}));

import {
  createAppointmentFromAI,
  createAppointmentBatchFromAI,
} from "@/lib/booking-confirmation.server";

const profile = {
  id: "ownerA",
  business_timezone: "America/Sao_Paulo",
  business_name: "Salão Bela Vista",
};

const SERVICE_ID = "svc-corte";
const PROF_ID = "prof-bruno";
const CONTACT_BRUNO = "contact-bruno";
const CONTACT_GABRIELA = "contact-gabriela";
const PHONE = "+5511999999999";

beforeEach(() => {
  queue.clear();
  calls.length = 0;
});

function seedItem(opts: {
  bufferMinutes: number;
  contactId: string;
  startsAtIso: string;
  endsAtIso: string;
  apptId: string;
  conflict?: boolean;
}) {
  enqueue("services", "select", {
    data: {
      id: SERVICE_ID,
      name: "Corte",
      duration_minutes: 30,
      price_cents: 5000,
      buffer_minutes: opts.bufferMinutes,
    },
  });
  enqueue("professionals", "select", { data: { id: PROF_ID, name: "Bruno" } });
  enqueue("contacts", "select", {
    data: { id: opts.contactId, name: opts.contactId, phone: PHONE },
  });
  enqueue("appointments", "select", { data: opts.conflict ? { id: "conflict-x" } : null });
  if (!opts.conflict) {
    enqueue("appointments", "insert", {
      data: { id: opts.apptId, starts_at: opts.startsAtIso, ends_at: opts.endsAtIso },
      error: null,
    });
    enqueue("appointment_services", "insert", { data: null, error: null });
  }
}

function seedBatchConfirmationMessage() {
  enqueue("profiles", "select", {
    data: { msg_booking_confirmed_text: null, msg_booking_confirmed_enabled: true },
  });
  enqueue("whatsapp_instances", "select", { data: { status: "connected" } });
}

describe("createAppointmentBatchFromAI", () => {
  it("encadeia o 2º item automaticamente (duração do 1º, buffer 0) quando pedem o mesmo horário nominal", async () => {
    seedItem({
      bufferMinutes: 0,
      contactId: CONTACT_BRUNO,
      startsAtIso: "2026-07-24T09:00:00-03:00",
      endsAtIso: "2026-07-24T12:30:00.000Z", // 09:00 -03:00 + 30min = 12:30 UTC
      apptId: "appt-1",
    });
    seedItem({
      bufferMinutes: 0,
      contactId: CONTACT_GABRIELA,
      startsAtIso: "2026-07-24T12:30:00.000Z",
      endsAtIso: "2026-07-24T13:00:00.000Z",
      apptId: "appt-2",
    });
    seedBatchConfirmationMessage();

    const items = [
      {
        service_id: SERVICE_ID,
        professional_id: PROF_ID,
        starts_at: "2026-07-24T09:00:00-03:00",
        client_name: "Bruno",
        client_phone: PHONE,
        contact_id: CONTACT_BRUNO,
      },
      {
        service_id: SERVICE_ID,
        professional_id: PROF_ID,
        starts_at: "2026-07-24T09:00:00-03:00", // mesmo horário nominal pedido
        client_name: "Gabriela",
        client_phone: PHONE,
        contact_id: CONTACT_GABRIELA,
      },
    ];

    const batch = await createAppointmentBatchFromAI(items, profile);

    expect(batch.allFailed).toBe(false);
    expect(batch.anyFailed).toBe(false);
    expect(batch.results).toHaveLength(2);
    expect(batch.results[0].ok).toBe(true);
    expect(batch.results[1].ok).toBe(true);

    const inserts = calls.filter((c) => c.table === "appointments" && c.op === "insert");
    expect(inserts).toHaveLength(2);
    // 2º item foi ajustado pra começar exatamente onde o 1º termina.
    expect((inserts[1].payload as any).starts_at).toBe("2026-07-24T12:30:00.000Z");

    // Cada agendamento persiste o titular correto (não o nome de quem está no WhatsApp).
    expect((inserts[0].payload as any).client_name).toBe("Bruno");
    expect((inserts[1].payload as any).client_name).toBe("Gabriela");
  });

  it("com buffer > 0, soma o intervalo ao encadear o próximo horário", async () => {
    seedItem({
      bufferMinutes: 15,
      contactId: CONTACT_BRUNO,
      startsAtIso: "2026-07-24T09:00:00-03:00",
      endsAtIso: "2026-07-24T12:30:00.000Z",
      apptId: "appt-1",
    });
    seedItem({
      bufferMinutes: 15,
      contactId: CONTACT_GABRIELA,
      startsAtIso: "2026-07-24T12:45:00.000Z",
      endsAtIso: "2026-07-24T13:15:00.000Z",
      apptId: "appt-2",
    });
    seedBatchConfirmationMessage();

    const items = [
      {
        service_id: SERVICE_ID,
        professional_id: PROF_ID,
        starts_at: "2026-07-24T09:00:00-03:00",
        client_name: "Bruno",
        client_phone: PHONE,
        contact_id: CONTACT_BRUNO,
      },
      {
        service_id: SERVICE_ID,
        professional_id: PROF_ID,
        starts_at: "2026-07-24T09:00:00-03:00",
        client_name: "Gabriela",
        client_phone: PHONE,
        contact_id: CONTACT_GABRIELA,
      },
    ];

    const batch = await createAppointmentBatchFromAI(items, profile);
    expect(batch.anyFailed).toBe(false);

    const inserts = calls.filter((c) => c.table === "appointments" && c.op === "insert");
    // 12:30 (fim do 1º) + 15min de buffer = 12:45
    expect((inserts[1].payload as any).starts_at).toBe("2026-07-24T12:45:00.000Z");
  });

  it("preserva horários já distintos pedidos pelo cliente (sem ajuste forçado)", async () => {
    seedItem({
      bufferMinutes: 0,
      contactId: CONTACT_BRUNO,
      startsAtIso: "2026-07-24T09:00:00-03:00",
      endsAtIso: "2026-07-24T12:30:00.000Z",
      apptId: "appt-1",
    });
    seedItem({
      bufferMinutes: 0,
      contactId: CONTACT_GABRIELA,
      startsAtIso: "2026-07-24T14:00:00-03:00",
      endsAtIso: "2026-07-24T17:30:00.000Z",
      apptId: "appt-2",
    });
    seedBatchConfirmationMessage();

    const items = [
      {
        service_id: SERVICE_ID,
        professional_id: PROF_ID,
        starts_at: "2026-07-24T09:00:00-03:00",
        client_name: "Bruno",
        client_phone: PHONE,
        contact_id: CONTACT_BRUNO,
      },
      {
        service_id: SERVICE_ID,
        professional_id: PROF_ID,
        starts_at: "2026-07-24T14:00:00-03:00", // horário já distinto
        client_name: "Gabriela",
        client_phone: PHONE,
        contact_id: CONTACT_GABRIELA,
      },
    ];

    await createAppointmentBatchFromAI(items, profile);

    const inserts = calls.filter((c) => c.table === "appointments" && c.op === "insert");
    // starts_at do 2º item continua o que o cliente pediu, sem encadear.
    expect((inserts[1].payload as any).starts_at).not.toBe((inserts[0].payload as any).ends_at);
  });

  it("lote parcial: 1 sucesso + 1 slot_taken → anyFailed true, allFailed false", async () => {
    seedItem({
      bufferMinutes: 0,
      contactId: CONTACT_BRUNO,
      startsAtIso: "2026-07-24T09:00:00-03:00",
      endsAtIso: "2026-07-24T12:30:00.000Z",
      apptId: "appt-1",
    });
    // 2º item: mesmo agrupamento nominal, mas conflita mesmo após ajuste
    seedItem({
      bufferMinutes: 0,
      contactId: CONTACT_GABRIELA,
      startsAtIso: "2026-07-24T12:30:00.000Z",
      endsAtIso: "2026-07-24T13:00:00.000Z",
      apptId: "appt-2",
      conflict: true,
    });
    seedBatchConfirmationMessage();

    const items = [
      {
        service_id: SERVICE_ID,
        professional_id: PROF_ID,
        starts_at: "2026-07-24T09:00:00-03:00",
        client_name: "Bruno",
        client_phone: PHONE,
        contact_id: CONTACT_BRUNO,
      },
      {
        service_id: SERVICE_ID,
        professional_id: PROF_ID,
        starts_at: "2026-07-24T09:00:00-03:00",
        client_name: "Gabriela",
        client_phone: PHONE,
        contact_id: CONTACT_GABRIELA,
      },
    ];

    const batch = await createAppointmentBatchFromAI(items, profile);
    expect(batch.allFailed).toBe(false);
    expect(batch.anyFailed).toBe(true);
    expect(batch.results[0].ok).toBe(true);
    expect(batch.results[1].ok).toBe(false);
    expect(batch.results[1].reason).toBe("slot_taken");
    expect(batch.summaryTextForAi).toMatch(/1 de 2/);
  });
});

describe("createAppointmentFromAI — profissional ambíguo (bug de segurança)", () => {
  it("recusa com professional_required quando há 2+ profissionais ativos e nenhum foi informado", async () => {
    enqueue("services", "select", {
      data: {
        id: SERVICE_ID,
        name: "Corte",
        duration_minutes: 30,
        price_cents: 5000,
        buffer_minutes: 0,
      },
    });
    enqueue("professionals", "select", {
      data: [
        { id: "p1", name: "Bruno" },
        { id: "p2", name: "Carla" },
      ],
    });

    const result = await createAppointmentFromAI(
      {
        service_id: SERVICE_ID,
        starts_at: "2026-07-24T09:00:00-03:00",
        client_name: "Cliente",
        client_phone: PHONE,
        contact_id: CONTACT_BRUNO,
        // professional_id ausente de propósito
      },
      profile,
    );

    expect(result.ok).toBe(false);
    expect(result.reason).toBe("professional_required");

    // Nunca deve ter chegado a checar conflito nem inserir — a criação foi
    // bloqueada ANTES, o que é exatamente o fix do bug de segurança (antes,
    // isso criava com professional_id null e pulava o anti-conflito).
    const conflictChecks = calls.filter((c) => c.table === "appointments" && c.op === "select");
    expect(conflictChecks).toHaveLength(0);
    const inserts = calls.filter((c) => c.table === "appointments" && c.op === "insert");
    expect(inserts).toHaveLength(0);
  });
});
