## Mudanças

### 1. Checks estilo WhatsApp em `MessageBubble` (`src/features/inbox/conversation-panel.tsx`)

Hoje toda mensagem outbound mostra `<CheckCheck>` (dois checks), só mudando a cor quando `status === "read"`. Trocar por:

- `status === "sent"` → `<Check size={13}>` (1 check cinza) — enviado mas não entregue
- `status === "delivered"` → `<CheckCheck size={13}>` cinza — entregue ao aparelho
- `status === "read"` → `<CheckCheck size={13}>` azul (`#34B7F1` / token `--info` se existir, senão hex direto pra combinar com WhatsApp)

Aplicar nos dois locais que renderizam o rodapé da bolha (bolha normal ~linha 689 e bolha de áudio ~linha 604). `Check` já precisa ser adicionado no import do `lucide-react`.

### 2. Hora real (HH:MM) no rodapé da mensagem

Atualmente o rodapé chama `formatRelative(m.created_at)` → "há 23min". Trocar **somente dentro de `MessageBubble`** por uma função local que sempre devolve a hora:

```
date.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })
```

Aplicar nos dois rodapés (texto/mídia + áudio).

`formatRelative` continua sendo usado no card de contato (lista lateral), portanto **não** alterar a função em `data.ts`.

### 3. Sincronizar status real do WhatsApp (webhook)

Sem isso o status nunca passa de `"sent"` e os checks ficam estáticos. Em `src/routes/api/public/evolution.$instanceId.ts`, adicionar um branch para `event === "messages.update"`:

- Para cada item, ler `key.id` (id da Evolution) e `status` (`DELIVERY_ACK` → `"delivered"`, `READ` / `PLAYED` → `"read"`).
- Atualizar `messages` por `whatsapp_message_id = key.id` setando o novo status.
- Só "subir" status (não regredir read → delivered).

Para isso funcionar, também guardar o id retornado pela Evolution ao enviar:

- Em `sendWhatsAppMessage` / `sendWhatsAppMedia` / `sendWhatsAppAudio` (`src/lib/evolution.functions.ts`), após o `evo.send...`, extrair `r?.key?.id` e gravar na coluna `whatsapp_message_id` no insert da `messages`.
- Se a coluna não existir, criar via migração SQL (`alter table messages add column whatsapp_message_id text`, mais index único parcial). Confirmar com o usuário antes de rodar SQL — ou ele roda manualmente como das últimas vezes.

A subscription realtime já refaz o mapeamento on `UPDATE`, então a UI atualiza sozinha.

## Arquivos tocados

- `src/features/inbox/conversation-panel.tsx` — ícones de check + hora HH:MM
- `src/routes/api/public/evolution.$instanceId.ts` — handler `messages.update`
- `src/lib/evolution.functions.ts` — salvar `whatsapp_message_id` no envio
- SQL manual (você roda no Supabase SQL Editor): coluna `whatsapp_message_id` em `messages`

## Pergunta antes de implementar

A parte 3 (status real vindo do WhatsApp) exige rodar 1 SQL no Supabase. Quer que eu inclua tudo de uma vez ou prefere só as mudanças visuais (1 e 2) agora e o sync de status numa próxima rodada?
