-- Garante a tabela public.services + public.service_categories com RLS por
-- workspace owner. Idempotente — pode rodar quantas vezes precisar.

-- =========================================================================
-- 1) service_categories
-- =========================================================================
create table if not exists public.service_categories (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid references auth.users(id) on delete cascade,
  name text not null,
  color text not null default '#25C880',
  created_at timestamptz not null default now()
);

alter table public.service_categories
  add column if not exists owner_user_id uuid references auth.users(id) on delete cascade;

create index if not exists service_categories_owner_idx
  on public.service_categories (owner_user_id);

alter table public.service_categories enable row level security;

do $$
declare r record;
begin
  for r in select policyname from pg_policies
    where schemaname='public' and tablename='service_categories'
  loop
    execute format('drop policy if exists %I on public.service_categories', r.policyname);
  end loop;
end $$;

create policy "ws members read service_categories"
  on public.service_categories for select to authenticated
  using (owner_user_id is null or owner_user_id = public.get_my_workspace_owner());

create policy "ws members insert service_categories"
  on public.service_categories for insert to authenticated
  with check (owner_user_id = public.get_my_workspace_owner());

create policy "ws members update service_categories"
  on public.service_categories for update to authenticated
  using (owner_user_id = public.get_my_workspace_owner())
  with check (owner_user_id = public.get_my_workspace_owner());

create policy "ws members delete service_categories"
  on public.service_categories for delete to authenticated
  using (owner_user_id = public.get_my_workspace_owner());

-- =========================================================================
-- 2) services
-- =========================================================================
create table if not exists public.services (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid references auth.users(id) on delete cascade,
  category_id uuid references public.service_categories(id) on delete set null,
  name text not null,
  description text default '',
  price_cents integer not null default 0,
  duration_minutes integer not null default 30,
  emoji text default '🔧',
  color text default '#25C880',
  status text not null default 'active',
  created_at timestamptz not null default now()
);

alter table public.services
  add column if not exists owner_user_id uuid references auth.users(id) on delete cascade;
alter table public.services
  add column if not exists status text not null default 'active';
alter table public.services
  add column if not exists category_id uuid;
alter table public.services
  add column if not exists description text default '';
alter table public.services
  add column if not exists price_cents integer not null default 0;
alter table public.services
  add column if not exists duration_minutes integer not null default 30;
alter table public.services
  add column if not exists emoji text default '🔧';
alter table public.services
  add column if not exists color text default '#25C880';
alter table public.services
  add column if not exists created_at timestamptz not null default now();

create index if not exists services_owner_status_idx
  on public.services (owner_user_id, status);

alter table public.services enable row level security;

do $$
declare r record;
begin
  for r in select policyname from pg_policies
    where schemaname='public' and tablename='services'
  loop
    execute format('drop policy if exists %I on public.services', r.policyname);
  end loop;
end $$;

create policy "ws members read services"
  on public.services for select to authenticated
  using (owner_user_id = public.get_my_workspace_owner());

create policy "ws members insert services"
  on public.services for insert to authenticated
  with check (owner_user_id = public.get_my_workspace_owner());

create policy "ws members update services"
  on public.services for update to authenticated
  using (owner_user_id = public.get_my_workspace_owner())
  with check (owner_user_id = public.get_my_workspace_owner());

create policy "ws members delete services"
  on public.services for delete to authenticated
  using (owner_user_id = public.get_my_workspace_owner());

notify pgrst, 'reload schema';
