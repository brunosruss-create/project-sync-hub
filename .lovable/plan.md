## Objetivo

Tornar funcionais os campos cosméticos da aba Contato e do menu ⋮ do painel de chat, reutilizando o motor já existente no kanban (`handleMenuAction` em `_authenticated.inbox.tsx`) através de um hook único `useContactActions`. Zero regressão: nada que já funciona é tocado.

## Estado atual (já mapeado no código)

- `_authenticated.inbox.tsx > handleMenuAction` JÁ implementa: toggle-urgent, move, archive, schedule (abre modal), assign (abre TransferModal), edit (abre EditContactModal). O kanban está OK.
- `conversation-panel.tsx > ContactTab` é cosmético: `email`/`notes` em `useState` sem persistir; `tags` mudam só no estado local; botão "Salvar" só dá `toast.success`.
- `conversation-panel.tsx > HistoryTab` JÁ busca `appointments` reais — funciona, só falta tratar o caso "Nenhum serviço registrado" ser confundido com vazio (é o estado correto quando não há dados).
- `conversation-panel.tsx > menuAction(label)` no menu ⋮ do header do chat só chama `toast` ("em breve") — todos os itens são cosméticos.
- Colunas faltando no DB: `email`, `notes`, `is_blocked`, `is_archived`, `assigned_agent_id`. `tags`, `priority`, `kanban_column` já existem.

## Mudanças

### 1. Migration SQL (`supabase/manual/20260604000000_contact_fields.sql`)
Apenas `ADD COLUMN IF NOT EXISTS`:
- `contacts.email text`
- `contacts.notes text`
- `contacts.is_blocked boolean default false`
- `contacts.is_archived boolean default false`
- `contacts.assigned_agent_id uuid references profiles(id) on delete set null`
- Índices: `contacts_tags_gin (gin(tags))`, `contacts_assigned_agent`, `contacts_archived (owner_user_id, is_archived)`

Não mexer em `priority`, `tags`, `kanban_column` (já existem).

### 2. Hook único `src/hooks/use-contact-actions.ts`
Centraliza toda mutação de contato. Cada função: optimistic-friendly via `queryClient.invalidateQueries` + supabase update + toast.
- `saveContact(id, {name?, email?, notes?})`
- `addTag(id, tag, currentTags)` / `removeTag(...)`
- `toggleUrgent(id, currentPriority)` — só muda `priority`, NÃO força `kanban_column` (o drag-and-drop e a coluna são independentes; evita regressão no kanban).
- `moveToColumn(id, column)`
- `assignAgent(id, agentId | null)`
- `transferToAgent(id, agentId, agentName)` — atualiza `assigned_agent_id`, move para `in_progress`, insere mensagem `system` em `messages`.
- `toggleBlock(id, currentlyBlocked)`
- `archiveContact(id)` — usa `is_archived = true` (fallback para `kanban_column = 'archived'` se a coluna não existir, espelhando o padrão atual de `handleMenuAction`).

Invalidação: `['contacts']`, `['contact', id]`, `['messages', id]` quando aplicável. Também emite um `CustomEvent('zf:contact-updated', { detail: { id, patch } })` para que `_authenticated.inbox.tsx` atualize o estado local `contacts` (que hoje é um `useState`, não `useQuery`) sem precisar refazer o load.

### 3. `_authenticated.inbox.tsx`
- Substituir o corpo do `handleMenuAction` por chamadas ao `useContactActions` (mesmo comportamento, mesmas modais). Lógica de UI e modais permanece igual.
- Escutar `zf:contact-updated` para sincronizar o `setContacts` local.
- Adicionar filtro `is_archived = false` e `is_blocked = false` nas duas queries de `contacts` (linhas 131 e 139) — com fallback silencioso caso a coluna ainda não exista no projeto do usuário (try sem o filtro).

### 4. `conversation-panel.tsx > ContactTab`
Reescrever só o conteúdo do componente (mesma assinatura `({ contact })`):
- `form` local (`name`, `email`, `notes`) inicializado de `contact`, ressincroniza em `useEffect([contact.id])`.
- Botão "Salvar alterações" chama `saveContact`.
- Tags como chips removíveis (`removeTag`) + input com Enter/vírgula (`addTag`).
- Mantém `Field` e os estilos existentes do arquivo (não introduz novos componentes UI).

### 5. `conversation-panel.tsx` — menu ⋮ do header do chat
- Trocar `menuAction(label)` por chamadas reais do `useContactActions`:
  - Transferir → abre `TransferConversationModal` (já existe).
  - Marcar como urgente → `toggleUrgent`.
  - Adicionar tag → abre o mesmo `EditContactModal` (já existe) OU um pequeno popover inline com input + `addTag` (preferir inline para não duplicar fluxo).
  - Agendar atendimento → emite `zf:open-schedule` com `contactId` (mesmo evento que o kanban já usa) — sem duplicar lógica de modal.
  - Bloquear → `toggleBlock` (com `confirm`).
  - Ver perfil completo → `navigate({ to: '/contacts', search: { id: contact.id } })` se a rota suportar; senão mantém disabled até criar página de perfil (fora do escopo deste passo).

### 6. Tab Histórico
Já funcional. Única mudança: garantir que a query também devolva `appointment_services.services(emoji)` se a coluna existir; senão deixar como está. (Opcional — não bloqueia.)

## Fora de escopo (não tocar)

- Webhook Evolution / envio/recebimento WhatsApp.
- Realtime de `messages` e `contacts`.
- Drag-and-drop do kanban (`KanbanColumn`, `useDroppable`).
- `schedule-modal.tsx`, `transfer-conversation-modal.tsx`, `edit-contact-modal.tsx` (apenas chamadas).
- Tabelas `messages`, `appointments`, RLS.
- Página `/contacts/:id` completa (gap #5 do prompt) — fica para iteração futura.
- Filtro de mensagens de contato bloqueado no webhook (gap #2) — implementar quando confirmarmos que `is_blocked` está em produção, em PR separado para não misturar com mudanças de UI.

## Ordem de execução

1. SQL migration (zero risco).
2. Criar `use-contact-actions.ts` (sem consumir ainda).
3. Refatorar `handleMenuAction` no inbox para usar o hook (comportamento idêntico).
4. Reescrever `ContactTab` para persistir.
5. Conectar menu ⋮ do header do chat ao hook.
6. Adicionar filtros `is_archived/is_blocked` nas queries do inbox.

Validação manual entre passos: kanban continua carregando, drag-and-drop funciona, envio de mensagem funciona, modal de agendamento abre.
