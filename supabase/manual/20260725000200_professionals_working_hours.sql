-- Jornada de trabalho por profissional.
-- NULL = o profissional segue o horário de funcionamento do negócio
-- (profiles.business_hours). Só quem é exceção precisa configurar.
--
-- Formato (mais rico que o business_hours legado — suporta intervalo de almoço):
--   { "mon": { "active": true, "ranges": [{"start":"09:00","end":"12:00"},
--                                          {"start":"14:00","end":"18:00"}] },
--     "tue": { "active": false, "ranges": [] }, ... }
--
-- Idempotente. Rode no SQL Editor do Supabase.

alter table public.professionals
  add column if not exists working_hours jsonb;

comment on column public.professionals.working_hours is
  'Jornada semanal própria. NULL = herda profiles.business_hours. Formato: { dia: { active, ranges: [{start,end}] } }';
