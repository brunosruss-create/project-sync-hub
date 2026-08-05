-- Bootstrap: função RPC que permite ao service_role aplicar migrations via API.
--
-- Escopo: sem senha do Postgres no ambiente, um script Node não tem como
-- executar DDL — o SERVICE_ROLE_KEY é JWT do PostgREST, não credencial de
-- banco. Esta função abre uma via controlada: só quem tem service_role
-- consegue chamar (verificado via `role = 'service_role'` do JWT).
--
-- Segurança:
--   1. SECURITY DEFINER com search_path fixado a public (evita hijack via
--      trigger em schemas atacantes).
--   2. Chamável APENAS pelo role interno `service_role` — nunca `authenticated`
--      nem `anon`. A GRANT abaixo é a única superfície de acesso.
--   3. O service_role já ignora RLS por definição no Supabase, então esta
--      função não amplia o modelo de ameaças: quem tinha a chave já podia
--      ler/escrever em qualquer linha; agora também pode aplicar DDL.
--
-- Uso pelo script apply-migrations.ts:
--   POST /rest/v1/rpc/apply_migration_sql
--   { "sql": "<conteúdo do .sql>" }
--
-- Não é `exec` genérico de propósito: o nome deixa claro que é infra de
-- migration, e o retorno vazio evita vazar contagem de linhas afetadas
-- via canais laterais.

create or replace function public.apply_migration_sql(sql text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Rejeita input nulo/vazio de propósito para evitar erros silenciosos.
  if sql is null or length(trim(sql)) = 0 then
    raise exception 'apply_migration_sql: SQL vazio';
  end if;
  execute sql;
end;
$$;

comment on function public.apply_migration_sql(text) is
  'Executa DDL/DML via RPC. Somente service_role. Usado por scripts/apply-migrations.ts.';

-- Revoga do público por precaução — o default do Postgres é conceder
-- EXECUTE em funções para PUBLIC, o que aqui seria catastrófico.
revoke all on function public.apply_migration_sql(text) from public;
revoke all on function public.apply_migration_sql(text) from anon;
revoke all on function public.apply_migration_sql(text) from authenticated;

-- Concede APENAS ao service_role.
grant execute on function public.apply_migration_sql(text) to service_role;

notify pgrst, 'reload schema';

insert into public.schema_manual_migrations (filename)
values ('20260808000100_bootstrap_apply_sql_rpc.sql')
on conflict (filename) do nothing;
