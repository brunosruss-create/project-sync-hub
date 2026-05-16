-- Coluna que controla o envio automatico da mensagem fora do horario.
-- Default FALSE: se o usuario nao optou explicitamente, nao enviamos a mensagem.
-- Isso evita spam quando o workspace nunca configurou esse toggle.
alter table public.profiles
  add column if not exists ai_out_of_hours_enabled boolean not null default false;
