## Objetivo

Tornar o sistema **multi-tenant por workspace** de verdade: o manager (cliente SaaS) cria a equipe pelo painel, e todos os membros dessa equipe enxergam **a mesma inbox / mesmo número de WhatsApp / mesmos contatos** que o manager. Hoje cada `auth.users.id` é uma ilha isolada — vamos introduzir o conceito de "workspace = manager".

## Modelo de dados

**Conceito:** workspace é identificado pelo `user_id` do manager. Não precisa de tabela `workspaces` — economiza migrations.

```sql
-- Quem pertence a qual workspace
create table public.workspace_members (
  id uuid primary key default gen_random_uuid(),
  workspace_owner_id uuid references auth.users(id) on delete cascade not null, -- = manager
  member_user_id     uuid references auth.users(id) on delete cascade not null,
  active boolean default true not null,
  created_at timestamptz default now() not null,
  unique (workspace_owner_id, member_user_id)
);

-- Função: dado o usuário logado, retorna o id do dono do workspace dele
-- (se ele é manager → retorna o próprio id; se é agente → retorna o manager dele)
create function public.get_my_workspace_owner() returns uuid ...
```

Backfill: para cada manager existente, insere ele mesmo em `workspace_members` como membro do próprio workspace.

## RLS — aqui está a mudança crítica

Hoje as policies em `contacts`, `messages`, `whatsapp_instances`, `kanban_columns`, `appointments` usam `owner_user_id = auth.uid()`. Vamos trocar por:

```sql
using (owner_user_id = public.get_my_workspace_owner())
```

Resultado: agente logado lê/escreve nos dados do manager dele. Os inserts continuam usando `owner_user_id = get_my_workspace_owner()` para que dados criados por agentes pertençam ao workspace do manager (e não ao próprio agente).

Tabelas afetadas: `contacts`, `messages`, `whatsapp_instances`, `kanban_columns`, `appointments`. Atualizo todas as policies "Users can ..." e as guards "owner guard ...".

## Backend — server functions (admin)

Novo arquivo `src/lib/team.functions.ts`:

| Função | O que faz | Quem pode chamar |
|---|---|---|
| `listTeamMembers` | Lista membros do workspace do usuário logado (join `workspace_members` + `auth.users` + `user_roles`) | Manager |
| `createTeamMember` | Recebe `{ email, password, fullName, role }`. Usa `supabaseAdmin.auth.admin.createUser({ email_confirm: true })`, insere em `user_roles` (role = 'agent' ou 'manager'), insere em `workspace_members` apontando para o workspace do chamador | Manager |
| `updateTeamMember` | Toggle ativo/inativo, mudar role | Manager |
| `removeTeamMember` | Remove de `workspace_members` + `user_roles` (não deleta `auth.users` para preservar histórico) | Manager |

Todas usam `requireSupabaseAuth` + checam `has_role(auth.uid(), 'manager')` no início. Bloqueia agente tentar bypassar.

## Frontend

**`src/routes/_authenticated.settings.team.tsx`** — substituir o mock `SEED` por dados reais via `useQuery(listTeamMembers)`. Modal de convite ganha campos: email, senha temporária, nome, role. Submit → `useMutation(createTeamMember)`. Toggle/remover usam `updateTeamMember`/`removeTeamMember`. Toast de sucesso, invalidate da query.

**`src/hooks/use-role.tsx`** — já existe. Continua válido.

**Sidebar e guards** — não muda. Já bloqueia agente nas rotas sensíveis.

**Decisão sobre criação:** email + senha temporária (sem dependência de email infra). Manager entrega a senha pro agente; agente loga e (futuramente) pode trocar via `/settings/profile`.

## Validação

1. Manager (você) loga → vê tudo igual + Equipe lista só você.
2. Em /settings/team → "Convidar membro" → cria `agente@x.com / 123456 / Agente` → aparece na lista.
3. Logout, login como `agente@x.com` → sidebar enxuta (sem Configurações/Super Admin) → Inbox carrega **as mesmas conversas que o manager vê** → manda mensagem → manager vê (mesmo workspace).
4. Manager remove o agente → próxima requisição do agente devolve dados vazios (RLS bloqueia).

## Arquivos tocados

**Migration nova** (`supabase/manual/20260514160000_workspace_members.sql`):
- cria `workspace_members` + RLS
- cria `get_my_workspace_owner()`
- backfill: managers existentes
- **substitui todas as policies** de `contacts`, `messages`, `whatsapp_instances`, `kanban_columns`, `appointments` para usar `get_my_workspace_owner()`

**Frontend:**
- `src/lib/team.functions.ts` (novo) — server functions admin
- `src/routes/_authenticated.settings.team.tsx` — UI real, sem SEED

**O que NÃO muda:**
- Inbox, Kanban, drag-and-drop, chat, realtime, dashboard, conexão Evolution, webhook, schedule — código continua usando `owner_user_id`. As queries que hoje filtram por `auth.uid()` no client passam a ser cobertas pela RLS reescrita (RLS faz o filtro). Onde o client passa `owner_user_id: user.id` em inserts, troco para `get_my_workspace_owner()` via uma função SQL ou faço o insert via server function que resolve o owner.

## Pontos de atenção

1. **Inserts no client com `owner_user_id: user.id`**: hoje muitos componentes (new-contact-modal, schedule-modal, etc.) inserem com `owner_user_id: user.id`. Para um agente isso violaria a RLS. Solução simples: a nova RLS de INSERT aceita `owner_user_id IN (auth.uid(), get_my_workspace_owner())` — agente que envia o próprio uid falha, mas o client passa a usar `get_my_workspace_owner()`. Vou criar um helper React `useWorkspaceOwnerId()` que cacheia esse valor e atualizar os ~6 componentes que fazem insert.

2. **`evolution.functions.ts`**: o `getOrCreateRow` usa `auth.uid()` como `owner_user_id` da `whatsapp_instances`. Como WhatsApp é manager-only (já bloqueado por guard), esse caminho só roda para manager → `auth.uid() === get_my_workspace_owner()`. Sem mudança.

3. **Realtime**: os filtros `postgres_changes` filtram por `owner_user_id=eq.${user.id}`. Trocar por `eq.${workspaceOwnerId}` nos componentes de inbox/messages.

## Escopo fora desta entrega

- Convite por email com link mágico (fica para depois — exige infra de email)
- Atribuição de conversa a agente específico (`assignedAgent` ainda mock)
- Tela do agente trocar a própria senha (já existe? checar `/settings/profile`)
