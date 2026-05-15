-- Vincula a IA global do Super Admin a TODOS os workspaces (atuais e futuros)
-- e adiciona persistência dos serviços que o agente pode agendar.

-- a) Default true para futuros workspaces
alter table public.profiles
  alter column ai_enabled set default true;

-- b) Backfill nos workspaces existentes
update public.profiles
set ai_enabled = true
where ai_enabled is distinct from true;

-- c) Defaults razoáveis quando o campo está NULL
update public.profiles
set ai_assistant_name = coalesce(ai_assistant_name, 'Sofia'),
    ai_tone           = coalesce(ai_tone, 'Amigável'),
    ai_transfer_keywords = coalesce(
      ai_transfer_keywords,
      array['humano','atendente','reclamação']::text[]
    ),
    ai_transfer_after_messages = coalesce(ai_transfer_after_messages, 5),
    ai_working_hours = coalesce(
      ai_working_hours,
      jsonb_build_object(
        'monday',    jsonb_build_object('enabled', true,  'start','08:00','end','20:00'),
        'tuesday',   jsonb_build_object('enabled', true,  'start','08:00','end','20:00'),
        'wednesday', jsonb_build_object('enabled', true,  'start','08:00','end','20:00'),
        'thursday',  jsonb_build_object('enabled', true,  'start','08:00','end','20:00'),
        'friday',    jsonb_build_object('enabled', true,  'start','08:00','end','20:00'),
        'saturday',  jsonb_build_object('enabled', true,  'start','08:00','end','20:00'),
        'sunday',    jsonb_build_object('enabled', false, 'start','08:00','end','20:00')
      )
    ),
    ai_out_of_hours_message = coalesce(
      ai_out_of_hours_message,
      'Olá! No momento estamos fora do horário de atendimento.'
    );

-- d) Coluna nova p/ serviços habilitados pela IA
alter table public.profiles
  add column if not exists ai_enabled_service_ids uuid[] not null default '{}';
