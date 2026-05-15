-- =====================================================================
-- REPARO: papéis trocados entre manager e agente.
-- Rode este arquivo INTEIRO no SQL Editor do Supabase (uma única vez).
--
-- Regra única e simples:
--   - Quem é dono do workspace (workspace_members.workspace_owner_id =
--     member_user_id) é SEMPRE manager.
--   - Qualquer outro membro do workspace é SEMPRE agent.
--   - Cada usuário tem exatamente UMA role efetiva.
--
-- O frontend lê a role via RPC get_my_role(); as policies usam
-- is_workspace_manager() e get_my_workspace_owner(). Tudo passa a derivar
-- de workspace_members, eliminando inconsistências antigas em user_roles.
-- =====================================================================

-- 0) Garantir que TODO usuário com role manager tenha um workspace próprio.
--    (compat com contas antigas criadas antes de workspace_members existir)
insert into public.workspace_members (workspace_owner_id, member_user_id, active)
select ur.user_id, ur.user_id, true
from public.user_roles ur
where ur.role = 'manager'::public.app_role
  and not exists (
    select 1 from public.workspace_members wm
    where wm.workspace_owner_id = ur.user_id
      and wm.member_user_id = ur.user_id
  )
on conflict (workspace_owner_id, member_user_id) do nothing;

-- 0b) Garantir que TODO auth.user que não esteja em workspace_members
--     vire dono do próprio workspace (não deixa ninguém sem workspace).
insert into public.workspace_members (workspace_owner_id, member_user_id, active)
select u.id, u.id, true
from auth.users u
where not exists (
  select 1 from public.workspace_members wm where wm.member_user_id = u.id
)
on conflict (workspace_owner_id, member_user_id) do nothing;

-- 1) Normalizar user_roles: zerar e reescrever a partir de workspace_members.
--    Owner -> manager. Não-owner -> agent. Uma linha por usuário.
delete from public.user_roles;

insert into public.user_roles (user_id, role)
select distinct on (wm.member_user_id)
  wm.member_user_id,
  case
    when wm.member_user_id = wm.workspace_owner_id then 'manager'::public.app_role
    else 'agent'::public.app_role
  end as role
from public.workspace_members wm
where wm.active = true
order by wm.member_user_id,
  case when wm.member_user_id = wm.workspace_owner_id then 0 else 1 end
on conflict (user_id, role) do nothing;

-- 2) Trigger de novo signup: continua criando manager + workspace próprio.
--    (já existem como handle_new_user_role / handle_new_user_workspace;
--     apenas garantimos a ordem correta.)
create or replace function public.handle_new_user_role()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  insert into public.user_roles (user_id, role)
  values (new.id, 'manager')
  on conflict do nothing;
  return new;
end $$;

create or replace function public.handle_new_user_workspace()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  insert into public.workspace_members (workspace_owner_id, member_user_id, active)
  values (new.id, new.id, true)
  on conflict do nothing;
  return new;
end $$;

-- 3) Helpers: recalculados a partir de workspace_members (fonte da verdade).

create or replace function public.get_my_workspace_owner()
returns uuid
language sql stable security definer set search_path = public
as $$
  select coalesce(
    (select workspace_owner_id from public.workspace_members
       where member_user_id = auth.uid() and active = true
       order by case when workspace_owner_id = auth.uid() then 0 else 1 end
       limit 1),
    auth.uid()
  )
$$;

create or replace function public.is_workspace_manager()
returns boolean
language sql stable security definer set search_path = public
as $$
  select auth.uid() is not null
     and auth.uid() = public.get_my_workspace_owner()
$$;

create or replace function public.get_my_role()
returns public.app_role
language sql stable security definer set search_path = public
as $$
  select case
    when auth.uid() is null then null
    when public.is_workspace_manager() then 'manager'::public.app_role
    else 'agent'::public.app_role
  end
$$;

create or replace function public.has_role(_user_id uuid, _role public.app_role)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.user_roles
    where user_id = _user_id and role = _role
  )
$$;

create or replace function public.is_contact_visible(_contact_id uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.contacts c
    where c.id = _contact_id
      and c.owner_user_id = public.get_my_workspace_owner()
      and (
        public.is_workspace_manager()
        or c.assigned_agent_id = auth.uid()
      )
  )
