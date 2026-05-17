-- Backfill professional_id em appointments antigos (legado tinha apenas agent_id).
-- Idempotente. Rode no SQL Editor do Supabase.

-- agent_id é text (legado) e professionals.id é uuid -> precisamos castear.
update public.appointments a
   set professional_id = a.agent_id::uuid
 where a.professional_id is null
   and a.agent_id is not null
   and a.agent_id ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
   and exists (
     select 1 from public.professionals p where p.id = a.agent_id::uuid
   );

-- Índice para consulta de disponibilidade por profissional (usado pela IA).
create index if not exists appointments_owner_professional_starts_idx
  on public.appointments(owner_user_id, professional_id, starts_at);

notify pgrst, 'reload schema';
