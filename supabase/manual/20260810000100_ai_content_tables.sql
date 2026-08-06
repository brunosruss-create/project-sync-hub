-- ============================================================
-- Módulo AI_Content_Generation — tabelas base.
--
-- 100% isolado dos módulos de mensageria e de publicação:
--   - Nenhuma FK para contacts, messages, zernio_accounts, message_jobs,
--     social_posts, social_account_connections, services ou service_photos.
--   - owner_user_id referencia apenas auth.users.
--   - Leitura de services é feita em app com filtro explícito por
--     owner_user_id (isolamento lógico, sem constraint DB).
--
-- Tabelas:
--   1. brand_kits                       (1 por workspace)
--   2. content_briefs                   (entrada do usuário, sobrevive ao job)
--   3. content_jobs                     (execução do brief)
--   4. generated_assets                 (resultado por rede/versão)
--   5. content_usage_meters             (contadores por workspace/mês)
--   6. content_publishing_permissions   (permissões granulares)
-- ============================================================

-- ─── 1. brand_kits ─────────────────────────────────────────────────

create table if not exists public.brand_kits (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  primary_color text not null default '#0EA5E9',
  secondary_color text not null default '#1E293B',
  support_color text not null default '#F59E0B',
  logo_url text,
  display_font text not null default 'Playfair Display',
  body_font text not null default 'Inter',
  tone_of_voice text not null default 'profissional',
  default_signature text default '',
  extraction_source text check (extraction_source in ('instagram_handle', 'website_url', 'manual')),
  extraction_metadata jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(owner_user_id)
);

create index if not exists brand_kits_owner_idx
  on public.brand_kits (owner_user_id);

alter table public.brand_kits enable row level security;

drop policy if exists "owner reads brand_kits" on public.brand_kits;
drop policy if exists "owner inserts brand_kits" on public.brand_kits;
drop policy if exists "owner updates brand_kits" on public.brand_kits;
drop policy if exists "owner deletes brand_kits" on public.brand_kits;

create policy "owner reads brand_kits"
  on public.brand_kits for select to authenticated
  using (owner_user_id = auth.uid() or owner_user_id = public.get_my_workspace_owner());
create policy "owner inserts brand_kits"
  on public.brand_kits for insert to authenticated
  with check (owner_user_id = auth.uid() or owner_user_id = public.get_my_workspace_owner());
create policy "owner updates brand_kits"
  on public.brand_kits for update to authenticated
  using (owner_user_id = auth.uid() or owner_user_id = public.get_my_workspace_owner());
create policy "owner deletes brand_kits"
  on public.brand_kits for delete to authenticated
  using (owner_user_id = auth.uid() or owner_user_id = public.get_my_workspace_owner());

-- ─── 2. content_briefs ─────────────────────────────────────────────

create table if not exists public.content_briefs (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  created_by uuid not null references auth.users(id) on delete set null,
  template_category text not null check (template_category in (
    'promo', 'novidade', 'depoimento', 'agenda', 'dica',
    'institucional', 'antes_depois', 'catalogo'
  )),
  post_format text not null check (post_format in ('single', 'carousel', 'story')),
  carousel_slide_count int check (carousel_slide_count between 2 and 10),
  target_networks text[] not null,
  service_id uuid, -- referência lógica sem FK (isolamento cross-módulo)
  free_text_objective text,
  tone_override text,
  ai_image_optin boolean not null default false,
  created_at timestamptz not null default now(),
  -- Se format=carousel, count é obrigatório.
  check (post_format <> 'carousel' or carousel_slide_count is not null)
);

create index if not exists content_briefs_owner_idx
  on public.content_briefs (owner_user_id, created_at desc);

alter table public.content_briefs enable row level security;

drop policy if exists "owner reads content_briefs" on public.content_briefs;
drop policy if exists "owner inserts content_briefs" on public.content_briefs;
drop policy if exists "owner updates content_briefs" on public.content_briefs;
drop policy if exists "owner deletes content_briefs" on public.content_briefs;

