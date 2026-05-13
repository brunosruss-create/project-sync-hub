
# Fix de fluxo: Kanban é triagem que termina em "Agendado", não em "Concluído"

Hoje o sistema trata o Kanban como se o serviço fosse encerrado ali (botão "Concluir", coluna "Concluído"). Vamos realinhar para o fluxo real: a ação principal do atendimento é **Agendar**. Concluir continua existindo só na Agenda (`/schedule`), que já está correta.

## Escopo

### 1. Colunas do Kanban (`src/features/inbox/data.ts`)
- Alterar `KanbanColumnId` de `"waiting" | "active" | "done" | "urgent"` para `"waiting" | "in_progress" | "scheduled" | "urgent"`.
- Atualizar `COLUMNS`:
  - 🟡 Aguardando (`#F59E0B`)
  - 🔵 Em Atendimento (`#3B82F6`)
  - 📅 Agendado (`#25C880`) — verde brand, substitui "Concluído"
  - 🔴 Urgente (`#EF4444`)
- Atualizar `COLUMN_COLOR` e os 12 contatos do `MOCK_CONTACTS` (rótulos `active` → `in_progress`, `done` → `scheduled`).

### 2. Painel de conversa (`src/features/inbox/conversation-panel.tsx`)
- **Header**: remover o botão "Concluir" (verde primary). No lugar:
  - `[Transferir]` ghost (já existe).
  - `[📅 Agendar]` primary verde — abre o modal de agendamento.
  - `[⋮]` mantém menu, removendo qualquer item de "concluir".
  - `[✕]` fechar.
- **Tab Serviços**: hoje é placeholder. Implementar lista do catálogo (`SEED_SERVICES`) com checkbox por serviço:
  - Item: checkbox + nome + duração + preço; quando marcado, fundo verde sutil + borda verde.
  - Footer sticky: `N selecionados · X min · R$ total` + botão `📅 Agendar serviços selecionados` que abre o modal já com esses serviços pré-marcados.
- **Tab Histórico**: lista de `appointments` do contato com `status in ('completed','cancelled','no_show')`, ordenada desc — mais recente primeiro. Fallback vazio amigável.
- **Tab Contato**: manter como está (já tem nome/telefone/observações).

### 3. Modal de Agendamento dentro do Inbox
- Criar `src/features/inbox/schedule-modal.tsx` (modal centralizado, max-width 480px), com os campos pedidos: serviços (multi, pré-marcados), data, grade de slots de 30min, agente (default = `assignedAgent` do contato), observações, toggle "Notificar pelo WhatsApp" + preview da mensagem.
- Não vamos reaproveitar o `AppointmentModal` da Agenda porque ele é single-service e tem outra UX — manter as duas independentes evita regressão na Agenda.
- Ao confirmar:
  1. `insert` em `appointments` (status `scheduled`) + `appointment_services` (snapshot de preço/duração).
  2. `update` em `contacts` movendo para `kanban_column = 'scheduled'`.
  3. `insert` em `messages` com `direction='system'` + `message_type='system'`: "Agendado para DD/MM às HH:mm — [serviços]".
  4. Se `notify_whatsapp` estiver on, `insert` em `messages` `direction='outbound'` com a mensagem de confirmação (envio real via WhatsApp fica para depois — esse insert só representa intenção).
  5. Toast de sucesso e fecha modal.
- Fallback total para mocks quando o Supabase falhar (mesmo padrão dos outros módulos).

### 4. Banco — migration
- `ALTER TABLE public.contacts DROP CONSTRAINT contacts_kanban_column_check`, recriar com `('waiting','in_progress','scheduled','urgent')`. `UPDATE contacts SET kanban_column='in_progress' WHERE kanban_column='active'` e `'scheduled' WHERE kanban_column='done'`.
- Criar (com `if not exists`) `public.contact_services` e `public.appointment_services` conforme spec, mais índices em `messages(contact_id, created_at desc)` e `appointments(workspace_id, starts_at)`.
- RLS por workspace (helper já existe nas outras tabelas — replicar o mesmo policy `ws_*`).
- `messages` e `appointments` já existem; só garantir RLS/índice.

### 5. Pequenos ajustes auxiliares
- `src/routes/_authenticated.inbox.tsx`: o seletor de coluna no `byColumn` hoje usa as keys antigas — atualizar para as novas 4 keys. Mensagem do toast no drag end já é dinâmica via `COLUMNS`, mas validar a label.
- `src/routes/_authenticated.contacts.tsx` e `src/components/command-palette.tsx` (se referenciam `done`/`active` em filtros) — passar para os novos ids. Sem mudança visual além das labels.
- Schedule não muda. Continua sendo onde "Concluir" acontece.

## Detalhes técnicos

```text
inbox / KanbanColumnId
  - waiting       (Aguardando)     #F59E0B
  - in_progress   (Em Atendimento) #3B82F6
  - scheduled     (Agendado)       #25C880   ← antes era "done/Concluído"
  - urgent        (Urgente)        #EF4444
```

```text
ConversationPanel header (esq → dir)
  Avatar | Nome/telefone | [Transferir] [📅 Agendar] [⋮] [✕]
```

```sql
-- check constraint
ALTER TABLE public.contacts DROP CONSTRAINT IF EXISTS contacts_kanban_column_check;
UPDATE public.contacts SET kanban_column='in_progress' WHERE kanban_column='active';
UPDATE public.contacts SET kanban_column='scheduled'   WHERE kanban_column='done';
ALTER TABLE public.contacts ADD CONSTRAINT contacts_kanban_column_check
  CHECK (kanban_column IN ('waiting','in_progress','scheduled','urgent'));

-- novas tabelas auxiliares (idempotentes)
CREATE TABLE IF NOT EXISTS public.contact_services (...);
CREATE TABLE IF NOT EXISTS public.appointment_services (...);
CREATE INDEX IF NOT EXISTS messages_contact_created_idx
  ON public.messages (contact_id, created_at DESC);
CREATE INDEX IF NOT EXISTS appts_ws_starts_idx
  ON public.appointments (workspace_id, starts_at);
```

## Arquivos afetados

- `src/features/inbox/data.ts` — keys/labels/cores das colunas + seed.
- `src/features/inbox/conversation-panel.tsx` — header, tab Serviços, tab Histórico.
- `src/features/inbox/schedule-modal.tsx` — **novo**.
- `src/routes/_authenticated.inbox.tsx` — `byColumn` com novas keys.
- `src/routes/_authenticated.contacts.tsx` + `src/components/command-palette.tsx` — strings de coluna.
- 1 migration SQL (sem `down`).

## Fora do escopo

- Envio real via WhatsApp/Evolution API (mantemos só o registro `outbound` no banco como intent).
- Rebuild da Agenda — segue do jeito que está.
- Componente de Calendar/DayPicker novo: o modal usa um date input + grade de slots calculados a partir de `timeSlots()` que já existe em `schedule/data.ts`.
- Painel completo de contato (`/contacts/:id`) — só link no menu ⋮.
