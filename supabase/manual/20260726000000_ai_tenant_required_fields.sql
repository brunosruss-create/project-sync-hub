-- ============================================================
-- 20260726000000_ai_tenant_required_fields.sql
-- Perguntas personalizadas por workspace + corrige semântica de
-- ai_required_fields para permitir override explícito de "zero campos".
-- TODAS as alterações de schema usam ADD COLUMN IF NOT EXISTS.
-- Seguro para produção: não quebra workspaces existentes.
-- ============================================================

-- 1) Perguntas personalizadas por workspace (texto livre, sem chave/label —
--    não são consultadas em nenhum outro lugar do código).
alter table public.profiles
  add column if not exists ai_custom_questions jsonb default '[]'::jsonb;

-- 2) ai_required_fields: até hoje '[]' significava tanto "nunca customizado"
--    quanto "tenant escolheu zero campos", e o código sempre tratava os dois
--    casos como "nunca customizado" (caía no padrão do segmento). Isso
--    impedia o tenant de realmente pedir zero campos extras.
--    Nova semântica: null = nunca customizado -> herda do segmento;
--    qualquer array (mesmo vazio) = override explícito do tenant.
--    Remove o default '[]' — novas linhas ficam null (herdam do segmento).
alter table public.profiles
  alter column ai_required_fields drop default;

-- Backfill: até hoje só o super-admin escrevia em ai_segments.default_required_fields
-- (nunca em profiles.ai_required_fields por workspace, pois não existia UI para
-- isso) — então todo '[]' atual em profiles representa "nunca tocado", não
-- "override para vazio". Migra para null.
update public.profiles
  set ai_required_fields = null
  where ai_required_fields = '[]'::jsonb;
