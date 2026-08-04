-- ============================================================
-- 20260804000200_messages_content_search.sql
--
-- Busca dentro do conteúdo das mensagens. Até aqui a busca da lista de
-- conversas cobria nome, telefone e `contacts.last_message` — ou seja, só a
-- ÚLTIMA mensagem. Achar "a conversa onde o cliente falou da nota fiscal" era
-- impossível.
--
-- pg_trgm + GIN em vez de tsvector porque o usuário busca FRAGMENTO, não
-- palavra inteira ("nota fisc" tem que achar "nota fiscal"), e trigram não
-- depende de configurar dicionário/stemmer de português. O custo é um índice
-- maior; a tabela de mensagens é a mais quente do banco, mas a escrita é
-- append-only e o GIN aguenta bem esse padrão.
--
-- A query correspondente é `ilike '%termo%'` via PostgREST, que parametriza o
-- valor. Nunca interpolar input do usuário em string de `.or()`.
--
-- Idempotente. Rode no SQL Editor do Supabase.
-- ============================================================

create extension if not exists pg_trgm;

-- Se a tabela já for grande, rode ESTA linha separadamente, fora de bloco de
-- transação, para não travar escrita durante a criação:
--
--   create index concurrently if not exists messages_content_trgm_idx
--     on public.messages using gin (content gin_trgm_ops);
--
-- No SQL Editor do Supabase cada statement roda em sua própria transação, então
-- a forma abaixo serve para o volume atual.
create index if not exists messages_content_trgm_idx
  on public.messages using gin (content gin_trgm_ops);

comment on index public.messages_content_trgm_idx is
  'Busca por fragmento em messages.content (ilike %termo%). Se ficar lento com o crescimento, o próximo passo é btree_gin para índice composto (owner_user_id, content).';

insert into public.schema_manual_migrations (filename)
values ('20260804000200_messages_content_search.sql')
on conflict (filename) do nothing;

notify pgrst, 'reload schema';

select 'pg_trgm + índice de busca em messages.content' as status;
