
## Diagnóstico

Mapeei todos os pontos de contato entre WhatsApp/Inbox e Agenda:

1. **Inbox → Modal de agendamento** (`src/features/inbox/conversation-panel.tsx:684`) — abre `ScheduleModal` passando o contato do WhatsApp.
2. **ScheduleModal** (`src/features/inbox/schedule-modal.tsx`) — ao confirmar:
   - Insere em `appointments` (linha 88).
   - Insere em `appointment_services` (linha 105).
   - Atualiza `contacts.kanban_column = 'scheduled'` (linha 119).
   - Insere mensagens (system + outbound) em `messages`.
3. **Agenda** (`src/routes/_authenticated.schedule.tsx:93-140`) — no mount faz `select` em `appointments` e `contacts`. Se vier vazio, mantém `MOCK_APPOINTMENTS`.

### Causa raiz (confirmada pelas imagens enviadas)

A imagem 1 mostra o contato “Cauê” na coluna **AGENDADO** (= o `kanban_column` foi atualizado e a mensagem do sistema foi enviada), mas a imagem 2 mostra a agenda exibindo apenas os 4 mocks (“Sem contato” / Alinhamento, Diagnóstico, Troca de Pasti, Polimento). Isso prova que o `select` em `appointments` voltou vazio — ou seja, o `insert` em `appointments` está falhando silenciosamente. O modal só faz `console.warn` no erro e mesmo assim mostra `toast.success`, então o usuário acredita que foi agendado.

Causas prováveis para o insert falhar:
- **`agent_id` inválido**: o modal usa `MOCK_AGENTS[0].id = "a1"` (string fixa). Se a coluna `agent_id` for `uuid` ou tiver FK para `agents`, o insert é rejeitado.
- **`service_id` inválido**: usa ids do `SEED_SERVICES` (mock), idem.
- **RLS sem `owner_user_id`**: o insert não envia `owner_user_id`, então qualquer policy `with check (owner_user_id = auth.uid())` recusa.
- A Agenda **filtra por `agentFilter`** que só conhece `MOCK_AGENTS` (`a1..a4`); se algum dia o insert passar com `agent_id` real (uuid), a agenda também esconde porque o id não está no filtro.
- Não há `realtime` nem evento entre Inbox e Agenda — mesmo se o insert funcionar, a agenda só recarrega no mount.

## Plano de correção

### 1. Migration Supabase para `appointments` + `appointment_services`
Criar (ou reconciliar) o schema com `owner_user_id uuid not null default auth.uid()`, `contact_id uuid` (FK opcional), `agent_id text`, `service_id text` (text, para aceitar ids semente), demais campos atuais e RLS:
- `enable row level security`
- policy `select/insert/update/delete using (owner_user_id = auth.uid())` em ambas tabelas.
- Index em `(owner_user_id, starts_at)`.

### 2. `schedule-modal.tsx` — robustez
- Enviar `owner_user_id: user.id` no insert de `appointments` e nos demais inserts.
- **Não** mostrar toast de sucesso se `apptErr` existir; mostrar `toast.error` com a mensagem e abortar o restante (kanban/mensagens). Isso evita o falso positivo atual.
- Disparar `window.dispatchEvent(new CustomEvent("zf:appointment-created", { detail: { appointment } }))` ao final.

### 3. `_authenticated.schedule.tsx` — refletir dados reais
- Iniciar `items` como `[]` (não `MOCK_APPOINTMENTS`); usar mocks apenas como fallback dev quando `import.meta.env.DEV` e nada veio do banco — para produção a agenda deve ser fiel ao banco.
- Remover o filtro por `agentFilter` para appointments cujo `agent_id` não está no conjunto (ou: não filtrar quando o set contém todos os agentes conhecidos / aceitar agent_id desconhecido como “visível”).
- Ouvir o evento `zf:appointment-created` e o canal Realtime de `appointments` (`postgres_changes` filtrado por `owner_user_id`) para atualizar `items` sem precisar recarregar a página.
- Garantir reload ao focar a aba (`visibilitychange`).

### 4. Verificação
- Após aplicar: agendar pelo WhatsApp → esperar toast de sucesso → ir em /schedule e ver o card aparecer imediatamente (via evento) e persistido após reload.
- Se o insert ainda falhar, o toast de erro mostrará a causa exata (RLS, FK, tipo) para correção pontual.

## Detalhes técnicos

- Arquivos a editar:
  - `supabase/migrations/<timestamp>_appointments.sql` (novo)
  - `src/features/inbox/schedule-modal.tsx`
  - `src/routes/_authenticated.schedule.tsx`
- Sem mudanças em UI/visual — apenas dados, RLS e sincronização.
- Não toca em nada de WhatsApp/Evolution/áudio.
