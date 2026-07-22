# Segurança do ZapFlow

Modelo de segurança e histórico de correções. Leia junto com `INFRAESTRUTURA.md`.

## Como o isolamento entre empresas funciona

ZapFlow é multi-tenant: cada empresa é um **workspace** identificado por
`owner_user_id`. Duas camadas garantem que uma empresa nunca veja dados de outra:

1. **Frontend → Supabase direto (via browser, chave anônima + JWT do usuário).**
   O Inbox, Kanban, Agenda e Serviços leem/escrevem `contacts`, `messages`,
   `appointments`, `services`, `kanban_columns` **diretamente** pelo navegador.
   → **A RLS do Postgres é a ÚNICA proteção aqui.** RLS quebrada = vazamento
   entre empresas. Não relaxe as policies.

2. **Server functions → Supabase via service-role.**
   As `*.functions.ts` e o webhook usam `supabaseAdmin` (service role, que
   **bypassa RLS**) e filtram manualmente por `owner_user_id`. Aqui a proteção
   é o filtro no código — toda query nova precisa do `.eq("owner_user_id", ...)`.

### Papéis (RLS)
- **manager** (dono do workspace): vê tudo do workspace.
- **agent**: vê só contatos atribuídos a ele (`assigned_agent_id = auth.uid()`)
  e as mensagens/agenda desses contatos.
- **super_admin**: acesso via RPCs `security definer` gated por `is_super_admin()`.

Helpers canônicos (não dupliquem lógica de papel fora deles):
`get_my_workspace_owner()`, `is_workspace_manager()`, `is_contact_visible()`,
`is_appointment_visible()`, `is_super_admin()`.

## Estado verificado (2026-07-21)

Testado empiricamente com a chave anônima (sem login) via `GET /rest/v1/<tabela>`:

| Tabela | Anon consegue ler? | OK? |
|---|---|---|
| contacts, messages, appointments, services | ❌ `[]` | ✅ protegido |
| whatsapp_instances, kanban_columns, professionals | ❌ `[]` | ✅ protegido |
| user_roles, workspace_members, ai_usage_logs | ❌ `[]` | ✅ protegido |
| **global_settings** (guarda a chave do Gemini) | ❌ `[]` | ✅ **chave segura** |
| **profiles** | ⚠️ vazava 1 linha | 🔧 **corrigido** — ver abaixo |

## Correções aplicadas

### 2026-07-21 — Vazamento de `profiles` via chave anônima
**Problema:** a policy `public_can_read_booking_profile` (do recurso "link de
agendamento público", já removido do código) permitia que a chave anônima lesse
`profiles` com `booking_enabled=true`, expondo `business_name`, `email` e
`ai_custom_prompt` sem login. A migration de remoção
(`20260614000000_drop_public_booking_link.sql`) nunca foi aplicada em produção.
**Correção:** `supabase/manual/20260721000000_fix_profiles_anon_leak.sql` —
remove a policy, remove qualquer outra policy `anon` em profiles, e limpa as
colunas mortas do booking link.

## Dívidas de segurança conhecidas (a fazer)
- **Migrations manuais** → produção pode divergir do repo. Versionar o schema real.
- **Sem monitoramento de erro** (Sentry/etc.) → falhas passam despercebidas.
- **Chaves no `.env`** → `.env` já foi removido do git e está no `.gitignore`.
  A chave anônima que vazou no histórico é pública por design (baixa severidade);
  a service-role nunca esteve no git.
- **Logs com PII** → alguns `console.log` imprimem telefones/mensagens. Revisar.
