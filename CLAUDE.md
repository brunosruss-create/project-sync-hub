# ZapFlow

SaaS multi-tenant de atendimento via WhatsApp com IA (Google Gemini). Cada empresa é um workspace isolado; agentes atendem contatos, um bot de IA responde dentro de regras configuráveis (horário de funcionamento vs. horário de atendimento da IA são configs desacopladas).

**Antes de mexer em infra, deploy ou segurança, leia:**
- [docs/INFRAESTRUTURA.md](docs/INFRAESTRUTURA.md) — onde cada peça roda (Vercel/Railway/Supabase/Evolution API), env vars, runbook de recriação.
- [docs/SEGURANCA.md](docs/SEGURANCA.md) — modelo de isolamento entre empresas (RLS), papéis (manager/agent/super_admin), histórico de correções.

## Stack

TanStack Start (React 19 + Nitro/SSR) + Vite + Tailwind v4 + Radix UI + Supabase (Postgres/Auth/Storage) + Google Gemini. Deploy do app no Vercel; worker de fila assíncrona (`src/lib/job-worker.ts`, script `npm run worker`) no Railway junto com a Evolution API (conexão WhatsApp).

## Estrutura

```
src/features/    dashboard, inbox, reports, schedule, services, settings, super-admin
src/routes/      rotas TanStack Router (file-based) + src/routes/api/ (webhook, queue-health)
src/integrations/supabase/   client browser (anon) + client server (service role)
src/lib/         utils, job-worker (Railway), error handling
scripts/         check-migrations (ledger vs. repo)
supabase/migrations/   migrations versionadas (poucas)
supabase/manual/       migrations aplicadas manualmente no SQL Editor (a maioria — 55+)
```

**Não há tipos gerados do Supabase** (`types.ts` não existe) e o `createClient` roda sem o
generic `Database` — toda linha de query é `any`. Consequência prática: erro de coluna só
aparece em runtime, nunca no `tsc`. Por isso o mapeamento de linha vive num módulo único
por entidade (ex.: `src/features/inbox/contact-row.ts` para `contacts`) em vez de espalhado
por tela.

## Convenções e cuidados

- **RLS é a única proteção** nas queries que o browser faz direto no Supabase (chave anônima + JWT). Nunca relaxar policy sem entender o impacto — ver `SEGURANCA.md`.
- Server functions/webhook usam `supabaseAdmin` (service role, **bypassa RLS**) — toda query nova aqui precisa filtrar manualmente por `owner_user_id`.
- **Migrations são aplicadas à mão no SQL Editor** e só valem depois de rodadas lá — avisar o usuário. Para saber o que falta: `npm run migrations:check`, que compara `supabase/manual/*.sql` com o ledger `public.schema_manual_migrations`. Toda migration manual nova **termina se registrando** no ledger:
  ```sql
  insert into public.schema_manual_migrations (filename)
  values ('<nome-deste-arquivo>.sql') on conflict (filename) do nothing;
  ```
  Sem essa linha final, a migration fica invisível pro check. Nome do arquivo com timestamp **único** (já houve 4 colisões, que tornavam a ordem de aplicação ambígua).
- Deploy do Vercel **não é automático via push** (GitHub↔Vercel não linkado) — é `npx vercel deploy --prod`, que builda **no Vercel**. Nunca `vercel build --prod` local: as env vars marcadas como Sensitive não são legíveis fora do build remoto e o build quebra. Projeto alvo é `hello-tenant-base` (não `project-sync-hub`) — conferir `.vercel/project.json`. Confirmar com o usuário antes de rodar (é ação visível/produção).
- `EVOLUTION_API_KEY` (Vercel) e `AUTHENTICATION_API_KEY` (Railway) precisam ser idênticos byte-a-byte, senão dá "Forbidden".
- Commits e comentários de UI em português; mensagens de commit seguem `tipo: descrição` (feat/fix/chore/infra/refactor).
- Pasta `.lovable/` é resquício do Lovable (ferramenta usada antes) — projeto agora é editado localmente/Claude Code.
- Repo irmão `C:\Users\Dell\zapweb\hello-tenant-base` é uma versão **anterior/abandonada** deste mesmo projeto — não confundir os dois.
