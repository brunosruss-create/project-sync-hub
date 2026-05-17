## Objetivo

Adicionar uma nova view de chat estilo WhatsApp Web em `/conversations-chat`, reutilizando os mesmos dados, tabelas e server functions do kanban existente. Renomear o menu atual "Conversas" para "Kanban" e criar novo item "Conversas" apontando para a nova rota.

## Arquivos existentes tocados (apenas 1)

### `src/components/app-sidebar.tsx`
No array `ALL_ITEMS` (linhas 20–30):
- Renomear `{ label: "Conversas", to: "/inbox" }` → `{ label: "Kanban", to: "/inbox", icon: Columns3 }` (importar `Columns3` de `lucide-react`).
- Inserir **acima** do item Kanban: `{ label: "Conversas", to: "/conversations-chat", icon: MessageSquare, agentVisible: true }`.

Nada mais é alterado. Rota `/inbox`, componentes do kanban, `conversation-panel.tsx`, `composer.tsx`, hooks, evolution functions, webhooks e schema do banco permanecem intactos.

## Arquivos novos

### 1. `src/routes/_authenticated.conversations-chat.tsx`
Rota TanStack file-based seguindo o padrão de `_authenticated.inbox.tsx`:
```tsx
export const Route = createFileRoute("/_authenticated/conversations-chat")({
  component: ChatPage,
  validateSearch: zodValidator(z.object({ id: fallback(z.string(), "").optional() })),
});
```
Renderiza `<ChatView />` ocupando 100% da altura da área de conteúdo.

### 2. `src/components/chat/ChatView.tsx`
Container principal. Layout flex de 2 colunas (lista 360px à esquerda, conversa à direita), `overflow:hidden` no container, scroll interno em cada coluna. Em telas <768px alterna entre lista e conversa conforme `?id=` na URL (`useSearch`/`useNavigate` do TanStack Router).

Reutiliza para dados:
- `useWorkspaceOwnerId`, `useAuth`, `useRole` (mesmos hooks do kanban).
- Carrega contatos da mesma forma que `_authenticated.inbox.tsx` faz no `load()` (mesmo `SELECT_FULL` em `contacts`, mesmo realtime `INSERT/UPDATE` em `contacts` + `messages`, mesmo listener `zf:contact-updated`). A lógica de fetch é duplicada **somente** porque o pedido proíbe alterar `_authenticated.inbox.tsx` — não há alteração no contrato de dados.

Estado compartilhado: o evento `zf:contact-updated` já é emitido por `useContactActions`, então qualquer ação no chat reflete no kanban automaticamente (e vice-versa via realtime do Supabase).

### 3. `src/components/chat/ConversationList.tsx`
Coluna esquerda. Header com título "Conversas" + botão "+ Novo contato" (dispara `window.dispatchEvent(new CustomEvent("zf:new-contact"))` — listener já existente em `_authenticated.inbox.tsx` não cobre esta rota, então abre modal local; ver decisão abaixo). Campo de busca local (nome/telefone). Filtros "Todos | Meus | Sem atend." (mesma lógica do kanban — copiada localmente).

Lista ordenada por `lastMessageAt` desc, sem agrupar por status. Renderiza `ConversationListItem`.

### 4. `src/components/chat/ConversationListItem.tsx`
Reutiliza:
- `ContactAvatar` de `@/features/inbox/contact-avatar`.
- `formatRelative`, `formatPhone`, `formatMessagePreview` de `@/features/inbox/data`.

Exibe: avatar, nome, hora, preview, badge de não lidas (`unreadCount`), bolinha de status colorida (cor da coluna do kanban via `columns[c.kanban_column].color`). Item ativo: fundo `color-mix(in oklab, var(--brand-400) 10%, transparent)`.

### 5. `src/components/chat/MessageThread.tsx`
Área de mensagens (scroll interno). Faz o mesmo `select` em `messages` que `conversation-panel.tsx` faz (linhas 181–210) e o mesmo subscribe realtime (`INSERT`/`UPDATE` filtrado por `contact_id`).

