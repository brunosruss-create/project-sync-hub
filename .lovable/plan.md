# Ajuste do card — remover scrollbar horizontal na coluna

## Causa

A barrinha horizontal no rodapé de cada coluna (visível no print) é causada pelos elementos posicionados com offset negativo dentro do `ContactCard`:

- Badge de não lidas: `top: -6, right: -6`
- Botão ⋮ (hover): `top: -4 / 16, right: -4`

Como o card tem `width: 100%` dentro do container `overflow-y-auto` da coluna, esses 6px que "vazam" para fora à direita geram overflow horizontal — e o navegador mostra a scrollbar.

## Mudanças (cirúrgicas, apenas visual)

**1. `src/features/inbox/kanban-column.tsx`** (linha 87)
- Trocar `className="flex-1 overflow-y-auto flex flex-col"` por `className="flex-1 overflow-y-auto overflow-x-hidden flex flex-col"`.
- Garante que nenhum overflow horizontal interno produza scrollbar, sem afetar o scroll vertical.

**2. `src/features/inbox/contact-card.tsx`** (badge + botão ⋮)
- Badge não lidas: trocar `top: -6, right: -6` por `top: 6, right: 6` (fica dentro do card, sem clipping e sem causar overflow).
- Botão ⋮: trocar `right: -4` por `right: 6`; ajustar `top` para `6` quando não há badge e `30` quando há badge (para não sobrepor o número).
- Recalcular `anchor.left` do menu para refletir a nova posição (`r.right - 180`).

## O que NÃO muda

- Drag & drop, listeners, dispatch do evento `zf:card-menu`, ScheduleModal, EditContactModal.
- Estilos de hover, animações, dark mode.
- Layout interno do card (avatar, nome, telefone, preview, tags, tempo).
- Scroll horizontal do Kanban (entre colunas) continua funcional.
- Lógica de mensagens, realtime, Supabase, Evolution.

## Teste rápido

1. Coluna com 1+ cards → não deve aparecer scrollbar horizontal no rodapé da coluna.
2. Badge de não lidas continua visível no canto superior direito do card.
3. Hover no card mostra o ⋮ no canto, abre o menu na posição correta.
4. Scroll vertical da coluna e scroll horizontal do Kanban seguem funcionando.
