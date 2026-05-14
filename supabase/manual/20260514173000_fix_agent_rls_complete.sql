-- Correção completa: escopo de acesso por role no workspace.
-- Rode este arquivo INTEIRO no SQL Editor do Supabase.

-- 1) Corrige role efetiva: agente vence manager acidental quando não é o dono do workspace.
create or replace function public.get_my_role()
returns public.app_role
language sql
stable
security definer
set search_path = public
as $$
  select case
    when auth.uid() is null then null
    when public.has_role(auth.uid(), 'agent'::public.app_role)
      and auth.uid() <> public.get_my_workspace_owner()
      then 'agent'::public.app_role
    when public.has_role(auth.uid(), 'manager'::public.app_role)
      then 'manager'::public.app_role
    when public.has_role(auth.uid(), 'agent'::public.app_role)
      then 'agent'::public.app_role
    else null
  end
$$;

create or replace function public.is_workspace_manager()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select auth.uid() is not null
    and (
      auth.uid() = public.get_my_workspace_owner()
      or (
        public.has_role(auth.uid(), 'manager'::public.app_role)
        and not public.has_role(auth.uid(), 'agent'::public.app_role)
      )
    )
$$;

-- Remove role manager criada por trigger em membros que também são agentes.
delete from public.user_roles ur
using public.workspace_members wm
where ur.user_id = wm.member_user_id
  and ur.role = 'manager'::public.app_role
  and wm.member_user_id <> wm.workspace_owner_id
  and exists (
    select 1
    from public.user_roles ur_agent
    where ur_agent.user_id = ur.user_id
      and ur_agent.role = 'agent'::public.app_role
  );

-- 2) Helpers de visibilidade usados pelas policies.
alter table if exists public.contacts
  add column if not exists assigned_agent_id uuid references auth.users(id) on delete set null;

create index if not exists contacts_assigned_agent_id_idx
  on public.contacts(assigned_agent_id);

create or replace function public.is_contact_visible(_contact_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.contacts c
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
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.appointments a
    where a.id = _appointment_id
      and a.owner_user_id = public.get_my_workspace_owner()
      and (
        public.is_workspace_manager()
        or (a.contact_id is not null and public.is_contact_visible(a.contact_id))
      )
  )
$$;

-- 3) Liga RLS nas tabelas sensíveis, se existirem.
alter table if exists public.contacts enable row level security;
alter table if exists public.messages enable row level security;
alter table if exists public.appointments enable row level security;
alter table if exists public.appointment_services enable row level security;
alter table if exists public.kanban_columns enable row level security;

-- 4) Derruba TODAS as policies antigas dessas tabelas para evitar OR permissivo.
do $$
declare
  table_name text;
  policy_record record;
begin
  foreach table_name in array array[
    'contacts',
    'messages',
    'appointments',
    'appointment_services',
    'kanban_columns'
  ] loop
    if to_regclass(format('public.%I', table_name)) is not null then
      for policy_record in
        select policyname
        from pg_policies
        where schemaname = 'public'
          and tablename = table_name
      loop
        execute format('drop policy if exists %I on public.%I', policy_record.policyname, table_name);
      end loop;
    end if;
  end loop;
end $$;

-- 5) contacts: manager vê workspace; agente vê somente conversa atribuída a ele.
do $$
begin
  if to_regclass('public.contacts') is not null then
    create policy "contacts scoped select"
      on public.contacts for select to authenticated
      using (
        owner_user_id = public.get_my_workspace_owner()
        and (
          public.is_workspace_manager()
          or assigned_agent_id = auth.uid()
        )
      );

    create policy "contacts scoped insert"
      on public.contacts for insert to authenticated
      with check (
        owner_user_id = public.get_my_workspace_owner()
        and (
          public.is_workspace_manager()
          or assigned_agent_id = auth.uid()
        )
      );

    create policy "contacts scoped update"
      on public.contacts for update to authenticated
      using (
        owner_user_id = public.get_my_workspace_owner()
        and (
          public.is_workspace_manager()
          or assigned_agent_id = auth.uid()
        )
      )
      with check (
        owner_user_id = public.get_my_workspace_owner()
        and (
          public.is_workspace_manager()
          or assigned_agent_id = auth.uid()
        )
      );

    create policy "contacts manager delete"
      on public.contacts for delete to authenticated
      using (
        owner_user_id = public.get_my_workspace_owner()
        and public.is_workspace_manager()
      );
  end if;
