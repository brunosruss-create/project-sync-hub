// Teste do bug: a IA gerava o texto de "transferência para atendente" mas
// nunca enviava — só marcava o contato como waiting/unread internamente,
// deixando o cliente sem nenhuma resposta.
import { describe, it, expect, beforeEach, vi } from "vitest";

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
  evo: {
    sendText: vi.fn(async () => ({ key: { id: "wamid-1" } })),
    sendPresence: vi.fn(async () => undefined),
  },
  instanceNameForOwner: (id: string) => `inst-${id}`,
}));

import { sendAiReplyAndPersist } from "@/lib/message-processing.server";
import { evo } from "@/lib/evolution.server";
import type { AiRunResult } from "@/lib/ai-respond.server";

const OWNER_ID = "owner-1";
const CONTACT_ID = "contact-1";
const PHONE = "+5511999999999";
const INSTANCE = "inst-owner-1";

beforeEach(() => {
  queue.clear();
  calls.length = 0;
  (evo.sendText as any).mockClear();
  (evo.sendPresence as any).mockClear();
});

describe("sendAiReplyAndPersist — transfer_to_human", () => {
  it("envia a mensagem de transferência ao cliente (antes era descartada) e ainda marca waiting/unread", async () => {
    enqueue("messages", "insert", { data: null, error: null });
    enqueue("contacts", "update", { data: null, error: null }); // last_message/last_direction
    enqueue("contacts", "update", { data: null, error: null }); // kanban_column/is_unread

    const ai: AiRunResult = {
      action: "transfer_to_human",
      response: "Entendi! Vou passar você para um atendente humano agora. Aguarde um momento.",
    };

    vi.useFakeTimers();
    const promise = sendAiReplyAndPersist(INSTANCE, OWNER_ID, CONTACT_ID, PHONE, ai, "test");
    await vi.runAllTimersAsync();
    await promise;
    vi.useRealTimers();

    // Mensagem realmente enviada ao cliente — o cerne do bug.
    expect(evo.sendText).toHaveBeenCalledTimes(1);
    expect((evo.sendText as any).mock.calls[0][1].text).toBe(ai.response);

    // Persistida no histórico como outbound da IA.
    const msgInsert = calls.find((c) => c.table === "messages" && c.op === "insert");
    expect(msgInsert).toBeTruthy();
    expect((msgInsert!.payload as any).content).toBe(ai.response);
    expect((msgInsert!.payload as any).is_ai).toBe(true);

    // Continua marcando o contato pra um humano assumir (comportamento antigo preservado).
    const contactUpdates = calls.filter((c) => c.table === "contacts" && c.op === "update");
    expect(contactUpdates.length).toBeGreaterThanOrEqual(1);
    const kanbanUpdate = contactUpdates.find(
      (c) => (c.payload as any).kanban_column === "waiting",
    );
    expect(kanbanUpdate).toBeTruthy();
    expect((kanbanUpdate!.payload as any).is_unread).toBe(true);
  });

  it("send_message continua funcionando como antes (sem regressão)", async () => {
    enqueue("messages", "insert", { data: null, error: null });
    enqueue("contacts", "update", { data: null, error: null });

    const ai: AiRunResult = {
      action: "send_message",
      response: "Olá! Como posso ajudar?",
      tokens_total: 42,
    };

    vi.useFakeTimers();
    const promise = sendAiReplyAndPersist(INSTANCE, OWNER_ID, CONTACT_ID, PHONE, ai, "test");
    await vi.runAllTimersAsync();
    await promise;
    vi.useRealTimers();

    expect(evo.sendText).toHaveBeenCalledTimes(1);
    const contactUpdates = calls.filter((c) => c.table === "contacts" && c.op === "update");
    // send_message não deve mexer em kanban_column (isso é exclusivo do transfer).
    expect(contactUpdates.every((c) => !("kanban_column" in (c.payload as any)))).toBe(true);
  });
});
