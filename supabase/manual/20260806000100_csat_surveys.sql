-- ============================================================
-- 20260806000100_csat_surveys.sql
--
-- CSAT: pesquisa de satisfação (nota 1 a 5) enviada pelo WhatsApp alguns
-- minutos depois de a conversa ser marcada como resolvida.
--
-- Por que o gatilho é trigger no banco e não código no cliente: resolver
-- conversa tem 5 caminhos na UI, e o drag-and-drop do Kanban
-- (_authenticated.inbox.tsx) escreve `kanban_column` direto em `contacts`,
-- sem passar por useContactActions. Só um trigger pega todos.
--
-- Depende de 20260806000000_message_jobs_scheduling.sql (job_type +
-- scheduled_at). Idempotente. Rode no SQL Editor do Supabase.
-- ============================================================

-- ── Template da mensagem ────────────────────────────────────

-- default FALSE de propósito: é mensagem PROATIVA e não solicitada ao cliente
-- final, diferente das reativas (confirmação de agendamento, transferência),
-- que nascem ligadas. Quem quiser pesquisa liga em Configurações › Mensagens.
alter table public.profiles
  add column if not exists msg_csat_enabled boolean not null default false,
  add column if not exists msg_csat_text    text;

-- ── Tabela ──────────────────────────────────────────────────

create table if not exists public.csat_surveys (
  id                uuid primary key default gen_random_uuid(),
  owner_user_id     uuid not null references auth.users(id)     on delete cascade,
  contact_id        uuid not null references public.contacts(id) on delete cascade,
  -- Snapshot de quem atendeu. É grátis no insert e IMPOSSÍVEL de reconstruir
  -- depois (a atribuição muda). Habilita CSAT por atendente no futuro.
  assigned_agent_id uuid,
  status            text not null default 'pending'
                    check (status in ('pending','sent','answered','expired','cancelled')),
  rating            int check (rating between 1 and 5),
  -- Texto cru do cliente, para auditar o parser quando ele errar.
  raw_answer        text,
  sent_at           timestamptz,
  answered_at       timestamptz,
  created_at        timestamptz not null default now()
);

comment on table public.csat_surveys is
  'Pesquisas de satisfação. Estados: pending (agendada) → sent (entregue, único que aceita nota) → answered | expired | cancelled.';
comment on column public.csat_surveys.status is
  'cancelled = não perguntamos (conversa reabriu, WhatsApp caiu, template desligado). expired = perguntamos e não veio resposta válida. A distinção importa: taxa de resposta é answered/(answered+expired) — contar as canceladas afundaria a métrica por motivo que não é do cliente.';

-- Backstop de concorrência: dois agentes resolvendo o mesmo contato ao mesmo
-- tempo são transações distintas e NÃO se enxergam no `not exists` do trigger.
-- Só um índice único aborta a segunda. (O cooldown de 7 dias fica no trigger:
-- índice não expressa janela de tempo.)
create unique index if not exists csat_surveys_one_open_per_contact
  on public.csat_surveys (contact_id)
  where status in ('pending','sent');

create index if not exists csat_surveys_owner_sent_idx
  on public.csat_surveys (owner_user_id, sent_at);

alter table public.csat_surveys enable row level security;

-- Só LEITURA pelo cliente (o relatório lê daqui). Escrita é 100% servidor:
-- o trigger é security definer e o worker usa service role.
drop policy if exists "ws members read csat" on public.csat_surveys;
create policy "ws members read csat"
  on public.csat_surveys for select to authenticated
  using (owner_user_id = public.get_my_workspace_owner());

-- ── Gatilho ─────────────────────────────────────────────────

create or replace function public.enqueue_csat_on_resolve()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  v_enabled boolean;
  v_survey  uuid;
  v_delay   interval;
