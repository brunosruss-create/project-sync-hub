## Objetivo
Bolhas de mensagem enviada no modo chat devem ter exatamente a mesma cor suave do kanban (verde claro com texto escuro), em vez do verde forte atual.

## Arquivo único alterado
`src/components/chat/MessageBubble.tsx` — somente CSS inline das bolhas outbound.

## Mudanças (copiando valores exatos do kanban — `conversation-panel.tsx` linhas 859-875)

1. **Fundo e borda outbound**
   - De: `bg = "var(--brand-400)"`, sem borda
   - Para: `bg = "color-mix(in oklab, var(--brand-400) 15%, var(--bg-surface))"`, `border = "1px solid color-mix(in oklab, var(--brand-400) 30%, transparent)"`

2. **Cor do texto outbound**
   - De: `#fff`
   - Para: `var(--text-primary)` (igual ao kanban)

3. **Timestamp outbound** (legibilidade no novo fundo claro)
   - De: `rgba(255,255,255,0.8)`
   - Para: `var(--text-muted)`

4. **StatusTicks outbound** (ticks de enviado/entregue/lido)
   - sent/delivered: `var(--text-muted)`
   - read: `var(--brand-400)`

5. **Badge "IA"** (aparece dentro de bolhas outbound)
   - De: fundo `rgba(255,255,255,0.2)` herdando `color: #fff`
   - Para: fundo `color-mix(in oklab, var(--brand-400) 20%, transparent)`, texto `var(--brand-400)`

## Não tocado
- Bolhas inbound (recebidas)
- `conversation-panel.tsx` (kanban)
- Qualquer outro componente, rota, hook, lógica
- Player de áudio, anexos, imagens — apenas as cores do container outbound

## Validação visual
Após aplicar, comparar `/conversations-chat` com o painel lateral do kanban: as bolhas enviadas devem ter fundo, borda, texto e ticks idênticos.