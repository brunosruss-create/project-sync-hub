## Diagnóstico

Quando um segundo usuário (outro workspace) conecta o WhatsApp, a conexão acontece (status `connected`, foto carregada via `fetchInstances`/`profilePicUrl`), mas **nenhuma mensagem inbound chega** porque o **webhook não dispara com sucesso** para a linha desse usuário.

Há três causas concorrentes em `src/lib/evolution.functions.ts` + handler em `src/routes/api/public/evolution.$instanceId.ts`:

### 1. `webhook_secret` fica NULL para novos usuários (causa principal)

- `getOrCreateRow()` (linha 32–47) insere a linha com apenas `instance_name`, `owner_user_id`, `status`. Não gera `webhook_secret`.
- A tabela `whatsapp_instances` não possui `DEFAULT` para `webhook_secret` em migration versionada (a primeira instância — a sua — provavelmente teve o secret semeado manualmente / por SQL antigo). Para novas linhas o valor fica **NULL**.
- Em `connectInstance` (linha 146): `const webhookSecret = (row.webhook_secret as string | null) ?? "";` → registra o webhook na Evolution com header `x-webhook-secret: ""` (string vazia).
- Quando a Evolution faz POST no nosso endpoint, o handler valida assim:

  ```ts
  const secret = request.headers.get("x-webhook-secret") ?? "";
  if (!row || !secret || secret !== row.webhook_secret || ...) return 403;
  ```

  Mesmo que `secret === row.webhook_secret` (ambos `""`/null), o `!secret` curto-circuita → **403 Forbidden em todos os webhooks** → 0 mensagens entram. Por isso `connection.update` "open" também não chega → o status de "connected" que você vê foi setado pelo `refreshInstanceStatus` (polling com `connectionState`/`fetchInstances`), não pelo webhook. Foto idem (vem do `fetchInstances` direto).

### 2. `createInstance` no fluxo `connectInstance` não passa o bloco `webhook`

- Linhas 174–179 chamam `evo.createInstance({ instanceName, integration, qrcode })` **sem** `webhook`.
- O registro depende exclusivamente do `ensureWebhook()` posterior (linha 229), que é best-effort com `try/catch warn` — silencia falhas. Se ele falhar uma vez, o webhook simplesmente nunca existe na Evolution para esse usuário.

### 3. `publicBaseUrl()` pode retornar vazio

- Linhas 15–30: depende de `PUBLIC_APP_URL` (env) ou de detectar `x-forwarded-host`/`getRequestHost()`. Em alguns contextos de execução do Worker ele retorna `""`.
- Quando vazio, `webhookUrl` em `connectInstance` (linha 145) vira `null`, o `if (webhookUrl)` na linha 227 é falso → `ensureWebhook` **nunca é chamado** → webhook nunca registrado.

A combinação de (2) + (3) explica por que para o usuário 2 o webhook pode literalmente nunca ter sido registrado na Evolution; (1) explica por que, mesmo registrado, todo POST volta 403.

## Plano de correção (mínimo, sem mexer em kanban/chat/dashboard)

### A. Garantir `webhook_secret` sempre populado (`src/lib/evolution.functions.ts`)

1. Em `getOrCreateRow`: ao inserir, gerar `webhook_secret: crypto.randomUUID()` e incluir no insert.
2. Logo após carregar `existing`/`created`, se `row.webhook_secret` ainda for falsy, fazer `update` setando um novo UUID e usar esse valor adiante. Garante backfill para linhas pré-existentes sem precisar de SQL manual.

### B. Endurecer o handler (`src/routes/api/public/evolution.$instanceId.ts`)

- Manter rejeição quando `!secret` ou mismatch (já é o comportamento), mas adicionar log explícito do motivo (`"missing secret header"` vs `"secret mismatch"`) para facilitar diagnóstico futuro nos worker logs.
- Não muda lógica funcional.

### C. Registrar o webhook no `createInstance` também (`connectInstance`)

- Restaurar o bloco `webhook` no `evo.createInstance({...})` dentro de `connectInstance`, passando `url`, `headers: { "x-webhook-secret": webhookSecret }`, `events: WEBHOOK_EVENTS`, `webhookByEvents: false`, `webhookBase64: true`. Isso faz a Evolution já nascer com o webhook, sem depender do `ensureWebhook` posterior.

### D. Tornar `publicBaseUrl()` confiável

- Acrescentar fallback final: se nada resolver, usar a URL pública estável `https://project--e2215eb7-4cbb-4afc-8773-9f93425b90f1.lovable.app` (do `project_urls`). Isso garante que `webhookUrl` nunca vire `null` em produção.
- Manter prioridade para `PUBLIC_APP_URL` se o usuário tiver definido.

### E. Falhas do webhook devem ser visíveis (mas não derrubar o QR)

- Em `ensureWebhook`, manter `try/catch` mas, no `catch` não-auth, gravar `webhook_last_error` em uma coluna opcional? **Pular** — fora de escopo. Apenas melhorar o `console.warn` para incluir nome da instância e URL para conseguirmos rastrear nos logs.

## Validação

1. Logar com a segunda conta, ir em Settings → WhatsApp → conectar/escanear QR.
2. Após `connected`, verificar nos worker logs (`[evolution]`) que recebeu `messages.upsert` (não 403).
3. Enviar uma mensagem real para o número conectado → deve aparecer no Kanban em tempo real.
4. Confirmar que a primeira conta (já funcionando) **continua** recebendo (o backfill do secret só roda se for null; não sobrescreve o existente).

## O que NÃO muda

- Webhook handler (lógica), kanban, drag-and-drop, chat, dashboard, agendamentos, contatos, serviços, settings UI.
- Schema do banco (sem migration nova; o backfill é via update do servidor com service-role).
