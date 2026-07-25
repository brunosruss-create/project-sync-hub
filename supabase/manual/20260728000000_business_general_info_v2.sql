-- ============================================================
-- 20260728000000_business_general_info_v2.sql
-- v2 de "Informações gerais do negócio": permite o tenant remover um fato
-- sugerido (opt-out) e criar fatos personalizados (Sim/Não com label
-- próprio). Ver src/lib/general-info-labels.ts e
-- 20260727000000_business_general_info.sql (v1) para contexto.
-- ADD COLUMN IF NOT EXISTS — seguro para produção.
-- ============================================================

-- 1) Lista de chaves do catálogo que o tenant realmente vê. Mesmo padrão de
--    herança null-vs-array de ai_required_fields: null = segue os defaults
--    do segmento (reativo); array = customizado pelo tenant (remover com
--    "x" ou adicionar do catálogo materializa aqui e para de seguir o
--    segmento).
alter table public.profiles
  add column if not exists business_general_info_included jsonb;

-- 2) Fatos personalizados do tenant (fora do catálogo hardcoded):
--    [{ id, label, value: boolean|null }]. value null = não informado,
--    mesma semântica do catálogo (a IA nunca infere "Não" por omissão).
alter table public.profiles
  add column if not exists business_general_info_custom jsonb not null default '[]'::jsonb;
