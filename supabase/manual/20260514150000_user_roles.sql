-- User roles: manager / agent
-- Roles MUST live in their own table (never on profiles) for security.

create type public.app_role as enum ('manager', 'agent');

create table public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  role app_role not null,
  created_at timestamptz default now() not null,
  unique (user_id, role)
);

alter table public.user_roles enable row level security;

-- SECURITY DEFINER to avoid recursive RLS checks
create or replace function public.has_role(_user_id uuid, _role app_role)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.user_roles
    where user_id = _user_id and role = _role
  )
$$;

-- Returns the highest-priority role for the current user (manager > agent)
create or replace function public.get_my_role()
returns app_role
language sql stable security definer set search_path = public
as $$
  select role from public.user_roles
  where user_id = auth.uid()
  order by case role when 'manager' then 1 when 'agent' then 2 end
  limit 1
$$;

-- Each user reads only their own role rows
create policy "users read own roles"
on public.user_roles for select to authenticated
using (user_id = auth.uid());

-- Backfill: every existing auth user becomes manager (compat — nobody loses access)
insert into public.user_roles (user_id, role)
select id, 'manager'::app_role from auth.users
on conflict (user_id, role) do nothing;

-- Trigger: new signup → manager by default
create or replace function public.handle_new_user_role()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  insert into public.user_roles (user_id, role)
  values (new.id, 'manager')
  on conflict do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created_role on auth.users;
create trigger on_auth_user_created_role
after insert on auth.users
for each row execute function public.handle_new_user_role();
