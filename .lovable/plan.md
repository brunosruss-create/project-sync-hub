## Diagnóstico (com base nos logs reais)

Os logs do servidor às 21:48 (Brasília) mostram **DUAS chamadas paralelas** da IA para a mesma mensagem do usuário, separadas por 69ms:

```
00:48:36.873 [ai hours] check {source:"business_hours"}     ← passou (dentro do horário)
00:48:36.804 [ai hours] check {source:"business_hours"}     ← rejeitou
00:48:36.804 [ai hours] fora do intervalo {nowMin:1308, startMin:480, endMin:1080}
```

Isso explica exatamente o print: **uma resposta "Olá! Como posso te ajudar hoje?" + uma resposta "fora do horário"**, ambas no mesmo minuto. O Evolution está reentregando o mesmo webhook em paralelo, e o dedup atual (que só grava em `ai_usage_logs` *depois* de processar) deixa as duas chamadas passarem pela janela de corrida.

Além disso, os logs revelam o segundo problema: o `business_hours` salvo para sexta é **8:00–18:00** (`endMin:1080`), não 23:00 como o usuário acredita ter configurado. Por isso às 21:48 a IA responde "fora do horário" — o dado salvo no banco realmente diz que está fechado.

Resumindo, são **dois bugs diferentes** que estavam sendo tratados como um:

1. **Race condition no webhook** → produz a resposta dupla (uma normal + uma "fora do horário").
2. **Horário salvo errado** → produz a mensagem "fora do horário" mesmo às 21h, porque `business_hours.fri.end = "18:00"` no banco.

## Plano de correção

### 1. Eliminar a race do webhook (`src/routes/api/public/evolution.$instanceId.ts`)

- Antes de chamar `runAiResponse`, fazer um **insert atômico** num registro de lock por `whatsapp_message_id` (na própria tabela `ai_usage_logs` com action `"lock"` ou numa tabela `ai_message_locks` com unique constraint em `(workspace_owner_id, wa_message_id)`).
- Se o insert falhar por conflito de unicidade, **abortar a iteração** sem chamar a IA nem enviar texto.
- Garante que duas entregas paralelas do mesmo `m.key.id` resultem em apenas UMA resposta.

### 2. Conferir o que a tela de Configurações realmente está salvando

- Abrir `src/routes/_authenticated.settings.workspace.tsx` e verificar o payload enviado em `business_hours` no save.
- Comparar com o que está no banco (`profiles.business_hours` do owner).
- Se a UI mostra 23:00 mas o banco tem 18:00, o bug está no save (provavelmente no parser do input de texto `HH:mm` que substituiu o `<input type="time">` — pode estar lendo um state desatualizado, ou só salvando alguns dias).
- Corrigir o save para que o valor exibido na UI seja exatamente o gravado.

### 3. Logar a fonte e o conteúdo dos horários efetivos

- No `[ai hours] check` adicionar `effectiveHours` resumido (ex: `{fri:"08:00-23:00"}`) para confirmar visualmente nos logs que o que a IA leu bate com o que a UI mostra.
- Sem isso, qualquer divergência futura volta a ser invisível.

### 4. Validação

- Enviar uma mensagem e confirmar nos logs apenas **um** `[ai hours] check` por mensagem.
- Conferir no banco que `business_hours.fri.end` é `"23:00"` depois de salvar 23:00 na tela.
- Confirmar que às 22h o WhatsApp recebe **apenas uma** resposta da IA, e que ela não é "fora do horário".

### O que NÃO será mexido

- Nada de layout, formato 24h dos inputs, design, ou outras telas.
- Apenas: lock anti-duplicata, save do `business_hours` e logs de diagnóstico.
