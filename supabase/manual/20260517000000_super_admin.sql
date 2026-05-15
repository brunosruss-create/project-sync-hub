-- Super admin: gating + RPCs com dados reais.
-- Aditivo. Não altera RLS de outras tabelas.

-- 1) Adiciona valor 'super_admin' ao enum app_role
do $$
begin
  if not exists (
    select 1 from pg_enum e
    join pg_type t on t.oid = e.enumtypid
    where t.typname = 'app_role' and e.enumlabel = 'super_admin'
  ) then
    alter type public.app_role add value 'super_admin';
  end if;
end $$;

-- 2) Função canônica is_super_admin()
create or replace function public.is_super_admin()
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.user_roles
    where user_id = auth.uid() and role = 'super_admin'::app_role
  )
$$;

grant execute on function public.is_super_admin() to authenticated;

-- 3) Concede super_admin para o(s) e-mail(s) reais (idempotente)
insert into public.user_roles (user_id, role)
select u.id, 'super_admin'::app_role
from auth.users u
where lower(u.email) in (
  'brunorusso2607@gmail.com'
)
on conflict (user_id, role) do nothing;

-- 4) RPC: listagem de workspaces (managers + agregados)
create or replace function public.admin_list_workspaces()
returns table (
  workspace_owner_id uuid,
  owner_email text,
  owner_name text,
  created_at timestamptz,
  user_count bigint,
  contact_count bigint,
  has_whatsapp boolean
)
language plpgsql stable security definer set search_path = public
as $$
begin
  if not public.is_super_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  return query
  select
    u.id as workspace_owner_id,
    u.email::text as owner_email,
    coalesce(u.raw_user_meta_data->>'full_name', u.raw_user_meta_data->>'name', split_part(u.email, '@', 1)) as owner_name,
    u.created_at,
    (select count(*) from public.workspace_members m where m.workspace_owner_id = u.id and m.active) as user_count,
    coalesce((select count(*) from public.contacts c where c.owner_user_id = u.id), 0) as contact_count,
    exists(select 1 from public.whatsapp_instances w where w.owner_user_id = u.id) as has_whatsapp
  from auth.users u
  join public.user_roles r on r.user_id = u.id and r.role = 'manager'::app_role
  order by u.created_at desc;
end $$;

grant execute on function public.admin_list_workspaces() to authenticated;

-- 5) RPC: listagem completa de usuários
create or replace function public.admin_list_users()
returns table (
  user_id uuid,
  email text,
  full_name text,
  created_at timestamptz,
  role app_role,
  workspace_owner_id uuid,
  workspace_owner_email text
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
       limit 1) as workspace_owner_email
  from auth.users u
  order by u.created_at desc;
end $$;

grant execute on function public.admin_list_users() to authenticated;

-- 6) RPC: saúde das instâncias whatsapp
create or replace function public.admin_list_instances()
returns table (
  instance_id uuid,
  instance_name text,
  status text,
  owner_user_id uuid,
  owner_email text,
  created_at timestamptz,
  updated_at timestamptz
)
language plpgsql stable security definer set search_path = public
as $$
begin
  if not public.is_super_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  return query
  select
    w.id as instance_id,
    w.instance_name::text,
    w.status::text,
    w.owner_user_id,
    u.email::text as owner_email,
    w.created_at,
    w.updated_at
  from public.whatsapp_instances w
  left join auth.users u on u.id = w.owner_user_id
  order by w.created_at desc;
end $$;

grant execute on function public.admin_list_instances() to authenticated;
