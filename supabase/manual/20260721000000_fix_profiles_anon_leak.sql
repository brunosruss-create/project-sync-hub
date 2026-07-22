-- ============================================================
-- SEGURANÇA: fecha vazamento de dados de negócio via chave anônima.
-- ============================================================
-- Cole este arquivo INTEIRO no SQL Editor do Supabase e clique em Run:
-- https://supabase.com/dashboard/project/xrezmnaspkctuidehqqi/sql/new
-- É seguro rodar várias vezes (idempotente).
--
-- PROBLEMA:
-- A policy "public_can_read_booking_profile" (criada pelo recurso de "link de
-- agendamento público", já REMOVIDO do código) permitia que a chave anônima
-- lesse linhas de `profiles` com booking_enabled=true — expondo business_name,
-- email e ai_custom_prompt para QUALQUER pessoa na internet, sem login.
-- A migration que deveria ter removido isso (20260614000000_drop_public_booking_link.sql)
-- nunca foi aplicada neste banco de produção. Confirmado empiricamente:
-- `GET /rest/v1/profiles` com a chave anon retornava 1 linha com dados do negócio.

-- 1) Garante que a RLS está ligada em profiles.
alter table if exists public.profiles enable row level security;

-- 2) Remove a policy pública residual — esta é a correção do vazamento.
drop policy if exists "public_can_read_booking_profile" on public.profiles;

-- 3) Defensivo: remove QUALQUER outra policy concedida ao role `anon` em profiles,
--    caso exista alguma outra sobra que eu não tenha visto.
do $$
declare pol record;
begin
  for pol in
    select policyname
    from pg_policies
    where schemaname = 'public'
      and tablename = 'profiles'
      and 'anon' = any(roles)
  loop
    execute format('drop policy if exists %I on public.profiles', pol.policyname);
    raise notice 'Removida policy anon residual em profiles: %', pol.policyname;
  end loop;
end $$;

-- 4) Limpa as colunas mortas do booking link (o código não as usa mais).
alter table if exists public.profiles
  drop column if exists booking_slug,
  drop column if exists booking_enabled,
  drop column if exists booking_ai_send,
  drop column if exists booking_service_ids,
  drop column if exists booking_title,
  drop column if exists booking_description;

drop index if exists public.profiles_booking_slug_idx;

-- 5) Verificação: lista as policies restantes de profiles.
--    Nenhuma deve ter 'anon' na coluna `roles`.
select policyname, roles, cmd
from pg_policies
where schemaname = 'public' and tablename = 'profiles'
order by policyname;
