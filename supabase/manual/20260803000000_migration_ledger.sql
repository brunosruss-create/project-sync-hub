-- ============================================================
-- 20260803000000_migration_ledger.sql
--
-- Registro de quais migrations manuais já rodaram neste banco.
--
-- Contexto: as migrations deste projeto são aplicadas à mão no SQL Editor
-- (supabase/manual/*.sql, 50+ arquivos). Até aqui, saber o que estava aplicado
-- dependia de memória. Esta tabela é o registro; `npm run migrations:check`
-- compara o repo com ela e diz o que falta rodar.
--
-- Convenção: toda migration manual nova termina registrando o próprio nome:
--
--   insert into public.schema_manual_migrations (filename)
--   values ('<nome-deste-arquivo>.sql')
--   on conflict (filename) do nothing;
--
-- Idempotente. Rode no SQL Editor do Supabase.
-- ============================================================

create table if not exists public.schema_manual_migrations (
  filename    text primary key,
  applied_at  timestamptz not null default now()
);

comment on table public.schema_manual_migrations is
  'Migrations de supabase/manual/ já aplicadas. Lido por scripts/check-migrations.ts.';

-- Metadado de schema: não é dado de tenant e não deve ser exposto ao cliente
-- anônimo. RLS ligado sem policy nenhuma = ninguém acessa via chave anônima;
-- o service role (usado pelo script) ignora RLS por definição.
alter table public.schema_manual_migrations enable row level security;

insert into public.schema_manual_migrations (filename)
values ('20260803000000_migration_ledger.sql')
on conflict (filename) do nothing;

notify pgrst, 'reload schema';

select 'migration ledger criado' as status;