begin
  -- TUDO dentro do bloco exception. Este trigger roda DENTRO da transação do
  -- UPDATE do cliente: se levantar erro, o contato não é marcado como
  -- resolvido. E o drag-and-drop do Kanban só faz console.warn no erro, então
  -- o card ficaria visualmente em "Resolvido" com o banco discordando.
  -- Marcar conversa como resolvida nunca pode falhar por causa do CSAT.
  begin
    select msg_csat_enabled into v_enabled
      from public.profiles where id = new.owner_user_id;
    if not coalesce(v_enabled, false) then
      return null;
    end if;

    -- Jitter. Sem ele, resolver 200 conversas de uma vez viraria 200 envios em
    -- rajada — o worker pula o rate limiter para csat_send, então nada
    -- seguraria. Risco de BLOQUEIO DO NÚMERO, não só de rate limit da
    -- Evolution. O atraso também dá janela para a conversa reabrir antes de
    -- perguntarmos.
    v_delay := interval '5 minutes' + (random() * interval '5 minutes');

    insert into public.csat_surveys (owner_user_id, contact_id, assigned_agent_id)
    select new.owner_user_id, new.id, new.assigned_agent_id
     where not exists (
       select 1 from public.csat_surveys s
        where s.contact_id = new.id
          and (
            s.status in ('pending','sent')                 -- já há uma aberta
            or s.created_at > now() - interval '7 days'     -- cooldown
          )
     )
    returning id into v_survey;

    if v_survey is null then
      return null;  -- duplicata ou dentro do cooldown
    end if;

    insert into public.message_jobs
      (workspace_owner_id, contact_id, instance_name, payload, job_type, scheduled_at)
    values (
      new.owner_user_id,
      new.id,
      -- Espelha instanceNameForOwner (src/lib/evolution.server.ts). Valor
      -- informativo: o worker resolve a instância de novo na hora do envio,
      -- porque o que vale é o estado da conexão naquele momento.
      'zf_' || substr(replace(new.owner_user_id::text, '-', ''), 1, 24),
      jsonb_build_object('survey_id', v_survey),
      'csat_send',
      now() + v_delay
    );
  exception when others then
    raise warning '[enqueue_csat_on_resolve] contato=% erro=%', new.id, sqlerrm;
  end;
  return null;
end;
$$;

drop trigger if exists contacts_enqueue_csat on public.contacts;
create trigger contacts_enqueue_csat
after update of kanban_column on public.contacts
for each row
when (new.kanban_column = 'resolved' and old.kanban_column is distinct from 'resolved')
execute function public.enqueue_csat_on_resolve();

-- ── Sweeper ─────────────────────────────────────────────────

-- NÃO é opcional: uma pesquisa presa em pending/sent bloqueia o contato para
-- sempre no índice único parcial acima. Este é o que mantém o índice limpo.
create or replace function public.expire_stale_csat_surveys()
returns void
language plpgsql
security definer set search_path = public
as $$
begin
  -- Enviada e sem resposta em 48h: o cliente não vai mais responder.
  update public.csat_surveys
     set status = 'expired'
   where status = 'sent'
     and sent_at < now() - interval '48 hours';

  -- Conversa saiu de "resolvida" (cliente voltou a falar) antes de a pesquisa
  -- ser respondida: não é falta de resposta, é pergunta que não cabe mais.
  update public.csat_surveys s
     set status = 'cancelled'
   where s.status in ('pending','sent')
     and exists (
       select 1 from public.contacts c
        where c.id = s.contact_id
          and c.kanban_column is distinct from 'resolved'
     );
end;
$$;

do $$
begin
  if exists (select 1 from cron.job where jobname = 'expire-stale-csat-surveys') then
    perform cron.unschedule('expire-stale-csat-surveys');
  end if;
end $$;

select cron.schedule(
  'expire-stale-csat-surveys',
  '*/15 * * * *',
  $$select public.expire_stale_csat_surveys();$$
);

insert into public.schema_manual_migrations (filename)
values ('20260806000100_csat_surveys.sql')
on conflict (filename) do nothing;

notify pgrst, 'reload schema';

select 'csat_surveys + trigger + sweeper' as status;

-- ── Verificação (rode depois, separado) ─────────────────────
--
-- 0) Ligar o CSAT no seu workspace (nasce desligado):
--    update public.profiles set msg_csat_enabled = true where id = '<seu-owner-uuid>';
--
-- 1) Resolver um contato e conferir que gerou pesquisa + job agendado:
--    update public.contacts set kanban_column = 'resolved' where id = '<contato>';
--    select status, created_at from public.csat_surveys where contact_id = '<contato>';
--    select job_type, scheduled_at, scheduled_at > now() as no_futuro
--      from public.message_jobs where contact_id = '<contato>' and job_type = 'csat_send';
--
-- 2) Resolver de novo NÃO deve duplicar (cooldown de 7 dias):
--    update public.contacts set kanban_column = 'waiting'  where id = '<contato>';
--    update public.contacts set kanban_column = 'resolved' where id = '<contato>';
--    select count(*) as deve_continuar_1 from public.csat_surveys where contact_id = '<contato>';
--
-- 3) O trigger NÃO pode derrubar o resolve. Simule falha e confirme que o
--    update passa mesmo assim:
--    alter table public.message_jobs rename to message_jobs_tmp;
--    update public.contacts set kanban_column = 'waiting'  where id = '<contato>';
--    update public.contacts set kanban_column = 'resolved' where id = '<contato>';  -- deve funcionar
--    alter table public.message_jobs_tmp rename to message_jobs;
--
-- 4) Limpar: delete from public.csat_surveys where contact_id = '<contato>';
--            delete from public.message_jobs  where contact_id = '<contato>' and job_type = 'csat_send';
