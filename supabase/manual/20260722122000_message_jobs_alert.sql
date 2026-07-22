-- Alerta de fila acumulando: se message_jobs tiver itens "pending" há mais
-- de 2 minutos, dispara um POST pro webhook configurado (Slack/Discord/etc).
-- É o sinal antecedente mais confiável de que o worker (src/lib/job-worker.ts)
-- caiu ou está degradando — sem isso, só se saberia pelo cliente reclamando.
--
-- Requer as extensions pg_cron e pg_net habilitadas no projeto (Supabase
-- Dashboard → Database → Extensions, ou rode este bloco uma vez com um usuário
-- com privilégio suficiente).
create extension if not exists pg_cron;
create extension if not exists pg_net;

create or replace function public.check_stale_message_jobs()
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  stale_count int;
  webhook_url text;
begin
  select count(*) into stale_count
  from public.message_jobs
  where status = 'pending' and created_at < now() - interval '2 minutes';

  if stale_count = 0 then
    return;
  end if;

  select value into webhook_url from public.global_settings where key = 'alert_webhook_url';
  if webhook_url is null or webhook_url = '' then
    raise warning '[check_stale_message_jobs] % job(s) travado(s) na fila, mas alert_webhook_url não está configurado em global_settings', stale_count;
    return;
  end if;

  perform net.http_post(
    url := webhook_url,
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body := jsonb_build_object(
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

-- Pra ativar o alerta, configure a URL do webhook (Slack/Discord incoming
-- webhook) uma vez:
--   insert into public.global_settings (key, value)
--   values ('alert_webhook_url', 'https://hooks.slack.com/services/...')
--   on conflict (key) do update set value = excluded.value;