end $$;

-- 6) messages: agente só lê/escreve mensagens de contatos visíveis.
do $$
begin
  if to_regclass('public.messages') is not null then
    create policy "messages scoped select"
      on public.messages for select to authenticated
      using (
        owner_user_id = public.get_my_workspace_owner()
        and (
          public.is_workspace_manager()
          or public.is_contact_visible(contact_id)
        )
      );

    create policy "messages scoped insert"
      on public.messages for insert to authenticated
      with check (
        owner_user_id = public.get_my_workspace_owner()
        and (
          public.is_workspace_manager()
          or public.is_contact_visible(contact_id)
        )
      );

    create policy "messages scoped update"
      on public.messages for update to authenticated
      using (
        owner_user_id = public.get_my_workspace_owner()
        and (
          public.is_workspace_manager()
          or public.is_contact_visible(contact_id)
        )
      )
      with check (
        owner_user_id = public.get_my_workspace_owner()
        and (
          public.is_workspace_manager()
          or public.is_contact_visible(contact_id)
        )
      );
  end if;
end $$;

-- 7) appointments: agente só vê agenda ligada a contato visível.
do $$
begin
  if to_regclass('public.appointments') is not null then
    create policy "appointments scoped select"
      on public.appointments for select to authenticated
      using (public.is_appointment_visible(id));

    create policy "appointments scoped insert"
      on public.appointments for insert to authenticated
      with check (
        owner_user_id = public.get_my_workspace_owner()
        and (
          public.is_workspace_manager()
          or (contact_id is not null and public.is_contact_visible(contact_id))
        )
      );

    create policy "appointments scoped update"
      on public.appointments for update to authenticated
      using (public.is_appointment_visible(id))
      with check (
        owner_user_id = public.get_my_workspace_owner()
        and (
          public.is_workspace_manager()
          or (contact_id is not null and public.is_contact_visible(contact_id))
        )
      );

    create policy "appointments scoped delete"
      on public.appointments for delete to authenticated
      using (public.is_appointment_visible(id));
  end if;
end $$;

-- 8) appointment_services: segue a visibilidade do appointment pai.
do $$
begin
  if to_regclass('public.appointment_services') is not null then
    create policy "appointment services scoped select"
      on public.appointment_services for select to authenticated
      using (
        owner_user_id = public.get_my_workspace_owner()
        and public.is_appointment_visible(appointment_id)
      );

    create policy "appointment services scoped insert"
      on public.appointment_services for insert to authenticated
      with check (
        owner_user_id = public.get_my_workspace_owner()
        and public.is_appointment_visible(appointment_id)
      );

    create policy "appointment services scoped update"
      on public.appointment_services for update to authenticated
      using (
        owner_user_id = public.get_my_workspace_owner()
        and public.is_appointment_visible(appointment_id)
      )
      with check (
        owner_user_id = public.get_my_workspace_owner()
        and public.is_appointment_visible(appointment_id)
      );

    create policy "appointment services scoped delete"
      on public.appointment_services for delete to authenticated
      using (
        owner_user_id = public.get_my_workspace_owner()
        and public.is_appointment_visible(appointment_id)
      );
  end if;
end $$;

-- 9) kanban_columns: qualquer membro lê; somente manager altera.
do $$
begin
  if to_regclass('public.kanban_columns') is not null then
    create policy "kanban scoped select"
      on public.kanban_columns for select to authenticated
      using (owner_user_id = public.get_my_workspace_owner());

    create policy "kanban manager insert"
      on public.kanban_columns for insert to authenticated
      with check (
        owner_user_id = public.get_my_workspace_owner()
        and public.is_workspace_manager()
      );

    create policy "kanban manager update"
      on public.kanban_columns for update to authenticated
      using (
        owner_user_id = public.get_my_workspace_owner()
        and public.is_workspace_manager()
      )
      with check (
        owner_user_id = public.get_my_workspace_owner()
        and public.is_workspace_manager()
      );

    create policy "kanban manager delete"
      on public.kanban_columns for delete to authenticated
      using (
        owner_user_id = public.get_my_workspace_owner()
        and public.is_workspace_manager()
      );
  end if;
end $$;

select 'agent_rls_fix_applied' as status;