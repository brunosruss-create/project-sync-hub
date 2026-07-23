// Worker de fila assíncrona pro processamento de mensagens do WhatsApp.
// Processo Node long-running (não roda como função serverless) — pensado
// pra rodar 24/7 no mesmo projeto Railway da Evolution API.
// Consome public.message_jobs (enfileirada pelo webhook em
// src/routes/api/public/evolution.$instanceId.ts) e chama processMessageJob
// (src/lib/message-processing.server.ts) fora do request HTTP do webhook.
//
// Rodar com: npm run worker  (usa tsx, resolve os aliases @/* do tsconfig.json)
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { processMessageJob, type MessageJobPayload } from "@/lib/message-processing.server";
import { initSentry, captureException } from "@/lib/sentry.server";

initSentry("worker");

const POLL_INTERVAL_MS = 1500;
const BATCH_SIZE = 5;
const MAX_GLOBAL_CONCURRENCY = 18; // protege a chave única do Gemini de picos
const PER_WORKSPACE_LIMIT_PER_MINUTE = 25; // protege 1 cliente de estourar a cota de todos
const MAX_ATTEMPTS = 5;
const STALE_PROCESSING_MS = 5 * 60_000; // job travado em "processing" (worker caiu no meio) volta a pending

type JobRow = {
  id: string;
  workspace_owner_id: string;
  contact_id: string;
  instance_name: string;
  payload: MessageJobPayload;
  attempts: number;
};

// Janela deslizante em memória — 1 processo só no lançamento, suficiente
// pro volume inicial. Se precisar de múltiplos workers depois, isso vira
// uma checagem no banco (ver Fase 2 do plano de escala).
const workspaceCallTimestamps = new Map<string, number[]>();

function isRateLimited(workspaceOwnerId: string): boolean {
  const now = Date.now();
  const windowStart = now - 60_000;
  const recent = (workspaceCallTimestamps.get(workspaceOwnerId) ?? []).filter(
    (t) => t > windowStart,
  );
  workspaceCallTimestamps.set(workspaceOwnerId, recent);
  return recent.length >= PER_WORKSPACE_LIMIT_PER_MINUTE;
}

function recordCall(workspaceOwnerId: string) {
  const arr = workspaceCallTimestamps.get(workspaceOwnerId) ?? [];
  arr.push(Date.now());
  workspaceCallTimestamps.set(workspaceOwnerId, arr);
}

let activeCount = 0;

async function releaseBackToPending(jobId: string) {
  const { error } = await supabaseAdmin
    .from("message_jobs")
    .update({ status: "pending" })
    .eq("id", jobId);
  if (error) console.error("[job-worker] release falhou:", jobId, error.message);
}

async function markDone(jobId: string) {
  const { error } = await supabaseAdmin
    .from("message_jobs")
    .update({ status: "done" })
    .eq("id", jobId);
  if (error) console.error("[job-worker] markDone falhou:", jobId, error.message);
}

async function markError(jobId: string, attempts: number, message: string) {
  const status = attempts >= MAX_ATTEMPTS ? "error" : "pending";
  const { error } = await supabaseAdmin
    .from("message_jobs")
    .update({ status, last_error: message.slice(0, 500) })
    .eq("id", jobId);
  if (error) console.error("[job-worker] markError falhou:", jobId, error.message);
}

async function runJob(job: JobRow) {
  activeCount++;
  try {
    if (isRateLimited(job.workspace_owner_id)) {
      // Throttle, não descarte: devolve pra fila e tenta de novo no próximo poll.
      await releaseBackToPending(job.id);
      return;
    }
    recordCall(job.workspace_owner_id);
    await processMessageJob({
      workspaceOwnerId: job.workspace_owner_id,
      contactId: job.contact_id,
      instanceName: job.instance_name,
      payload: job.payload,
    });
    await markDone(job.id);
  } catch (e: any) {
    console.error("[job-worker] job falhou:", job.id, e?.message ?? e);
    captureException(e);
    await markError(job.id, job.attempts, String(e?.message ?? e));
  } finally {
    activeCount--;
  }
}

async function pollOnce() {
  if (activeCount >= MAX_GLOBAL_CONCURRENCY) return;
  const claimSize = Math.min(BATCH_SIZE, MAX_GLOBAL_CONCURRENCY - activeCount);
  const { data: jobs, error } = await supabaseAdmin.rpc("claim_message_jobs", {
    p_batch_size: claimSize,
  });
  if (error) {
    console.error("[job-worker] claim falhou:", error.message);
    return;
  }
  if (!jobs || jobs.length === 0) return;
  console.log(`[job-worker] processando ${jobs.length} job(s)`);
  for (const job of jobs as JobRow[]) {
    void runJob(job); // dispara em paralelo, até o teto de concorrência
  }
}

async function reapStaleJobs() {
  const cutoff = new Date(Date.now() - STALE_PROCESSING_MS).toISOString();
  const { error } = await supabaseAdmin
    .from("message_jobs")
    .update({ status: "pending" })
    .eq("status", "processing")
    .lt("locked_at", cutoff);
  if (error) console.error("[job-worker] reap falhou:", error.message);
}

async function pollLoop() {
  for (;;) {
    try {
      await pollOnce();
    } catch (e: any) {
      console.error("[job-worker] erro no loop:", e?.message ?? e);
      captureException(e);
    }
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
  }
}

console.log("[job-worker] iniciado", {
  pollIntervalMs: POLL_INTERVAL_MS,
  batchSize: BATCH_SIZE,
  maxGlobalConcurrency: MAX_GLOBAL_CONCURRENCY,
  perWorkspaceLimitPerMinute: PER_WORKSPACE_LIMIT_PER_MINUTE,
});

setInterval(() => {
  reapStaleJobs().catch((e) => console.error("[job-worker] reap erro:", e?.message ?? e));
}, 30_000);

process.on("SIGTERM", () => {
  console.log("[job-worker] SIGTERM recebido, encerrando após jobs em andamento");
  process.exit(0);
});

pollLoop();
