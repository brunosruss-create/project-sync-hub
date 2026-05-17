-- ════════════════════════════════════════════════════════════
-- Campos funcionais de contato: email, notes, block, archive, agente.
-- Apenas ADD COLUMN IF NOT EXISTS — nunca alterar colunas existentes.
-- ════════════════════════════════════════════════════════════

alter table public.contacts
  add column if not exists email             text,
  add column if not exists notes             text,
  add column if not exists is_blocked        boolean default false,
  add column if not exists is_archived       boolean default false,
  add column if not exists assigned_agent_id uuid references public.profiles(id) on delete set null;

create index if not exists contacts_tags_gin
  on public.contacts using gin(tags);

create index if not exists contacts_assigned_agent
  on public.contacts (assigned_agent_id);

create index if not exists contacts_archived
  on public.contacts (owner_user_id, is_archived);
