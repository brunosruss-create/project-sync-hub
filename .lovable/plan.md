## Problema

Os webhooks do Evolution chegam com status 200 (confirmado nos logs do worker), mas as mensagens não aparecem em **Aguardando**. O log de "logado no Windows vs Chrome" é apenas como o WhatsApp identifica a sessão Web — **não** é a causa, pode ignorar.

A causa provável está no parser do evento em `src/routes/api/public/evolution.$instanceId.ts`:

```ts
const event = String(payload?.event ?? "").toLowerCase();
...
} else if (event === "messages.upsert") {
```

O Evolution API, dependendo da versão/configuração de `webhook_by_events`, envia o nome do evento em formatos diferentes:
- `messages.upsert` (ponto, minúsculo) — formato "novo"
- `MESSAGES_UPSERT` → após `toLowerCase()` vira `messages_upsert` (underscore) — formato "clássico"

Hoje só o primeiro casa. Se sua instância manda o segundo, o handler retorna 200 sem inserir nada — exatamente o sintoma.

Além disso, hoje não há log nenhum quando o evento não bate, então é "silencioso".

## Plano

1. **Normalizar o nome do evento** no handler do webhook: aceitar tanto `messages.upsert` quanto `messages_upsert` (e idem para `connection.update` / `connection_update`, `qrcode.updated` / `qrcode_updated`). Implementação: substituir `.` por `_` (ou vice-versa) antes do `switch`.

2. **Adicionar logs de diagnóstico** (temporariamente) no início do handler:
   - `console.log('[evolution]', event, 'keys:', Object.keys(payload ?? {}))`
   - Quando cair em "evento ignorado", logar `event` para sabermos exatamente o que veio.

3. **Tratar variações do payload de mensagem**: alguns formatos do Evolution colocam a mensagem direto em `data` (objeto único) em vez de `data.messages[]`. O código já cobre os dois, mas vou validar que campos como `key.remoteJid` existam mesmo quando vem como `data.key.remoteJid`.

4. **Verificar pós-deploy**: após aplicar, você manda uma mensagem de teste e eu releio os logs do worker para confirmar qual é o `event` real e que o insert em `messages` aconteceu.

## Detalhes técnicos

- Arquivo único alterado: `src/routes/api/public/evolution.$instanceId.ts`.
- Sem mudança de schema, sem mudança de RLS, sem mudança no front.
- Logs serão removidos depois de confirmarmos o fluxo.

Aprovar para eu implementar?
