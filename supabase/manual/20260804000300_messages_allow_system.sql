-- ============================================================
-- 20260804000300_messages_allow_system.sql
--
-- Permite direction/message_type = 'system' em `public.messages`.
--
-- Contexto: a tabela `messages` foi criada fora do versionamento, e as CHECK
-- constraints dela nunca estiveram no repo. A de `direction` aceitava só
-- ('inbound','outbound') — mas o código insere 'system' em dois lugares desde
-- sempre:
--
--   • src/hooks/use-contact-actions.ts   → "Conversa transferida para X"
--   • src/features/inbox/schedule-modal.tsx → aviso de agendamento
--
-- Os dois falhavam em silêncio (o erro era ignorado como "best-effort"), então
-- esses avisos NUNCA apareceram no chat. Esta migration conserta isso, e é
-- também o que destrava a nota interna — que grava direction/message_type
-- 'system' de propósito, para não casar com nenhum `.eq("direction", …)` do
-- resto do código e assim falhar seguro em quem esquecer o filtro is_internal.
--
-- Sem isto, `messages_internal_shape_chk` (que EXIGE 'system' para notas) e
-- `messages_direction_check` (que PROIBIA 'system') se contradizem e nenhuma
-- nota pode ser inserida.
--
-- Idempotente. Rode no SQL Editor do Supabase.
-- ============================================================

-- direction: a definição atual é conhecida e curta, então recriamos explícito.
do $$
declare
  def text;
begin
  select pg_get_constraintdef(oid) into def
    from pg_constraint
   where conrelid = 'public.messages'::regclass
     and conname  = 'messages_direction_check';

  if def is null then
    -- Constraint não existe neste banco: cria já com os três valores.
    alter table public.messages
      add constraint messages_direction_check
      check (direction = any (array['inbound'::text, 'outbound'::text, 'system'::text]));
  elsif def not like '%''system''%' then
    alter table public.messages drop constraint messages_direction_check;
    alter table public.messages
      add constraint messages_direction_check
      check (direction = any (array['inbound'::text, 'outbound'::text, 'system'::text]));
  end if;
end $$;

-- message_type: a lista atual é maior (text/image/audio/video/document/…) e
-- pode conter valores que não conhecemos. Em vez de recriar por uma lista
-- adivinhada — que poderia ESTREITAR silenciosamente o que hoje é aceito e
-- quebrar o webhook —, acrescentamos 'system' à definição existente.
do $$
declare
  def text;
  newdef text;
begin
  select pg_get_constraintdef(oid) into def
    from pg_constraint
   where conrelid = 'public.messages'::regclass
     and conname  = 'messages_message_type_check';

  if def is null then
    raise notice 'messages_message_type_check não existe — nada a fazer.';
  elsif def like '%''system''%' then
    raise notice 'messages_message_type_check já aceita system — nada a fazer.';
  else
    -- Injeta 'system' no fim do ARRAY[...], preservando todo o resto.
    newdef := regexp_replace(def, '\]\)\)\s*$', ', ''system''::text]))');
    if newdef = def then
      raise exception 'Formato inesperado em messages_message_type_check, ajuste à mão: %', def;
    end if;
    execute 'alter table public.messages drop constraint messages_message_type_check';
    execute 'alter table public.messages add constraint messages_message_type_check ' || newdef;
  end if;
end $$;

insert into public.schema_manual_migrations (filename)
values ('20260804000300_messages_allow_system.sql')
on conflict (filename) do nothing;

notify pgrst, 'reload schema';

-- Confere o resultado.
select conname, pg_get_constraintdef(oid) as definicao
  from pg_constraint
 where conrelid = 'public.messages'::regclass
   and conname in ('messages_direction_check', 'messages_message_type_check')
 order by conname;
