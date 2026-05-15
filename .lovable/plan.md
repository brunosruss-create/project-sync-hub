## Problemas identificados

1. **Sidebar vaza "Super Admin" para qualquer manager.** O `src/components/app-sidebar.tsx` esconde o item apenas para `isAgent`. Qualquer usuário comum (manager) — incluindo `goldenf0408@gmail.com` — vê o link.
2. **Guard do route confia em `profiles.role`**, coluna ad-hoc que não existe no schema oficial (`app_role` só tem `manager`/`agent`). Hoje qualquer um que clicar pode entrar até a checagem assíncrona terminar.
3. **Páginas Workspaces / Usuários / Saúde / Cobrança usam SEED hard-coded.** Os "usuários" não são reais.

## Escopo cirúrgico (NÃO toco em mais nada)

Apenas arquivos abaixo. Nenhum estilo, layout, RLS de outras tabelas, ou comportamento do app principal será alterado.

### 1. Definição oficial de super admin (1 migração nova)

`supabase/manual/20260517000000_super_admin.sql`:
- `alter type public.app_role add value if not exists 'super_admin';`
- `create or replace function public.is_super_admin() returns boolean security definer …` lendo `user_roles`.
- `grant 'super_admin'` apenas para o e-mail real `bruno…@gmail.com` (lookup em `auth.users`).
- Nada mais — sem mexer em RLS de outras tabelas.

### 2. Hook `useIsSuperAdmin` (novo arquivo)

`src/hooks/use-is-super-admin.tsx` — chama `supabase.rpc('is_super_admin')`, fail-closed (false em qualquer erro). Usa `useAuth` para esperar sessão pronta antes da query.

### 3. Sidebar (1 linha de mudança)

`src/components/app-sidebar.tsx`: filtrar o item "Super Admin" usando `useIsSuperAdmin()`. Sem alterações visuais para os outros itens.

### 4. Guard do layout super admin

`src/routes/_authenticated.super-admin.tsx`: trocar a query em `profiles.role` por `useIsSuperAdmin()` (fail-closed). Mantém o `toast.error` + redirect para `/dashboard`. Layout/visual intactos.

### 5. Server functions com dados reais (admin client)

Novo `src/lib/super-admin.functions.ts` (apenas `createServerFn`, padrão correto):
- `listWorkspaces()` — junta `auth.users` + `user_roles(role='manager')` + agregados de `workspace_members` (count usuários) e `contacts` (count) por `owner_user_id`.
- `listAllUsers()` — `auth.users` + `user_roles` + workspace owner.
- `listInstancesHealth()` — `whatsapp_instances` + `auth.users` (email do dono).
- Todas protegidas por `requireSupabaseAuth` + verificação `is_super_admin()` no handler (defesa em profundidade); usam `supabaseAdmin` para bypass de RLS.

### 6. Substituir SEED nas 3 páginas

- `_authenticated.super-admin.workspaces.tsx`: trocar `SEED` por `useQuery` + `listWorkspaces`. Manter colunas, filtros e estilos.
- `_authenticated.super-admin.users.tsx`: trocar `SEED` por `useQuery` + `listAllUsers`. Mantém UI.
- `_authenticated.super-admin.health.tsx`: trocar `SEED` por `useQuery` + `listInstancesHealth`. Status real = `whatsapp_instances.status`. Métricas inexistentes (msgs/min, latência) ficam como `—` em vez de números falsos.
- `_authenticated.super-admin.billing.tsx`: como ainda não há tabela de billing real, exibir KPIs com valor "—" e tabela "Trials vencidos" derivada de `created_at` dos workspaces sem plano (placeholder honesto, sem dados falsos). Marcar com nota "dados de billing serão integrados quando Stripe estiver ativo".

## Detalhes técnicos

- A nova migração é aditiva (`add value if not exists`, novas funções) — não quebra nada existente.
- `supabaseAdmin` só é usado dentro de `createServerFn` em arquivos `.functions.ts` (regra do template).
- Todas as funções verificam `is_super_admin()` antes de retornar dados — guard duplo (route + server).
- Nenhuma alteração em: app-sidebar styling, settings, inbox, schedule, services, dashboard, RLS de tabelas existentes.

## Resultado esperado

- `goldenf0408@gmail.com` (manager comum) deixa de ver "Super Admin" no sidebar e é bloqueado se acessar a URL diretamente.
- Apenas o e-mail real do dono (bruno…) vê o painel.
- Workspaces / Usuários / Saúde mostram dados reais do Supabase (auth.users, user_roles, workspace_members, whatsapp_instances).
- Cobrança fica honesto até integrar Stripe.
