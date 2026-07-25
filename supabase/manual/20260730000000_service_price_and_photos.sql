-- ============================================================
-- 20260730000000_service_price_and_photos.sql
-- 1) Política de divulgação de preço POR SERVIÇO (null = herda o padrão do
--    workspace em profiles.ai_price_disclosure_policy — mesmo padrão de
--    herança null-vs-valor já usado em ai_required_fields).
-- 2) Galeria de fotos por serviço (a IA pode enviar quando o cliente pedir
--    explicitamente, ver toggle abaixo): [{ id, url, caption }].
-- 3) Toggle de workspace pra habilitar a IA a enviar essas fotos —
--    desligado por padrão (feature nova e sensível: precisa opt-in).
-- ADD COLUMN IF NOT EXISTS — seguro para produção.
-- ============================================================

alter table public.services
  add column if not exists price_disclosure_policy text;

alter table public.services
  add column if not exists photos jsonb not null default '[]'::jsonb;

alter table public.profiles
  add column if not exists ai_can_send_photos boolean not null default false;
