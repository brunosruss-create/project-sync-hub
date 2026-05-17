-- Link público de agendamento — adiciona colunas em profiles e policy anon.
-- Idempotente. Rode no SQL Editor do Supabase.

alter table public.profiles
  add column if not exists booking_slug         text unique,
  add column if not exists booking_enabled      boolean default false,
  add column if not exists booking_service_ids  text[] default '{}',
  add column if not exists booking_title        text default 'Agende seu horário',
  add column if not exists booking_description  text default '';

-- Backfill: gera slug para workspaces existentes (apenas onde estiver vazio).
update public.profiles
set booking_slug = (
  lower(
    regexp_replace(
      coalesce(substring(business_name from 1 for 20), 'workspace'),
      '[^a-zA-Z0-9]+', '-', 'g'
    )
  ) || '-' || substring(gen_random_uuid()::text from 1 for 4)
)
where booking_slug is null or booking_slug = '';

-- Garantia extra contra slug vazio (caso o regexp produza string vazia).
update public.profiles
set booking_slug = 'workspace-' || substring(gen_random_uuid()::text from 1 for 8)
where booking_slug is null or booking_slug = '' or booking_slug ~ '^-+';

create index if not exists profiles_booking_slug_idx
  on public.profiles(booking_slug)
  where booking_enabled = true;

-- Policy: anon pode SELECT em profiles APENAS quando booking_enabled=true.
-- A API pública projeta apenas as colunas necessárias (nunca SELECT *).
drop policy if exists "public_can_read_booking_profile" on public.profiles;
create policy "public_can_read_booking_profile"
  on public.profiles for select
  to anon
  using (booking_enabled = true and booking_slug is not null);

-- Sem policy anon em appointments — escrita sempre via supabaseAdmin na
-- server route /api/public/book/$slug.
