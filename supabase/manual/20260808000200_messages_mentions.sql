-- Menções (@) em notas internas: quais atendentes o autor citou.
--
-- Modelo: array de UUIDs em messages.mentioned_users. Alternativa considerada
-- (tabela `mentions` separada com read_at por usuário) foi descartada por
-- escopo — dobrava a complexidade só para tracking de lido/não-lido, que
-- pode virar depois se surgir demanda. Hoje a menção dispara notificação
-- em tempo real via realtime, e ponto.
--
-- Uso:
--   - Composer: no modo nota, ao digitar `@`, autocomplete lista membros do
--     workspace; ao confirmar, o userId entra no array e o nome aparece
--     visualmente no `content`.
--   - Notificador: subscription realtime detecta INSERT em messages onde
--     `auth.uid() = ANY(mentioned_users)` e dispara toast + som.
--
-- Índice GIN pra permitir `mentioned_users && ARRAY[uid]` performático se
-- surgir dashboard de menções por usuário. Overhead de escrita é mínimo
-- porque a coluna quase sempre vem como `{}` (só notas com @ escrevem).

alter table public.messages
  add column if not exists mentioned_users uuid[] not null default '{}';

comment on column public.messages.mentioned_users is
  'Usuários mencionados via @ em notas internas. Vazio para mensagens comuns. Usado por use-inbound-notifier para disparar notificação pessoal.';

create index if not exists messages_mentions_gin_idx
  on public.messages using gin (mentioned_users)
  where mentioned_users <> '{}';

notify pgrst, 'reload schema';

insert into public.schema_manual_migrations (filename)
values ('20260808000200_messages_mentions.sql')
on conflict (filename) do nothing;
