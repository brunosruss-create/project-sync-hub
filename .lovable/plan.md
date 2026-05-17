## Causa

Ao desbloquear pelo menu da conversa, o hook `useContactActions.toggleBlock` atualiza o Supabase e dispara `zf:contact-updated`, mas:

1. O `ConversationPanel` aberto recebe o contato via prop `contact` vinda do `openContact` (estado em `_authenticated.inbox.tsx` / `_authenticated.contacts.tsx`). O listener de `zf:contact-updated` só atualiza o array `contacts`, **não** o `openContact` — então `contact.is_blocked` continua `true` na UI até dar reload.
2. Não existe assinatura realtime na tabela `contacts`, então mudanças feitas em outra aba/dispositivo (super-admin, outro atendente) só aparecem após refresh.

## Mudanças

### 1. `src/routes/_authenticated.inbox.tsx`
- No handler `onContactUpdated`, além de atualizar a lista, atualizar `openContact` quando o id coincidir; se `is_blocked` ou `is_archived` virar `true`, fechar o painel (`setOpenContact(null)`).
- Adicionar canal Supabase realtime `postgres_changes` em `public.contacts` (event `UPDATE`, filtrado por `owner_user_id=eq.${workspaceOwnerId}`) que aplica o mesmo patch local (sem precisar de novo `load()`).

### 2. `src/routes/_authenticated.contacts.tsx`
- Adicionar listener `zf:contact-updated` que atualiza `contacts` e `openContact`.
- Adicionar mesma assinatura realtime de `public.contacts`.
- Garantir que `onContactUpdate` (já passado ao `ConversationPanel`) também atualize `openContact`, não só a lista.

### 3. `src/hooks/use-contact-actions.ts`
- Sem mudanças funcionais. O `emitUpdate` já dispara o patch correto.

### 4. Migration: `supabase/manual/20260605000000_contacts_realtime.sql`
```sql
alter publication supabase_realtime add table public.contacts;
alter table public.contacts replica identity full;
```
(usar `do $$ ... exception when duplicate_object then null; end $$;` para ser idempotente)

## Resultado

- Clicar "Desbloquear contato" → o menu instantaneamente vira "Bloquear contato" (sem reload).
- Bloquear/desbloquear/arquivar em outra aba reflete em tempo real no inbox e na página de contatos.
- Nenhuma alteração em lógica de mensagens, autenticação ou rotas.