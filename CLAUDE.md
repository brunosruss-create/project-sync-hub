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
src/integrations/supabase/   client browser + client server + tipos gerados
src/lib/         utils, job-worker (Railway), error handling
supabase/migrations/   migrations versionadas (poucas)
supabase/manual/       migrations aplicadas manualmente no SQL Editor (a maioria — 37+)
```

## Convenções e cuidados

- **RLS é a única proteção** nas queries que o browser faz direto no Supabase (chave anônima + JWT). Nunca relaxar policy sem entender o impacto — ver `SEGURANCA.md`.
- Server functions/webhook usam `supabaseAdmin` (service role, **bypassa RLS**) — toda query nova aqui precisa filtrar manualmente por `owner_user_id`.
- **Migrations não têm garantia de estar sincronizadas com produção** (rodadas manualmente no SQL Editor). Ao criar uma migration, ela só vale depois de rodada lá também — avisar o usuário.
- Deploy do Vercel **não é automático via push** (GitHub↔Vercel não linkado) — é `vercel build --prod && vercel deploy --prebuilt --prod`. Confirmar com o usuário antes de rodar (é uma ação visível/produção).
- `EVOLUTION_API_KEY` (Vercel) e `AUTHENTICATION_API_KEY` (Railway) precisam ser idênticos byte-a-byte, senão dá "Forbidden".
- Commits e comentários de UI em português; mensagens de commit seguem `tipo: descrição` (feat/fix/chore/infra/refactor).
- Pasta `.lovable/` é resquício do Lovable (ferramenta usada antes) — projeto agora é editado localmente/Claude Code.
- Repo irmão `C:\Users\Dell\zapweb\hello-tenant-base` é uma versão **anterior/abandonada** deste mesmo projeto — não confundir os dois.
