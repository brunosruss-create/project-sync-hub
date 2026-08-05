-- Preview de link compartilhado (reel/post/story do Instagram).
--
-- Conteúdo publicado e compartilhado no DM não vem como arquivo de mídia — a
-- Meta só entrega a URL da página (ver src/routes/api/public/zernio.ts). Em vez
-- de mostrar um link nu, guardamos aqui os metadados da página (og:image +
-- og:title) para renderizar um card com miniatura, parecido com o preview
-- nativo do Instagram/WhatsApp.
--
-- Formato do JSON:
--   { "url": "https://instagram.com/reel/...",
--     "title": "texto do og:title" | null,
--     "thumbnail": "https://<nosso-storage>/...jpg" | null }
--
-- thumbnail é re-hospedado no nosso Storage (a URL do og:image da Meta é
-- hotlink-bloqueada — mesmo motivo do re-host de avatar).

alter table public.messages
  add column if not exists link_preview jsonb default null;

comment on column public.messages.link_preview is
  'Metadados de link compartilhado (reel/post IG): { url, title, thumbnail }. NULL quando a mensagem não é um compartilhamento.';

notify pgrst, 'reload schema';

insert into public.schema_manual_migrations (filename)
values ('20260808000500_messages_link_preview.sql')
on conflict (filename) do nothing;
