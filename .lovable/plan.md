## Objetivo
Mensagens recebidas no WhatsApp precisam aparecer no Inbox em produção e em preview. WhatsApp já conecta; o problema é entre o webhook da Evolution e o que o Inbox enxerga.

## Causa provável (em ordem)
1. **Inbox mascara falha**: `_authenticated.inbox.tsx` cai silenciosamente para `MOCK_CONTACTS` quando a query do Supabase erra ou retorna vazio. Isso esconde 100% dos problemas de RLS e de webhook.
2. **Webhook insere sem `owner_user_id`** em `contacts` e `messages`. Se a RLS de SELECT exigir `owner_user_id = auth.uid()`, o usuário nunca vê as linhas (apesar do `supabaseAdmin` conseguir gravar).
3. **`PUBLIC_APP_URL` ambíguo**: o webhook gravado na Evolution é o do ambiente onde você clicou "Conectar". Se conectou no preview, produção não recebe nada (e vice-versa). Não temos como inspecionar facilmente qual URL está registrada lá.

## Mudanças propostas

### 1. Parar de esconder erro no Inbox (frontend)
Em `src/routes/_authenticated.inbox.tsx`:
- Mostrar estado vazio real quando o Supabase responder OK com 0 linhas (não cair pro mock).
- Logar `error.message` no console e exibir banner discreto se a query falhar (RLS, tabela ausente, etc.).
- Manter `MOCK_CONTACTS` apenas em modo desenvolvimento sem sessão, não como fallback de erro silencioso.

### 2. Vincular contato e mensagem ao dono da instância (webhook)
Em `src/routes/api/public/evolution.$instanceId.ts`:
- Já temos `row` da tabela `whatsapp_instances` com `owner_user_id`. Carregar esse campo também.
- Ao fazer upsert de `contacts`, gravar `owner_user_id = row.owner_user_id`.
- Buscar contato existente filtrando por `phone` **E** `owner_user_id` (multiusuário correto).
- Ao inserir em `messages`, gravar `owner_user_id` também (se a coluna existir; se não existir, criar via migration).

### 3. Garantir colunas + RLS coerentes (Supabase)
Verificar / criar via migration:
- `contacts.owner_user_id uuid references auth.users(id)` (se ainda não existir).
- `messages.owner_user_id uuid references auth.users(id)` (se ainda não existir).
- Policies SELECT/UPDATE: `auth.uid() = owner_user_id`.
- Backfill para linhas órfãs já gravadas (atribuir ao único `whatsapp_instances.owner_user_id` que tiver `phone` correspondente, ou apagar se não houver).

### 4. Tornar `PUBLIC_APP_URL` previsível
Em `src/lib/evolution.functions.ts`:
- Em `connectInstance`, gravar a `webhook_url` resolvida em `whatsapp_instances` (nova coluna `webhook_url text`) para o usuário ver em qual ambiente o WhatsApp está apontando.
- Na tela de WhatsApp settings, exibir essa URL e um botão "Re-registrar webhook neste ambiente" que chama `setWebhook` sem refazer o QR — corrige produção sem precisar reescanear.

### 5. Verificação pós-deploy
- Mandar uma mensagem do celular e abrir os logs do server-fn / route handler para confirmar:
  - chegou em `/api/public/evolution/{id}`,
  - passou na verificação de `x-webhook-secret`,
  - identificou o evento como `messages.upsert`,
  - inseriu `contacts` + `messages` com `owner_user_id`.
- Se algum passo falhar, o log do handler já mostra (`console.log("[evolution]", ...)`).

## Arquivos afetados
- `src/routes/_authenticated.inbox.tsx` — remover fallback silencioso, mostrar erro real.
- `src/routes/api/public/evolution.$instanceId.ts` — gravar `owner_user_id` em contacts/messages.
- `src/lib/evolution.functions.ts` — guardar `webhook_url` da instância + endpoint para re-registrar webhook.
- `src/routes/_authenticated.settings.whatsapp.tsx` — mostrar URL do webhook + botão de re-registrar.
- Migration Supabase — colunas `owner_user_id` em `contacts`/`messages` (se faltarem) + policies + backfill.

## Fora de escopo
- Mudanças no fluxo de QR / auth (já estão funcionando).
- Mensagens de grupo, mídia, status read (manter como está).
