## Escopo

Apenas dentro de `/super-admin/*`. Nenhuma mudança em kanban, chat, whatsapp, agenda, serviços, auth, ou RLS de tabelas de produto. Tudo aditivo.

## 1. Migração SQL nova
Arquivo: `supabase/manual/20260518000000_super_admin_actions.sql`

- `alter table public.profiles add column if not exists is_blocked boolean default false;`
- `alter table public.profiles add column if not exists plan text;` (se ainda não existir; usado pela tab Configurações)
- Índices: `contacts(owner_user_id, last_message_at desc)`.
- Tabela `audit_logs` (idempotente: actor_id, actor_email, action, resource_type, resource_id, metadata jsonb, created_at).
- Novas RPCs SECURITY DEFINER, todas com guard `if not public.is_super_admin() then raise exception 'forbidden'`:
  - `admin_workspace_summary(owner uuid)` → métricas (contatos, mensagens mês, agendamentos, membros, plano, instância WA, último ping, número).
  - `admin_workspace_members(owner uuid)` → membros (id, email, full_name, role, is_blocked, created_at).
  - `admin_workspace_contacts(owner uuid, lim int default 50)` → contatos read-only.
  - `admin_workspace_audit(owner uuid, lim int default 5)` → últimas ações.
  - `admin_set_user_role(target uuid, new_role app_role)` → update + audit insert; bloqueia auto-rebaixar de super_admin.
  - `admin_set_user_blocked(target uuid, blocked boolean)` → update + audit; bloqueia auto-bloqueio.
  - `admin_set_workspace_plan(owner uuid, plan text)` → update + audit.
- Sem novas policies destrutivas; service role continua bypassando.

## 2. Server functions novas
Arquivo: `src/lib/super-admin-actions.functions.ts` — apenas `createServerFn` + imports.

Cada uma: `requireSupabaseAuth` + checa `is_super_admin()` via RPC com `supabaseAdmin`, log em audit_logs, retorna DTO simples.

- `getWorkspaceDetail({ ownerId })` → chama as 4 RPCs `admin_workspace_*` em paralelo.
- `setUserRole({ userId, role })`.
- `setUserBlocked({ userId, blocked })`.
- `setWorkspacePlan({ ownerId, plan })`.
- `resetUserPassword({ userId })` → usa `supabaseAdmin.auth.admin.generateLink({ type: 'recovery', email })` e dispara o email padrão; loga em audit. Server-only (service role).
- `forceWhatsappReconnect({ ownerId })` → opcional: chama Evolution helper já existente, sem mexer no fluxo do cliente.
- `suspendWorkspace({ ownerId })` / `deleteWorkspace({ ownerId, confirmEmail })` → marca todos os membros `is_blocked=true`; delete só se confirmEmail bate com email do dono.

Validação Zod em todos os inputs (uuid, enum, max length).

## 3. UI — novo drawer
Arquivo novo: `src/features/super-admin/inspect-workspace-drawer.tsx`

- Drawer 520px slide-in da direita, 200ms ease-out, overlay escuro com clique fora fechando.
- Header: avatar (iniciais), nome do dono, badge status WA, botão ✕.
- Tabs (state local): Resumo / Usuários / Contatos / Configurações.
- Cada tab tem `useQuery` próprio com `queryKey: ['admin','ws', ownerId, tab]`.
- Resumo: 2x2 cards de métricas + bloco info + lista das 5 últimas ações.
- Usuários: lista membros com avatar colorido determinístico, badge role, dropdown ⋮ (Trocar role / Resetar senha / Bloquear|Desbloquear). Mutations invalidam o query.
- Contatos: tabela read-only, "Mostrando 50 de N".
- Configurações: bloco WA (instance, status, ping, número, botão Forçar reconexão), select de plano + Salvar, ações de risco (Suspender, Deletar — modal de confirmação digitando email do dono).
- Toda mutation: `useMutation` + toast + invalidate query.

Estilo: reutiliza `adminCard`, tokens existentes; nada de cores hardcoded fora do padrão já aplicado nas páginas admin atuais (mantém o padrão inline-style usado lá).

## 4. Integração na tela Workspaces
Arquivo: `src/routes/_authenticated.super-admin.workspaces.tsx`

- Adiciona estado `inspectId: string | null`.
- Botão 👁 (linha 138-140) passa a `setInspectId(w.workspace_owner_id)` em vez do toast.
- Renderiza `<InspectWorkspaceDrawer ownerId={inspectId} onClose={…} />` no fim do componente.
- Suspender/Excluir continuam por enquanto OU passam a chamar `suspendWorkspace`/`deleteWorkspace` com confirm dialog (incluído).

## 5. Tela Usuários — limpeza + ações
Arquivo: `src/routes/_authenticated.super-admin.users.tsx`

- **Remover** botão "Impersonar" e import `UserCog` se ficar órfão.
- Coluna "Ações" passa a ser um menu ⋮ com:
  - Trocar role (popover inline com select; opção super_admin só aparece para super_admin atual — já é o caso já que a tela inteira é gated).
  - Resetar senha (modal de confirmação → `resetUserPassword`).
  - Bloquear/Desbloquear (modal só para bloquear).
- Adiciona campo `is_blocked` no tipo `User` e no SELECT da RPC `admin_list_users` (atualizar a função no novo SQL — basta `create or replace` da RPC existente acrescentando a coluna; idempotente).
- Linha de usuário bloqueado: opacity 0.5 + badge vermelho "Bloqueado" ao lado do nome.
- Mutations invalidam `["admin","users"]`.

## 6. Bloqueio de login para usuários `is_blocked`
Arquivo: `src/routes/_authenticated.tsx` (apenas o guard que já existe)

- Após carregar profile, se `profile.is_blocked === true` → `signOut()` + redirect para `/login?blocked=1` + toast "Sua conta foi bloqueada por um administrador". Mudança de ~5 linhas, não toca em mais nada do fluxo de auth.
- Página `/login` mostra mensagem se `?blocked=1`. (1 linha).

## 7. Segurança / regras invariantes
- Nenhuma operação admin no client direto: tudo via server fn com service role.
- Toda server fn re-verifica `is_super_admin()` no handler (defesa em profundidade).
- Auto-proteção: server fns rejeitam quando `target === actor` para bloquear/rebaixar.
- audit_logs preenchido em toda mutation.

## Arquivos tocados (resumo)

Novos:
- `supabase/manual/20260518000000_super_admin_actions.sql`
- `src/lib/super-admin-actions.functions.ts`
- `src/features/super-admin/inspect-workspace-drawer.tsx`

Editados (cirúrgico):
- `src/routes/_authenticated.super-admin.workspaces.tsx` — adicionar drawer + handlers.
- `src/routes/_authenticated.super-admin.users.tsx` — remover Impersonar, trocar ações, badge bloqueado.
- `src/routes/_authenticated.tsx` — 5 linhas para gate `is_blocked`.
- `src/routes/login.tsx` — mensagem opcional `?blocked=1`.

NÃO tocados: kanban, inbox, whatsapp, agenda, serviços, settings do cliente, RLS de outras tabelas, sidebar, dashboard, hooks de auth.

## Ação manual exigida ao usuário
Rodar o novo SQL `20260518000000_super_admin_actions.sql` no SQL Editor (em uma única execução — não envolve `ALTER TYPE … ADD VALUE`, então é seguro).
