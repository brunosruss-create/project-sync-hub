-- ════════════════════════════════════════════════════════════
-- Memória de longo prazo da IA por contato.
-- Resumo automático do histórico antigo (gerado pela IA periodicamente).
-- ════════════════════════════════════════════════════════════

alter table public.contacts
  add column if not exists ai_summary               text default '',
  add column if not exists ai_summary_updated_at    timestamptz,
  add column if not exists ai_summary_message_count integer default 0;

create index if not exists contacts_ai_summary_updated_idx
  on public.contacts(owner_user_id, ai_summary_updated_at);
