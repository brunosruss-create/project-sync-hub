-- Toggle para envio automatico da mensagem de boas-vindas no primeiro contato.
alter table public.profiles
  add column if not exists welcome_message_enabled boolean not null default false;