create policy "owner reads content_briefs"
  on public.content_briefs for select to authenticated
  using (owner_user_id = auth.uid() or owner_user_id = public.get_my_workspace_owner());
create policy "owner inserts content_briefs"
  on public.content_briefs for insert to authenticated
  with check (owner_user_id = auth.uid() or owner_user_id = public.get_my_workspace_owner());
create policy "owner updates content_briefs"
  on public.content_briefs for update to authenticated
  using (owner_user_id = auth.uid() or owner_user_id = public.get_my_workspace_owner());
create policy "owner deletes content_briefs"
  on public.content_briefs for delete to authenticated
  using (owner_user_id = auth.uid() or owner_user_id = public.get_my_workspace_owner());

-- ─── 3. content_jobs ───────────────────────────────────────────────

create table if not exists public.content_jobs (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  brief_id uuid not null references public.content_briefs(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'running', 'completed', 'failed')),
  stage text check (stage in ('image_bank', 'ai_image', 'ai_text', 'render', 'service_lookup', 'unknown')),
  error_message text,
  image_provider_used text check (image_provider_used in ('pexels', 'unsplash', 'pixabay', 'nano_banana', 'service_photo')),
  ai_text_model text,
  cost_estimate_cents int not null default 0,
  duration_ms int,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists content_jobs_owner_idx
  on public.content_jobs (owner_user_id, created_at desc);
create index if not exists content_jobs_brief_idx
  on public.content_jobs (brief_id);
create index if not exists content_jobs_status_idx
  on public.content_jobs (status)
  where status in ('pending', 'running');

alter table public.content_jobs enable row level security;

drop policy if exists "owner reads content_jobs" on public.content_jobs;
drop policy if exists "owner inserts content_jobs" on public.content_jobs;
drop policy if exists "owner updates content_jobs" on public.content_jobs;
drop policy if exists "owner deletes content_jobs" on public.content_jobs;

create policy "owner reads content_jobs"
  on public.content_jobs for select to authenticated
  using (owner_user_id = auth.uid() or owner_user_id = public.get_my_workspace_owner());
create policy "owner inserts content_jobs"
  on public.content_jobs for insert to authenticated
  with check (owner_user_id = auth.uid() or owner_user_id = public.get_my_workspace_owner());
create policy "owner updates content_jobs"
  on public.content_jobs for update to authenticated
  using (owner_user_id = auth.uid() or owner_user_id = public.get_my_workspace_owner());
create policy "owner deletes content_jobs"
  on public.content_jobs for delete to authenticated
  using (owner_user_id = auth.uid() or owner_user_id = public.get_my_workspace_owner());

-- ─── 4. generated_assets ───────────────────────────────────────────

