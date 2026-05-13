## Diagnóstico

**Logs do worker confirmam que o webhook está chegando e respondendo 200:**
- `19:37:44` `messages.upsert` → 200
- `19:37:01` `connection.update` → 200
- Vários `messages.upsert` históricos também → 200

Ou seja, a Evolution **está enviando** para `https://github-vercel-bridge.lovable.app/api/public/evolution/...` e nosso handler **está rodando**. O problema não é "a Evolution não manda" e nem CSS.

**As duas hipóteses reais:**

1. **O `INSERT` em `contacts` está falhando silenciosamente.**
   No handler `src/routes/api/public/evolution.$instanceId.ts`, o bloco `messages.upsert` faz `await supabaseAdmin.from("contacts").insert({...})` **sem checar `error`**. Se uma coluna não existir, ou se houver constraint, o insert falha mas o request volta 200 e nada aparece nos logs. Hoje só logamos erro genérico no `catch` externo, então um erro do Supabase fica engolido.

2. **Realtime não foi ligado nas tabelas.** Mesmo que o INSERT funcione, sem `ALTER PUBLICATION supabase_realtime ADD TABLE public.contacts` o front nunca recebe push e fica preso no estado "Nenhuma conversa ainda" até dar refresh. Como você falou "mensagem não chega", precisamos confirmar se nem com refresh aparece.

**O Kanban "sumiu":** isso é comportamento atual do código, não bug de CSS. Em `src/routes/_authenticated.inbox.tsx` linha ~370, quando `contacts.length === 0` mostramos o `EmptyState` ocupando o espaço todo, no lugar das 4 colunas (Aguardando / Em andamento / Agendado / Urgente). Antes (com `MOCK_CONTACTS`) sempre tinha card de teste, então as colunas ficavam visíveis.

## Correções (cirúrgicas)

### A. Logar erros do webhook para enxergar o problema real
Em `src/routes/api/public/evolution.$instanceId.ts`, no bloco `messages.upsert`:
- Capturar `{ error }` no `select` do contato existente, no `insert` do novo contato, no `update` do existente, e no `insert` em `messages`.
- `console.error("[evolution upsert]", { step, error: error.message })` quando houver erro.
- Não muda o status code (continua 200 pra Evolution não reentregar).

Resultado: na próxima mensagem de teste, os logs vão mostrar exatamente em qual passo o INSERT está falhando (coluna inexistente, RLS no admin, FK, etc).

### B. Restaurar as colunas do Kanban quando vazio
Em `src/routes/_authenticated.inbox.tsx`:
- Quando `contacts.length === 0` **e** WhatsApp está `connected` **e** sem erro, em vez de renderizar o `EmptyState` ocupando tudo, renderizar o **DndContext com as 4 colunas vazias** (cada uma já tem o placeholder "Solte um card aqui") e mostrar uma faixa fina no topo das colunas: "Aguardando primeira mensagem dos clientes…"
- Mantém a tela "WhatsApp não conectado" como está.

Não mexer em `kanban-column.tsx`, `contact-card.tsx`, `conversation-panel.tsx`, nem no CSS.

### C. Verificação da publication Realtime
Pedir confirmação se a SQL abaixo já foi rodada no SQL Editor do Supabase (passo da rodada anterior):
```sql
ALTER TABLE public.contacts REPLICA IDENTITY FULL;
ALTER TABLE public.messages REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.contacts;
ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;
```
Se não foi, o front não recebe push em tempo real (mas dar F5 ainda mostraria contatos se o INSERT estivesse ok — daí a importância do passo A).

## Como vamos validar
1. Após (A) + (B): publicar, abrir Inbox → deve ver as 4 colunas vazias com a faixa de aviso.
2. Mandar mensagem de teste pro `5511914825892`.
3. Olhar logs do worker:
   - Se aparecer `[evolution upsert]` com erro → corrigimos a coluna/constraint que está faltando.
   - Se NÃO aparecer erro mas o front continuar vazio → é Realtime + RLS de SELECT (passo C). Aí resolvemos com a SQL e/ou ajuste de RLS.

Não regredimos nada do fluxo de QR, conexão da instância, ou webhook que já está em produção.
