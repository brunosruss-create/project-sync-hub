
# Correção: agente vendo tudo como manager

## Diagnóstico

Dois problemas independentes acontecendo ao mesmo tempo:

### 1. Agente enxergando TODAS as conversas do workspace
O bug não está em `createTeamMember` — a role da Jaqueline está salva como `agent` no banco (a UI de Equipe mostra "Agente" corretamente). O problema é de **RLS**: a policy atual de `contacts` (e `messages`, `appointments`, `kanban_columns`) usa apenas:

```
owner_user_id = public.get_my_workspace_owner()
```

Como `get_my_workspace_owner()` resolve para o id do **Bruno** (dono do workspace) tanto pro Bruno quanto pra Jaqueline, **qualquer membro do workspace lê tudo**. Não há diferenciação por role. É exatamente o "acesso de gerente" que ela teve.

### 2. Sidebar/rotas não escondidas para agente
`AppSidebar` marca todos os itens com `agentVisible: true` (exceto Super Admin). Ou seja, o agente vê Dashboard, Relatórios, Configurações, Serviços, Agente IA igual ao manager. Páginas sensíveis (Equipe, WhatsApp, Cobrança, Workspace, Super Admin) também precisam de gate por role no servidor — `ManagerOnly` existe mas nem todas usam.

A criação da role em si está correta (`createTeamMember` deleta o `manager` default do trigger e insere `agent`).

## Plano de correção

### Parte A — RLS (a mudança que realmente resolve o vazamento)

Nova migration `supabase/manual/20260514170000_agent_scoped_access.sql` que **reescreve** as policies de leitura/escrita das tabelas sensíveis para diferenciar manager vs agent.

Regra:
- **Manager** (workspace owner) → enxerga tudo do próprio workspace (igual hoje).
- **Agente** → enxerga apenas registros de `contacts` onde `assigned_agent_id = auth.uid()`. Para `messages`, só as cujo `contact_id` pertence a um contato atribuído a ele. Não pode ver `appointments`/`kanban_columns` de outros (regras análogas via join em contacts).

Helpers SQL novos (SECURITY DEFINER, sem recursão):

```sql
create or replace function public.is_workspace_manager()
returns boolean language sql stable security definer set search_path = public as $$
  select public.has_role(auth.uid(), 'manager')
$$;

create or replace function public.is_contact_visible(_contact_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.contacts c
    where c.id = _contact_id
      and c.owner_user_id = public.get_my_workspace_owner()
      and (
        public.is_workspace_manager()
        or c.assigned_agent_id = auth.uid()
      )
  )
$$;
```

Policies reescritas (DROP + CREATE de cada uma — idempotente):

- `contacts` SELECT/UPDATE/DELETE:
  ```
  using (
    owner_user_id = public.get_my_workspace_owner()
    and (
      public.is_workspace_manager()
      or assigned_agent_id = auth.uid()
    )
  )
  ```
  INSERT continua sendo qualquer membro do workspace (agente pode receber novo contato via webhook ou criar manual já atribuindo a si).

- `messages` SELECT/UPDATE: `using (owner_user_id = get_my_workspace_owner() and (is_workspace_manager() or is_contact_visible(contact_id)))`. INSERT idem (agente só insere em contato visível pra ele).

- `appointments` SELECT/UPDATE/DELETE: mesma regra via `is_contact_visible(contact_id)` para agente.

- `kanban_columns`: leitura aberta a todo membro (são as colunas do board, não dado por contato); escrita apenas manager (`is_workspace_manager()`).

- `whatsapp_instances`: já está OK (leitura compartilhada, escrita só do owner). Não mexer.

Importante: a transferência de conversa que fizemos continua funcionando — `assignContact` roda com middleware autenticado e o `update contacts set assigned_agent_id = ...` precisa que o usuário tenha permissão de UPDATE na linha. Para o agente conseguir transferir uma conversa que está nele, a policy de UPDATE acima já cobre. Para **receber** uma transferência feita por outro agente, o problema é que esse outro agente também precisa ver/atualizar a linha. **Decisão:** a transferência fica permitida apenas para manager — agente não transfere conversa de terceiros. Isso é coerente com o modelo "agente só vê o que é dele". Adicionar verificação no servidor `assignContact` que retorna 403 quando o caller é agent. (Self-assign de conversa "Sem atendente" também só pelo manager — para o MVP.)

### Parte B — UI/rotas (defesa em profundidade)

1. **`src/components/app-sidebar.tsx`**: marcar `agentVisible: false` em Dashboard, Serviços, Agente IA, Relatórios, Configurações, Super Admin. Agente vê apenas: Conversas, Agenda, Contatos.

2. **Envolver com `<ManagerOnly>`** as rotas que ainda não têm:
   - `_authenticated.dashboard.tsx`
   - `_authenticated.reports.tsx`
   - `_authenticated.services.tsx`
   - `_authenticated.ai-agent.tsx`
   - `_authenticated.settings.team.tsx` (verificar — provavelmente já tem)
   - `_authenticated.settings.whatsapp.tsx`
   - `_authenticated.settings.workspace.tsx`
   - `_authenticated.settings.billing.tsx`
   - `_authenticated.super-admin.*` (já tem o próprio gate)

3. **Filtro padrão da Inbox para agente**: em `_authenticated.inbox.tsx`, quando `isAgent`, forçar `filter = "mine"` no mount inicial e esconder o botão "Sem atendente" (ele não vê mesmo, mas a UI precisa ser coerente).

4. **`assignContact` (`src/lib/assignment.functions.ts`)**: bloquear chamada quando o caller for agent (`has_role(userId, 'manager')` falso → 403). `listAssignableMembers` continua liberado.

5. **`/contacts`**: já filtra via RLS, então com a nova policy ele naturalmente só verá os atribuídos a ele. Sem mudança.

### Parte C — Verificação

Depois de rodar a migration, conferir manualmente com a sessão da Jaqueline:
- Inbox lista apenas Cauê (única conversa com `assigned_agent_id = jaqueline.id`).
- Sidebar mostra só Conversas / Agenda / Contatos.
- Acesso direto a `/dashboard`, `/reports`, `/settings/team`, etc → toast "Acesso restrito" e redirect pra `/inbox`.
- Bruno (manager) continua vendo tudo, inclusive a conversa do Cauê.

## Garantias anti-regressão

- Manager (workspace owner) mantém acesso idêntico ao atual — todas as policies têm o ramo `is_workspace_manager()` que abre tudo do workspace.
- Realtime continua funcionando — RLS é aplicada no canal, então o agente só recebe eventos de contatos dele (efeito desejado).
- Webhooks da Evolution rodam com `supabaseAdmin` (service role) e ignoram RLS — inserção de mensagens entrando segue inalterada.
- `forward-modal`, kanban drag-and-drop, agendar, marcar urgente: o agente só executa em contatos visíveis para ele (RLS bloqueia o resto), comportamento esperado.
- Migration é toda `drop policy if exists` + `create policy` + helpers `create or replace` — pode ser re-executada.

## Fora de escopo
- Notificação ao agente quando recebe transferência.
- Permitir que agente "pegue" conversa "Sem atendente" (auto-assign) — exigiria policy mais frouxa de UPDATE; deixar para depois quando a UX estiver definida.
- Auditoria de transferências.
