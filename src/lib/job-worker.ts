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
import { sendCsatSurvey } from "@/lib/csat.server";
import { runScheduledSend, type ScheduledSendPayload } from "@/lib/scheduled-send.server";

initSentry("worker");

const POLL_INTERVAL_MS = 1500;
const BATCH_SIZE = 5;
const MAX_GLOBAL_CONCURRENCY = 18; // protege a chave única do Gemini de picos
const PER_WORKSPACE_LIMIT_PER_MINUTE = 25; // protege 1 cliente de estourar a cota de todos
const MAX_ATTEMPTS = 5;
const STALE_PROCESSING_MS = 5 * 60_000; // job travado em "processing" (worker caiu no meio) volta a pending

type JobType = "ai_reply" | "csat_send" | "scheduled_send";

type JobRow = {
  id: string;
  workspace_owner_id: string;
  contact_id: string;
  instance_name: string;
  /** Para "ai_reply" é MessageJobPayload; para "csat_send" é { survey_id }. */
  payload: MessageJobPayload | Record<string, unknown>;
  attempts: number;
  job_type: JobType;
  scheduled_at: string;
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

/**
 * Devolve um job throttlado para a fila.
 *
 * Duas coisas importam aqui, e as duas só ficaram possíveis com `scheduled_at`:
 *
 * 1. Adia 5s em vez de devolver para "agora". Antes o job voltava a `pending`
 *    e o poll de 1,5s reclamava na hora, girando em falso contra um workspace
 *    que estourou a cota.
 * 2. Devolve o `attempts`. O incremento acontece no claim (RPC), então um job
 *    só throttlado consumia tentativa sem nunca ter sido executado — bastavam
 *    5 voltas de throttle para virar dead-letter. Throttle não é falha.
 */
async function releaseBackToPending(jobId: string, attempts: number) {
  const { error } = await supabaseAdmin
    .from("message_jobs")
    .update({
      status: "pending",
      scheduled_at: new Date(Date.now() + 5_000).toISOString(),
      attempts: Math.max(0, attempts - 1),
    })
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
  // Backoff exponencial: 2s, 4s, 8s, 16s, 32s. Antes o retry era imediato
  // (voltava a `pending` e o poll de 1,5s pegava de novo), então as 5
  // tentativas se esgotavam em ~8 segundos — um 500 transitório do Gemini
  // virava dead-letter sem nunca ter tido chance real de reprocessar.
  const backoffMs = Math.min(2 ** Math.max(1, attempts) * 1000, 60_000);
  const { error } = await supabaseAdmin
    .from("message_jobs")
    .update({
      status,
      last_error: message.slice(0, 500),
      ...(status === "pending"
        ? { scheduled_at: new Date(Date.now() + backoffMs).toISOString() }
        : {}),
    })
    .eq("id", jobId);
  if (error) console.error("[job-worker] markError falhou:", jobId, error.message);
}

async function runJob(job: JobRow) {
  activeCount++;
  try {
    // O rate limit por workspace existe para proteger a cota do Gemini, então
    // só se aplica a jobs que chamam a IA. CSAT não toca LLM — passá-lo por
    // aqui o atrasaria sem motivo e, pior, um workspace com muito volume de IA
    // adiaria indefinidamente o envio das pesquisas.
    //
    // Contrapartida: envios de CSAT ficam invisíveis para qualquer throttle.
    // A defesa contra rajada (resolver 200 conversas de uma vez) é o jitter no
    // `scheduled_at`, aplicado pelo trigger que enfileira — não aqui.
    if (job.job_type === "ai_reply") {
      if (isRateLimited(job.workspace_owner_id)) {
        await releaseBackToPending(job.id, job.attempts);
        return;
      }
      recordCall(job.workspace_owner_id);
      await processMessageJob({
        workspaceOwnerId: job.workspace_owner_id,
        contactId: job.contact_id,
        instanceName: job.instance_name,
        payload: job.payload as MessageJobPayload,
      });
    } else if (job.job_type === "csat_send") {
      await sendCsatSurvey({
        surveyId: String((job.payload as any)?.survey_id ?? ""),
        scheduledAt: job.scheduled_at,
        attempts: job.attempts,
      });
    } else if (job.job_type === "scheduled_send") {
      // Mensagem agendada pelo atendente. Não passa pelo rate limit da IA:
      // é ação humana explícita, pontual, e não bate no Gemini.
      await runScheduledSend({
        workspaceOwnerId: job.workspace_owner_id,
        contactId: job.contact_id,
        instanceName: job.instance_name,
        payload: job.payload as ScheduledSendPayload,
      });
    } else {
      // Tipo desconhecido: marca done em vez de ficar reprocessando para sempre.
      console.warn("[job-worker] job_type desconhecido, ignorando:", job.job_type, job.id);
    }
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
