
## Diagnóstico (com base em logs reais do worker)

**1. "Mensagem de teste não chega no Inbox"** — não é o webhook. Os logs do worker mostram dezenas de `POST /api/public/evolution/... → 200` com `event: messages.upsert` chegando normalmente nos últimos minutos. Os dados estão sendo gravados no Supabase. O bug é **no front**: `src/routes/_authenticated.inbox.tsx` carrega `contacts` **uma única vez no mount** (`useEffect` sem refetch nem subscription). Enquanto o usuário fica olhando a tela, novas linhas no banco nunca aparecem — daí o "Nenhuma conversa ainda" eterno.

**2. "Primeira tentativa de conectar dá erro, a segunda funciona"** — em `connectInstance` (`src/lib/evolution.functions.ts`), o fluxo é: `logout` → `deleteInstance` → `createInstance` → `connect`. Quando a instância acabou de ser deletada, a Evolution leva ~500–1500 ms até o socket Baileys subir e gerar o QR. Hoje o código tenta `connect` **uma única vez**; se voltar sem `base64`, marcamos `status=error` e mostramos "Evolution conectou mas não devolveu QR". Na segunda tentativa a instância já existe + socket pronto → `connect` devolve QR na hora.

## Correções (cirúrgicas, sem quebrar o que já funciona)

### A. Inbox em tempo real
Em `src/routes/_authenticated.inbox.tsx`, dentro do `useEffect` que carrega contatos:
- Após o load inicial, abrir uma **Supabase Realtime subscription** em `postgres_changes` para a tabela `contacts` filtrando por `owner_user_id=eq.${user.id}`, eventos `INSERT` e `UPDATE`.
- Em `INSERT`: append no estado `contacts` (mapeando para o tipo `Contact`).
- Em `UPDATE`: substituir a linha pelo id, preservando ordenação por `last_message_at desc`.
- Cleanup: `supabase.removeChannel(channel)` no unmount.
- Fallback de segurança: também refazer o fetch quando a janela ganhar foco (`window.addEventListener("focus", refetch)`).
- Se Realtime não estiver habilitado para a tabela, criar migration adicionando `contacts` à publication `supabase_realtime` e setando `REPLICA IDENTITY FULL`.

Não mexer em `kanban-column.tsx`, `conversation-panel.tsx`, nem no webhook handler — eles já gravam corretamente.

### B. Retry no primeiro QR
Em `src/lib/evolution.functions.ts`, dentro de `connectInstance`, no bloco "2) Sempre chama connect":
- Trocar a chamada única `evo.connect(name)` por um loop de até **4 tentativas**, com espera de **600 ms** entre elas, parando assim que `extractQRCode` retornar algo não-nulo.
- Manter o `try/createInstance` anterior intacto (se já vier QR de lá, pula o loop).
- Só marcar `status=error` e lançar a mensagem atual ("Evolution conectou mas não devolveu QR") **depois** que todas as tentativas falharem.
- Não alterar `deleteInstance`/`logout`/`createInstance`/`ensureWebhook`/expiração de 30 s — todo o fluxo que hoje funciona na 2ª tentativa fica idêntico.

### C. Nada mais muda
- Webhook handler `src/routes/api/public/evolution.$instanceId.ts` permanece como está (logs confirmam que processa `messages.upsert` corretamente).
- `PUBLIC_APP_URL`, secrets, rota de QR, polling de status, registro de webhook: intactos.

## Como vamos validar
1. Após implementar, mandar uma mensagem WhatsApp de outro número para `5511914825892` com a aba do Inbox aberta — deve aparecer **sem refresh** em 1-2 s.
2. Desconectar a instância e clicar "Conectar" — o QR deve aparecer já na 1ª tentativa (vai estar fazendo o retry interno, transparente).
3. Logs do worker continuam mostrando `messages.upsert → 200` (não regredimos nada).
