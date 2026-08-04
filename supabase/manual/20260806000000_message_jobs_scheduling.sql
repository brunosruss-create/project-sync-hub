-- ============================================================
-- 20260806000000_message_jobs_scheduling.sql
--
-- Prepara `message_jobs` para (a) mais de um tipo de job e (b) execução
-- futura. Nada muda de comportamento para os jobs de IA que já existem:
-- entram como job_type='ai_reply' com scheduled_at=now() e são claimados
-- exatamente como antes.
--
-- Habilita duas coisas:
--   • CSAT (pesquisa enviada X minutos depois de a conversa ser resolvida);
--   • backoff de verdade no retry. Hoje markError devolve o job a 'pending'
--     e o poll de 1,5s reclama na hora — as 5 tentativas queimam em ~8
--     segundos e um 500 transitório do Gemini vira dead-letter.
--
-- Idempotente. Rode no SQL Editor do Supabase.
-- ============================================================

-- Se o webhook tiver um insert em voo, o ALTER espera pelo lock — e todo
-- insert que chegar depois enfileira ATRÁS do ALTER. Melhor falhar rápido
-- e repetir do que travar a ingestão de mensagens.
set local lock_timeout = '5s';

-- ── job_type ────────────────────────────────────────────────

alter table public.message_jobs
  add column if not exists job_type text not null default 'ai_reply';

comment on column public.message_jobs.job_type is
  'Discriminador do handler no worker (runJob em src/lib/job-worker.ts).';

alter table public.message_jobs drop constraint if exists message_jobs_job_type_check;
alter table public.message_jobs
  add constraint message_jobs_job_type_check
  check (job_type in ('ai_reply', 'csat_send'));

-- ── scheduled_at ────────────────────────────────────────────

-- Em três passos de propósito. Fazer direto com
-- `add column scheduled_at timestamptz not null default now()` carimbaria
-- TODAS as linhas existentes com o horário do ALTER (now() é STABLE, então
-- o Postgres usa o fast path sem rewrite). Isso perderia a ordem FIFO do
-- backlog `pending` — todas empatariam — e cegaria o alerta de fila travada
-- por 2 minutos, porque a idade das linhas resetaria.
alter table public.message_jobs
  add column if not exists scheduled_at timestamptz;

update public.message_jobs
   set scheduled_at = created_at
 where scheduled_at is null;

alter table public.message_jobs
  alter column scheduled_at set default now(),
  alter column scheduled_at set not null;

comment on column public.message_jobs.scheduled_at is
  'Não claimar antes deste instante. Igual a created_at para jobs imediatos.';

-- ── Índices ─────────────────────────────────────────────────

create index if not exists message_jobs_due_idx
  on public.message_jobs (scheduled_at)
  where status = 'pending';

-- O antigo (created_at) fica sem nenhum consumidor: o claim passa a ordenar
-- por scheduled_at e o alerta a contar por scheduled_at. Índice parcial em
-- status='pending' é reescrito a cada transição de status (entra no insert,
-- sai no claim) — manter dois dobra esse custo de escrita à toa.
drop index if exists public.message_jobs_pending_idx;

-- ── Claim ───────────────────────────────────────────────────

-- `create or replace` basta: a assinatura não muda, e o tipo de retorno
-- `setof public.message_jobs` se estende sozinho quando a tabela ganha
-- colunas (o composite muda por baixo, a identidade do tipo não).
create or replace function public.claim_message_jobs(p_batch_size int default 5)
returns setof public.message_jobs
language plpgsql
security definer set search_path = public
as $$
begin
  return query
  update public.message_jobs
     set status = 'processing',
         locked_at = now(),
         attempts = attempts + 1
   where id in (
     select id from public.message_jobs
      where status = 'pending'
        and scheduled_at <= now()
      order by scheduled_at
      limit p_batch_size
      for update skip locked
   )
  returning *;
end;
$$;

-- ── Alerta de fila travada ──────────────────────────────────

-- Só muda a linha da contagem: `created_at` → `scheduled_at`. Sem isto, todo
-- job agendado para o futuro fica `pending` com created_at no passado e
-- dispara "worker caído" no WhatsApp do dono A CADA 2 MINUTOS até a hora de
-- rodar (o pg_cron está ativo em '*/2 * * * *').
-- Corpo idêntico ao de 20260723000000_message_jobs_alert_whatsapp.sql.
create or replace function public.check_stale_message_jobs()
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  stale_count int;
  evolution_url text;
  evolution_key text;
  instance_name text;
  target_number text;
begin
  select count(*) into stale_count
  from public.message_jobs
  where status = 'pending' and scheduled_at < now() - interval '2 minutes';

  if stale_count = 0 then
    return;
  end if;

  select value into evolution_url from public.global_settings where key = 'alert_evolution_url';
  select value into evolution_key from public.global_settings where key = 'alert_evolution_api_key';
  select value into instance_name from public.global_settings where key = 'alert_evolution_instance';
  select value into target_number from public.global_settings where key = 'alert_whatsapp_number';

  if evolution_url is null or evolution_key is null or instance_name is null or target_number is null then
    raise warning '[check_stale_message_jobs] % job(s) travado(s) na fila, mas alerta via WhatsApp não configurado (faltam chaves alert_* em global_settings)', stale_count;
    return;
  end if;

  perform net.http_post(
    url := evolution_url || '/message/sendText/' || instance_name,
    headers := jsonb_build_object('Content-Type', 'application/json', 'apikey', evolution_key),
    body := jsonb_build_object(
      'number', target_number,
      'text', format(
        '⚠️ ZapFlow: %s mensagem(ns) travada(s) na fila há mais de 2 minutos. Verificar o worker (job-worker) no Railway.',
        stale_count
      )
    )
  );
end;
$$;

insert into public.schema_manual_migrations (filename)
values ('20260806000000_message_jobs_scheduling.sql')
on conflict (filename) do nothing;

-- Obrigatório: o PostgREST cacheia a forma de retorno da RPC. Sem isto o
-- worker recebe as linhas sem as colunas novas.
notify pgrst, 'reload schema';

select 'message_jobs: job_type + scheduled_at + claim/alerta atualizados' as status;

-- ── Verificação (rode depois, separado) ─────────────────────
--
-- 1) Job agendado NÃO deve ser claimado antes da hora:
--
--    insert into public.message_jobs
--      (workspace_owner_id, contact_id, instance_name, payload, job_type, scheduled_at)
--    select owner_user_id, id, 'zf_teste', '{}'::jsonb, 'csat_send', now() + interval '5 minutes'
--      from public.contacts limit 1
--    returning id;
--
--    select count(*) as deve_ser_zero
--      from public.claim_message_jobs(10) where job_type = 'csat_send';
--
-- 2) E o alerta NÃO deve contar esse job (esta é a razão da mudança):
--
--    select count(*) as deve_ser_zero
--      from public.message_jobs
--     where status = 'pending' and scheduled_at < now() - interval '2 minutes';
--
-- 3) Limpe: delete from public.message_jobs where instance_name = 'zf_teste';
