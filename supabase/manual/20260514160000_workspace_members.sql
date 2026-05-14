-- Workspace multi-tenant: cada manager = um workspace.
-- Membros (managers + agents) compartilham os mesmos dados (whatsapp, contatos, mensagens, etc).

-- 1) Tabela workspace_members
create table if not exists public.workspace_members (
  id uuid primary key default gen_random_uuid(),
  workspace_owner_id uuid references auth.users(id) on delete cascade not null,
  member_user_id     uuid references auth.users(id) on delete cascade not null,
  active boolean default true not null,
  created_at timestamptz default now() not null,
  unique (workspace_owner_id, member_user_id)
);

create index if not exists workspace_members_member_idx
  on public.workspace_members(member_user_id);

alter table public.workspace_members enable row level security;

-- 2) Função: dado o usuário logado, retorna o id do dono do workspace dele.
--    Manager → o próprio id. Agente → o id do manager que o convidou.
--    Fallback: se não houver linha em workspace_members, retorna o próprio uid
--    (compat: usuários antigos continuam funcionando antes do backfill).
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

-- 3) RLS de workspace_members
drop policy if exists "members read own workspace" on public.workspace_members;
create policy "members read own workspace"
  on public.workspace_members for select to authenticated
  using (
    workspace_owner_id = auth.uid() or member_user_id = auth.uid()
  );

-- 4) Backfill: todo manager existente vira membro do próprio workspace
insert into public.workspace_members (workspace_owner_id, member_user_id, active)
select user_id, user_id, true
from public.user_roles
where role = 'manager'
on conflict (workspace_owner_id, member_user_id) do nothing;

-- 5) Trigger: novo signup (manager) também vira membro do próprio workspace
create or replace function public.handle_new_user_workspace()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  insert into public.workspace_members (workspace_owner_id, member_user_id, active)
  values (new.id, new.id, true)
  on conflict do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created_workspace on auth.users;
create trigger on_auth_user_created_workspace
after insert on auth.users
for each row execute function public.handle_new_user_workspace();

-- =============================================================
-- 6) RESCREVE RLS de TODAS as tabelas para usar o workspace owner
-- =============================================================

-- contacts
do $$
begin
  if to_regclass('public.contacts') is not null then
    drop policy if exists "Users can read own contacts"   on public.contacts;
    drop policy if exists "Users can insert own contacts" on public.contacts;
    drop policy if exists "Users can update own contacts" on public.contacts;
    drop policy if exists "Users can delete own contacts" on public.contacts;
    drop policy if exists "Contacts owner guard select" on public.contacts;
    drop policy if exists "Contacts owner guard insert" on public.contacts;
    drop policy if exists "Contacts owner guard update" on public.contacts;
    drop policy if exists "Contacts owner guard delete" on public.contacts;

    create policy "ws members read contacts"
      on public.contacts for select to authenticated
      using (owner_user_id = public.get_my_workspace_owner());
    create policy "ws members insert contacts"
      on public.contacts for insert to authenticated
      with check (owner_user_id = public.get_my_workspace_owner());
    create policy "ws members update contacts"
      on public.contacts for update to authenticated
      using (owner_user_id = public.get_my_workspace_owner())
      with check (owner_user_id = public.get_my_workspace_owner());
    create policy "ws members delete contacts"
      on public.contacts for delete to authenticated
      using (owner_user_id = public.get_my_workspace_owner());
  end if;
end $$;

-- messages
do $$
begin
  if to_regclass('public.messages') is not null then
    drop policy if exists "Users can read own messages"   on public.messages;
    drop policy if exists "Users can insert own messages" on public.messages;
    drop policy if exists "Users can update own messages" on public.messages;
    drop policy if exists "Messages owner guard select" on public.messages;
    drop policy if exists "Messages owner guard insert" on public.messages;
    drop policy if exists "Messages owner guard update" on public.messages;

    create policy "ws members read messages"
      on public.messages for select to authenticated
      using (owner_user_id = public.get_my_workspace_owner());
    create policy "ws members insert messages"
      on public.messages for insert to authenticated
      with check (owner_user_id = public.get_my_workspace_owner());
    create policy "ws members update messages"
      on public.messages for update to authenticated
      using (owner_user_id = public.get_my_workspace_owner())
      with check (owner_user_id = public.get_my_workspace_owner());
  end if;
end $$;

