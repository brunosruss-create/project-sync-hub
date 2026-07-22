# Infraestrutura do ZapFlow — Runbook

Documento de operação. Explica **onde tudo roda**, **quais variáveis existem** e
**como recriar/religar** cada peça. Não contém segredos (só os nomes das
variáveis e onde encontrá-las).

> ⚠️ Este runbook existe porque a infra do Evolution (Railway) já caiu uma vez
> por falta de pagamento e **não havia nenhuma documentação** de como recriá-la.
> Mantenha este arquivo atualizado.

---

## Visão geral

```
WhatsApp  ⇄  Evolution API (Railway, 24/7)  ──webhook──▶  ZapFlow (Vercel)  ⇄  Supabase
                    │                                          │                 (dados + auth + storage)
              Postgres + Redis                          Google Gemini (IA)
              (do Evolution)
```

| Peça | Onde roda | Papel | Pode cair sem derrubar o resto? |
|---|---|---|---|
| **App ZapFlow** | Vercel (`hello-tenant-base.vercel.app`) | Frontend + SSR + webhook receiver | Se cair, o WhatsApp para de responder |
| **Evolution API** | Railway (projeto `aware-love`) | Conexão persistente com o WhatsApp | **Ponto único de falha** do WhatsApp |
| **Supabase** | Supabase Cloud (`xrezmnaspkctuidehqqi`) | Banco, Auth (Google + senha), Storage (`chat-media`) | Se cair, o app inteiro para |
| **Gemini** | Google | Cérebro do atendente de IA | Se cair, IA não responde (resto funciona) |

Domínio antigo (Lovable): `github-vercel-bridge.lovable.app` — hospedagem própria
da Lovable. Pode ser deprecado quando o domínio da Vercel virar o oficial.

---

## 1. Evolution API (Railway) — o coração do WhatsApp

**Projeto Railway:** `aware-love` — contém 3 serviços que sobem juntos:
- **Evolution** (a API em si, imagem oficial `evolution-api`, hoje v2.3.7)
- **Postgres** (guarda as sessões Baileys / pareamento do WhatsApp)
- **Redis** (cache de sessão)

### Variáveis do serviço Evolution (aba Variables → "Raw Editor" mostra tudo)
As que importam pra integração com o ZapFlow:

| Variável (Railway) | Papel | Espelho no ZapFlow |
|---|---|---|
| `SERVER_URL` | URL pública da Evolution (ex.: `https://aware-love-production.up.railway.app`) | `EVOLUTION_API_URL` |
| `AUTHENTICATION_API_KEY` | Chave de acesso à API | `EVOLUTION_API_KEY` |
| `DATABASE_ENABLED` / `DATABASE_PROVIDER` | Liga o Postgres pra persistir dados | — |
| `DATABASE_SAVE_DATA_*` | O que persistir (chats, contatos, instância, mensagens) | — |
| `QRCODE_LIMIT`, `QRCODE_COLOR` | Config do QR de pareamento | — |
| `CONFIG_SESSION_PHONE_VERSION` | Versão do WhatsApp Web que o Baileys anuncia | — |
| `WEBHOOK_GLOBAL_ENABLED` | Webhook global (o app registra webhook por instância mesmo assim) | — |
| `LANGUAGE`, `LOG_LEVEL`, `SERVER_PORT`, `DEL_INSTANCE` | Operacionais | — |

> **REGRA DE OURO:** `EVOLUTION_API_KEY` (no ZapFlow) e `AUTHENTICATION_API_KEY`
> (no Railway) precisam ser **idênticos byte-a-byte**. O código já avisa quando
> não batem ("Forbidden"). Um espaço ou aspas a mais quebra a autenticação.

### Se o Railway cair por falta de pagamento
1. Pagar a fatura no billing do Railway.
2. Os 3 serviços costumam voltar a "Active" sozinhos (o Railway não apaga volumes).
3. Se algum ficar "Crashed"/"Sleeping" → botão **Redeploy** naquele serviço.
4. Testar saúde: `curl https://<SERVER_URL>/` deve responder
   `{"status":200,"message":"Welcome to the Evolution API..."}`.

