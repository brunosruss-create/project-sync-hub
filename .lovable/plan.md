
## Objetivo

Criar a entidade **Profissionais** (quem executa o serviço) totalmente separada de **Equipe** (quem tem login no sistema). A Agenda passa a usar profissionais reais em vez do mock `MOCK_AGENTS`.

## 1. Banco — nova tabela `professionals`

Migração SQL (manual/Supabase), com RLS por `owner_user_id` e suporte a workspace owner (manager + agentes do workspace podem ler):

```sql
create table public.professionals (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  role text default '',           -- cargo livre
  phone text default '',
  email text default '',
  avatar_url text,
  avatar_color text,              -- gerado do nome se null
  linked_user_id uuid references auth.users(id) on delete set null,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);
create index professionals_owner_idx on public.professionals(owner_user_id, is_active);
alter table public.professionals enable row level security;
-- policies: select/insert/update/delete onde owner_user_id = workspace_owner do auth.uid()
```

Adicionar coluna em `appointments` (não remove `agent_id`, evita regressão):

```sql
alter table public.appointments
  add column if not exists professional_id uuid references public.professionals(id) on delete set null;
create index if not exists appointments_professional_idx on public.appointments(professional_id);
```

Realtime: `alter publication supabase_realtime add table public.professionals`.

## 2. Server functions — `src/lib/professionals.functions.ts`

CRUD com `requireSupabaseAuth`, escopado ao `workspace_owner_id` do usuário:
- `listProfessionals()` — todos do workspace (manager) ou os ativos (agente).
- `createProfessional(input)` — Zod: name (obrig.), role/phone/email/linked_user_id/is_active opcionais.
- `updateProfessional({ id, ...patch })`
- `deleteProfessional({ id })` — hard delete.

Apenas `manager` pode criar/editar/excluir; agente só lê.

## 3. Página `/settings/team-members` (Profissionais)

Nova rota `src/routes/_authenticated.settings.team-members.tsx` (path interno; label "Profissionais"; URL pode ser `/settings/professionals`). Usa `SettingsLayout`.

Conteúdo:
- Lista em cartões/linhas com **avatar circular** (foto se `avatar_url`, senão iniciais sobre cor derivada do nome — reutilizar `ContactAvatar` em `src/features/inbox/contact-avatar.tsx`).
- Cada linha: nome, cargo, telefone, badge Ativo/Inativo, menu **⋮** com: Editar, Desativar/Reativar, Excluir (com `ConfirmDialog`).
- **Estado vazio**: ícone `Briefcase` grande, título "Nenhum profissional cadastrado ainda.", subtítulo "Adicione as pessoas que realizam os atendimentos presenciais.", botão "+ Adicionar primeiro profissional".
- Botão "+ Novo profissional" no topo direito.

Modal **Novo / Editar Profissional** (440px):
1. Nome * (placeholder "Nome completo")
2. Cargo — texto livre, dica 11px muted "Defina como preferir — sem restrição de área."
3. Telefone — máscara BR
4. Email
5. Toggle "Esta pessoa também tem acesso ao sistema?" → ao ativar, select com membros de `workspace_members` (server fn `listTeamMembers` já existe). Dica: "Útil quando o profissional também atende pelo WhatsApp."
6. Toggle Ativo (default ligado).

Footer: [Cancelar] [Salvar]. Mutations invalidam `["professionals"]`.

Usa `useQuery`/`useMutation` chamando server fns via `useServerFn`.

## 4. Sidebar de Configurações — `settings-layout.tsx`

Reordenar e separar visualmente com seções:
- **ACESSO AO SISTEMA**: Perfil, Negócio, Equipe
- **AGENDA**: Profissionais (novo)
- (sem grupo): WhatsApp, Planos & Cobrança

Implementação: array de items aceita `{ kind: "section", label } | { kind: "item", ... }` e o render desenha um divisor `border-top` + label uppercase muted antes do grupo.

Atualizar subtítulo da página Equipe (`_authenticated.settings.team.tsx`):
- "Gerencie quem tem acesso ao sistema e atende pelo WhatsApp."

## 5. Agenda — usar profissionais reais

Em `src/routes/_authenticated.schedule.tsx`:
- Remover dependência de `MOCK_AGENTS` (manter no arquivo de data só para fallback DEV se necessário).
- `useQuery(["professionals", ownerUserId], listProfessionals)` para popular a lista de profissionais.
- O state `agents` passa a vir desse query (mapeado para `{ id, name, color: avatar_color || nameToColor(name) }`).
- Filtro superior: trocar label **"Agentes"** → **"Profissionais"**.
- Contador no header: "X de Y profissionais".
- `agent_id` continua sendo gravado no DB (compat) **e** novo `professional_id` (mesmo valor) — escrita no `upsert` adiciona `professional_id: draft.agent_id || null`.
- `mapAppt`: ler `r.professional_id ?? r.agent_id` para preencher `agent_id` interno (sem renomear o campo do tipo `Appointment` para evitar refator amplo).

No **AppointmentModal** (mesmo arquivo) e em **`src/features/inbox/schedule-modal.tsx`**:
- O select "Profissional" usa a lista vinda do query.
- Item exibido: `{name}{role ? ` — ${role}` : ''}` com bolinha colorida.
- Estado vazio inline no select: "Nenhum profissional cadastrado." + Link `/settings/professionals` "Adicionar profissional".

`schedule-modal.tsx` (usado no Inbox/Conversa) recebe `agents` como prop hoje; substituir por busca via `useQuery` interno do mesmo `listProfessionals` para não exigir prop drilling.

## 6. Avatar helper compartilhado

Reutilizar `ContactAvatar` de `src/features/inbox/contact-avatar.tsx` (já implementa iniciais + cor derivada do nome + suporte a `avatar_url`). Sem duplicar código.

## 7. Não-regressão (verificar)

- Kanban, Chat, Dashboard, Equipe, WhatsApp, Serviços, Auth — sem alterações.
- Appointments existentes (apenas com `agent_id`) continuam aparecendo: `mapAppt` lê fallback.
- Filtro da Agenda mantém appointments cujo profissional não está mais cadastrado (mesma regra atual de `knownAgents`).
- Sem seed de profissionais — usuário cadastra os próprios.

## Arquivos

Novos:
- `supabase/manual/20260516000000_professionals.sql`
- `src/lib/professionals.functions.ts`
- `src/routes/_authenticated.settings.professionals.tsx`
- `src/features/settings/professional-modal.tsx`

Editados:
- `src/features/settings/settings-layout.tsx` (sidebar com seções)
- `src/routes/_authenticated.settings.team.tsx` (subtítulo)
- `src/routes/_authenticated.schedule.tsx` (query profissionais, filtro, mapAppt, upsert, label)
- `src/features/inbox/schedule-modal.tsx` (select de profissionais reais + estado vazio)
- `src/features/schedule/data.ts` (manter MOCK como fallback DEV)

## Pontos a confirmar antes de implementar

1. URL da rota: `/settings/professionals` (sugerido) ou `/settings/profissionais` (português, como mencionado)?
2. `linked_user_id` é só metadado por enquanto, certo? Não cria login nem altera permissões — apenas marca que o profissional X corresponde ao membro Y da equipe.
3. Manter `agent_id` na tabela `appointments` indefinidamente como espelho de `professional_id`, ou planejar migração futura para remover?