create table if not exists public.generated_assets (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  job_id uuid not null references public.content_jobs(id) on delete cascade,
  target_network text not null check (target_network in ('facebook', 'instagram', 'tiktok', 'youtube')),
  version int not null default 1,
  parent_asset_id uuid references public.generated_assets(id) on delete set null,
  approval_status text not null default 'pending' check (approval_status in ('pending', 'approved', 'rejected')),
  rendered_image_url text not null,
  slides_json jsonb, -- carrossel: array de {url, index}
  copy_bundle jsonb not null,
  image_source_metadata jsonb,
  ai_image_prompt text,
  social_post_id uuid, -- retornado pelo Social_Publishing_Module após handoff
  approved_at timestamptz,
  approved_by uuid references auth.users(id) on delete set null,
  rejected_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists generated_assets_owner_idx
  on public.generated_assets (owner_user_id, created_at desc);
create index if not exists generated_assets_job_idx
  on public.generated_assets (job_id);
create index if not exists generated_assets_status_idx
  on public.generated_assets (owner_user_id, approval_status);
create index if not exists generated_assets_parent_idx
  on public.generated_assets (parent_asset_id)
  where parent_asset_id is not null;

alter table public.generated_assets enable row level security;

drop policy if exists "owner reads generated_assets" on public.generated_assets;
drop policy if exists "owner inserts generated_assets" on public.generated_assets;
drop policy if exists "owner updates generated_assets" on public.generated_assets;
drop policy if exists "owner deletes generated_assets" on public.generated_assets;

create policy "owner reads generated_assets"
  on public.generated_assets for select to authenticated
  using (owner_user_id = auth.uid() or owner_user_id = public.get_my_workspace_owner());
create policy "owner inserts generated_assets"
  on public.generated_assets for insert to authenticated
  with check (owner_user_id = auth.uid() or owner_user_id = public.get_my_workspace_owner());
create policy "owner updates generated_assets"
  on public.generated_assets for update to authenticated
  using (owner_user_id = auth.uid() or owner_user_id = public.get_my_workspace_owner());
create policy "owner deletes generated_assets"
  on public.generated_assets for delete to authenticated
  using (owner_user_id = auth.uid() or owner_user_id = public.get_my_workspace_owner());

-- ─── 5. content_usage_meters ───────────────────────────────────────

create table if not exists public.content_usage_meters (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  period_year_month text not null, -- 'YYYY-MM' na tz do workspace
  metric text not null check (metric in ('posts_generated', 'ai_images_generated', 'content_jobs_started')),
  count int not null default 0,
  updated_at timestamptz not null default now(),
  unique(owner_user_id, period_year_month, metric)
);

create index if not exists content_usage_meters_owner_idx
  on public.content_usage_meters (owner_user_id, period_year_month);

alter table public.content_usage_meters enable row level security;

drop policy if exists "owner reads content_usage_meters" on public.content_usage_meters;
drop policy if exists "owner manages content_usage_meters" on public.content_usage_meters;

create policy "owner reads content_usage_meters"
  on public.content_usage_meters for select to authenticated
  using (owner_user_id = auth.uid() or owner_user_id = public.get_my_workspace_owner());
-- Escrita: só via server functions com service role (não policy explícita pra client).
create policy "owner manages content_usage_meters"
  on public.content_usage_meters for all to authenticated
  using (owner_user_id = auth.uid())
  with check (owner_user_id = auth.uid());

-- ─── 6. content_publishing_permissions ─────────────────────────────

create table if not exists public.content_publishing_permissions (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  scope text not null check (scope in ('member', 'role')),
  member_user_id uuid references auth.users(id) on delete cascade,
  role text check (role in ('manager', 'agent')),
  can_brand_edit boolean not null default false,
  can_brief_create boolean not null default true,
  can_asset_approve boolean not null default true,
  can_publish_immediate boolean not null default false,
  can_ai_image_optin boolean not null default false,
  updated_at timestamptz not null default now(),
  check ((scope = 'member' and member_user_id is not null) or (scope = 'role' and role is not null))
);

create unique index if not exists content_pub_perms_member_unique_idx
  on public.content_publishing_permissions (owner_user_id, member_user_id)
  where scope = 'member' and member_user_id is not null;

create unique index if not exists content_pub_perms_role_unique_idx
  on public.content_publishing_permissions (owner_user_id, role)
  where scope = 'role' and role is not null;

alter table public.content_publishing_permissions enable row level security;

drop policy if exists "owner reads content_publishing_permissions" on public.content_publishing_permissions;
drop policy if exists "owner manages content_publishing_permissions" on public.content_publishing_permissions;

create policy "owner reads content_publishing_permissions"
  on public.content_publishing_permissions for select to authenticated
  using (owner_user_id = auth.uid() or owner_user_id = public.get_my_workspace_owner());
create policy "owner manages content_publishing_permissions"
  on public.content_publishing_permissions for all to authenticated
  using (owner_user_id = auth.uid())
  with check (owner_user_id = auth.uid());

notify pgrst, 'reload schema';

insert into public.schema_manual_migrations (filename)
values ('20260810000100_ai_content_tables.sql')
on conflict (filename) do nothing;
