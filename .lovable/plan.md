## Problema

A mensagem inicial enviada no primeiro contato é:

> "Olá! Bem-vindo(a) ao {{negocio}}. Em instantes um atendente irá responder."

Isso é incoerente quando a IA está ligada porque:

1. Promete um **atendente humano** ("em instantes vai responder") — mas quem responde é a IA.
2. Logo em seguida a IA dispara a própria apresentação ("Olá! Eu sou a Sofia, do …. Como posso ajudar?"), gerando **duas saudações duplicadas** e contraditórias.
3. Ignora completamente os toggles já existentes no painel da IA ("A IA se apresenta pelo nome?" e "A IA menciona o nome do negócio?").

A causa: a mensagem de boas-vindas é um template estático em `src/lib/message-defaults.ts` (e seed em `20260520000000_business_and_ai_timezone.sql`), enviada pelo webhook (`src/routes/api/public/evolution.$instanceId.ts` linhas 407–462) **sempre** que `welcome_message_enabled = true`, sem olhar se a IA está ativa.

## Correção

### 1. Suprimir o welcome estático quando a IA estiver ativa

Em `src/routes/api/public/evolution.$instanceId.ts`, ler também `ai_enabled` do profile e só disparar o welcome estático quando `ai_enabled = false`. Quando a IA está ligada, ela já cumpre o papel da saudação (com nome do assistente + nome do negócio + pergunta de abertura), de forma consistente com os toggles do painel.

Comportamento resultante:

```text
AI ligada  → cliente recebe APENAS a saudação gerada pela IA
AI desligada → cliente recebe o welcome estático (faz sentido prometer atendente humano)
```

### 2. Trocar o texto default do welcome estático

Mesmo no cenário "IA desligada", a frase atual ("Em instantes um atendente irá responder") soa fria e não pergunta nada. Trocar o default para algo neutro e acolhedor, que funcione com ou sem IA:

> "Olá{{cliente_virgula}} Recebemos sua mensagem no {{negocio}} e já vamos te atender. 😊"

Arquivos:
- `src/lib/message-defaults.ts` — atualizar o campo `default` de `welcome`.
- `supabase/manual/20260520000000_…sql` — esse seed só roda em instalações novas; não criar nova migration (usuários existentes que já personalizaram a mensagem não são afetados; quem está no default antigo continua até editar — aceitável).

### 3. UI: aviso explícito no painel da mensagem de Boas-vindas

Em `src/routes/_authenticated.settings.messages.tsx`, na seção da mensagem `welcome`, adicionar um aviso 💡:

> "Quando a IA está ativa, esta mensagem **não é enviada** — a própria IA faz a saudação usando o nome do assistente e do negócio configurados em Agente IA."

Isso evita que o usuário fique configurando uma mensagem que nunca dispara.

## Fora de escopo

- Não mexer no prompt da IA (já se apresenta corretamente).
- Não mexer nas outras mensagens transacionais (transfer, booking_*).
- Não criar nova coluna no banco.

## Arquivos afetados

1. `src/routes/api/public/evolution.$instanceId.ts` — gate `ai_enabled` no envio do welcome.
2. `src/lib/message-defaults.ts` — novo texto default.
3. `src/routes/_authenticated.settings.messages.tsx` — aviso na UI.