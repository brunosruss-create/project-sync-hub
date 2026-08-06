-- ============================================================
-- Adiciona chaves das APIs de banco de imagens em global_settings.
-- Mesmo padrão da chave Gemini: super admin configura uma vez pelo UI,
-- Vercel (app) e Railway (worker) leem do banco. Elimina drift entre
-- ambientes e centraliza rotação de credenciais.
--
-- Todas as chaves começam vazias — image-bank cai de graça quando ausentes.
-- ============================================================

insert into public.global_settings (key, value, description)
values
  ('pexels_api_key',   '', 'Chave da API Pexels (banco de imagens 1º na cascata)'),
  ('unsplash_access_key', '', 'Access Key do Unsplash (banco de imagens 2º na cascata)'),
  ('pixabay_api_key',  '', 'Chave da API Pixabay (banco de imagens 3º na cascata)')
on conflict (key) do nothing;

notify pgrst, 'reload schema';

insert into public.schema_manual_migrations (filename)
values ('20260810000500_image_bank_settings.sql')
on conflict (filename) do nothing;
