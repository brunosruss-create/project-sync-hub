-- Garante que public.services tenha owner_user_id e status, e faz backfill
-- dos registros antigos onde owner_user_id é null. Idempotente.

alter table public.services
  add column if not exists owner_user_id uuid references auth.users(id) on delete cascade;

alter table public.services
  add column if not exists status text not null default 'active';

-- Backfill: se só existe 1 profile no workspace (caso single-tenant),
-- atribui os serviços órfãos a esse owner.
do $$
declare
  only_owner uuid;
begin
  if (select count(*) from public.profiles) = 1 then
    select id into only_owner from public.profiles limit 1;
    update public.services
       set owner_user_id = only_owner
     where owner_user_id is null;
  end if;
end $$;

create index if not exists services_owner_status_idx
  on public.services (owner_user_id, status);

notify pgrst, 'reload schema';

-- Diagnóstico: lista serviços órfãos que ainda restam (precisam de revisão manual).
-- select id, name, owner_user_id, status from public.services where owner_user_id is null;
