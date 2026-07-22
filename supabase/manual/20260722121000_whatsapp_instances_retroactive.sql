-- Migration retroativa e não-destrutiva: a tabela whatsapp_instances já existe
-- em produção (criada fora do controle de versão, ver docs/INFRAESTRUTURA.md),
-- mas nunca teve um CREATE TABLE versionado no repo. Isso torna o ambiente
-- irreproduzível (não dá pra recriar do zero só com as migrations).
-- CREATE TABLE IF NOT EXISTS: em produção é um no-op (tabela já existe).
-- Em um ambiente novo, cria a tabela do zero com o schema real usado no código
-- (src/lib/evolution.functions.ts, src/routes/api/public/evolution.$instanceId.ts).

create table if not exists public.whatsapp_instances (
  id uuid primary key default gen_random_uuid(),
  instance_name text unique not null,
  owner_user_id uuid references auth.users(id) on delete cascade not null,
  status text not null default 'disconnected',
  webhook_secret text,
  qr_code text,
  qr_expires_at timestamptz,
  last_connected_at timestamptz,
  phone_number text,
  profile_name text,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null
);

create index if not exists whatsapp_instances_owner_idx
  on public.whatsapp_instances (owner_user_id);

alter table public.whatsapp_instances enable row level security;

-- Reaplica (idempotente) as mesmas policies já vigentes em produção
-- (definidas originalmente em 20260514160000_workspace_members.sql), para que
-- um ambiente novo fique no mesmo estado sem depender de ordem de execução.
drop policy if exists "Users can read own whatsapp" on public.whatsapp_instances;
drop policy if exists "Users can insert own whatsapp" on public.whatsapp_instances;
drop policy if exists "Users can update own whatsapp" on public.whatsapp_instances;
drop policy if exists "Users can delete own whatsapp" on public.whatsapp_instances;
drop policy if exists "wa owner select" on public.whatsapp_instances;
drop policy if exists "wa owner insert" on public.whatsapp_instances;
drop policy if exists "wa owner update" on public.whatsapp_instances;
drop policy if exists "wa owner delete" on public.whatsapp_instances;
drop policy if exists "ws members read whatsapp" on public.whatsapp_instances;
drop policy if exists "owner manages whatsapp insert" on public.whatsapp_instances;
drop policy if exists "owner manages whatsapp update" on public.whatsapp_instances;
drop policy if exists "owner manages whatsapp delete" on public.whatsapp_instances;

create policy "ws members read whatsapp"
  on public.whatsapp_instances for select to authenticated
  using (owner_user_id = public.get_my_workspace_owner());
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
