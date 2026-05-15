-- Super Admin actions: bloqueio de usuário, plano de workspace, audit log.
-- Aditivo. Não altera RLS de outras tabelas.

-- 1) Colunas em profiles
alter table public.profiles
  add column if not exists is_blocked boolean not null default false;

alter table public.profiles
  add column if not exists plan text;

-- 2) Índices úteis para queries do super admin
create index if not exists contacts_owner_lastmsg_idx
  on public.contacts (owner_user_id, last_message_at desc nulls last);

-- 3) audit_logs
create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references auth.users(id) on delete set null,
  actor_email text,
  action text not null,
  resource_type text,
  resource_id text,
  metadata jsonb,
  created_at timestamptz not null default now()
);

create index if not exists audit_logs_created_at_idx
  on public.audit_logs (created_at desc);

create index if not exists audit_logs_resource_idx
  on public.audit_logs (resource_type, resource_id);

alter table public.audit_logs enable row level security;

-- Apenas super admin pode ler audit_logs via RPC. Sem policies para anon/auth — service role bypassa.

-- 4) admin_list_users: recriada incluindo is_blocked
create or replace function public.admin_list_users()
returns table (
  user_id uuid,
  email text,
  full_name text,
  created_at timestamptz,
  role app_role,
  workspace_owner_id uuid,
  workspace_owner_email text,
  is_blocked boolean
)
language plpgsql stable security definer set search_path = public
as $$
begin
  if not public.is_super_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  return query
  select
    u.id as user_id,
    u.email::text,
    coalesce(u.raw_user_meta_data->>'full_name', u.raw_user_meta_data->>'name', split_part(u.email, '@', 1)) as full_name,
    u.created_at,
    (select r.role from public.user_roles r
       where r.user_id = u.id
       order by case r.role when 'super_admin' then 1 when 'manager' then 2 else 3 end
       limit 1) as role,
    (select m.workspace_owner_id from public.workspace_members m
       where m.member_user_id = u.id and m.active
       order by case when m.workspace_owner_id = u.id then 0 else 1 end
       limit 1) as workspace_owner_id,
    (select wu.email::text from public.workspace_members m
       join auth.users wu on wu.id = m.workspace_owner_id
       where m.member_user_id = u.id and m.active
       order by case when m.workspace_owner_id = u.id then 0 else 1 end
       limit 1) as workspace_owner_email,
    coalesce((select p.is_blocked from public.profiles p where p.id = u.id), false) as is_blocked
  from auth.users u
  order by u.created_at desc;
end $$;

grant execute on function public.admin_list_users() to authenticated;
