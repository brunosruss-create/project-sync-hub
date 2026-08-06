-- Estende job_type de message_jobs pra incluir 'render_composition'.
--
-- Novo tipo usado pra pedir ao worker do Railway (que tem satori/resvg
-- instalados) que renderize a composição do editor (foto base + camadas)
-- em PNG final. Vercel serverless não consegue chamar satori porque marcamos
-- como external no build.

alter table public.message_jobs drop constraint if exists message_jobs_job_type_check;
alter table public.message_jobs
  add constraint message_jobs_job_type_check
  check (job_type in ('ai_reply', 'csat_send', 'scheduled_send', 'content_generation', 'render_composition'));

notify pgrst, 'reload schema';

insert into public.schema_manual_migrations (filename)
values ('20260810000800_message_jobs_render_composition.sql')
on conflict (filename) do nothing;
