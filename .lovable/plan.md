## Diagnóstico

Confirmei via API:

```
webhook url: https://localhost:8080/api/public/evolution/3b0f3e4e-...
updatedAt:   2026-05-13T03:02:46Z   (não foi atualizado após o fix)
state:       open                    (WhatsApp conectado normalmente)
```

A instância WhatsApp está conectada, mas o webhook continua apontando para localhost. Por isso a Evolution recebe a mensagem do WhatsApp mas não consegue entregar para o ZapFlow → nada é gravado em `messages`/`contacts` → nada aparece em "Aguardando".

## Correção (2 passos)

### 1. Sobrescrever o webhook diretamente na Evolution agora

Em vez de pedir para o usuário clicar em Reconectar, vou usar `curl` para chamar `/webhook/set/zapflow_main` na Evolution API com a URL pública correta:

```
https://github-vercel-bridge.lovable.app/api/public/evolution/3b0f3e4e-f8ec-4fcf-b593-1b74ee2bd313
```

Isso atualiza o webhook sem precisar reescanear QR e sem precisar do usuário fazer nada.

### 2. Validar o fluxo end-to-end

Após setar o webhook:

a. Confirmar via `/webhook/find/zapflow_main` que a URL agora é a pública.

b. Simular um POST do webhook diretamente no endpoint `/api/public/evolution/{id}` com `x-webhook-secret` correto e payload de `messages.upsert`, para verificar se:
   - O endpoint responde 200
   - Um contato novo é criado em `contacts` com `kanban_column='waiting'`
   - Uma mensagem é inserida em `messages`

c. Se algum desses passos falhar, investigar (RLS no admin client não se aplica, então deve ser schema/coluna). Olhar logs com `server-function-logs`.

### 3. Pedir ao usuário para enviar mensagem de teste

Após validação, o usuário envia uma mensagem WhatsApp real e verifica se aparece em "Aguardando".

## Por que só editar o webhook resolve

- A instância no Evolution já existe e está `open`.
- O fix em `publicBaseUrl()` (commits anteriores) garante que **futuras** chamadas a Reconectar registrem a URL correta.
- Mas o webhook atual (registrado antes do fix) precisa ser sobrescrito uma vez. Pode ser feito via API direta sem tocar no app.
