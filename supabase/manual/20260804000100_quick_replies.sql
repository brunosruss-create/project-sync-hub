-- ============================================================
-- 20260804000100_quick_replies.sql
--
-- Respostas rápidas: textos pré-salvos que o atendente insere no composer.
-- Diferente das mensagens automáticas (que vivem em colunas de `profiles`,
-- ver 20260608000000_message_templates.sql): aquelas são um conjunto fixo de
-- 6 chaves, estas são uma lista de tamanho variável por workspace.
--
-- O corpo aceita as mesmas variáveis das mensagens automáticas — {{cliente}} e
-- {{negocio}} — renderizadas por renderTemplate (src/lib/message-templates.ts)
-- no momento da inserção. Mantenha as chaves em ASCII: o regex do engine é
-- \w+, que não casa com acento nem hífen.
--
-- Idempotente. Rode no SQL Editor do Supabase.
-- ============================================================

create table if not exists public.quick_replies (
  id            uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  title         text not null,
  shortcut      text default '',
  body          text not null,
  sort_order    integer not null default 0,
  is_active     boolean not null default true,
  created_at    timestamptz not null default now()
);

comment on table public.quick_replies is
  'Respostas rápidas do atendente. Corpo aceita {{cliente}} e {{negocio}}.';

create index if not exists quick_replies_owner_idx
  on public.quick_replies(owner_user_id, is_active, sort_order);

alter table public.quick_replies enable row level security;

drop policy if exists "ws members read quick_replies"  on public.quick_replies;
drop policy if exists "ws owner insert quick_replies"  on public.quick_replies;
drop policy if exists "ws owner update quick_replies"  on public.quick_replies;
drop policy if exists "ws owner delete quick_replies"  on public.quick_replies;

-- Leitura para todo o workspace: o atendente precisa usar as respostas, mesmo
-- não sendo o dono. Escrita só para o dono, como em professionals.
create policy "ws members read quick_replies"
  on public.quick_replies for select to authenticated
  using (owner_user_id = public.get_my_workspace_owner());

create policy "ws owner insert quick_replies"
  on public.quick_replies for insert to authenticated
  with check (owner_user_id = auth.uid());

create policy "ws owner update quick_replies"
  on public.quick_replies for update to authenticated
  using (owner_user_id = auth.uid())
  with check (owner_user_id = auth.uid());

create policy "ws owner delete quick_replies"
  on public.quick_replies for delete to authenticated
  using (owner_user_id = auth.uid());

insert into public.schema_manual_migrations (filename)
values ('20260804000100_quick_replies.sql')
on conflict (filename) do nothing;

notify pgrst, 'reload schema';

select 'tabela quick_replies criada' as status;
