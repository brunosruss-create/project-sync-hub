-- Bucket dedicado para outputs do AI_Content_Generation_Module.
-- Isolado dos buckets `chat-media` (mensageria) e `social-media` (publicação).
--
-- Estrutura de pastas:
--   ai-content/{owner_user_id}/logos/{brand_kit_id}.{ext}
--   ai-content/{owner_user_id}/renders/{asset_id}/{version}.png
--   ai-content/{owner_user_id}/renders/{asset_id}/{version}-slide-{n}.png
--   ai-content/{owner_user_id}/image-bank-cache/{hash}.{ext}
--   ai-content/{owner_user_id}/ai-generated/{uuid}.png
--   ai-content/{owner_user_id}/template-previews/{templateId}.png

insert into storage.buckets (id, name, public)
values ('ai-content', 'ai-content', true)
on conflict (id) do nothing;

-- Policy: upload autenticado (server functions e uploads diretos do browser autenticado).
drop policy if exists "auth upload ai-content" on storage.objects;
create policy "auth upload ai-content"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'ai-content');

-- Policy: leitura pública (URLs consumidas pela UI, por Satori na composição de templates,
-- e pelo handoff pro Social_Publishing_Module).
drop policy if exists "public read ai-content" on storage.objects;
create policy "public read ai-content"
  on storage.objects for select to public
  using (bucket_id = 'ai-content');

-- Policy: autenticado pode deletar (limpeza de rascunhos abandonados).
drop policy if exists "auth delete ai-content" on storage.objects;
create policy "auth delete ai-content"
  on storage.objects for delete to authenticated
  using (bucket_id = 'ai-content');

notify pgrst, 'reload schema';

insert into public.schema_manual_migrations (filename)
values ('20260810000200_ai_content_bucket.sql')
on conflict (filename) do nothing;
