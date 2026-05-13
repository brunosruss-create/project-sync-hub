-- Vincula contatos e mensagens ao usuário dono da instância WhatsApp.
-- Idempotente para Supabase/Postgres.

alter table if exists public.contacts
  add column if not exists owner_user_id uuid references auth.users(id) on delete cascade;

alter table if exists public.messages
  add column if not exists owner_user_id uuid references auth.users(id) on delete cascade;

alter table if exists public.whatsapp_instances
  add column if not exists webhook_url text;

create index if not exists contacts_owner_user_id_idx
  on public.contacts(owner_user_id);

create index if not exists contacts_owner_phone_idx
  on public.contacts(owner_user_id, phone);

create index if not exists messages_owner_user_id_idx
  on public.messages(owner_user_id);

create index if not exists messages_owner_contact_id_idx
  on public.messages(owner_user_id, contact_id);

alter table if exists public.contacts enable row level security;
alter table if exists public.messages enable row level security;

do $$
begin
  if to_regclass('public.contacts') is not null then
    drop policy if exists "Users can read own contacts" on public.contacts;
    drop policy if exists "Users can insert own contacts" on public.contacts;
    drop policy if exists "Users can update own contacts" on public.contacts;
    drop policy if exists "Users can delete own contacts" on public.contacts;
    drop policy if exists "Contacts owner guard select" on public.contacts;
    drop policy if exists "Contacts owner guard insert" on public.contacts;
    drop policy if exists "Contacts owner guard update" on public.contacts;
    drop policy if exists "Contacts owner guard delete" on public.contacts;

    create policy "Users can read own contacts"
      on public.contacts for select
      to authenticated
      using (owner_user_id = auth.uid());

    create policy "Users can insert own contacts"
      on public.contacts for insert
      to authenticated
      with check (owner_user_id = auth.uid());

    create policy "Users can update own contacts"
      on public.contacts for update
      to authenticated
      using (owner_user_id = auth.uid())
      with check (owner_user_id = auth.uid());

    create policy "Users can delete own contacts"
      on public.contacts for delete
      to authenticated
      using (owner_user_id = auth.uid());

    create policy "Contacts owner guard select"
      on public.contacts as restrictive for select
      to authenticated
      using (owner_user_id = auth.uid());

    create policy "Contacts owner guard insert"
      on public.contacts as restrictive for insert
      to authenticated
      with check (owner_user_id = auth.uid());

    create policy "Contacts owner guard update"
      on public.contacts as restrictive for update
      to authenticated
      using (owner_user_id = auth.uid())
      with check (owner_user_id = auth.uid());

    create policy "Contacts owner guard delete"
      on public.contacts as restrictive for delete
      to authenticated
      using (owner_user_id = auth.uid());
  end if;

  if to_regclass('public.messages') is not null then
    drop policy if exists "Users can read own messages" on public.messages;
    drop policy if exists "Users can insert own messages" on public.messages;
    drop policy if exists "Users can update own messages" on public.messages;
    drop policy if exists "Messages owner guard select" on public.messages;
    drop policy if exists "Messages owner guard insert" on public.messages;
    drop policy if exists "Messages owner guard update" on public.messages;

    create policy "Users can read own messages"
      on public.messages for select
      to authenticated
      using (owner_user_id = auth.uid());

    create policy "Users can insert own messages"
      on public.messages for insert
      to authenticated
      with check (owner_user_id = auth.uid());

    create policy "Users can update own messages"
      on public.messages for update
      to authenticated
      using (owner_user_id = auth.uid())
      with check (owner_user_id = auth.uid());

    create policy "Messages owner guard select"
      on public.messages as restrictive for select
      to authenticated
      using (owner_user_id = auth.uid());

    create policy "Messages owner guard insert"
      on public.messages as restrictive for insert
      to authenticated
      with check (owner_user_id = auth.uid());

    create policy "Messages owner guard update"
      on public.messages as restrictive for update
      to authenticated
      using (owner_user_id = auth.uid())
      with check (owner_user_id = auth.uid());
  end if;
end $$;
