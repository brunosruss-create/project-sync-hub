# IA entende áudios do WhatsApp

Hoje a IA só é disparada quando `mediaType === "text"` (linha 406 de `evolution.$instanceId.ts`). Áudios entram no banco como `message_type: "audio"` com `media_url`, mas a IA nunca é chamada — o cliente fica sem resposta.

O Gemini (já em uso via `generativelanguage.googleapis.com`) aceita áudio nativamente como `inlineData` (base64 + mimeType). Não precisa Whisper, nem STT separado, nem mudar provider.

## Mudanças

### 1. `src/routes/api/public/evolution.$instanceId.ts` (gate do áudio)

Logo após inserir a mensagem `audio` no banco, adicionar um segundo branch que dispara a IA quando:
- `mediaType === "audio"`
- `mediaUrl` existe
- `!humanInControl`

Esse branch:
- Baixa o áudio (`fetch(mediaUrl)` → `arrayBuffer` → base64).
- Limita tamanho (~15MB) — se exceder, manda fallback de texto pedindo pra reenviar/escrever.
- Monta o `conversation_history` igual ao branch de texto.
- Chama `runAiResponse({ ..., message: caption || "[áudio]", audio: { data, mimeType } })`.
- Envia a resposta com `evo.sendText` exatamente como hoje.

### 2. `src/lib/ai-respond.server.ts` (passar áudio ao Gemini)

- Adicionar campo opcional em `RunAiInput`:
  ```ts
  audio?: { data: string; mimeType: string };
  ```
- Na montagem de `contents` (linha ~1010), quando `data.audio` existir, a última `parts` do user vira:
  ```ts
  parts: [
    { inlineData: { mimeType: data.audio.mimeType, data: data.audio.data } },
    { text: data.message || "Responda ao áudio do cliente." },
  ]
  ```
- Resto do fluxo (system prompt, booking layer, parsing de `APPOINTMENT_JSON` etc.) não muda — Gemini retorna texto normal.

### 3. `src/lib/ai-respond.functions.ts` (schema Zod)

Adicionar ao validator:
```ts
audio: z.object({
  data: z.string().min(1),
  mimeType: z.string().min(1).max(100),
}).optional()
```

## Garantias anti-regressão

- Fluxo de texto **intocado** — novo branch é aditivo.
- `humanInControl`, welcome message, gate de IA desligada, working hours — tudo reaproveitado.
- Toggles existentes (booking, reschedule, cancel) continuam funcionando porque o pós-processamento de `APPOINTMENT_JSON` / `RESCHEDULE_JSON` / `CANCEL_JSON` roda sobre o `text` retornado, independente do input ser áudio ou texto.
- Modelo já configurado (`gemini_model`) — sem mudança de model picker. Flash Lite, Flash e Pro 2.5/3.x aceitam áudio.

## Formatos aceitos

WhatsApp envia `audio/ogg; codecs=opus` (PTT). Gemini aceita `audio/ogg`, `audio/mp3`, `audio/wav`, `audio/aac`, `audio/flac`, `audio/aiff`. Vou normalizar o mimeType vindo do banco (`media_mime`) para o que Gemini reconhece — `audio/ogg; codecs=opus` → `audio/ogg`.

## QA

1. Mandar áudio curto ("oi, quero marcar amanhã 14h") → IA responde + (se booking ligado) cria appointment.
2. Mandar áudio só com saudação → IA saúda normalmente.
3. Mandar áudio > 15MB → fallback de texto.
4. Mandar texto depois → fluxo antigo continua igual (regressão).
5. Conferir `server-function-logs` por erro de tamanho/mime no Gemini.
