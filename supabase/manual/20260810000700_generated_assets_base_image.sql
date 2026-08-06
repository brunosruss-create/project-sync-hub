-- Adiciona coluna base_image_url em generated_assets.
--
-- Motivação: quando o cliente edita layers no editor, o rendered_image_url é
-- substituído pelo PNG com as camadas aplicadas. Precisamos manter a imagem
-- ORIGINAL (foto base sem camadas) pra permitir reedição sem "cascar" camadas
-- sobre camadas.
--
-- base_image_url é preenchido na PRIMEIRA edição (com o valor original de
-- rendered_image_url) e nunca mais mexido.

alter table public.generated_assets
  add column if not exists base_image_url text;

comment on column public.generated_assets.base_image_url is
  'URL da foto original sem camadas do editor. Só preenchido após primeira edição.';

notify pgrst, 'reload schema';

insert into public.schema_manual_migrations (filename)
values ('20260810000700_generated_assets_base_image.sql')
on conflict (filename) do nothing;
