-- ════════════════════════════════════════════════════════════
-- Realtime na tabela contacts: necessário para sincronizar
-- bloqueio/desbloqueio/arquivamento entre abas e dispositivos.
-- Idempotente.
-- ════════════════════════════════════════════════════════════

do $$
begin
  alter publication supabase_realtime add table public.contacts;
exception
  when duplicate_object then null;
  when undefined_object then null;
end $$;

alter table public.contacts replica identity full;
