-- Backfill professional_id em appointments antigos (legado tinha apenas agent_id).
-- Idempotente. Rode no SQL Editor do Supabase.

-- 1) agent_id é text (legado) e professionals.id é uuid -> precisamos castear.
update public.appointments a
   set professional_id = a.agent_id::uuid
 where a.professional_id is null
   and a.agent_id is not null
   and a.agent_id ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
   and exists (
     select 1 from public.professionals p where p.id = a.agent_id::uuid
   );

-- 2) Quando o workspace tem exatamente 1 profissional ativo, vincula appointments
--    órfãos (professional_id ainda nulo) a esse único profissional.
update public.appointments a
   set professional_id = sub.pid
  from (
    select owner_user_id, min(id) as pid
      from public.professionals
     where is_active = true
     group by owner_user_id
    having count(*) = 1
  ) sub
 where a.owner_user_id = sub.owner_user_id
   and a.professional_id is null;

-- 3) Índice para consulta de disponibilidade por profissional (usado pela IA).
create index if not exists appointments_owner_professional_starts_idx
  on public.appointments(owner_user_id, professional_id, starts_at);

notify pgrst, 'reload schema';
