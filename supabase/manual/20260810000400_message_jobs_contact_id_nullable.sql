-- ============================================================
-- Torna contact_id opcional em message_jobs.
--
-- Motivação: o novo job_type='content_generation' (do AI_Content_Generation_Module)
-- não está atrelado a nenhum Contact — é uma tarefa de geração de post.
-- Antes dessa migration, a FK obrigatória bloqueava o INSERT com um
-- "violates foreign key constraint message_jobs_contact_id_fkey".
--
-- Job types que continuam populando contact_id (ai_reply, csat_send,
-- scheduled_send) não são afetados. A FK segue existindo (ON DELETE CASCADE)
-- pra manter a integridade quando um Contact é apagado.
-- ============================================================

alter table public.message_jobs
  alter column contact_id drop not null;

notify pgrst, 'reload schema';

insert into public.schema_manual_migrations (filename)
values ('20260810000400_message_jobs_contact_id_nullable.sql')
on conflict (filename) do nothing;
