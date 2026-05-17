-- Adiciona coluna com exemplo de descrição de serviço por segmento.
-- Usado como placeholder do campo "Descrição" no modal de criar serviço,
-- para o exemplo ser relevante ao ramo do workspace.

alter table public.ai_segments
  add column if not exists example_service_description text;

-- Seed dos 16 segmentos existentes. Idempotente: roda de novo sem efeito colateral.
update public.ai_segments set example_service_description =
  'Limpeza de pele profunda com extração de cravos, aplicação de máscara calmante e finalização com protetor solar. Indicada para peles oleosas.'
  where slug = 'clinica_estetica';

update public.ai_segments set example_service_description =
  'Consulta clínica de avaliação inicial, com anamnese completa e orientação sobre exames necessários. Atende convênio e particular.'
  where slug = 'consultorio_medico';

update public.ai_segments set example_service_description =
  'Limpeza e profilaxia com remoção de tártaro, polimento e aplicação de flúor. Recomendada a cada 6 meses.'
  where slug = 'odontologia';

update public.ai_segments set example_service_description =
  'Coleta de sangue para hemograma completo. Necessário jejum de 8 horas. Resultado liberado em até 24h.'
  where slug = 'laboratorio';

update public.ai_segments set example_service_description =
  'Corte feminino com lavagem, hidratação e escova. Inclui consultoria de estilo conforme o tipo de cabelo.'
  where slug = 'salao_beleza';

update public.ai_segments set example_service_description =
  'Corte masculino na máquina e tesoura + barba completa com toalha quente e finalização com bálsamo.'
  where slug = 'barbearia';

update public.ai_segments set example_service_description =
  'Troca de óleo e filtro com inspeção visual de freios, suspensão e níveis. Usamos óleo sintético 5W30.'
  where slug = 'oficina_mecanica';

update public.ai_segments set example_service_description =
  'Lavagem completa externa e interna + aplicação de cera de proteção. Para veículos pequenos e médios.'
  where slug = 'estetica_automotiva';

update public.ai_segments set example_service_description =
  'Avaliação física inicial com bioimpedância, medidas e teste de condicionamento. Resultado em até 48h.'
  where slug = 'academia_personal';

update public.ai_segments set example_service_description =
  'Sessão de fisioterapia ortopédica para reabilitação pós-cirúrgica de joelho. Inclui exercícios e terapia manual.'
  where slug = 'fisioterapia';

update public.ai_segments set example_service_description =
  'Diagnóstico de celular com orçamento sem compromisso. Cobrimos tela, bateria, conector de carga e placa.'
  where slug = 'assistencia_tecnica';

update public.ai_segments set example_service_description =
  'Consulta clínica geral para cães e gatos. Inclui exame físico, orientação nutricional e plano vacinal.'
  where slug = 'clinica_veterinaria';

update public.ai_segments set example_service_description =
  'Consulta nutricional inicial com avaliação antropométrica, plano alimentar personalizado e retorno em 30 dias.'
  where slug = 'nutricao_dietetica';

update public.ai_segments set example_service_description =
  'Sessão de psicoterapia individual de 50 minutos. Abordagem cognitivo-comportamental, presencial ou online.'
  where slug = 'psicologia_terapia';

update public.ai_segments set example_service_description =
  'Consulta jurídica inicial para análise do caso e orientação sobre próximos passos. Primeira conversa sem compromisso.'
  where slug = 'advocacia_juridico';

update public.ai_segments set example_service_description =
  'Descreva o que está incluso, materiais usados, duração média e quaisquer pré-requisitos para o cliente.'
  where slug = 'outro_personalizado';
