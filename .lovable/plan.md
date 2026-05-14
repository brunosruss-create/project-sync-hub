## Objetivo

Implementar a distinção real entre **Manager** e **Agente** no nível de permissões: criar a tabela `user_roles` no Supabase e bloquear o acesso de Agentes às rotas sensíveis (Equipe, WhatsApp, Billing, Workspace, Super Admin). Sem mexer em convite por email e sem filtrar conversas ainda.

## Escopo desta entrega

**Inclui:**
1. Schema `user_roles` + função `has_role()` no banco
2. Hook `useRole()` para o frontend ler o papel do usuário logado
3. Esconder itens de menu sensíveis na sidebar para Agentes
4. Bloquear navegação direta nas rotas sensíveis (redirect para `/inbox`)
5. Auto-promover o **primeiro usuário do sistema a Manager** + qualquer usuário sem papel cair em Manager (compat: ninguém é deslogado)

**Não inclui (fica para depois):**
- Convite real por email (o modal continua mock)
- Filtro de conversas por agente atribuído
- Mudar dados do mock `_authenticated.settings.team.tsx` para vir do banco

## Mudanças no banco (migration)

```sql
-- 1) Enum de papéis
create type public.app_role as enum ('manager', 'agent');

-- 2) Tabela user_roles (NUNCA na profiles, por segurança)
create table public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  role app_role not null,
  created_at timestamptz default now() not null,
  unique (user_id, role)
);

alter table public.user_roles enable row level security;

-- 3) Função SECURITY DEFINER para checar papel sem recursão
create or replace function public.has_role(_user_id uuid, _role app_role)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.user_roles
    where user_id = _user_id and role = _role
  )
$$;

-- 4) Função para retornar o papel "principal" do usuário (manager > agent)
create or replace function public.get_my_role()
returns app_role
language sql stable security definer set search_path = public
as $$
  select role from public.user_roles
  where user_id = auth.uid()
  order by case role when 'manager' then 1 when 'agent' then 2 end
  limit 1
$$;

-- 5) RLS: cada usuário lê só seu próprio papel
create policy "users read own roles"
on public.user_roles for select to authenticated
using (user_id = auth.uid());

-- 6) Backfill: todo usuário existente vira manager (compat)
insert into public.user_roles (user_id, role)
select id, 'manager'::app_role from auth.users
on conflict (user_id, role) do nothing;

-- 7) Trigger: novo signup vira manager por padrão
create or replace function public.handle_new_user_role()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  insert into public.user_roles (user_id, role)
  values (new.id, 'manager')
  on conflict do nothing;
  return new;
end $$;

create trigger on_auth_user_created_role
after insert on auth.users
for each row execute function public.handle_new_user_role();
```

> Decisão: novo usuário entra como **manager** por padrão (cada um cria seu próprio workspace). Quando o convite real existir, o convite criará a linha como `agent` antes do signup.

## Mudanças no frontend

### Novo: `src/hooks/use-role.tsx`
Hook que chama `supabase.rpc('get_my_role')`, retorna `'manager' | 'agent' | null` + `isManager`, `isAgent`, `loading`. Cacheado por React Query e re-fetch em `onAuthStateChange`. Fallback: se RPC falhar ou retornar null → trata como `manager` (não bloqueia ninguém em caso de erro).

### `src/components/app-sidebar.tsx`
Filtrar `items` antes do render: para Agentes, esconder **Configurações** e **Super Admin**. Demais itens (Dashboard, Conversas, Agenda, Serviços, Agente IA, Contatos, Relatórios) ficam visíveis.

### Bloqueio de rotas sensíveis
Adicionar `beforeLoad` (ou guard via `useEffect` + redirect) nas seguintes rotas — se `role === 'agent'`, redireciona para `/inbox`:
- `_authenticated.settings.team.tsx`
- `_authenticated.settings.whatsapp.tsx`
- `_authenticated.settings.billing.tsx`
- `_authenticated.settings.workspace.tsx`
- `_authenticated.super-admin.*` (todas)

`/settings/profile` continua acessível para Agente (ele precisa editar o próprio perfil).

### Tela `/settings/team` (mock)
Manter o mock como está nesta entrega — só adicionar uma nota visual no topo: "Em breve: convite real por email". O escopo de tornar essa tela funcional fica para a próxima iteração.

## Arquivos tocados

- **migration nova** (criar via ferramenta de schema)
- `src/hooks/use-role.tsx` (novo)
- `src/components/app-sidebar.tsx` (filtrar itens)
- `src/routes/_authenticated.settings.team.tsx` (guard + nota)
- `src/routes/_authenticated.settings.whatsapp.tsx` (guard)
- `src/routes/_authenticated.settings.billing.tsx` (guard)
- `src/routes/_authenticated.settings.workspace.tsx` (guard)
- `src/routes/_authenticated.super-admin.tsx` (guard no layout — protege todas as filhas)

## Validação

1. Usuário existente loga → vira manager via backfill → vê tudo igual hoje.
2. Inserir manualmente no banco `INSERT INTO user_roles (user_id, role) VALUES ('<id>', 'agent')` + remover o role manager dele → usuário deslogou+logou → não vê mais "Configurações" e "Super Admin" na sidebar; navegar manualmente para `/settings/team` redireciona para `/inbox`.
3. Novo signup → trigger cria role 'manager' → vê tudo.

## O que NÃO muda

Inbox, Kanban, drag-and-drop, chat, mensagens, realtime, dashboard, conexão WhatsApp Evolution, webhook handler — tudo intocado.
