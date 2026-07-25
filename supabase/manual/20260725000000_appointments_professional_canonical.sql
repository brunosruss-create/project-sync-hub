-- Torna `professional_id` a única coluna de profissional em appointments.
-- Idempotente. Rode no SQL Editor do Supabase ANTES de subir o deploy que
-- deixa de ler `agent_id`.
--
-- Contexto: a coluna vivia duplicada — `agent_id` (text, legado) e
-- `professional_id` (uuid). O modal de agendamento gravava as duas, mas o
-- caminho da IA (booking-confirmation.server.ts) gravava só `professional_id`.
-- Como o modal filtrava por `agent_id`, todo agendamento feito pela IA vinha com
-- `agent_id` nulo, não casava com nada, e o horário aparecia livre mesmo estando
-- ocupado. O backfill de 20260613 só cobria o sentido agent_id -> professional_id.

-- 1) Repete o backfill de 20260613 para pegar o que entrou desde então.
update public.appointments a
   set professional_id = a.agent_id::uuid
 where a.professional_id is null
   and a.agent_id is not null
   and a.agent_id ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
   and exists (
     select 1 from public.professionals p where p.id = a.agent_id::uuid
   );

-- 2) Workspace com exatamente 1 profissional ativo: vincula os órfãos a ele.
update public.appointments a
   set professional_id = sub.pid
  from (
    select owner_user_id, (min(id::text))::uuid as pid
      from public.professionals
     where is_active = true
     group by owner_user_id
    having count(*) = 1
  ) sub
 where a.owner_user_id = sub.owner_user_id
   and a.professional_id is null;

-- 3) Índice da janela do dia: a UI passou a filtrar por `starts_at < to AND
--    ends_at > from` para não perder atendimento que atravessa a meia-noite.
create index if not exists appointments_owner_ends_idx
  on public.appointments(owner_user_id, ends_at);

notify pgrst, 'reload schema';

-- 4) DIAGNÓSTICO — leia o resultado antes de rodar o drop.
--    `orfaos_com_agent_id` são linhas que têm `agent_id` preenchido mas não
--    conseguiram virar `professional_id` (valor legado tipo 'a1', ou profissional
--    já apagado). Elas vão aparecer como "sem profissional" depois do drop.
--    Se vier > 0, decida o que fazer com elas antes de seguir.
select
  count(*)                                                          as total,
  count(*) filter (where professional_id is not null)               as com_professional_id,
  count(*) filter (where professional_id is null)                   as sem_professional_id,
  count(*) filter (where professional_id is null and agent_id is not null)
                                                                    as orfaos_com_agent_id
from public.appointments;
