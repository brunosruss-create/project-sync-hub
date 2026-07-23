-- Troca o alerta de fila travada de webhook genérico (Slack/Discord) pra
-- mensagem direta no WhatsApp via Evolution API — usuário não usa
-- Discord/Slack, então reaproveita a infra que já existe.
-- Valores (URL/chave do Evolution, instância, número de destino) já
-- inseridos em global_settings via script (não versionados aqui de propósito).
create extension if not exists pg_cron;
create extension if not exists pg_net;

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
  where status = 'pending' and created_at < now() - interval '2 minutes';

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

-- Agenda a checagem a cada 2 minutos (idempotente: reagenda se já existir).
do $$
begin
  if exists (select 1 from cron.job where jobname = 'check-stale-message-jobs') then
    perform cron.unschedule('check-stale-message-jobs');
  end if;
end $$;

select cron.schedule(
  'check-stale-message-jobs',
  '*/2 * * * *',
  $$select public.check_stale_message_jobs();$$
);