### Se o projeto Railway for PERDIDO (recriar do zero)
Não há IaC — recriação é manual:
1. Novo projeto no Railway → adicionar **Postgres** e **Redis** (templates prontos).
2. Novo serviço a partir da imagem Docker **`atendai/evolution-api`** (ou a oficial
   `evoapicloud/evolution-api`) na versão desejada.
3. Setar as variáveis da tabela acima. `SERVER_URL` = o domínio público que o
   Railway gerar pro serviço Evolution. `DATABASE_*` apontando pro Postgres do projeto.
4. Copiar o novo `SERVER_URL` + `AUTHENTICATION_API_KEY` para as env vars do ZapFlow
   (ver seção 2). Redeploy do ZapFlow.
5. Cada usuário reconecta o WhatsApp (Configurações → WhatsApp → Reconectar → QR novo).
   A linha em `whatsapp_instances` no Supabase é reaproveitada — não precisa mexer no banco.

---

## 2. App ZapFlow (Vercel)

- **Projeto Vercel:** `hello-tenant-base` (`prj_0SbyAR3P5YXgOzkTvbF4gkWizcMP`).
- **Repo:** `github.com/brunosruss-create/project-sync-hub` (branch `main`).
- **Framework:** TanStack Start + Nitro (preset nativo `vercel`, SSR real).
- **Build:** `npm run build` → `.vercel/output/functions/__server.func/` (a Vercel roda isso).

> ⚠️ O deploy automático via `git push` **não está ligado** (a vinculação
> GitHub↔Vercel não foi concluída). Deploys hoje são via CLI:
> `vercel build --prod && vercel deploy --prebuilt --prod`.
> Pra ligar auto-deploy: painel Vercel → Settings → Git → conectar o repo.

### Env vars do ZapFlow (Vercel → Settings → Environment Variables)
| Variável | Valor / origem |
|---|---|
| `EVOLUTION_API_URL` | = `SERVER_URL` do Railway |
| `EVOLUTION_API_KEY` | = `AUTHENTICATION_API_KEY` do Railway |
| `PUBLIC_APP_URL` | URL pública do app (pro webhook: `https://<app>/api/public/evolution/<id>`) |
| `VITE_SUPABASE_URL` / `SUPABASE_URL` | `https://xrezmnaspkctuidehqqi.supabase.co` |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | chave anônima (pública por design, vai no navegador) |
| `SUPABASE_SERVICE_ROLE_KEY` | **SEGREDO** — bypassa RLS, só no servidor. Nunca no cliente. |

> Adicionar env var via API da Vercel exige o campo `"type":"encrypted"` no POST
> (sem ele, a API retorna 400). Env var nova só vale após um **redeploy**.

---

## 3. Supabase

- **Projeto:** `xrezmnaspkctuidehqqi` — https://supabase.com/dashboard/project/xrezmnaspkctuidehqqi
- **Faz:** banco Postgres, Auth (Google OAuth + email/senha), Storage (bucket `chat-media`).
- **Chave do Gemini:** fica na tabela `global_settings` (key `gemini_api_key`), **não** em env var.
- **Migrations:** rodadas **manualmente** no SQL Editor. Ficam em `supabase/manual/*.sql`
  (a maioria) e `supabase/migrations/*.sql`. ⚠️ Não há garantia de que produção = repo;
  ao criar uma migration nova, rode-a no SQL Editor.
- **Isolamento entre empresas:** RLS por `owner_user_id` + papel (manager vê tudo,
  agente só contatos atribuídos). O frontend lê/escreve direto pelo browser confiando
  na RLS — então **RLS quebrada = vazamento entre empresas**. Ver `SEGURANCA.md`.

---

## 4. Checklist de "está tudo no ar?"
```bash
# 1. Evolution respondendo
curl https://aware-love-production.up.railway.app/

# 2. App no ar
curl -I https://hello-tenant-base.vercel.app/

# 3. Supabase respondendo (deve dar 200 e JSON)
curl https://xrezmnaspkctuidehqqi.supabase.co/rest/v1/ -H "apikey: <ANON_KEY>"
```
E no app: Configurações → WhatsApp deve mostrar "Conectado".
