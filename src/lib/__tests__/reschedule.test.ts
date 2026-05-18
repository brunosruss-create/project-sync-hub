// Testes do fluxo de reagendamento da IA: cancela o antigo + cria o novo,
// com rollback automático quando a criação falha (ex.: slot ocupado).
import { describe, it, expect, beforeEach, vi } from "vitest";

// ─── Mock do supabaseAdmin com fila programável por (tabela, operação) ───
type Op = "select" | "insert" | "update";
type Result = { data?: unknown; error?: unknown };
const queue = new Map<string, Result[]>();
const calls: Array<{ table: string; op: Op; payload?: unknown; filters: Record<string, unknown> }> = [];

function key(table: string, op: Op) { return `${table}:${op}`; }
function enqueue(table: string, op: Op, result: Result) {
  const k = key(table, op);
  if (!queue.has(k)) queue.set(k, []);
  queue.get(k)!.push(result);
}
function takeResult(table: string, op: Op): Result {
  const k = key(table, op);
  const arr = queue.get(k);
  if (!arr || arr.length === 0) {
    throw new Error(`No fixture queued for ${k}`);
  }
  return arr.shift()!;
}

function builder(table: string) {
  const filters: Record<string, unknown> = {};
  let op: Op = "select";
  let payload: unknown;

  const self: any = {
    select: () => self,
    insert: (p: unknown) => { op = "insert"; payload = p; return self; },
    update: (p: unknown) => { op = "update"; payload = p; return self; },
    eq: (c: string, v: unknown) => { filters[`eq:${c}`] = v; return self; },
    ilike: (c: string, v: unknown) => { filters[`ilike:${c}`] = v; return self; },
    gte: (c: string, v: unknown) => { filters[`gte:${c}`] = v; return self; },
    lte: (c: string, v: unknown) => { filters[`lte:${c}`] = v; return self; },
    lt: (c: string, v: unknown) => { filters[`lt:${c}`] = v; return self; },
    gt: (c: string, v: unknown) => { filters[`gt:${c}`] = v; return self; },
    neq: (c: string, v: unknown) => { filters[`neq:${c}`] = v; return self; },
    not: (c: string, ...rest: unknown[]) => { filters[`not:${c}`] = rest; return self; },
    is: (c: string, v: unknown) => { filters[`is:${c}`] = v; return self; },
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
    // suporta await direto (sem .single/.maybeSingle) — usado por insert/update
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

// ─── Mocks dos canais de mensagem WhatsApp (não queremos enviar nada) ───
const sendReschedule = vi.fn(async () => undefined);
const sendCancellation = vi.fn(async () => undefined);
const sendConfirmation = vi.fn(async () => undefined);

vi.mock("@/lib/evolution.server", () => ({
  evo: { sendText: vi.fn(async () => ({ ok: true })) },
  instanceNameForOwner: (id: string) => `inst-${id}`,
}));

vi.mock("@/lib/message-templates", () => ({
  renderTemplate: (t: string) => t,
}));

vi.mock("@/lib/message-defaults", () => ({
  MESSAGE_DEFAULTS: {
    msg_booking_confirmed_text: "ok",
    msg_booking_confirmed_enabled: true,
    msg_booking_rescheduled_text: "ok",
    msg_booking_rescheduled_enabled: true,
    msg_booking_cancelled_text: "ok",
    msg_booking_cancelled_enabled: true,
  },
}));

// ─── Importar DEPOIS dos mocks ───
import { rescheduleAppointmentFromAI } from "@/lib/booking-confirmation.server";

const profile = {
  id: "ownerA",
  business_timezone: "America/Sao_Paulo",
  business_name: "Clínica X",
};

const OLD_ID = "appt-old";
const NEW_ID = "appt-new";
const CONTACT_ID = "contact-1";
const SERVICE_ID = "svc-1";
const PROFESSIONAL_ID = "prof-1";

function seedOldAppointmentLookups(opts: { contactMatch?: boolean } = {}) {
  // 1) rescheduleAppointmentFromAI faz pre-check em "appointments:select"
  //    (id/status/contact_id) para decidir se precisa resolver.
  enqueue("appointments", "select", {
    data: { id: OLD_ID, status: "scheduled", contact_id: opts.contactMatch === false ? "other" : CONTACT_ID },
  });
  // 2) Em seguida busca o appointment completo (com services + contacts).
  enqueue("appointments", "select", {
    data: {
      id: OLD_ID,
      contact_id: CONTACT_ID,
      professional_id: PROFESSIONAL_ID,
      service_id: SERVICE_ID,
      status: "scheduled",
      starts_at: "2026-05-21T17:00:00Z",
      notes: "",
      services: { id: SERVICE_ID, name: "Consulta", duration_minutes: 60, price_cents: 10000 },
      contacts: { name: "Bruno", phone: "+5511999999999" },
    },
  });
}

function seedCancelOldSuccess() {
  // cancelAppointmentFromAI(silent) → também faz o pre-check em "appointments:select"
  enqueue("appointments", "select", {
    data: { id: OLD_ID, status: "scheduled", contact_id: CONTACT_ID },
  });
  // depois carrega completo para gravar
  enqueue("appointments", "select", {
    data: {
      id: OLD_ID,
      contact_id: CONTACT_ID,
      status: "scheduled",
      starts_at: "2026-05-21T17:00:00Z",
      notes: "",
      services: { id: SERVICE_ID, name: "Consulta", duration_minutes: 60, price_cents: 10000 },
      contacts: { name: "Bruno", phone: "+5511999999999" },
    },
  });
  // update → cancelled
  enqueue("appointments", "update", { data: null, error: null });
}

function seedCreateNew(opts: { conflict?: boolean }) {
  // createAppointmentFromAI: resolve serviço pelo nome
  enqueue("services", "select", {
    data: { id: SERVICE_ID, name: "Consulta", duration_minutes: 60, price_cents: 10000 },
  });
  // profissional fornecido → busca por id
  enqueue("professionals", "select", {
    data: { id: PROFESSIONAL_ID, name: "Dra. Y" },
  });
  // contato já conhecido (contact_id passado)
  enqueue("contacts", "select", {
    data: { id: CONTACT_ID, name: "Bruno", phone: "+5511999999999" },
  });
  // anti-conflito: verifica se o slot novo está ocupado
  enqueue("appointments", "select", {
    data: opts.conflict ? { id: "conflict-x" } : null,
  });
  if (!opts.conflict) {
    // insert do novo appointment
    enqueue("appointments", "insert", {
      data: { id: NEW_ID, starts_at: "2026-05-22T17:00:00Z" },
      error: null,
    });
    // insert na tabela appointment_services (sem .single → cai no .then)
    enqueue("appointment_services", "insert", { data: null, error: null });
  }
}

function seedRollbackUpdate() {
  // rollback executa um .update em appointments
  enqueue("appointments", "update", { data: null, error: null });
}

beforeEach(() => {
  queue.clear();
  calls.length = 0;
  sendReschedule.mockClear();
  sendCancellation.mockClear();
  sendConfirmation.mockClear();
});

describe("rescheduleAppointmentFromAI", () => {
  it("faz cancel + create + 1 update final e retorna ok no caminho feliz", async () => {
    seedOldAppointmentLookups();
    seedCancelOldSuccess();
    seedCreateNew({ conflict: false });

    const result = await rescheduleAppointmentFromAI(
      {
        appointment_id: OLD_ID,
        new_starts_at: "2099-12-31T14:00:00-03:00",
        contact_id: CONTACT_ID,
      },
      profile,
    );

    expect(result.ok).toBe(true);

    // Verificações estruturais sobre o fluxo
    const updates = calls.filter((c) => c.table === "appointments" && c.op === "update");
    expect(updates).toHaveLength(1); // só o cancel; sem rollback
    expect((updates[0].payload as any).status).toBe("cancelled");

    const inserts = calls.filter((c) => c.table === "appointments" && c.op === "insert");
    expect(inserts).toHaveLength(1);
    expect((inserts[0].payload as any).status).toBe("scheduled");
    expect((inserts[0].payload as any).notes).toMatch(/Reagendado de/);
  });

  it("faz ROLLBACK automático quando o novo slot está ocupado (slot_taken)", async () => {
    seedOldAppointmentLookups();
    seedCancelOldSuccess();
    seedCreateNew({ conflict: true });
    seedRollbackUpdate();

    const result = await rescheduleAppointmentFromAI(
      {
        appointment_id: OLD_ID,
        new_starts_at: "2099-12-31T14:00:00-03:00",
        contact_id: CONTACT_ID,
      },
      profile,
    );

    expect(result.ok).toBe(false);
    expect(result.reason).toBe("slot_taken");

    // Devem existir DOIS updates: 1) cancel do antigo, 2) rollback que reverte
    const updates = calls.filter((c) => c.table === "appointments" && c.op === "update");
    expect(updates).toHaveLength(2);
    expect((updates[0].payload as any).status).toBe("cancelled");
    expect((updates[1].payload as any).status).toBe("scheduled"); // rollback

    // Nenhum appointment novo foi inserido
    const inserts = calls.filter((c) => c.table === "appointments" && c.op === "insert");
    expect(inserts).toHaveLength(0);
  });

  it("rejeita com bad_date quando new_starts_at é inválido", async () => {
    const result = await rescheduleAppointmentFromAI(
      { appointment_id: OLD_ID, new_starts_at: "isso-nao-e-uma-data", contact_id: CONTACT_ID },
      profile,
    );
    expect(result.ok).toBe(false);
    expect(result.reason).toBe("bad_date");
  });

  it("rejeita com past_date quando o novo horário é no passado", async () => {
    const result = await rescheduleAppointmentFromAI(
      { appointment_id: OLD_ID, new_starts_at: "2000-01-01T10:00:00-03:00", contact_id: CONTACT_ID },
      profile,
    );
    expect(result.ok).toBe(false);
    expect(result.reason).toBe("past_date");
  });
});
