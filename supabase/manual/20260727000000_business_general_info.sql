-- ============================================================
-- 20260727000000_business_general_info.sql
-- "Informações gerais do negócio" — fatos que a IA pode responder quando
-- perguntada (estacionamento, PIX, acessibilidade etc.), estruturados em
-- vez de depender só de texto livre em business_description.
-- Chaves/labels correspondentes em src/lib/general-info-labels.ts.
-- ADD COLUMN IF NOT EXISTS — seguro para produção, não quebra workspaces
-- existentes.
-- ============================================================

-- 1) Valor Sim/Não por tenant. Mapa { chave: boolean } — chave AUSENTE
--    significa "não informado" e a IA nunca deve tratar isso como "Não".
alter table public.profiles
  add column if not exists business_general_info jsonb not null default '{}'::jsonb;

-- 2) Quais fatos são sugeridos por padrão pra cada segmento (mesmo padrão
--    de ai_segments.default_required_fields).
alter table public.ai_segments
  add column if not exists default_general_info_fields jsonb not null default '[]'::jsonb;

update public.ai_segments set default_general_info_fields =
  '["estacionamento","aceita_pix","aceita_cartao_credito","aceita_convenio","acessibilidade_cadeirantes","wifi_clientes"]'::jsonb
  where name = 'Clínica de Estética';

update public.ai_segments set default_general_info_fields =
  '["estacionamento","aceita_pix","aceita_cartao_credito","aceita_convenio","acessibilidade_cadeirantes","atende_emergencias","wifi_clientes"]'::jsonb
  where name = 'Consultório Médico';

update public.ai_segments set default_general_info_fields =
  '["estacionamento","aceita_pix","aceita_cartao_credito","aceita_convenio","acessibilidade_cadeirantes","atende_criancas","atende_emergencias","wifi_clientes"]'::jsonb
  where name = 'Odontologia';

update public.ai_segments set default_general_info_fields =
  '["estacionamento","aceita_pix","aceita_cartao_credito","aceita_convenio","acessibilidade_cadeirantes","agendamento_mesmo_dia"]'::jsonb
  where name = 'Laboratório de Análises';

update public.ai_segments set default_general_info_fields =
  '["estacionamento","aceita_pix","aceita_cartao_credito","aceita_dinheiro","oferece_parcelamento","wifi_clientes","atende_fim_de_semana"]'::jsonb
  where name = 'Salão de Beleza';

update public.ai_segments set default_general_info_fields =
  '["estacionamento","aceita_pix","aceita_cartao_credito","aceita_dinheiro","atende_fim_de_semana"]'::jsonb
  where name = 'Barbearia';

update public.ai_segments set default_general_info_fields =
  '["estacionamento","aceita_pix","aceita_cartao_credito","oferece_parcelamento","delivery"]'::jsonb
  where name = 'Oficina Mecânica';

update public.ai_segments set default_general_info_fields =
  '["estacionamento","aceita_pix","aceita_cartao_credito","aceita_dinheiro","atende_fim_de_semana","agendamento_mesmo_dia"]'::jsonb
  where name = 'Lava-rápido e Estética Automotiva';

update public.ai_segments set default_general_info_fields =
  '["estacionamento","aceita_pix","aceita_cartao_credito","oferece_parcelamento","ar_condicionado","atende_fim_de_semana"]'::jsonb
  where name = 'Academia e Personal';

update public.ai_segments set default_general_info_fields =
  '["estacionamento","aceita_pix","aceita_cartao_credito","aceita_convenio","acessibilidade_cadeirantes"]'::jsonb
  where name = 'Clínica de Fisioterapia';

update public.ai_segments set default_general_info_fields =
  '["estacionamento","aceita_pix","aceita_cartao_credito","oferece_parcelamento","delivery","agendamento_mesmo_dia"]'::jsonb
  where name = 'Assistência Técnica';

update public.ai_segments set default_general_info_fields =
  '["estacionamento","aceita_pix","aceita_cartao_credito","aceita_convenio","atende_emergencias","atende_fim_de_semana"]'::jsonb
  where name = 'Clínica Veterinária';

update public.ai_segments set default_general_info_fields =
  '["aceita_pix","aceita_cartao_credito","aceita_convenio","wifi_clientes"]'::jsonb
  where name = 'Nutrição e Dietética';

update public.ai_segments set default_general_info_fields =
  '["aceita_pix","aceita_cartao_credito","aceita_convenio"]'::jsonb
  where name = 'Psicologia e Terapia';

update public.ai_segments set default_general_info_fields =
  '["estacionamento","aceita_pix","aceita_cartao_credito"]'::jsonb
  where name = 'Advocacia e Jurídico';

update public.ai_segments set default_general_info_fields = '[]'::jsonb
  where name = 'Outro / Personalizado';
