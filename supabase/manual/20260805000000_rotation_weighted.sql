-- ============================================================
-- 20260805000000_rotation_weighted.sql
--
-- Distribuição automática ponderada de conversas entre atendentes.
--
-- Quando a IA transfere para humano, a conversa é atribuída ao próximo
-- atendente do rodízio. O peso define a proporção: com 3 atendentes em 2-2-1,
-- o ciclo é [A, A, B, B, C] e recomeça.
--
-- Idempotente. Rode no SQL Editor do Supabase.
-- ============================================================

-- ── 1) Configuração por membro ──────────────────────────────

alter table public.workspace_members
  add column if not exists rotation_enabled boolean not null default true,
  add column if not exists rotation_weight  integer not null default 1;

comment on column public.workspace_members.rotation_enabled is
  'Participa do rodízio automático de conversas.';
comment on column public.workspace_members.rotation_weight is
  'Peso no rodízio. 2 significa o dobro de conversas de quem tem 1.';

-- `add constraint` não aceita `if not exists` no Postgres — o bloco abaixo é o
-- que mantém a migration idempotente, como nas demais do repo.
do $$
begin
  alter table public.workspace_members
    add constraint workspace_members_rotation_weight_range
    check (rotation_weight between 1 and 100);
exception when duplicate_object then null;
end $$;

-- Dono do workspace fica FORA do rodízio por padrão: quem administra
-- normalmente não quer receber atribuição automática. Pode se incluir depois
-- pela tela de Equipe.
update public.workspace_members
   set rotation_enabled = false
 where member_user_id = workspace_owner_id
   and rotation_enabled is distinct from false;

-- O backfill acima NÃO basta sozinho: este trigger cria a linha do dono a cada
-- signup novo, e sem passar a coluna explicitamente ela pegaria o default
-- `true` — todo cadastro novo nasceria com o dono dentro do rodízio.
-- O trigger `on_auth_user_created_workspace` segue apontando para esta função.
create or replace function public.handle_new_user_workspace()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  insert into public.workspace_members
    (workspace_owner_id, member_user_id, active, rotation_enabled)
  values (new.id, new.id, true, false)
  on conflict do nothing;
  return new;
end $$;

-- ── 2) Estado do ciclo ──────────────────────────────────────

create table if not exists public.rotation_state (
  owner_user_id   uuid primary key references auth.users(id) on delete cascade,
  counter         bigint not null default 0,
  slots_signature text,
  updated_at      timestamptz not null default now()
);

comment on table public.rotation_state is
  'Posição do rodízio por workspace. Uma linha por workspace; não cresce.';

-- RLS ligado sem nenhuma policy, igual message_jobs: é infraestrutura interna
-- do rodízio, não dado de usuário. Ninguém acessa pela chave anônima; o worker
-- usa service role, que ignora RLS por definição.
alter table public.rotation_state enable row level security;

-- Sem índice de propósito: a PK em owner_user_id já é o índice do upsert.

-- ── 3) Avanço atômico do ciclo ──────────────────────────────

-- Por que uma instrução só, e não ler-calcular-escrever no JS:
-- o worker dispara `void runJob(job)` sem await (job-worker.ts) com
-- MAX_GLOBAL_CONCURRENCY = 18, e claim_message_jobs não agrupa por workspace —
-- até 5 jobs do MESMO workspace rodam em paralelo. Um contador em JS sofreria
-- read-modify-write race e mandaria várias conversas para o mesmo atendente.
-- Aqui a segunda sessão bloqueia no tuple lock, re-lê a linha já atualizada e
-- incrementa sobre ela. Sem deadlock: instrução única, linha única.
--
-- `slots_signature` reinicia o ciclo quando a configuração muda (peso alterado,
-- atendente entrou/saiu) — senão o mapeamento deslocaria no meio do ciclo.
--
-- NÃO marcar como `stable`: precisa ser volatile (o default), senão o PostgREST
-- roda em transação read-only e o INSERT falha.
create or replace function public.next_rotation_counter(
  p_owner_id  uuid,
  p_signature text default null
)
returns bigint
language sql
security definer
set search_path = public
as $$
  insert into public.rotation_state (owner_user_id, counter, slots_signature)
  values (p_owner_id, 1, p_signature)
  on conflict (owner_user_id) do update set
    counter = case
      when p_signature is distinct from public.rotation_state.slots_signature then 1
      else public.rotation_state.counter + 1
    end,
    slots_signature = p_signature,
    updated_at = now()
  returning counter;
$$;

-- Função nova no Postgres nasce com EXECUTE para PUBLIC — anon e authenticated
-- inclusive. Sem este revoke, qualquer um com a chave pública chamaria
-- next_rotation_counter('<uuid de outro workspace>') e envenenaria o contador
-- alheio. O `from public` é o que importa: sem ele os outros dois não têm
-- efeito, porque o privilégio vem de PUBLIC.
revoke all on function public.next_rotation_counter(uuid, text) from public, anon, authenticated;
grant execute on function public.next_rotation_counter(uuid, text) to service_role;

insert into public.schema_manual_migrations (filename)
values ('20260805000000_rotation_weighted.sql')
on conflict (filename) do nothing;

notify pgrst, 'reload schema';

select 'rodízio ponderado: colunas + rotation_state + next_rotation_counter' as status;
