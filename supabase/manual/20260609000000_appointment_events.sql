-- Tabela de eventos do appointment: histórico de ações por lead (created /
-- rescheduled / cancelled). Insert é feito sempre via service role pelo
-- server fn `notifyAppointmentChange`, então não precisamos de policy de insert
-- para usuários autenticados.

create table if not exists public.appointment_events (
  id uuid primary key default gen_random_uuid(),
  appointment_id uuid not null references public.appointments(id) on delete cascade,
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  contact_id uuid references public.contacts(id) on delete set null,
  service_id uuid references public.services(id) on delete set null,
  kind text not null check (kind in ('created','rescheduled','cancelled')),
  starts_at timestamptz,
  previous_starts_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists appointment_events_contact_idx
  on public.appointment_events(contact_id, created_at desc);
create index if not exists appointment_events_owner_idx
  on public.appointment_events(owner_user_id, created_at desc);
create index if not exists appointment_events_appt_idx
  on public.appointment_events(appointment_id, created_at desc);

alter table public.appointment_events enable row level security;

drop policy if exists "ws members read appointment_events" on public.appointment_events;
create policy "ws members read appointment_events"
  on public.appointment_events for select to authenticated
  using (owner_user_id = public.get_my_workspace_owner());

-- realtime opcional
alter table public.appointment_events replica identity full;
do $$
begin
  if exists (select 1 from pg_publication where pubname='supabase_realtime') then
    begin
      execute 'alter publication supabase_realtime add table public.appointment_events';
    exception when duplicate_object then null;
    end;
  end if;
end $$;
