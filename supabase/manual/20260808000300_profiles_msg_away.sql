-- Mensagem de ausência: dispara quando o cliente escreve e a IA está
-- desligada (`ai_enabled = false`). Cobre o gap dos canais Zernio, onde não
-- havia auto-reply nenhum se o atendente não estivesse por perto.
--
-- Escopo estreito de propósito:
--   1. Só dispara em canais que sabemos enviar (Zernio: whatsapp_cloud +
--      instagram). Evolution continua com o welcome_message tradicional.
--   2. Só quando `ai_enabled = false` — quando a IA está ligada, ela já
--      responde. Aqui é fallback pra quem desligou o robô.
--   3. Dedup por conversa: não envia se houve QUALQUER outbound do mesmo
--      contato nas últimas 6h (checagem em runtime no webhook, sem coluna
--      nova pra evitar migration mais complexa).
--
-- Colunas seguem o padrão msg_* das outras mensagens automáticas.

alter table public.profiles
  add column if not exists msg_away_text text default null;

alter table public.profiles
  add column if not exists msg_away_enabled boolean not null default false;

comment on column public.profiles.msg_away_text is
  'Texto enviado quando cliente escreve e IA está desligada. NULL = usa padrão MESSAGE_DEFAULTS.away.';
comment on column public.profiles.msg_away_enabled is
  'Se true, dispara msg_away_text via webhook Zernio em canais oficiais quando ai_enabled=false. Nasce false para não surpreender workspaces existentes.';

notify pgrst, 'reload schema';

insert into public.schema_manual_migrations (filename)
values ('20260808000300_profiles_msg_away.sql')
on conflict (filename) do nothing;
