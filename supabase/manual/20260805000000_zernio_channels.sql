-- Integração Zernio: WhatsApp Cloud API (oficial) + Instagram DM, convivendo
-- com a Evolution (QR) já existente. Migration ADITIVA e idempotente — não
-- altera dados nem quebra o fluxo Evolution atual.
--
-- Rodar manualmente no SQL Editor do Supabase (ver CLAUDE.md: migrations não
-- são aplicadas automaticamente).

-- ============================================================
-- 1) Tabela de contas conectadas via Zernio (1 por platform/workspace)
--    Equivalente ao whatsapp_instances da Evolution.
-- ============================================================
create table if not exists public.zernio_accounts (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid references auth.users(id) on delete cascade not null,
  platform text not null check (platform in ('whatsapp', 'instagram')),
  zernio_profile_id text not null,
  account_id text,                 -- id da conta na Zernio (preenchido no callback)
  username text,                   -- telefone (WA) ou @ (Instagram)
  display_name text,
  status text not null default 'disconnected',
  webhook_secret text,             -- valida webhooks da Zernio (defesa em profundidade)
  connected_at timestamptz,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null,
  unique (owner_user_id, platform)
);

create index if not exists zernio_accounts_owner_idx
  on public.zernio_accounts (owner_user_id);
create index if not exists zernio_accounts_account_idx
  on public.zernio_accounts (account_id);

alter table public.zernio_accounts enable row level security;

drop policy if exists "ws members read zernio" on public.zernio_accounts;
drop policy if exists "owner manages zernio insert" on public.zernio_accounts;
drop policy if exists "owner manages zernio update" on public.zernio_accounts;
drop policy if exists "owner manages zernio delete" on public.zernio_accounts;

create policy "ws members read zernio"
  on public.zernio_accounts for select to authenticated
  using (owner_user_id = public.get_my_workspace_owner());
create policy "owner manages zernio insert"
  on public.zernio_accounts for insert to authenticated
  with check (owner_user_id = auth.uid());
create policy "owner manages zernio update"
  on public.zernio_accounts for update to authenticated
  using (owner_user_id = auth.uid())
  with check (owner_user_id = auth.uid());
create policy "owner manages zernio delete"
  on public.zernio_accounts for delete to authenticated
  using (owner_user_id = auth.uid());

-- ============================================================
-- 2) contacts: multi-canal
--    channel default 'whatsapp_evolution' → linhas existentes seguem no fluxo atual.
-- ============================================================
alter table public.contacts
  add column if not exists channel text not null default 'whatsapp_evolution',
  add column if not exists external_conversation_id text,
  add column if not exists external_participant_id text;

-- Instagram não tem telefone: phone precisa aceitar null.
alter table public.contacts alter column phone drop not null;

-- Busca rápida de contato por conversa/participante da Zernio (webhook inbound).
create index if not exists contacts_external_conversation_idx
  on public.contacts (owner_user_id, external_conversation_id);
create index if not exists contacts_channel_idx
  on public.contacts (owner_user_id, channel);

-- ============================================================
-- 3) messages: multi-canal
--    whatsapp_message_id continua sendo o id externo (agora vale p/ Zernio tb).
-- ============================================================
alter table public.messages
  add column if not exists channel text not null default 'whatsapp_evolution',
  add column if not exists external_conversation_id text;

create index if not exists messages_external_conversation_idx
  on public.messages (external_conversation_id);

-- ============================================================
-- Notas de canal:
--   'whatsapp_evolution' → Evolution API (QR, não-oficial)  [existente]
--   'whatsapp_cloud'     → WhatsApp Cloud API via Zernio     [novo]
--   'instagram'          → Instagram DM via Zernio           [novo]
-- ============================================================

notify pgrst, 'reload schema';

insert into public.schema_manual_migrations (filename)
values ('20260805000000_zernio_channels.sql')
on conflict (filename) do nothing;