$$;

create or replace function public.is_appointment_visible(_appointment_id uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.appointments a
    where a.id = _appointment_id
      and a.owner_user_id = public.get_my_workspace_owner()
      and (
        public.is_workspace_manager()
        or (a.contact_id is not null and public.is_contact_visible(a.contact_id))
      )
  )
$$;

-- 4) RLS ligada nas tabelas sensíveis.
alter table if exists public.contacts             enable row level security;
alter table if exists public.messages             enable row level security;
alter table if exists public.appointments         enable row level security;
alter table if exists public.appointment_services enable row level security;
alter table if exists public.kanban_columns       enable row level security;
alter table if exists public.whatsapp_instances   enable row level security;

-- 5) Limpa TODAS as policies antigas dessas tabelas (evita OR permissivo).
do $$
declare
  t text;
  r record;
begin
  foreach t in array array[
    'contacts','messages','appointments','appointment_services',
    'kanban_columns','whatsapp_instances'
  ] loop
    if to_regclass(format('public.%I', t)) is not null then
      for r in
        select policyname from pg_policies
        where schemaname = 'public' and tablename = t
      loop
        execute format('drop policy if exists %I on public.%I', r.policyname, t);
      end loop;
    end if;
  end loop;
end $$;

-- 6) contacts: manager vê tudo do workspace; agente só vê o que está atribuído a ele.
do $$ begin
  if to_regclass('public.contacts') is not null then
    create policy "contacts scoped select" on public.contacts
      for select to authenticated
      using (
        owner_user_id = public.get_my_workspace_owner()
        and (public.is_workspace_manager() or assigned_agent_id = auth.uid())
      );

    create policy "contacts scoped insert" on public.contacts
      for insert to authenticated
      with check (
        owner_user_id = public.get_my_workspace_owner()
        and (public.is_workspace_manager() or assigned_agent_id = auth.uid())
      );

    create policy "contacts scoped update" on public.contacts
      for update to authenticated
      using (
        owner_user_id = public.get_my_workspace_owner()
        and (public.is_workspace_manager() or assigned_agent_id = auth.uid())
      )
      with check (
        owner_user_id = public.get_my_workspace_owner()
        and (public.is_workspace_manager() or assigned_agent_id = auth.uid())
      );

    create policy "contacts manager delete" on public.contacts
      for delete to authenticated
      using (
        owner_user_id = public.get_my_workspace_owner()
        and public.is_workspace_manager()
      );
  end if;
end $$;

-- 7) messages: agente só lê/escreve mensagens de contatos visíveis.
do $$ begin
  if to_regclass('public.messages') is not null then
    create policy "messages scoped select" on public.messages
      for select to authenticated
      using (
        owner_user_id = public.get_my_workspace_owner()
        and (public.is_workspace_manager() or public.is_contact_visible(contact_id))
      );

    create policy "messages scoped insert" on public.messages
      for insert to authenticated
      with check (
        owner_user_id = public.get_my_workspace_owner()
        and (public.is_workspace_manager() or public.is_contact_visible(contact_id))
      );

    create policy "messages scoped update" on public.messages
      for update to authenticated
      using (
        owner_user_id = public.get_my_workspace_owner()
        and (public.is_workspace_manager() or public.is_contact_visible(contact_id))
      )
      with check (
        owner_user_id = public.get_my_workspace_owner()
        and (public.is_workspace_manager() or public.is_contact_visible(contact_id))
      );
  end if;
end $$;

-- 8) appointments
do $$ begin
  if to_regclass('public.appointments') is not null then
    create policy "appointments scoped select" on public.appointments
      for select to authenticated
      using (
        owner_user_id = public.get_my_workspace_owner()
        and (
          public.is_workspace_manager()
          or contact_id is null
          or public.is_contact_visible(contact_id)
        )
      );

    create policy "appointments scoped insert" on public.appointments
      for insert to authenticated
      with check (
        owner_user_id = public.get_my_workspace_owner()
        and (
          public.is_workspace_manager()
          or contact_id is null
          or public.is_contact_visible(contact_id)
        )
      );

    create policy "appointments scoped update" on public.appointments
      for update to authenticated
      using (
        owner_user_id = public.get_my_workspace_owner()
        and (
          public.is_workspace_manager()
          or contact_id is null
          or public.is_contact_visible(contact_id)
        )
      )
      with check (
        owner_user_id = public.get_my_workspace_owner()
        and (
          public.is_workspace_manager()
          or contact_id is null
          or public.is_contact_visible(contact_id)
        )
      );

    create policy "appointments scoped delete" on public.appointments
      for delete to authenticated
      using (
        owner_user_id = public.get_my_workspace_owner()
        and (
          public.is_workspace_manager()
          or contact_id is null
          or public.is_contact_visible(contact_id)
        )
      );
  end if;
