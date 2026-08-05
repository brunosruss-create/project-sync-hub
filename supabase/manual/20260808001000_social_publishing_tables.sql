-- ============================================================
-- Módulo de Publicação em Redes Sociais — tabelas base.
--
-- 100% isolado do módulo de mensageria: nenhuma FK para contacts,
-- messages, zernio_accounts ou message_jobs. owner_user_id referencia
-- apenas auth.users.
--
-- Tabelas:
--   1. social_account_connections  (contas OAuth conectadas por workspace)
--   2. social_posts                (post = unidade de conteúdo, agrega targets)
--   3. social_post_targets         (1 linha por rede/conta, ciclo de vida independente)
--   4. social_publish_attempts     (histórico append-only de tentativas)
--   5. social_publishing_permissions (permissões granulares por membro/papel)
-- ============================================================

-- ─── 1. social_account_connections ─────────────────────────────────

create table if not exists public.social_account_connections (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  platform text not null check (platform in ('facebook', 'instagram', 'tiktok', 'youtube')),
  zernio_profile_id text not null,
  account_id text,
  account_name text,
  status text not null default 'connecting' check (status in ('connecting', 'connected', 'expired', 'disconnected')),
  connected_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists social_account_connections_unique_idx
  on public.social_account_connections (owner_user_id, platform, account_id);

create index if not exists social_account_connections_owner_idx
  on public.social_account_connections (owner_user_id);

alter table public.social_account_connections enable row level security;

drop policy if exists "owner reads social_account_connections" on public.social_account_connections;
drop policy if exists "owner inserts social_account_connections" on public.social_account_connections;
drop policy if exists "owner updates social_account_connections" on public.social_account_connections;
drop policy if exists "owner deletes social_account_connections" on public.social_account_connections;

create policy "owner reads social_account_connections"
  on public.social_account_connections for select to authenticated
  using (owner_user_id = auth.uid() or owner_user_id = public.get_my_workspace_owner());
create policy "owner inserts social_account_connections"
  on public.social_account_connections for insert to authenticated
  with check (owner_user_id = auth.uid());
create policy "owner updates social_account_connections"
  on public.social_account_connections for update to authenticated
  using (owner_user_id = auth.uid()) with check (owner_user_id = auth.uid());
create policy "owner deletes social_account_connections"
  on public.social_account_connections for delete to authenticated
  using (owner_user_id = auth.uid());

-- ─── 2. social_posts ───────────────────────────────────────────────

create table if not exists public.social_posts (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  created_by uuid not null references auth.users(id) on delete set null,
  base_text text default '',
  status text not null default 'draft' check (status in ('draft', 'scheduled', 'publishing', 'published', 'failed', 'partially_published')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists social_posts_owner_idx
  on public.social_posts (owner_user_id, created_at desc);

alter table public.social_posts enable row level security;

drop policy if exists "owner reads social_posts" on public.social_posts;
drop policy if exists "owner inserts social_posts" on public.social_posts;
drop policy if exists "owner updates social_posts" on public.social_posts;
drop policy if exists "owner deletes social_posts" on public.social_posts;

create policy "owner reads social_posts"
  on public.social_posts for select to authenticated
  using (owner_user_id = auth.uid() or owner_user_id = public.get_my_workspace_owner());
create policy "owner inserts social_posts"
  on public.social_posts for insert to authenticated
  with check (owner_user_id = auth.uid() or owner_user_id = public.get_my_workspace_owner());
create policy "owner updates social_posts"
  on public.social_posts for update to authenticated
  using (owner_user_id = auth.uid() or owner_user_id = public.get_my_workspace_owner());
create policy "owner deletes social_posts"
  on public.social_posts for delete to authenticated
  using (owner_user_id = auth.uid() or owner_user_id = public.get_my_workspace_owner());

-- ─── 3. social_post_targets ────────────────────────────────────────

create table if not exists public.social_post_targets (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.social_posts(id) on delete cascade,
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  social_account_connection_id uuid not null references public.social_account_connections(id),
  platform text not null check (platform in ('facebook', 'instagram', 'tiktok', 'youtube')),
  post_type text not null default 'feed',
  text text default '',
  media_urls jsonb default '[]'::jsonb,
  status text not null default 'draft' check (status in ('draft', 'scheduled', 'publishing', 'published', 'failed')),
  scheduled_for timestamptz,
  timezone text,
  zernio_post_id text,
  zernio_target_id text,
  platform_post_id text,
  published_at timestamptz,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists social_post_targets_post_idx
  on public.social_post_targets (post_id);
create index if not exists social_post_targets_owner_status_idx
  on public.social_post_targets (owner_user_id, status);
create index if not exists social_post_targets_scheduled_idx
  on public.social_post_targets (scheduled_for)
  where status in ('scheduled', 'publishing');

alter table public.social_post_targets enable row level security;

drop policy if exists "owner reads social_post_targets" on public.social_post_targets;
drop policy if exists "owner inserts social_post_targets" on public.social_post_targets;
drop policy if exists "owner updates social_post_targets" on public.social_post_targets;
drop policy if exists "owner deletes social_post_targets" on public.social_post_targets;

create policy "owner reads social_post_targets"
  on public.social_post_targets for select to authenticated
  using (owner_user_id = auth.uid() or owner_user_id = public.get_my_workspace_owner());
create policy "owner inserts social_post_targets"
  on public.social_post_targets for insert to authenticated
  with check (owner_user_id = auth.uid() or owner_user_id = public.get_my_workspace_owner());
create policy "owner updates social_post_targets"
  on public.social_post_targets for update to authenticated
  using (owner_user_id = auth.uid() or owner_user_id = public.get_my_workspace_owner());
create policy "owner deletes social_post_targets"
  on public.social_post_targets for delete to authenticated
  using (owner_user_id = auth.uid() or owner_user_id = public.get_my_workspace_owner());

-- ─── 4. social_publish_attempts ────────────────────────────────────

create table if not exists public.social_publish_attempts (
  id uuid primary key default gen_random_uuid(),
  post_target_id uuid not null references public.social_post_targets(id) on delete cascade,
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  attempt_number int not null default 1,
  result text not null default 'pending' check (result in ('pending', 'success', 'failure')),
  error_message text,
  started_at timestamptz not null default now(),
  finished_at timestamptz
);

create index if not exists social_publish_attempts_target_idx
  on public.social_publish_attempts (post_target_id, attempt_number);

alter table public.social_publish_attempts enable row level security;

drop policy if exists "owner reads social_publish_attempts" on public.social_publish_attempts;
drop policy if exists "owner inserts social_publish_attempts" on public.social_publish_attempts;

create policy "owner reads social_publish_attempts"
  on public.social_publish_attempts for select to authenticated
  using (owner_user_id = auth.uid() or owner_user_id = public.get_my_workspace_owner());
create policy "owner inserts social_publish_attempts"
  on public.social_publish_attempts for insert to authenticated
  with check (owner_user_id = auth.uid() or owner_user_id = public.get_my_workspace_owner());
-- Sem policy de UPDATE/DELETE: tabela append-only (Requirement 6.5).

-- ─── 5. social_publishing_permissions ──────────────────────────────

create table if not exists public.social_publishing_permissions (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  scope text not null check (scope in ('member', 'role')),
  member_user_id uuid references auth.users(id) on delete cascade,
  role text check (role in ('manager', 'agent')),
  create_edit_draft boolean not null default true,
  connect_account boolean not null default false,
  schedule boolean not null default false,
  publish_now boolean not null default false,
  updated_at timestamptz not null default now()
);

-- Índice único parcial: no máximo 1 override por (workspace, membro).
create unique index if not exists social_pub_perms_member_unique_idx
  on public.social_publishing_permissions (owner_user_id, member_user_id)
  where scope = 'member' and member_user_id is not null;

-- Índice único parcial: no máximo 1 override por (workspace, papel).
create unique index if not exists social_pub_perms_role_unique_idx
  on public.social_publishing_permissions (owner_user_id, role)
  where scope = 'role' and role is not null;

alter table public.social_publishing_permissions enable row level security;

drop policy if exists "owner reads social_publishing_permissions" on public.social_publishing_permissions;
drop policy if exists "owner manages social_publishing_permissions" on public.social_publishing_permissions;

create policy "owner reads social_publishing_permissions"
  on public.social_publishing_permissions for select to authenticated
  using (owner_user_id = auth.uid() or owner_user_id = public.get_my_workspace_owner());
create policy "owner manages social_publishing_permissions"
  on public.social_publishing_permissions for all to authenticated
  using (owner_user_id = auth.uid()) with check (owner_user_id = auth.uid());

notify pgrst, 'reload schema';

insert into public.schema_manual_migrations (filename)
values ('20260808001000_social_publishing_tables.sql')
on conflict (filename) do nothing;
