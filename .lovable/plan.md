## Causa do erro

A página `/settings/professionals` mostra "workspace owner não encontrado" porque a migration **`supabase/manual/20260516000000_professionals.sql` não foi rodada** no Supabase. Sem ela:

- A tabela `public.professionals` não existe.
- A coluna `appointments.professional_id` não existe.
- As políticas RLS de profissionais não existem.

O código do servidor (`listProfessionals`) chama `get_my_workspace_owner()` via RPC e, como o ambiente do banco está inconsistente com o que o código espera, a chamada falha e cai no fallback de erro genérico.

## Passos

### 1. Rodar a migration no Supabase (ação do usuário)

Abrir o **SQL Editor** do Supabase do projeto e colar/executar o conteúdo de `supabase/manual/20260516000000_professionals.sql` (já enviado no chat anterior). É idempotente — pode rodar com segurança.

Após rodar, recarregar a página `/settings/professionals`. O estado vazio deve aparecer sem o banner vermelho.

### 2. Pequenas correções no `src/lib/professionals.functions.ts`

- Mensagem de erro mais clara em `getOwnerId` quando a RPC falha (mencionar que pode faltar a migration).
- Trocar os filtros `eq("owner_user_id", userId)` em `updateProfessional` e `deleteProfessional` por `eq("owner_user_id", ownerId)` (usando `getOwnerId`) — mais consistente com `listProfessionals` e à prova de manager-não-owner no futuro.
- Sem mudanças em UI ou em outras rotas.

### 3. Validação

- Página `/settings/professionals` carrega sem erro.
- Botão "Adicionar primeiro profissional" abre modal e cria o registro.
- Profissional criado aparece na Agenda no filtro "Profissionais".

## Não muda

- Esquema SQL (a migration entregue já está correta).
- Inbox, Kanban, Equipe, WhatsApp, Serviços, Auth.
