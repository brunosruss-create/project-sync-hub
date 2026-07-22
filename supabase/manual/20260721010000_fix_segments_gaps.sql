-- ============================================================
-- Corrige 2 gaps encontrados na auditoria de segmentos de IA (2026-07-21).
-- ============================================================
-- Cole este arquivo INTEIRO no SQL Editor do Supabase e clique em Run:
-- https://supabase.com/dashboard/project/xrezmnaspkctuidehqqi/sql/new
-- Idempotente — seguro rodar várias vezes.

-- 1) GAP: 20260611000000_ai_segments_example_description.sql usou slugs
--    errados em 5 dos 16 UPDATEs (cada um afetou 0 linhas silenciosamente).
--    Reaplica com os slugs REAIS da tabela.
update public.ai_segments set example_service_description =
  'Consulta clínica geral para cães e gatos. Inclui exame físico, orientação nutricional e plano vacinal.'
  where slug = 'veterinaria';

update public.ai_segments set example_service_description =
  'Consulta nutricional inicial com avaliação antropométrica, plano alimentar personalizado e retorno em 30 dias.'
  where slug = 'nutricao';

update public.ai_segments set example_service_description =
  'Sessão de psicoterapia individual de 50 minutos. Abordagem cognitivo-comportamental, presencial ou online.'
  where slug = 'psicologia';

update public.ai_segments set example_service_description =
  'Consulta jurídica inicial para análise do caso e orientação sobre próximos passos. Primeira conversa sem compromisso.'
  where slug = 'advocacia';

update public.ai_segments set example_service_description =
  'Descreva o que está incluso, materiais usados, duração média e quaisquer pré-requisitos para o cliente.'
  where slug = 'personalizado';

-- 2) GAP: Psicologia era o único segmento de saúde sem nenhum campo
--    obrigatório antes de agendar. Adiciona "primeira consulta ou retorno"
--    (mesmo padrão já usado em Odontologia/Médico).
update public.ai_segments set default_required_fields = '["primeira_vez_ou_retorno"]'::jsonb
  where slug = 'psicologia';

-- 3) Verificação: confirma que os 5 slugs têm descrição e Psicologia tem o campo novo.
select slug, name,
       (example_service_description is not null) as tem_exemplo,
       default_required_fields
from public.ai_segments
where slug in ('veterinaria','nutricao','psicologia','advocacia','personalizado')
order by slug;
