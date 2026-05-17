-- Adiciona coluna com exemplo de descrição de serviço por segmento.
-- Usado como placeholder do campo "Descrição" no modal de criar serviço,
-- para o exemplo ser relevante ao ramo do workspace.
alter table public.ai_segments
  add column if not exists example_service_description text;
