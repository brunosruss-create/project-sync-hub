-- ============================================================
-- 20260731000000_service_photo_send_policy.sql
-- Substitui o toggle binário profiles.ai_can_send_photos por uma política de
-- QUANDO a IA pode enviar foto — mesmo padrão de herança null-vs-valor já
-- usado em services.price_disclosure_policy / profiles.ai_price_disclosure_policy:
--   never      = nunca envia (equivalente ao toggle desligado de hoje)
--   on_request = só quando o cliente pedir explicitamente (comportamento
--                atual quando o toggle estava ligado — vira o novo default)
--   proactive  = IA pode oferecer "temos fotos, quer ver?" ao falar do
--                serviço; o envio de fato ainda exige confirmação do cliente
-- services.photo_send_policy: null = herda o padrão do workspace abaixo.
-- profiles.ai_photo_send_policy: padrão do workspace, default 'never' pra
-- preservar o comportamento pré-existente (feature era opt-in, desligada
-- por padrão) sem exigir migração de dados de quem nunca ligou o toggle.
-- ============================================================

alter table public.services
  add column if not exists photo_send_policy text;

alter table public.profiles
  add column if not exists ai_photo_send_policy text not null default 'never';

-- Backfill: quem já tinha o toggle ligado só podia ter o comportamento
-- "on_request" (era o único que existia); quem tinha desligado ou nunca
-- configurou vira 'never'.
update public.profiles
  set ai_photo_send_policy = case when ai_can_send_photos then 'on_request' else 'never' end;

-- Mantém a coluna antiga por 1 ciclo de deploy para não quebrar leituras em
-- trânsito — deixa de ser lida pelo código novo, mas não é dropada aqui.
comment on column public.profiles.ai_can_send_photos is
  'DEPRECATED — substituído por ai_photo_send_policy. Mantido só para não quebrar leituras antigas em trânsito; remover em migration futura.';

notify pgrst, 'reload schema';
