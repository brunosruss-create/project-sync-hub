-- Profissionais: pessoas que executam o serviço (separado de Equipe / acesso ao sistema).
-- Idempotente. Rode no SQL Editor do Supabase.

create table if not exists public.professionals (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  role text default '',
  phone text default '',
  email text default '',
  avatar_url text,
  avatar_color text,
  linked_user_id uuid references auth.users(id) on delete set null,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create index if not exists professionals_owner_idx
  on public.professionals(owner_user_id, is_active);

alter table public.professionals enable row level security;

drop policy if exists "ws members read professionals" on public.professionals;
drop policy if exists "ws owner insert professionals" on public.professionals;
drop policy if exists "ws owner update professionals" on public.professionals;
drop policy if exists "ws owner delete professionals" on public.professionals;

create policy "ws members read professionals"
  on public.professionals for select to authenticated
  using (owner_user_id = public.get_my_workspace_owner());

create policy "ws owner insert professionals"
  on public.professionals for insert to authenticated
  with check (owner_user_id = auth.uid());

create policy "ws owner update professionals"
  on public.professionals for update to authenticated
  using (owner_user_id = auth.uid())
  with check (owner_user_id = auth.uid());

create policy "ws owner delete professionals"
  on public.professionals for delete to authenticated
  using (owner_user_id = auth.uid());

-- appointments.professional_id (espelha agent_id durante a transição)
alter table public.appointments
  add column if not exists professional_id uuid
    references public.professionals(id) on delete set null;

create index if not exists appointments_professional_idx
  on public.appointments(professional_id);

-- realtime
alter table public.professionals replica identity full;
do $$
begin
  if exists (select 1 from pg_publication where pubname='supabase_realtime') then
    begin
      execute 'alter publication supabase_realtime add table public.professionals';
    exception when duplicate_object then null;
    end;
  end if;
end $$;
