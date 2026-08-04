import { describe, it, expect, beforeEach, vi } from "vitest";

type Op = "select" | "insert" | "update";
type Result = { data?: unknown; error?: unknown };
const queue = new Map<string, Result[]>();
const calls: Array<{ table: string; op: Op; payload?: unknown }> = [];

function key(table: string, op: Op) {
  return `${table}:${op}`;
}
function enqueue(table: string, op: Op, result: Result) {
  const k = key(table, op);
  if (!queue.has(k)) queue.set(k, []);
  queue.get(k)!.push(result);
}
function takeResult(table: string, op: Op): Result {
  const arr = queue.get(key(table, op));
  if (!arr || arr.length === 0) return { data: null, error: null };
  return arr.shift()!;
}

function builder(table: string) {
  let op: Op = "select";
  let payload: unknown;
  const self: any = {
    select: () => self,
    insert: (p: unknown) => ((op = "insert"), (payload = p), self),
    update: (p: unknown) => ((op = "update"), (payload = p), self),
    eq: () => self,
    gt: () => self,
    in: () => self,
    maybeSingle: () => {
      calls.push({ table, op, payload });
      return Promise.resolve(takeResult(table, op));
    },
    then: (resolve: (v: Result) => unknown, reject: (e: unknown) => unknown) => {
      calls.push({ table, op, payload });
      return Promise.resolve(takeResult(table, op)).then(resolve, reject);
    },
  };
  return self;
}

vi.mock("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: { from: (t: string) => builder(t) },
}));

vi.mock("@/lib/evolution.server", () => ({
  evo: { sendText: vi.fn(async () => ({ key: { id: "wamid-csat" } })) },
  instanceNameForOwner: (id: string) => `zf_${id}`,
}));

const loadTemplate = vi.fn<(...a: any[]) => any>();
const getConnectedInstance = vi.fn<(...a: any[]) => any>();
const persistOutboundMessage = vi.fn<(...a: any[]) => any>(async () => undefined);
vi.mock("@/lib/booking-confirmation.server", () => ({
  loadTemplate: (...a: any[]) => loadTemplate(...a),
  getConnectedInstance: (...a: any[]) => getConnectedInstance(...a),
  persistOutboundMessage: (...a: any[]) => persistOutboundMessage(...a),
  normalizePhone: (s: string) => String(s).replace(/\D/g, ""),
}));

import { sendCsatSurvey } from "@/lib/csat.server";
import { evo } from "@/lib/evolution.server";

const SURVEY = "survey-1";
const OWNER = "owner-1";
const CONTACT = "contact-1";
const AGORA = () => new Date().toISOString();

/** Pesquisa agendada e ainda não enviada, com o contato resolvido. */
function cenarioFeliz() {
  enqueue("csat_surveys", "select", {
    data: { id: SURVEY, owner_user_id: OWNER, contact_id: CONTACT, status: "pending" },
    error: null,
  });
  enqueue("contacts", "select", {
    data: { id: CONTACT, phone: "+5511999999999", kanban_column: "resolved" },
    error: null,
  });
}

beforeEach(() => {
  queue.clear();
  calls.length = 0;
  (evo.sendText as any).mockClear();
  loadTemplate.mockReset().mockResolvedValue({ enabled: true, text: "Nota de 1 a 5?" });
  getConnectedInstance.mockReset().mockResolvedValue("zf_owner-1");
  persistOutboundMessage.mockClear();
});

describe("sendCsatSurvey", () => {
  it("envia, grava no inbox e marca como sent", async () => {
    cenarioFeliz();
    enqueue("profiles", "select", { data: { business_name: "Salão X" }, error: null });
    enqueue("contacts", "select", { data: { name: "Maria Silva" }, error: null });

    await sendCsatSurvey({ surveyId: SURVEY, scheduledAt: AGORA(), attempts: 1 });

    expect(evo.sendText).toHaveBeenCalledTimes(1);
    // Sem persistOutboundMessage a mensagem sai no WhatsApp mas some do inbox.
    expect(persistOutboundMessage).toHaveBeenCalledTimes(1);
    const upd = calls.filter((c) => c.table === "csat_surveys" && c.op === "update");
    expect((upd.at(-1)!.payload as any).status).toBe("sent");
  });

  it("não reenvia pesquisa que já saiu (reentrância do job)", async () => {
    enqueue("csat_surveys", "select", {
      data: { id: SURVEY, owner_user_id: OWNER, contact_id: CONTACT, status: "sent" },
      error: null,
    });
    await sendCsatSurvey({ surveyId: SURVEY, scheduledAt: AGORA(), attempts: 1 });
    expect(evo.sendText).not.toHaveBeenCalled();
  });

  it("cancela quando a conversa reabriu — não pergunta no meio de conversa nova", async () => {
    enqueue("csat_surveys", "select", {
      data: { id: SURVEY, owner_user_id: OWNER, contact_id: CONTACT, status: "pending" },
      error: null,
    });
    enqueue("contacts", "select", {
      data: { id: CONTACT, phone: "+5511999999999", kanban_column: "waiting" },
      error: null,
    });

    await sendCsatSurvey({ surveyId: SURVEY, scheduledAt: AGORA(), attempts: 1 });

    expect(evo.sendText).not.toHaveBeenCalled();
    const upd = calls.filter((c) => c.table === "csat_surveys" && c.op === "update");
    expect((upd.at(-1)!.payload as any).status).toBe("cancelled");
  });

  it("cancela quando o template foi desligado depois de agendar", async () => {
    cenarioFeliz();
    loadTemplate.mockResolvedValue({ enabled: false, text: "" });

    await sendCsatSurvey({ surveyId: SURVEY, scheduledAt: AGORA(), attempts: 1 });

    expect(evo.sendText).not.toHaveBeenCalled();
    const upd = calls.filter((c) => c.table === "csat_surveys" && c.op === "update");
    expect((upd.at(-1)!.payload as any).status).toBe("cancelled");
  });

  it("WhatsApp desconectado reagenda em vez de falhar", async () => {
    cenarioFeliz();
    getConnectedInstance.mockResolvedValue(null);

    await sendCsatSurvey({ surveyId: SURVEY, scheduledAt: AGORA(), attempts: 1 });

    expect(evo.sendText).not.toHaveBeenCalled();
    const jobUpd = calls.find((c) => c.table === "message_jobs" && c.op === "update");
    expect((jobUpd!.payload as any).status).toBe("pending");
    expect((jobUpd!.payload as any).scheduled_at).toBeTruthy();
  });

  it("desiste após as tentativas de reconexão", async () => {
    cenarioFeliz();
    getConnectedInstance.mockResolvedValue(null);

    await sendCsatSurvey({ surveyId: SURVEY, scheduledAt: AGORA(), attempts: 3 });

    const upd = calls.filter((c) => c.table === "csat_surveys" && c.op === "update");
    expect((upd.at(-1)!.payload as any).status).toBe("expired");
  });

  it("cancela quando o worker ficou parado tempo demais", async () => {
    enqueue("csat_surveys", "select", {
      data: { id: SURVEY, owner_user_id: OWNER, contact_id: CONTACT, status: "pending" },
      error: null,
    });
    const ontem = new Date(Date.now() - 20 * 60 * 60 * 1000).toISOString();

    await sendCsatSurvey({ surveyId: SURVEY, scheduledAt: ontem, attempts: 1 });

    expect(evo.sendText).not.toHaveBeenCalled();
    const upd = calls.filter((c) => c.table === "csat_surveys" && c.op === "update");
    expect((upd.at(-1)!.payload as any).status).toBe("cancelled");
  });
});