end $$;

-- 9) appointment_services: segue a visibilidade do appointment pai.
do $$ begin
  if to_regclass('public.appointment_services') is not null then
    create policy "appointment services scoped select" on public.appointment_services
      for select to authenticated
      using (
        owner_user_id = public.get_my_workspace_owner()
        and public.is_appointment_visible(appointment_id)
      );

    create policy "appointment services scoped insert" on public.appointment_services
      for insert to authenticated
      with check (
        owner_user_id = public.get_my_workspace_owner()
        and public.is_appointment_visible(appointment_id)
      );

    create policy "appointment services scoped update" on public.appointment_services
      for update to authenticated
      using (
        owner_user_id = public.get_my_workspace_owner()
        and public.is_appointment_visible(appointment_id)
      )
      with check (
        owner_user_id = public.get_my_workspace_owner()
        and public.is_appointment_visible(appointment_id)
      );

    create policy "appointment services scoped delete" on public.appointment_services
      for delete to authenticated
      using (
        owner_user_id = public.get_my_workspace_owner()
        and public.is_appointment_visible(appointment_id)
      );
  end if;
end $$;

-- 10) kanban_columns: qualquer membro lê; só manager altera.
do $$ begin
  if to_regclass('public.kanban_columns') is not null then
    create policy "kanban scoped select" on public.kanban_columns
      for select to authenticated
      using (owner_user_id = public.get_my_workspace_owner());

    create policy "kanban manager insert" on public.kanban_columns
      for insert to authenticated
      with check (
        owner_user_id = public.get_my_workspace_owner()
        and public.is_workspace_manager()
      );

    create policy "kanban manager update" on public.kanban_columns
      for update to authenticated
      using (
        owner_user_id = public.get_my_workspace_owner()
        and public.is_workspace_manager()
      )
      with check (
        owner_user_id = public.get_my_workspace_owner()
        and public.is_workspace_manager()
      );

    create policy "kanban manager delete" on public.kanban_columns
      for delete to authenticated
      using (
        owner_user_id = public.get_my_workspace_owner()
        and public.is_workspace_manager()
      );
  end if;
end $$;

-- 11) whatsapp_instances: leitura pra todo membro; alteração só do manager (dono).
do $$ begin
  if to_regclass('public.whatsapp_instances') is not null then
    create policy "wa scoped select" on public.whatsapp_instances
      for select to authenticated
      using (owner_user_id = public.get_my_workspace_owner());

    create policy "wa owner insert" on public.whatsapp_instances
      for insert to authenticated
      with check (owner_user_id = auth.uid() and public.is_workspace_manager());

    create policy "wa owner update" on public.whatsapp_instances
      for update to authenticated
      using (owner_user_id = auth.uid() and public.is_workspace_manager())
      with check (owner_user_id = auth.uid() and public.is_workspace_manager());

    create policy "wa owner delete" on public.whatsapp_instances
      for delete to authenticated
      using (owner_user_id = auth.uid() and public.is_workspace_manager());
  end if;
end $$;

-- 12) Verificação final: confira no resultado abaixo se tudo bate.
--     - role_in_table deve ser 'manager' para o dono e 'agent' para os demais.
--     - effective_role deve ser igual a role_in_table.
select
  u.email,
  ur.role                          as role_in_table,
  wm.workspace_owner_id            as workspace_owner,
  (wm.member_user_id = wm.workspace_owner_id) as is_owner,
  case
    when wm.member_user_id = wm.workspace_owner_id then 'manager'
    else 'agent'
  end                              as effective_role
from auth.users u
left join public.workspace_members wm
  on wm.member_user_id = u.id and wm.active = true
left join public.user_roles ur on ur.user_id = u.id
order by u.email;
