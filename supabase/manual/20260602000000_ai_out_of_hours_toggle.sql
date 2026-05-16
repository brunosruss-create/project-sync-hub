-- Permite desligar somente a resposta automática de fora do horário.
alter table public.profiles
  add column if not exists ai_out_of_hours_enabled boolean not null default true;