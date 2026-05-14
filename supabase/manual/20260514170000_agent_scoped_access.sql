-- Agent vs Manager scoped access
-- Manager (workspace owner) sees everything in the workspace.
-- Agent only sees contacts assigned to them (and the messages/appointments tied to those contacts).

-- ===== helpers =====

create or replace function public.is_workspace_manager()
returns boolean language sql stable security definer set search_path = public
as $$
  select public.has_role(auth.uid(), 'manager')
$$;

create or replace function public.is_contact_visible(_contact_id uuid)
returns boolean language sql stable security definer set search_path = public
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

-- ===== contacts =====
do $$
begin
  if to_regclass('public.contacts') is not null then
    drop policy if exists "ws members read contacts"   on public.contacts;
    drop policy if exists "ws members insert contacts" on public.contacts;
    drop policy if exists "ws members update contacts" on public.contacts;
    drop policy if exists "ws members delete contacts" on public.contacts;

    create policy "scoped read contacts" on public.contacts
      for select to authenticated
      using (
        owner_user_id = public.get_my_workspace_owner()
        and (public.is_workspace_manager() or assigned_agent_id = auth.uid())
      );

    -- Insert: any workspace member can create contacts (e.g. new lead).
    create policy "scoped insert contacts" on public.contacts
      for insert to authenticated
      with check (owner_user_id = public.get_my_workspace_owner());

    create policy "scoped update contacts" on public.contacts
      for update to authenticated
      using (
        owner_user_id = public.get_my_workspace_owner()
        and (public.is_workspace_manager() or assigned_agent_id = auth.uid())
      )
      with check (
        owner_user_id = public.get_my_workspace_owner()
        and (public.is_workspace_manager() or assigned_agent_id = auth.uid())
      );

    create policy "scoped delete contacts" on public.contacts
      for delete to authenticated
      using (
        owner_user_id = public.get_my_workspace_owner()
        and public.is_workspace_manager()
      );
  end if;
end $$;

-- ===== messages =====
do $$
begin
  if to_regclass('public.messages') is not null then
    drop policy if exists "ws members read messages"   on public.messages;
    drop policy if exists "ws members insert messages" on public.messages;
    drop policy if exists "ws members update messages" on public.messages;

    create policy "scoped read messages" on public.messages
      for select to authenticated
      using (
        owner_user_id = public.get_my_workspace_owner()
        and (public.is_workspace_manager() or public.is_contact_visible(contact_id))
      );

    create policy "scoped insert messages" on public.messages
      for insert to authenticated
      with check (
        owner_user_id = public.get_my_workspace_owner()
        and (public.is_workspace_manager() or public.is_contact_visible(contact_id))
      );

    create policy "scoped update messages" on public.messages
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

-- ===== appointments =====
do $$
begin
  if to_regclass('public.appointments') is not null then
    drop policy if exists "ws members read appointments"   on public.appointments;
    drop policy if exists "ws members insert appointments" on public.appointments;
    drop policy if exists "ws members update appointments" on public.appointments;
    drop policy if exists "ws members delete appointments" on public.appointments;

    create policy "scoped read appointments" on public.appointments
      for select to authenticated
      using (
        owner_user_id = public.get_my_workspace_owner()
        and (
          public.is_workspace_manager()
          or contact_id is null
          or public.is_contact_visible(contact_id)
        )
      );

    create policy "scoped insert appointments" on public.appointments
      for insert to authenticated
      with check (
        owner_user_id = public.get_my_workspace_owner()
        and (
          public.is_workspace_manager()
          or contact_id is null
          or public.is_contact_visible(contact_id)
        )
      );

    create policy "scoped update appointments" on public.appointments
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

    create policy "scoped delete appointments" on public.appointments
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

-- ===== kanban_columns =====
-- Read open to any member, write only manager.
do $$
begin
  if to_regclass('public.kanban_columns') is not null then
    drop policy if exists "ws members read kanban"   on public.kanban_columns;
    drop policy if exists "ws members insert kanban" on public.kanban_columns;
    drop policy if exists "ws members update kanban" on public.kanban_columns;
    drop policy if exists "ws members delete kanban" on public.kanban_columns;

    create policy "scoped read kanban" on public.kanban_columns
      for select to authenticated
      using (owner_user_id = public.get_my_workspace_owner());

    create policy "manager insert kanban" on public.kanban_columns
      for insert to authenticated
      with check (
        owner_user_id = public.get_my_workspace_owner()
        and public.is_workspace_manager()
      );

    create policy "manager update kanban" on public.kanban_columns
      for update to authenticated
      using (
        owner_user_id = public.get_my_workspace_owner()
        and public.is_workspace_manager()
      )
      with check (
        owner_user_id = public.get_my_workspace_owner()
        and public.is_workspace_manager()
      );

    create policy "manager delete kanban" on public.kanban_columns
      for delete to authenticated
      using (
        owner_user_id = public.get_my_workspace_owner()
        and public.is_workspace_manager()
      );
  end if;
end $$;
