## Objetivo

Bloquear/desbloquear não deve mais remover o contato da lista do kanban. O contato bloqueado permanece no card com um ícone de cadeado visível, e a mudança aparece em tempo real em todas as abas/dispositivos sem precisar dar refresh.

## Mudanças

### 1. `src/routes/_authenticated.inbox.tsx`
- No `load()`: remover o filtro `.eq("is_blocked", false)` para que contatos bloqueados continuem aparecendo.
- No handler de realtime `UPDATE` em `contacts`: remover o branch que filtrava contatos com `is_blocked || is_archived` do array; manter só o filtro de `is_archived` (arquivados continuam saindo da lista). Bloqueados são apenas atualizados, não removidos.
- No handler `setOpenContact` (realtime + `zf:contact-updated`): não fechar o painel quando `is_blocked` muda; só fechar em `is_archived`. Aplicar o patch normalmente.
- No listener `zf:contact-updated`: idem — não remover bloqueados da lista, só arquivados.

### 2. `src/features/inbox/contact-card.tsx`
- Adicionar ícone `Lock` (lucide-react) ao lado do nome (ou no canto) quando `contact.is_blocked === true`. Estilo discreto, cor `var(--text-muted)` ou `var(--danger)`, tamanho 12–13px. Tooltip "Contato bloqueado".
- Quando bloqueado, opcional: leve `opacity: 0.7` no card para sinalizar visualmente.

### 3. Realtime entre abas
- Garantir que o usuário aplicou `supabase/manual/20260605000000_contacts_realtime.sql` (adiciona `contacts` ao publication `supabase_realtime` + `replica identity full`). Sem isso, mudanças vindas de outras abas só aparecem com reload — o defensive fallback `void load()` já trata payloads parciais.
- O evento local `zf:contact-updated` continua resolvendo o realtime dentro da mesma aba (instantâneo).

### 4. `src/routes/_authenticated.contacts.tsx`
- Mesma lógica: remover do handler `zf:contact-updated` e do realtime qualquer remoção baseada em `is_blocked` (se houver). Verificar e ajustar consistentemente.

## Resultado esperado

- Clicar em "Bloquear contato" → cadeado aparece no card imediatamente, contato permanece na coluna, painel continua aberto.
- Clicar em "Desbloquear" → cadeado some imediatamente.
- Mudança em outra aba/dispositivo → aparece em tempo real (após aplicar a migration de realtime).
- Arquivar continua removendo da lista (comportamento atual mantido).