- Scroll automático ao fim no mount; em nova mensagem, só faz auto-scroll se o usuário está perto do fim (distância < 100px).
- Insere `<DateSeparator />` entre mensagens de dias diferentes.
- Header da conversa: avatar + nome + status online + telefone + botões **Transferir** e **Agendar** + menu ⋮. Como `ConversationPanel` é fixed-drawer e não pode ser reusado inline sem alterá-lo, esta tela reproduz os mesmos handlers chamando os mesmos modais já existentes (`TransferConversationModal`, `ScheduleModal`) e os mesmos métodos de `useContactActions`. Tabs Conversa/Contato/Serviços/Histórico ficam **fora do escopo desta entrega** (decisão pendente — ver abaixo).

### 6. `src/components/chat/MessageBubble.tsx`
Renderiza bolha alinhada à esquerda (inbound) ou direita (outbound). Suporta:
- `text`: conteúdo + hora + check de status.
- `image`: thumbnail clicável (mesma `media_url`).
- `audio`: player de áudio HTML5 nativo (mesmo padrão do panel).
- `document`: link de download.
- `system`: centralizado, fonte menor, cor `var(--text-muted)`.
- Badge "🤖 IA" quando `is_ai === true` (campo já existe em `messages`).
- Indicadores ✓ / ✓✓ / ✓✓ (cor brand quando `status==='read'`).

### 7. `src/components/chat/MessageInput.tsx`
Textarea + botão de envio. Enter envia, Shift+Enter quebra linha. Chama o **mesmo server function** `sendWhatsAppMessage` de `@/lib/evolution.functions` via `useServerFn` (idêntico a `conversation-panel.tsx` linha 31/321). Fallback de persistência local idêntico ao do panel.

Anexos/áudio: nesta entrega, apenas envio de texto (decisão pendente — ver abaixo). Os ícones 😊/📎/🎤 ficam visíveis mas desabilitados ou ocultos.

### 8. `src/components/chat/DateSeparator.tsx`
Linha horizontal com texto centralizado: "hoje" / "ontem" / nome do dia da semana (até 7 dias) / `dd/mm/yyyy`.

### 9. `src/components/chat/EmptyState.tsx`
Ícone `MessageSquare` grande + texto "Selecione uma conversa para começar a atender". Estilo coerente com `@/components/empty-state.tsx`.

## Comportamento URL e seleção

- Selecionar contato → `navigate({ to: "/conversations-chat", search: { id: contactId } })`.
- `MessageThread` lê `Route.useSearch().id` e carrega a conversa correspondente. Refresh mantém aberta.
- Sem `id` → `EmptyState`.

## Mobile (<768px)

CSS via media query: quando `id` ausente, mostra só lista; quando `id` presente, mostra só thread + botão "← Voltar" no header (que limpa `id` da URL).

## Decisões pendentes (preciso de confirmação)

1. **Tabs Contato / Serviços / Histórico**: hoje vivem dentro de `ConversationPanel` (fixed drawer, 460px). Para "reutilizar exatamente os mesmos componentes" sem duplicar código, a única opção limpa é refatorar `conversation-panel.tsx` em subcomponentes (`<ContactTab/>`, `<ServicesTab/>`, `<HistoryTab/>`) — mas isso **toca arquivo existente do kanban**, o que viola a regra absoluta. Opções:
   - **(a)** Nesta entrega o chat só tem a aba "Conversa". Tabs extras ficam disponíveis abrindo o painel lateral do kanban. ← recomendação para respeitar a regra.
   - **(b)** Permitir extração de subcomponentes de `conversation-panel.tsx` (refactor sem alterar comportamento) para reuso real.
2. **Envio de mídia/áudio/emoji**: mesma situação — hoje vivem em `composer.tsx`. Opções:
   - **(a)** Chat só envia texto inicialmente; mídia continua pelo kanban.
   - **(b)** Extrair `Composer` para uso inline (mexe em arquivo existente).
3. **Modal "Novo contato"**: hoje aberto via evento global capturado em `_authenticated.inbox.tsx`. O chat precisa de instância própria de `<NewContactModal />` (reuso do componente, sem alterar o existente).

## Checklist de não-regressão

- `/inbox` continua intocada (mesma rota, mesmo componente, mesmo comportamento).
- Nenhum arquivo em `src/features/inbox/`, `src/lib/evolution.*`, `src/routes/api/public/evolution.*`, `src/hooks/use-contact-actions.ts` é modificado.
- Nenhuma migration nova; schema do banco inalterado.
- Server function `sendWhatsAppMessage` chamada com mesmo payload — webhook Evolution não percebe diferença.

Posso seguir com a opção **(a)** nas duas decisões pendentes (entrega enxuta, zero risco no kanban)?
