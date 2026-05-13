# Colunas do Kanban editáveis (CRUD completo)

Hoje as 4 colunas (`waiting`, `in_progress`, `scheduled`, `urgent`) estão hardcoded em `src/features/inbox/data.ts`. Vamos torná-las dinâmicas, persistidas no Supabase e escopadas por dono da conta (`owner_user_id`) — mesmo padrão já usado em `contacts`. Como o projeto não tem tabela `workspaces`, "por workspace" = por conta dona, compartilhado entre todos os atendentes que enxergam aquele inbox.

## 1. Banco de dados (migration)

Nova tabela `kanban_columns`:

```
id                uuid PK default gen_random_uuid()
owner_user_id     uuid not null references auth.users
slug              text not null              -- "waiting", "vip", etc. único por owner
label             text not null              -- "Aguardando"
emoji             text not null default '📌'
color             text not null default '#6B7280'  -- hex, usado na borda superior
position          int  not null              -- ordem
is_system         bool not null default false -- marca as 4 padrão (não pode deletar)
created_at        timestamptz default now()
unique (owner_user_id, slug)
```

RLS: usuário só lê/edita as próprias linhas (`owner_user_id = auth.uid()`).

**Seed automático no primeiro acesso**: quando o inbox carregar e o usuário não tiver nenhuma coluna, um `createServerFn` insere as 4 padrão (Aguardando/Em Atendimento/Agendado/Urgente) com `is_system = true`.

`contacts.kanban_column` continua `text` (já é). Não há FK pra preservar liberdade — validação acontece no app.

## 2. Backend (server functions)

Arquivo novo `src/lib/kanban-columns.functions.ts` com `requireSupabaseAuth`:

- `listColumns()` — retorna colunas ordenadas por `position`. Se vazio, faz seed e retorna.
- `createColumn({ label, emoji, color })` — gera `slug` a partir do label, `position = max+1`.
- `updateColumn({ id, label?, emoji?, color? })` — bloqueia mudar `slug` (pra não invalidar `contacts.kanban_column`).
- `reorderColumns({ ids: string[] })` — atualiza `position` em batch.
- `deleteColumn({ id, fallbackSlug })` — bloqueia se `is_system`. Antes de apagar, faz `update contacts set kanban_column = fallbackSlug where kanban_column = <slug deletada>`.

## 3. Frontend

**`src/features/inbox/data.ts`**: manter tipos, formatadores e mocks; remover `COLUMNS` e `COLUMN_COLOR` constantes (passam a vir do estado). `KanbanColumnId` vira `string` (slug livre).

**`_authenticated.inbox.tsx`**:
- Novo estado `columns` carregado via `listColumns()` no mount + realtime na tabela `kanban_columns`.
- `byColumn` indexa por slug dinâmico; cards com `kanban_column` desconhecido caem em "Aguardando" (fallback visual).
- Drag & drop e o submenu "Mover para" do `CardMenu` passam a usar a lista dinâmica.
- Header da página ganha um botão **"+ Nova coluna"** (ícone `Plus` discreto, ao lado de "Novo Contato").

**`src/features/inbox/kanban-column.tsx`**:
- Adicionar ícone ⋮ pequeno no header da coluna (aparece no hover do header), abre dropdown com:
  - Editar (nome, emoji, cor)
  - Mover ← / Mover →
  - Excluir (desabilitado se `is_system`; confirma e move cards pra "Aguardando")
- Título clicável também abre o modal de edição.
- Cor da borda superior vem de `color` da coluna.

**Componentes novos**:
- `src/features/inbox/column-edit-modal.tsx` — campos: nome (text), emoji (input com sugestões 📌🟡🔵🟢🔴⭐📅💬🔥), cor (paleta de 8 swatches + input hex). Salvar = `createColumn` ou `updateColumn` + toast.
- `src/features/inbox/column-menu.tsx` — dropdown semelhante ao `card-menu.tsx`.

**Confirmação de delete**: usa `ConfirmDialog` existente — "Excluir 'Urgente'? Os 3 cards desta coluna voltam para Aguardando."

## 4. O que NÃO muda

- Lógica de mensagens, realtime de `contacts`/`messages`, Evolution, envio/recebimento.
- Drag & drop entre colunas (continua via dnd-kit).
- Cards (avatar, ⋮, badge), modal de novo contato, ScheduleModal, EditContactModal.
- Filtros, busca, atalhos de teclado, dark mode, scroll horizontal do board.

## 5. Ordem de implementação

1. Migration `kanban_columns` + RLS.
2. `kanban-columns.functions.ts` (list/create/update/reorder/delete + seed).
3. Refatorar `data.ts` e `_authenticated.inbox.tsx` para colunas dinâmicas (sem regredir nada).
4. `column-edit-modal.tsx` + botão "Nova coluna" no header.
5. `column-menu.tsx` + ⋮ no header da `kanban-column.tsx`.
6. Delete com fallback + `ConfirmDialog`.
7. Teste: renomear "Aguardando", criar "VIP", arrastar card, reordenar colunas, excluir e ver fallback.
