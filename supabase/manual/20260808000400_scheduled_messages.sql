-- Fase 9: Mensagens agendadas.
--
-- Reusa a tabela existente `message_jobs` (fila do worker) em vez de criar
-- outra tabela pra listar+cancelar+disparar. O worker já faz claim baseado em
-- `scheduled_at <= now()`; só faltava reconhecer o novo `job_type`.
--
-- Payload esperado do scheduled_send (JSON):
--   {
--     "text": "conteúdo da mensagem" | null,
--     "mediaUrl": "url" | null,
--     "mediaMime": "image/png" | null,
--     "mediaName": "arquivo.pdf" | null,
--     "sentBy": "<uuid do atendente>"
--   }
--
-- Depende de:
--   - 20260806000000_message_jobs_scheduling.sql (job_type + scheduled_at)

begin;

-- Estende o check constraint de job_type. Recria sem cair pra outros valores
-- (mantém o comportamento das políticas antigas de dead-letter).
alter table public.message_jobs drop constraint if exists message_jobs_job_type_check;
alter table public.message_jobs
  add constraint message_jobs_job_type_check
  check (job_type in ('ai_reply', 'csat_send', 'scheduled_send'));

-- Índice para a UI de "mensagens agendadas do contato": filtra por
-- (contact_id, status=pending, job_type=scheduled_send) e ordena por
-- scheduled_at. Sem o parcial, a tabela já é varrida a cada listagem porque a
-- maior parte dela é de ai_reply.
create index if not exists message_jobs_scheduled_send_idx
  on public.message_jobs (contact_id, scheduled_at)
  where status = 'pending' and job_type = 'scheduled_send';

commit;

notify pgrst, 'reload schema';

insert into public.schema_manual_migrations (filename)
values ('20260808000400_scheduled_messages.sql')
on conflict (filename) do nothing;
