-- Bucket dedicado para mídia do módulo de publicação em redes sociais.
-- Isolado do bucket `chat-media` (mensageria). Políticas permitem upload
-- autenticado e leitura pública (URLs servidas diretamente pro client e
-- pro Zernio).

insert into storage.buckets (id, name, public)
values ('social-media', 'social-media', true)
on conflict (id) do nothing;

-- Policy: upload autenticado (qualquer membro do workspace pode subir mídia pra posts)
drop policy if exists "auth upload social-media" on storage.objects;
create policy "auth upload social-media"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'social-media');

-- Policy: leitura pública (URLs públicas pra Zernio consumir e pra preview na UI)
drop policy if exists "public read social-media" on storage.objects;
create policy "public read social-media"
  on storage.objects for select to public
  using (bucket_id = 'social-media');

-- Policy: dono pode deletar (limpeza de rascunhos abandonados, se necessário)
drop policy if exists "auth delete social-media" on storage.objects;
create policy "auth delete social-media"
  on storage.objects for delete to authenticated
  using (bucket_id = 'social-media');

notify pgrst, 'reload schema';

insert into public.schema_manual_migrations (filename)
values ('20260808001100_social_media_bucket.sql')
on conflict (filename) do nothing;
