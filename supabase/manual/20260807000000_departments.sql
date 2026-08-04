-- ============================================================
-- 20260807000000_departments.sql
--
-- Departamentos (Vendas, Financeiro, Suporte…): agrupam atendentes e passam
-- a ser o primeiro passo da transferência de conversa.
--
-- Tudo ADITIVO e ANULÁVEL, sem backfill: o workspace já tem dado real, e
-- ninguém nasce com departamento. A feature fica invisível até o primeiro
-- departamento ser criado — transferência sem nenhum departamento continua
-- se comportando exatamente como antes.
--
-- Idempotente. Rode no SQL Editor do Supabase.
-- ============================================================

set local lock_timeout = '5s';

-- ── 1) Tabela ───────────────────────────────────────────────

create table if not exists public.departments (
  id            uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  name          text not null,
  color         text,
  position      integer not null default 0,
  is_active     boolean not null default true,
  created_at    timestamptz not null default now()
);

comment on table public.departments is
  'Departamentos do workspace. Agrupam membros da equipe para transferência e rodízio.';

create index if not exists departments_owner_idx
  on public.departments(owner_user_id, is_active, position);

-- Dois "Vendas" no mesmo workspace tornariam a transferência ambígua.
-- `lower()` porque "vendas" e "Vendas" são o mesmo departamento para quem usa.
create unique index if not exists departments_owner_name_uniq
  on public.departments(owner_user_id, lower(name));

alter table public.departments enable row level security;

drop policy if exists "ws members read departments"  on public.departments;
drop policy if exists "ws owner insert departments"  on public.departments;
drop policy if exists "ws owner update departments"  on public.departments;
drop policy if exists "ws owner delete departments"  on public.departments;

-- Leitura para todo o workspace: o atendente precisa ver o nome do próprio
-- departamento e escolher destino ao transferir. Escrita só para o dono,
-- mesmo padrão de professionals e quick_replies.
create policy "ws members read departments"
  on public.departments for select to authenticated
  using (owner_user_id = public.get_my_workspace_owner());

create policy "ws owner insert departments"
  on public.departments for insert to authenticated
  with check (owner_user_id = auth.uid());

create policy "ws owner update departments"
  on public.departments for update to authenticated
  using (owner_user_id = auth.uid())
  with check (owner_user_id = auth.uid());

create policy "ws owner delete departments"
  on public.departments for delete to authenticated
  using (owner_user_id = auth.uid());

-- ── 2) Vínculos ─────────────────────────────────────────────

-- `on delete set null` nos dois: apagar um departamento não pode apagar
-- membro nem conversa. Eles voltam para "sem departamento".
alter table public.workspace_members
  add column if not exists department_id uuid
  references public.departments(id) on delete set null;

alter table public.contacts
  add column if not exists department_id uuid
  references public.departments(id) on delete set null;

comment on column public.contacts.department_id is
  'Departamento dono da conversa. Preenchido ao transferir; sobrevive mesmo quando nenhuma pessoa foi escolhida (rodízio vazio).';

create index if not exists workspace_members_department_idx
  on public.workspace_members(workspace_owner_id, department_id)
  where active;

create index if not exists contacts_department_idx
  on public.contacts(owner_user_id, department_id)
  where department_id is not null;

-- ── 3) Rodízio por departamento ─────────────────────────────

-- rotation_state tinha owner_user_id como PK: UM contador por workspace.
-- Com departamentos isso quebra silenciosamente — Vendas e Financeiro
-- dividiriam o contador e, como a assinatura muda a cada troca de
-- departamento, o ciclo reiniciaria toda vez e as duas equipes cairiam
-- sempre na primeira pessoa. A chave passa a incluir o departamento.
--
-- Sentinela em vez de NULL: coluna de chave não aceita NULL, e
-- `nulls not distinct` só existe do Postgres 15 em diante.
alter table public.rotation_state
  add column if not exists department_key uuid
  not null default '00000000-0000-0000-0000-000000000000'::uuid;

comment on column public.rotation_state.department_key is
  'Departamento do ciclo. A sentinela de zeros representa "sem departamento" (rodízio do workspace inteiro).';

do $$
begin
  if exists (
    select 1 from pg_constraint
     where conrelid = 'public.rotation_state'::regclass
       and contype = 'p'
       and conname = 'rotation_state_pkey'
  ) then
    alter table public.rotation_state drop constraint rotation_state_pkey;
  end if;
end $$;

create unique index if not exists rotation_state_scope_uniq
  on public.rotation_state(owner_user_id, department_key);

-- Assinatura da função muda (ganha p_department_id), então a antiga precisa
-- sair: `create or replace` não substitui sobrecarga com aridade diferente e
-- as duas conviveriam, com o worker chamando a errada.
drop function if exists public.next_rotation_counter(uuid, text);

create or replace function public.next_rotation_counter(
  p_owner_id      uuid,
  p_signature     text default null,
  p_department_id uuid default null
)
returns bigint
language sql
security definer
set search_path = public
as $$
  insert into public.rotation_state (owner_user_id, department_key, counter, slots_signature)
  values (
    p_owner_id,
    coalesce(p_department_id, '00000000-0000-0000-0000-000000000000'::uuid),
    1,
    p_signature
  )
  on conflict (owner_user_id, department_key) do update set
    counter = case
      when p_signature is distinct from public.rotation_state.slots_signature then 1
      else public.rotation_state.counter + 1
    end,
    slots_signature = p_signature,
    updated_at = now()
  returning counter;
$$;

-- Função nova no Postgres nasce com EXECUTE para PUBLIC — anon e authenticated
-- inclusive. Sem este revoke, qualquer um com a chave pública envenenaria o
-- contador de outro workspace.
revoke all on function public.next_rotation_counter(uuid, text, uuid) from public, anon, authenticated;
grant execute on function public.next_rotation_counter(uuid, text, uuid) to service_role;

insert into public.schema_manual_migrations (filename)
values ('20260807000000_departments.sql')
on conflict (filename) do nothing;

notify pgrst, 'reload schema';

select 'departamentos: tabela + vínculos + rodízio por departamento' as status;

-- ── verificação (rode separado depois de aplicar) ───────────
--
-- -- 1) tabela e policies
-- select count(*) from public.departments;
-- select polname from pg_policy where polrelid = 'public.departments'::regclass;
--
-- -- 2) colunas novas
-- select column_name, is_nullable from information_schema.columns
--  where table_name in ('workspace_members','contacts') and column_name = 'department_id';
--
-- -- 3) rodízio: dois departamentos não compartilham contador
-- select public.next_rotation_counter('<seu-owner-uuid>', 'sig-a', null);          -- 1
-- select public.next_rotation_counter('<seu-owner-uuid>', 'sig-a', null);          -- 2
-- select public.next_rotation_counter('<seu-owner-uuid>', 'sig-b', '<dept-uuid>'); -- 1 (ciclo separado)
-- select public.next_rotation_counter('<seu-owner-uuid>', 'sig-a', null);          -- 3 (não foi resetado)
-- select owner_user_id, department_key, counter from public.rotation_state;
-- delete from public.rotation_state where slots_signature in ('sig-a','sig-b');
