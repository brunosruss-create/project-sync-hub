-- ════════════════════════════════════════════════════════════
-- Persiste horários do negócio + fuso horário (cosmético → funcional).
-- Garante IA ativa por padrão para todos os workspaces.
-- ════════════════════════════════════════════════════════════

-- 1) Novas colunas em profiles
alter table public.profiles
  add column if not exists business_hours    jsonb,
  add column if not exists business_timezone text   default 'America/Sao_Paulo',
  add column if not exists welcome_message   text,
  add column if not exists ai_timezone       text   default 'America/Sao_Paulo',
  add column if not exists ai_enabled_service_ids uuid[] not null default '{}'::uuid[];

-- 2) IA global ativa (default + backfill robusto, repetido para o caso da
--    migration 20260516 não ter sido aplicada na ordem certa).
alter table public.profiles alter column ai_enabled set default true;
update public.profiles set ai_enabled = true where ai_enabled is distinct from true;

-- 3) Defaults razoáveis em campos da IA quando NULL
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
    ),
    business_timezone = coalesce(business_timezone, 'America/Sao_Paulo'),
    ai_timezone       = coalesce(ai_timezone, business_timezone, 'America/Sao_Paulo'),
    business_hours = coalesce(
      business_hours,
      jsonb_build_object(
        'mon', jsonb_build_object('active', true,  'start','08:00','end','18:00'),
        'tue', jsonb_build_object('active', true,  'start','08:00','end','18:00'),
        'wed', jsonb_build_object('active', true,  'start','08:00','end','18:00'),
        'thu', jsonb_build_object('active', true,  'start','08:00','end','18:00'),
        'fri', jsonb_build_object('active', true,  'start','08:00','end','18:00'),
        'sat', jsonb_build_object('active', true,  'start','08:00','end','18:00'),
        'sun', jsonb_build_object('active', false, 'start','08:00','end','18:00')
      )
    ),
    welcome_message = coalesce(
      welcome_message,
      'Olá! Bem-vindo(a). Em instantes um atendente irá responder.'
    );
