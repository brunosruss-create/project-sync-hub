-- ============================================================
-- Adiciona coluna layers_json em generated_assets pra suportar o editor
-- visual drag-and-drop pós-geração.
--
-- Modelo: a imagem gerada (rendered_image_url) fica como foto base fixa.
-- Por cima, camadas editáveis (badge de categoria, headline, subheadline,
-- CTA, assinatura, hashtags) vivem em layers_json — cada camada tem
-- posição (x, y), tamanho (width, height), texto e estilo.
--
-- Quando o cliente publica, o backend renderiza a foto + camadas em PNG
-- final antes de mandar pro Social_Publishing_Module.
-- ============================================================

alter table public.generated_assets
  add column if not exists layers_json jsonb;

-- Ex de layers_json:
-- [
--   { "id": "badge", "type": "pill", "x": 60, "y": 60,
--     "text": "Promoção", "bg": "#0F172A", "color": "#FFFFFF" },
--   { "id": "headline", "type": "text", "x": 60, "y": 320, "w": 900,
--     "text": "Corte + escova por R$49,90", "fontSize": 78, "color": "#FFF" },
--   ...
-- ]
comment on column public.generated_assets.layers_json is
  'Camadas editáveis do editor drag-and-drop sobrepostas à foto base.';

notify pgrst, 'reload schema';

insert into public.schema_manual_migrations (filename)
values ('20260810000600_generated_assets_layers.sql')
on conflict (filename) do nothing;
