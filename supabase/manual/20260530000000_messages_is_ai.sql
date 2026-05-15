-- Marca mensagens enviadas automaticamente pela IA, para auditoria
-- e para evitar reentrância do agente sobre suas próprias respostas.
alter table public.messages
  add column if not exists is_ai boolean not null default false;
