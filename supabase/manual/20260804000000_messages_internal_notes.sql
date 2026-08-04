-- ============================================================
-- 20260804000000_messages_internal_notes.sql
--
-- Nota interna: anotação privada da equipe dentro da conversa.
-- Nunca é enviada ao WhatsApp do cliente e nunca entra no contexto da IA.
--
-- Por que coluna nova e não um 4º valor em `direction`: ~14 consumidores fazem
-- `direction === 'inbound' ? ... : ...`. Um valor novo ali faria a nota ser
-- classificada como fala do atendente — ou, pior, do cliente, e aí a IA
-- responderia à anotação em voz alta no WhatsApp.
--
-- ANTES DE RODAR — `public.messages` não tem CREATE TABLE no repo (foi criada
-- fora do versionamento). Confirme que não existe trigger propagando para
-- `contacts`, porque a nota não pode tocar last_message/last_message_at/
-- last_direction (senão a anotação privada vaza para o preview do Kanban):
--
--   select tgname, pg_get_triggerdef(oid)
--     from pg_trigger
--    where tgrelid = 'public.messages'::regclass and not tgisinternal;
--
-- Idempotente. Rode no SQL Editor do Supabase.
-- ============================================================

alter table public.messages
  add column if not exists is_internal boolean not null default false;

comment on column public.messages.is_internal is
  'true = nota interna da equipe. Nunca vai ao WhatsApp, nunca entra no contexto/resumo da IA. Toda leitura para IA, relatório, métrica ou billing precisa filtrar is_internal = false.';

-- Forma canônica da nota, garantida pelo banco. O browser escreve direto (RLS
-- é a única proteção nas queries do cliente), então a garantia não pode
-- depender de o caller lembrar. Impede dois erros:
--   (a) nota nascer com cara de mensagem enviada — direction outbound, tick de
--       entregue, id da Evolution;
--   (b) uma mensagem JÁ ENTREGUE ao cliente ser remarcada como interna depois,
--       o que reescreveria o histórico.
do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.messages'::regclass
       and conname  = 'messages_internal_shape_chk'
  ) then
    -- `not valid` evita ACCESS EXCLUSIVE longo no ALTER numa tabela quente;
    -- o validate abaixo roda com SHARE UPDATE EXCLUSIVE (não bloqueia leitura
    -- nem escrita) e passa trivialmente, já que toda linha existente é false.
    alter table public.messages
      add constraint messages_internal_shape_chk check (
        is_internal is false
        or (
          direction              = 'system'
          and message_type       = 'system'
          and whatsapp_message_id is null
          and coalesce(is_ai, false) is false
        )
      ) not valid;

    alter table public.messages validate constraint messages_internal_shape_chk;
  end if;
end $$;

-- `messages` não tem policy de DELETE de propósito: o histórico da conversa com
-- o cliente é append-only. Nota interna é conteúdo da equipe, não histórico do
-- cliente — e "não consigo apagar minha própria nota" é reclamação garantida.
-- Esta policy abre delete APENAS para is_internal = true, para o autor ou para
-- o gestor do workspace. Nenhuma mensagem real fica exposta por ela.
drop policy if exists "messages internal note delete" on public.messages;
create policy "messages internal note delete"
  on public.messages for delete to authenticated
  using (
    is_internal = true
    and owner_user_id = public.get_my_workspace_owner()
    and (
      public.is_workspace_manager()
      or (sent_by = auth.uid() and public.is_contact_visible(contact_id))
    )
  );

-- Sem índice de propósito: `is_internal` é ~99% false, seletividade péssima, o
-- planner ignoraria. As duas queries quentes já são cobertas pelos índices
-- existentes (contact_id / owner_user_id+contact_id) e `is_internal = false` é
-- um filtro barato aplicado por cima. Só valeria um índice PARCIAL, e só se
-- surgir uma visão "somente notas":
--
--   create index if not exists messages_internal_notes_idx
--     on public.messages (contact_id, created_at desc)
--     where is_internal = true;

insert into public.schema_manual_migrations (filename)
values ('20260804000000_messages_internal_notes.sql')
on conflict (filename) do nothing;

notify pgrst, 'reload schema';

select 'messages.is_internal + constraint de forma + policy de delete de nota' as status;
