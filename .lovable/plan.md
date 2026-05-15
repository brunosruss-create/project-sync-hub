## Diagnóstico

A IA só responde no botão "Testar agente" porque é o único lugar do código que chama `aiRespond`. Conferi os arquivos:

- `src/lib/ai-respond.functions.ts` — define o serverFn `aiRespond`.
- `src/routes/_authenticated.ai-agent.tsx` — único consumidor (modal de teste).
- `src/routes/api/public/evolution.$instanceId.ts` — webhook do WhatsApp. Recebe `messages.upsert`, salva contato + mensagem inbound, mas **nunca chama a IA nem envia resposta**.

Resultado: mensagem de cliente real entra no inbox, mas nada dispara o Gemini nem o `sendText` da Evolution. Por isso só o teste “funciona”.

Além disso, `aiRespond` usa `requireSupabaseAuth` como middleware — ele não pode ser chamado de um webhook público sem sessão de usuário. Precisa ter a lógica disponível em uma função interna chamável pelo servidor.

## Plano

### 1. Extrair o núcleo da IA para uma função server-only reutilizável
- Criar `src/lib/ai-respond.server.ts` exportando `runAiResponse({ workspace_owner_id, contact_id, message, conversation_history, preview })` com toda a lógica que hoje está dentro do `.handler` do `aiRespond`:
  - busca de `global_settings`, `profiles`, `ai_segments`
  - checagem `ai_enabled`, horário (`isWithinHours` com timezone)
  - palavras-chave de transferência
  - chamada ao Gemini
  - inserção em `ai_usage_logs`
- Refatorar `aiRespond` (serverFn autenticado) para apenas validar input e chamar `runAiResponse`. Comportamento do teste continua idêntico.

### 2. Disparar a IA no webhook quando chega mensagem do cliente
Em `src/routes/api/public/evolution.$instanceId.ts`, no bloco `messages.upsert`, depois de inserir a mensagem inbound com sucesso:

- Pular se `mediaType !== "text"` (Gemini hoje só recebe texto) ou `caption` vazio.
- Pular se a coluna do contato já indica handoff humano (`kanban_column` em `in_progress`/`transferred`/etc — usar a mesma regra que já bloqueia atribuição automática). Ler isso do `contacts` no mesmo round-trip do upsert.
- Buscar histórico recente: últimas N mensagens (ex.: 20) desse `contact_id`, ordenadas asc, mapeadas para `{ role: 'user' | 'assistant', content }` usando `direction` (`inbound` → user, `outbound` → assistant).
- Chamar `runAiResponse({ workspace_owner_id: row.owner_user_id, contact_id, message: caption, conversation_history })`.
- Tratar o resultado:
  - `send_message` ou `send_out_of_hours`: enviar via `evo.sendText(row.instance_name, { number: phone, text: response })`. Inserir em `messages` como `direction: 'outbound'`, `status: 'sent'`, `whatsapp_message_id` retornado pela Evolution. Atualizar `contacts.last_message`/`last_message_at`.
  - `transfer_to_human`: NÃO responder; mover `contacts.kanban_column` para `waiting`/`in_progress` (mesma coluna usada no fluxo manual de transferência) e marcar `is_unread = true` para um humano assumir. Logar em `ai_usage_logs` (já feito pelo runner).
  - `skip` / `error`: não enviar nada; apenas logar.
- Tudo dentro de `try/catch` — falha da IA NUNCA pode quebrar o webhook (precisa retornar 200 para a Evolution).

### 3. Marcar mensagens enviadas pela IA
- Adicionar coluna opcional `is_ai` boolean na tabela `messages` via nova migração `supabase/manual/2026053…_messages_is_ai.sql` (`add column if not exists is_ai boolean not null default false`).
- Setar `is_ai: true` no insert outbound disparado pela IA.
- Não muda nada na UI agora; serve para auditoria e para evitar reenvios em loop (filtra histórico se quiser).

### 4. Validação manual após implementar
- Enviar mensagem do WhatsApp real → verificar:
  - aparece no inbox
  - aparece resposta da IA logo depois (mesma resposta do botão "Testar")
  - log em `ai_usage_logs` com `action='send_message'`
  - fora do horário: cliente recebe `ai_out_of_hours_message`
  - palavra "humano": IA não responde, conversa vai para fila humana
- Conferir que o "Testar agente" continua funcionando (nada de regressão).

### Arquivos afetados
- novo: `src/lib/ai-respond.server.ts`
- novo: `supabase/manual/2026053…_messages_is_ai.sql`
- editado: `src/lib/ai-respond.functions.ts` (passa a delegar para o server helper)
- editado: `src/routes/api/public/evolution.$instanceId.ts` (gatilho da IA + envio outbound)
