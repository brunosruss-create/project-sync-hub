-- ============================================================
-- 20260729000000_business_general_info_notes.sql
-- 1) Observação opcional por fato (ex.: "oferece parcelamento? Sim" +
--    observação "até 3x sem juros"). Só faz sentido pro fato que ela
--    acompanha; chave ausente = sem observação.
-- 2) Remove "atende_fim_de_semana" do catálogo (redundante com
--    business_hours, que já cobre cada dia da semana) — limpa segmentos e
--    dados de tenant que já tinham essa chave salva.
-- ADD COLUMN IF NOT EXISTS — seguro para produção.
-- ============================================================

alter table public.profiles
  add column if not exists business_general_info_notes jsonb not null default '{}'::jsonb;

-- Remove a chave descontinuada dos defaults por segmento
update public.ai_segments
set default_general_info_fields = (
  select coalesce(jsonb_agg(v), '[]'::jsonb)
  from jsonb_array_elements_text(default_general_info_fields) v
  where v <> 'atende_fim_de_semana'
)
where default_general_info_fields @> '["atende_fim_de_semana"]'::jsonb;

-- Remove a chave descontinuada de quem já tinha respondido
update public.profiles
set business_general_info = business_general_info - 'atende_fim_de_semana'
where business_general_info ? 'atende_fim_de_semana';

-- Remove a chave descontinuada de listas customizadas por tenant
update public.profiles
set business_general_info_included = (
  select coalesce(jsonb_agg(v), '[]'::jsonb)
  from jsonb_array_elements_text(business_general_info_included) v
  where v <> 'atende_fim_de_semana'
)
where business_general_info_included @> '["atende_fim_de_semana"]'::jsonb;
