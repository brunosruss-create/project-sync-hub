// Sentry é opcional: sem SENTRY_DSN configurado, init() e captureException() não fazem nada.
// Configurar SENTRY_DSN nas env vars do Vercel (app) e do Railway (worker) ativa o monitoramento.
import * as Sentry from "@sentry/node";

let initialized = false;

export function initSentry(processName: "server" | "worker") {
  if (initialized) return;
  const dsn = process.env.SENTRY_DSN;
  if (!dsn) return;
  Sentry.init({
    dsn,
    tracesSampleRate: 0,
    initialScope: { tags: { process: processName } },
  });
  initialized = true;
}

export function captureException(error: unknown) {
  if (!initialized) return;
  Sentry.captureException(error);
}