-- whatsapp_instances
do $$
begin
  if to_regclass('public.whatsapp_instances') is not null then
    drop policy if exists "Users can read own whatsapp"   on public.whatsapp_instances;
    drop policy if exists "Users can insert own whatsapp" on public.whatsapp_instances;
    drop policy if exists "Users can update own whatsapp" on public.whatsapp_instances;
    drop policy if exists "Users can delete own whatsapp" on public.whatsapp_instances;
    drop policy if exists "wa owner select" on public.whatsapp_instances;
    drop policy if exists "wa owner insert" on public.whatsapp_instances;
    drop policy if exists "wa owner update" on public.whatsapp_instances;
    drop policy if exists "wa owner delete" on public.whatsapp_instances;

    create policy "ws members read whatsapp"
      on public.whatsapp_instances for select to authenticated
      using (owner_user_id = public.get_my_workspace_owner());
    -- Insert/update/delete: somente quem É o owner_user_id (só manager pode mexer aqui)
    create policy "owner manages whatsapp insert"
      on public.whatsapp_instances for insert to authenticated
      with check (owner_user_id = auth.uid());
    create policy "owner manages whatsapp update"
      on public.whatsapp_instances for update to authenticated
      using (owner_user_id = auth.uid())
      with check (owner_user_id = auth.uid());
    create policy "owner manages whatsapp delete"
      on public.whatsapp_instances for delete to authenticated
      using (owner_user_id = auth.uid());
  end if;
end $$;

-- kanban_columns
do $$
begin
  if to_regclass('public.kanban_columns') is not null then
    drop policy if exists "Users can read own kanban"   on public.kanban_columns;
    drop policy if exists "Users can insert own kanban" on public.kanban_columns;
    drop policy if exists "Users can update own kanban" on public.kanban_columns;
    drop policy if exists "Users can delete own kanban" on public.kanban_columns;

    create policy "ws members read kanban"
      on public.kanban_columns for select to authenticated
      using (owner_user_id = public.get_my_workspace_owner());
    create policy "ws members insert kanban"
      on public.kanban_columns for insert to authenticated
      with check (owner_user_id = public.get_my_workspace_owner());
    create policy "ws members update kanban"
      on public.kanban_columns for update to authenticated
      using (owner_user_id = public.get_my_workspace_owner())
      with check (owner_user_id = public.get_my_workspace_owner());
    create policy "ws members delete kanban"
      on public.kanban_columns for delete to authenticated
      using (owner_user_id = public.get_my_workspace_owner());
  end if;
end $$;

-- appointments
do $$
begin
  if to_regclass('public.appointments') is not null then
    drop policy if exists "Users can read own appointments"   on public.appointments;
    drop policy if exists "Users can insert own appointments" on public.appointments;
    drop policy if exists "Users can update own appointments" on public.appointments;
    drop policy if exists "Users can delete own appointments" on public.appointments;

    create policy "ws members read appointments"
      on public.appointments for select to authenticated
      using (owner_user_id = public.get_my_workspace_owner());
    create policy "ws members insert appointments"
      on public.appointments for insert to authenticated
      with check (owner_user_id = public.get_my_workspace_owner());
    create policy "ws members update appointments"
      on public.appointments for update to authenticated
      using (owner_user_id = public.get_my_workspace_owner())
      with check (owner_user_id = public.get_my_workspace_owner());
    create policy "ws members delete appointments"
      on public.appointments for delete to authenticated
      using (owner_user_id = public.get_my_workspace_owner());
  end if;
end $$;

-- appointment_services
do $$
begin
  if to_regclass('public.appointment_services') is not null then
    drop policy if exists "Users can read own appointment_services"   on public.appointment_services;
    drop policy if exists "Users can insert own appointment_services" on public.appointment_services;
    drop policy if exists "Users can update own appointment_services" on public.appointment_services;
    drop policy if exists "Users can delete own appointment_services" on public.appointment_services;

    create policy "ws members read appt_services"
      on public.appointment_services for select to authenticated
      using (owner_user_id = public.get_my_workspace_owner()
        or exists (select 1 from public.appointments a
                   where a.id = appointment_services.appointment_id
                     and a.owner_user_id = public.get_my_workspace_owner()));
    create policy "ws members insert appt_services"
      on public.appointment_services for insert to authenticated
      with check (owner_user_id = public.get_my_workspace_owner()
        or exists (select 1 from public.appointments a
                   where a.id = appointment_services.appointment_id
                     and a.owner_user_id = public.get_my_workspace_owner()));
    create policy "ws members update appt_services"
      on public.appointment_services for update to authenticated
      using (owner_user_id = public.get_my_workspace_owner());
    create policy "ws members delete appt_services"
      on public.appointment_services for delete to authenticated
      using (owner_user_id = public.get_my_workspace_owner());
  end if;
end $$;
