-- ============================================================
-- Estende o check constraint de public.message_jobs.job_type para
-- reconhecer o novo tipo 'content_generation', despachado pelo worker
-- para o handler processContentGenerationJob no AI_Content_Generation_Module.
--
-- Nada muda para os tipos já existentes ('ai_reply', 'csat_send',
-- 'scheduled_send'). A intenção é apenas permitir INSERT de linhas
-- do novo tipo sem violar constraint.
-- ============================================================

alter table public.message_jobs drop constraint if exists message_jobs_job_type_check;
alter table public.message_jobs
  add constraint message_jobs_job_type_check
  check (job_type in ('ai_reply', 'csat_send', 'scheduled_send', 'content_generation'));

notify pgrst, 'reload schema';

insert into public.schema_manual_migrations (filename)
values ('20260810000300_message_jobs_content_generation.sql')
on conflict (filename) do nothing;
