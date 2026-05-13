## Diagnóstico (causa raiz encontrada nos logs)

Os logs do worker mostram **exatamente** o problema:

```
[evolution upsert] select contact: column contacts.owner_user_id does not exist
[evolution upsert] insert contact: Could not find the 'owner_user_id' column
                   of 'contacts' in the schema cache (PGRST204)
```

Ou seja: o webhook **está chegando** (POST 200, log `[evolution] messages.upsert` registrado), mas a inserção em `contacts`/`messages` falha porque a coluna `owner_user_id` **não existe no Supabase**.

A migration `supabase/migrations/20260513133500_whatsapp_owner_rls.sql` (que adiciona `owner_user_id` em `contacts` e `messages` + RLS por dono) está no repositório, mas **nunca foi aplicada** no banco. Por isso nada aparece na Inbox e o Kanban fica vazio — não é CSS, não é Realtime, é schema.

> Obs.: você está certo, o projeto usa **Supabase direto** (não Lovable Cloud). Nada do plano abaixo mexe em Cloud — é só rodar SQL no SQL Editor do Supabase do projeto e nenhum código de QR/conexão é tocado.

## Plano de correção

### 1. Aplicar a migration de `owner_user_id` no Supabase (SQL Editor)
Rodar **exatamente** o conteúdo de `supabase/migrations/20260513133500_whatsapp_owner_rls.sql`. Ele já é idempotente (`add column if not exists`, `drop policy if exists`, `create policy ...`). Cria:
- `contacts.owner_user_id uuid → auth.users(id)`
- `messages.owner_user_id uuid → auth.users(id)`
- `whatsapp_instances.webhook_url text`
- índices por `owner_user_id`
- RLS: cada usuário só vê/edita seus próprios `contacts` e `messages`

### 2. Forçar reload do schema do PostgREST
Logo após a migration, no SQL Editor:
```sql
notify pgrst, 'reload schema';
```
Sem isto o erro `PGRST204` (schema cache) continua mesmo após criar a coluna.

### 3. Backfill (opcional, recomendado)
Se já existem `contacts`/`messages` antigos sem dono, prendê-los ao dono da instância para não “sumirem” depois do RLS:
```sql
update public.contacts c set owner_user_id = wi.owner_user_id
  from public.whatsapp_instances wi
 where c.owner_user_id is null and wi.owner_user_id is not null;
update public.messages m set owner_user_id = c.owner_user_id
  from public.contacts c
 where m.contact_id = c.id and m.owner_user_id is null;
```

### 4. Validação
1. Mandar mensagem de teste do celular para `5511914825892`.
2. Conferir logs do worker — devem aparecer **só** `[evolution] messages.upsert` + POST 200, **sem** `[evolution upsert] ... error`.
3. Abrir `/inbox` — o contato deve cair na coluna **Aguardando** (Realtime já está ativo).
4. Se ainda não aparecer no front (mas o insert agora der OK), aí sim olhamos Realtime/RLS de SELECT — mas a previsão é que resolva no passo 1+2.

### O que **não** muda
- Fluxo de QR Code, `connect`, `fetchInstances`, `evolution.functions.ts`.
- Webhook handler (`evolution.$instanceId.ts`) — os logs já provaram que ele funciona.
- UI da Inbox / Kanban (já restauramos as 4 colunas vazias).
- Nenhuma dependência de Lovable Cloud.

### Detalhes técnicos
- O webhook usa `supabaseAdmin` (service role) que **bypassa RLS**, então o insert depende **só** da coluna existir. Por isso a migration sozinha já destrava o webhook.
- O front (`/inbox`) usa o cliente autenticado, então o `select` depende do RLS criado pela mesma migration — daí ela resolver os dois lados de uma vez.
- A migration é idempotente: pode rodar de novo sem quebrar nada já existente.