## Problema

A mensagem de teste não apareceu em "Aguardando" porque o webhook configurado na Evolution API está apontando para `https://localhost:8080/...`. Confirmei consultando `/webhook/find/zapflow_main` no Railway:

```
url: https://localhost:8080/api/public/evolution/3b0f3e4e-f8ec-4fcf-b593-1b74ee2bd313
```

A função `publicBaseUrl()` em `src/lib/evolution.functions.ts` faz fallback para `getRequestHost()`, que durante a execução server-side dentro do Worker retornou `localhost:8080`. Resultado: a Evolution tenta entregar o evento `messages.upsert` para localhost e nada chega no app.

## Correção

### 1. `src/lib/evolution.functions.ts` — robustecer `publicBaseUrl()`

- Ler também `x-forwarded-host` e `x-forwarded-proto` do request (é o host público real atrás do proxy do Worker).
- Rejeitar valores inválidos (`localhost`, `127.0.0.1`, IPs internos).
- Manter `PUBLIC_APP_URL` como override prioritário.

### 2. Adicionar secret `PUBLIC_APP_URL`

Definir como `https://github-vercel-bridge.lovable.app` (URL publicada). Isso garante que mesmo que a detecção via header falhe, o webhook seja sempre registrado com URL pública correta.

### 3. Re-registrar o webhook

Após o fix, o usuário clica em **Reconectar** uma vez em Configurações → WhatsApp. O `configureEvolutionInstance` vai chamar `setWebhook` com a URL correta e sobrescrever o `localhost:8080` no Evolution.

Não é preciso reescanear o QR code — a sessão WhatsApp continua conectada, só a URL do webhook é atualizada.

## Verificação

1. Após reconectar, consultar `/webhook/find/zapflow_main` e confirmar que a URL agora é `https://github-vercel-bridge.lovable.app/api/public/evolution/...`.
2. Enviar uma mensagem WhatsApp de teste para o número conectado.
3. A conversa deve aparecer na coluna **Aguardando** do Inbox em poucos segundos.

## Detalhes técnicos

```ts
function publicBaseUrl(): string {
  const fromEnv =
    process.env.PUBLIC_APP_URL ||
    process.env.APP_PUBLIC_URL ||
    process.env.VITE_PUBLIC_APP_URL;
  if (fromEnv) return fromEnv.replace(/\/$/, "");

  try {
    const req = getRequest();
    const fwdHost = req.headers.get("x-forwarded-host");
    const fwdProto = req.headers.get("x-forwarded-proto") ?? "https";
    const host = fwdHost ?? getRequestHost();
    if (host && !/^localhost|^127\.|^0\.0\.0\.0/i.test(host)) {
      return `${fwdProto}://${host}`;
    }
  } catch {}
  return "";
}
```

Se `publicBaseUrl()` retornar string vazia, lançar erro claro em `connectInstance` em vez de registrar webhook quebrado silenciosamente.
