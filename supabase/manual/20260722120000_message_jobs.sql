-- Fila de processamento assíncrono de mensagens inbound do WhatsApp.
-- Desacopla o webhook da Evolution (que precisa responder rápido) do
-- processamento pesado (mídia + IA + envio de resposta).
-- Escrita/leitura só via service-role (webhook + worker) — sem acesso client-side.

create table if not exists public.message_jobs (
  id uuid primary key default gen_random_uuid(),
  workspace_owner_id uuid references auth.users(id) on delete cascade not null,
  contact_id uuid references public.contacts(id) on delete cascade not null,
  instance_name text not null,
  payload jsonb not null,
  status text not null default 'pending' check (status in ('pending','processing','done','error')),
  attempts int not null default 0,
  last_error text,
  locked_at timestamptz,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null
);

-- Índice pro worker: pega o lote mais antigo ainda pendente rapidamente.
create index if not exists message_jobs_pending_idx
  on public.message_jobs (created_at)
  where status = 'pending';

-- Índice de suporte ao rate limit por workspace (contagem de jobs recentes).
create index if not exists message_jobs_workspace_created_idx
  on public.message_jobs (workspace_owner_id, created_at);

alter table public.message_jobs enable row level security;
-- Sem policies para "authenticated": só service-role (bypassa RLS) lê/escreve.
-- Isso é intencional — a fila é infraestrutura interna, não dado de usuário.

create or replace function public.set_message_jobs_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

drop trigger if exists message_jobs_set_updated_at on public.message_jobs;
create trigger message_jobs_set_updated_at
before update on public.message_jobs
for each row execute function public.set_message_jobs_updated_at();

-- RPC usada pelo worker (src/lib/job-worker.ts) pra reivindicar um lote de jobs
-- com segurança sob concorrência (SELECT ... FOR UPDATE SKIP LOCKED não é
-- exposto pelo PostgREST diretamente, por isso vira função).
create or replace function public.claim_message_jobs(p_batch_size int default 5)
returns setof public.message_jobs
language plpgsql
security definer set search_path = public
as $$
begin
  return query
  update public.message_jobs
  set status = 'processing', locked_at = now(), attempts = attempts + 1
  where id in (
    select id from public.message_jobs
    where status = 'pending'
    order by created_at
    limit p_batch_size
    for update skip locked
  )
  returning *;
end;
$$;
