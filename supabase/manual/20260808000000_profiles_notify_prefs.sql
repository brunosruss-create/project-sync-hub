-- Preferência de som para notificação de mensagem nova.
--
-- `notify_push` já existe em profiles (para a Web Notification API do
-- navegador). Faltava a preferência de som — a gente reusa a coluna push
-- e só adiciona a de som. Default `true` porque a primeira experiência
-- do atendente é "avisa quando chegar mensagem"; quem se incomoda desliga.

alter table public.profiles
  add column if not exists notify_sound_enabled boolean not null default true;

comment on column public.profiles.notify_sound_enabled is
  'Toca beep ao receber mensagem inbound (silencia se a aba estiver em foco).';

notify pgrst, 'reload schema';

insert into public.schema_manual_migrations (filename)
values ('20260808000000_profiles_notify_prefs.sql')
on conflict (filename) do nothing;
