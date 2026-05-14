-- Rode este SQL no SQL Editor do Supabase (projeto xrezmnaspkctuidehqqi).
-- Garante a tabela appointments + appointment_services com RLS por dono.
-- Idempotente.

create table if not exists public.appointments (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid references auth.users(id) on delete cascade,
  contact_id uuid,
  service_id text,
  agent_id text,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  status text not null default 'scheduled',
  notes text default '',
  notify_whatsapp boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.appointments
  add column if not exists owner_user_id uuid references auth.users(id) on delete cascade;
alter table public.appointments
  add column if not exists contact_id uuid;
alter table public.appointments
  add column if not exists service_id text;
alter table public.appointments
  add column if not exists agent_id text;
alter table public.appointments
  add column if not exists status text not null default 'scheduled';
alter table public.appointments
  add column if not exists notes text default '';
alter table public.appointments
  add column if not exists notify_whatsapp boolean not null default true;
alter table public.appointments
  add column if not exists created_at timestamptz not null default now();

do $$
declare col_type text;
begin
  select data_type into col_type from information_schema.columns
    where table_schema='public' and table_name='appointments' and column_name='agent_id';
  if col_type = 'uuid' then
    alter table public.appointments alter column agent_id type text using agent_id::text;
  end if;
  select data_type into col_type from information_schema.columns
    where table_schema='public' and table_name='appointments' and column_name='service_id';
  if col_type = 'uuid' then
    alter table public.appointments alter column service_id type text using service_id::text;
  end if;
end $$;

create index if not exists appointments_owner_starts_idx
  on public.appointments(owner_user_id, starts_at);
create index if not exists appointments_contact_idx
  on public.appointments(contact_id);

alter table public.appointments enable row level security;

drop policy if exists "Users can read own appointments" on public.appointments;
drop policy if exists "Users can insert own appointments" on public.appointments;
drop policy if exists "Users can update own appointments" on public.appointments;
drop policy if exists "Users can delete own appointments" on public.appointments;

create policy "Users can read own appointments"
  on public.appointments for select to authenticated
  using (owner_user_id = auth.uid());
create policy "Users can insert own appointments"
  on public.appointments for insert to authenticated
  with check (owner_user_id = auth.uid());
create policy "Users can update own appointments"
  on public.appointments for update to authenticated
  using (owner_user_id = auth.uid()) with check (owner_user_id = auth.uid());
create policy "Users can delete own appointments"
  on public.appointments for delete to authenticated
  using (owner_user_id = auth.uid());

create table if not exists public.appointment_services (
  id uuid primary key default gen_random_uuid(),
  appointment_id uuid not null references public.appointments(id) on delete cascade,
  owner_user_id uuid references auth.users(id) on delete cascade,
  service_id text,
  price_cents integer not null default 0,
  duration_minutes integer not null default 0,
  created_at timestamptz not null default now()
);

alter table public.appointment_services
  add column if not exists owner_user_id uuid references auth.users(id) on delete cascade;

create index if not exists appointment_services_appt_idx
  on public.appointment_services(appointment_id);
create index if not exists appointment_services_owner_idx
  on public.appointment_services(owner_user_id);

alter table public.appointment_services enable row level security;

drop policy if exists "Users can read own appointment_services" on public.appointment_services;
drop policy if exists "Users can insert own appointment_services" on public.appointment_services;
drop policy if exists "Users can update own appointment_services" on public.appointment_services;
drop policy if exists "Users can delete own appointment_services" on public.appointment_services;

create policy "Users can read own appointment_services"
  on public.appointment_services for select to authenticated
  using (owner_user_id = auth.uid()
    or exists (select 1 from public.appointments a
               where a.id = appointment_services.appointment_id and a.owner_user_id = auth.uid()));
create policy "Users can insert own appointment_services"
  on public.appointment_services for insert to authenticated
  with check (owner_user_id = auth.uid()
    or exists (select 1 from public.appointments a
               where a.id = appointment_services.appointment_id and a.owner_user_id = auth.uid()));
create policy "Users can update own appointment_services"
  on public.appointment_services for update to authenticated
  using (owner_user_id = auth.uid()
    or exists (select 1 from public.appointments a
               where a.id = appointment_services.appointment_id and a.owner_user_id = auth.uid()));
create policy "Users can delete own appointment_services"
  on public.appointment_services for delete to authenticated
  using (owner_user_id = auth.uid()
    or exists (select 1 from public.appointments a
               where a.id = appointment_services.appointment_id and a.owner_user_id = auth.uid()));

alter table public.appointments replica identity full;
do $$
begin
  if exists (select 1 from pg_publication where pubname='supabase_realtime') then
    begin
      execute 'alter publication supabase_realtime add table public.appointments';
    exception when duplicate_object then null;
    end;
  end if;
end $$;
