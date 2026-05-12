O 404 não parece ser causado por Supabase nem pelas variáveis: o domínio `https://hello-tenant-base.vercel.app` está retornando um 404 da própria Vercel (`x-vercel-error: NOT_FOUND`), antes do app carregar.

O estado atual do projeto no Lovable é:
- Preview correto: `https://id-preview--e2215eb7-4cbb-4afc-8773-9f93425b90f1.lovable.app`
- Published URL: ainda não existe, porque o projeto não está publicado no Lovable.
- O projeto está configurado para o runtime de publicação do Lovable/Cloudflare (`@cloudflare/vite-plugin`, `wrangler.jsonc`, `src/server.ts`), não para Vercel.

Plano recomendado:
1. Publicar pelo Lovable usando o botão Publish/Update para gerar a URL pública permanente `.lovable.app`.
2. Depois que essa URL existir, usar ela no Supabase Auth em:
   - Site URL
   - Redirect URLs, incluindo `https://SEU-DOMINIO.lovable.app/**`
3. Não usar `hello-tenant-base.vercel.app` como URL principal, a menos que o projeto seja adaptado especificamente para self-hosting na Vercel.

Se você quiser insistir em Vercel, o próximo plano seria uma adaptação de self-hosting para Vercel, mas isso é uma mudança técnica separada do app; o caminho mais seguro para este projeto feito no Lovable é publicar pelo Lovable.