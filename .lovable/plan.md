## Objetivo
Trazer ao painel lateral do kanban dois detalhes que já existem no modo chat:
1. **Badge "IA"** dentro das bolhas enviadas automaticamente pelo agente
2. **Separadores de data** ("hoje", "ontem", dia da semana, dd/mm/aaaa) entre grupos de mensagens

## Arquivo único alterado
`src/features/inbox/conversation-panel.tsx` — adições pontuais, sem alterar lógica de envio, kanban, RLS, ou qualquer outro arquivo.

## Mudanças

### 1. Suporte ao campo `is_ai`
- Em `interface Message` (linha 51), adicionar `is_ai?: boolean`.
- Em `.select(...)` (linha 182), incluir `is_ai` na lista de colunas.
- Nos dois mapeamentos (load inicial linha ~194 e realtime INSERT linha ~231), adicionar `is_ai: !!r.is_ai`.

### 2. Badge "IA" no `MessageBubble` do kanban
Dentro da bolha de texto/mídia (a partir da linha 862, logo após `<MessageChevron .../>` e `<QuotedPreview .../>`), renderizar o mesmo badge usado em `src/components/chat/MessageBubble.tsx` quando `m.is_ai && isMe`:

```tsx
{m.is_ai && isMe && (
  <div className="inline-flex items-center" style={{
    gap: 4, fontSize: 10, fontWeight: 600,
    background: "color-mix(in oklab, var(--brand-400) 20%, transparent)",
    color: "var(--brand-400)",
    padding: "1px 6px", borderRadius: 999,
    marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.04em",
  }}>
    <Bot size={10} /> IA
  </div>
)}
```

Replicar o mesmo bloco no ramo de áudio (linha ~828, antes do `<AudioPlayerWithMe />`) para que áudios da IA também recebam o badge.

Importar `Bot` de `lucide-react` (já há vários ícones importados do mesmo módulo no topo do arquivo).

### 3. Separadores de data
- Importar o componente já pronto: `import { DateSeparator } from "@/components/chat/DateSeparator";`
- Adicionar helper local `sameDay(a, b)` (idêntico ao de `MessageThread.tsx`).
- No render (linha 578), substituir `messages.map((m) => <MessageBubble .../>)` por uma versão que percorre `messages`, intercalando `<DateSeparator date=... />` sempre que o dia muda em relação à mensagem anterior. As props de `MessageBubble` permanecem exatamente iguais.

## Não tocado
- Coluna kanban, drag-drop, abas Contato/Serviços/Histórico
- `MessageInput`, envio, IA backend, webhooks
- Estilos/cores das bolhas (mantém o esquema atual)
- Modo chat, sidebar, qualquer outro componente ou rota

## Validação visual
Abrir uma conversa do kanban que tenha mensagens da IA: o badge "IA" deve aparecer no topo das bolhas enviadas automaticamente. Mensagens de dias diferentes devem ficar separadas por uma faixa horizontal com o rótulo do dia, igual ao modo chat.