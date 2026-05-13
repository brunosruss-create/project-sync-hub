## O que já foi entregue
- **BUG 1** — duplicação de mensagem corrigida (removido optimistic update, realtime é fonte da verdade, dedupe por id já existia).
- **MELHORIA 1** — foto do WhatsApp nos cards/chat/contatos com fallback de iniciais coloridas.

## O que falta

### Melhoria 2 — Editar card existente (quick edit)

**Ícone ⋮ no card (`src/features/inbox/contact-card.tsx`)**
- Aparece só no hover (opacity 0 → 1, transition 100ms), 14px, `var(--text-muted)`.
- Posição: canto superior direito. Se houver badge de não lidas, posiciona logo abaixo do badge para não conflitar.
- Clique abre o dropdown e faz `stopPropagation` (não dispara drag nem abre o chat).

**Dropdown (`src/features/inbox/card-menu.tsx` — novo)**
- 180px, posicionado abaixo do ícone, fecha em click-outside / Esc.
- Itens, com separadores:
  - **Contato:** Editar nome • Adicionar tag • Atribuir agente
  - **Kanban:** Marcar/Remover urgência • Mover para coluna (submenu com as 4 colunas)
  - **Ações:** Agendar horário (abre `ScheduleModal`) • Abrir conversa
  - **Arquivar contato** (separador antes)
- Cada ação: update otimista no estado local + `supabase.from('contacts').update(...)` + toast.
- "Arquivar": seta `kanban_column = 'archived'` (ou `archived_at = now()`); o card some do kanban porque não está em nenhuma das 4 colunas visíveis.

**Modal "Editar contato" (`src/features/inbox/edit-contact-modal.tsx` — novo)**
- 400px, abre por "Editar nome" ou pelo dropdown.
- Campos: Nome (input), Tags (chips editáveis igual ao NewContactModal), Agente (select), Observações (textarea ligada a `contacts.notes`).
- Imutáveis: telefone, coluna kanban (apenas exibe).
- Salvar → update no Supabase + propaga via `onContactUpdate` no estado do `/inbox` + toast "Contato atualizado ✓".

**SQL necessário (você roda no SQL Editor):**
```sql
alter table public.contacts add column if not exists notes text;
alter table public.contacts add column if not exists archived_at timestamptz;
```

---

### Melhoria 3 — Criação em lote (`src/features/inbox/new-contact-modal.tsx`)

**Polir o "Criar outro após salvar" (modo single):**
- Após salvar com checkbox marcado: toast discreto, limpar nome/número/tags/mensagem, **manter** coluna e agente, focar `#whatsapp-number`, modal não fecha.

**Modo lote (toggle "+ Adicionar em lote"):**
- Tabela com colunas: Número WhatsApp • Nome • Tag • [✕], até 10 linhas, botão "+ adicionar linha".
- Validação por linha: número inválido / duplicado (consulta única `contacts.select('phone')`) marca ⚠ na linha.
- Footer: `[Cancelar]  [Criar N contatos →]` (N = linhas válidas).
- Submit: um único `supabase.from('contacts').insert([...])` → cards aparecem na coluna selecionada via realtime → toast "N contatos criados com sucesso ✓".
- Coluna e agente do header do modal aplicam-se a todas as linhas do lote.

---

## Não-regressão (vou re-testar ao final)
Drag-and-drop, ordenação por nova mensagem, badge de não lidas, abertura do painel, tabs, botão Agendar, filtros Todos/Meus/Sem atendente, busca, formatação de telefone, dark mode, scroll horizontal, envio de mensagem aparecendo 1 única vez.

## Ordem de execução
1. Modal Editar contato (componente isolado)
2. Dropdown ⋮ no card (consome o modal)
3. Modo lote no NewContactModal
4. Pequenos ajustes do "Criar outro" (single)
5. Sweep do checklist de não-regressão