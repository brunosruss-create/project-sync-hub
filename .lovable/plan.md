## Problema

No card "Próximos agendamentos" do dashboard, a coluna de serviço aparece como "—". O código já tenta dois caminhos (junção `appointment_services → services` e fallback por `appointments.service_id → services.id`), mas ambos retornam vazio para os agendamentos exibidos.

Causas prováveis (sem mexer em mais nada do app):

1. Agendamentos antigos foram criados com IDs de serviço fake (`SEED_SERVICES`), que não existem na tabela `services`, então nenhum dos dois lookups encontra nome.
2. Em `schedule-modal.tsx`, o insert em `appointment_services` é feito com `console.warn` em caso de erro — se o snapshot falha (ex.: `service_id` fake violando FK), o appointment fica salvo sem linha em `appointment_services`, e como `service_id` aponta para um id inexistente, o fallback também falha.
3. Possível problema da junção embutida `services(name)` se o PostgREST não detectar a FK pelo nome esperado.

## Correções (somente em `src/features/dashboard/data.ts` e `src/features/inbox/schedule-modal.tsx`)

### 1. `src/features/dashboard/data.ts` — tornar a resolução de nome de serviço robusta

- Substituir a junção embutida `services(name)` por duas queries explícitas:
  - `select("appointment_id, service_id").in("appointment_id", upcomingIds)` em `appointment_services`
  - `select("id,name").in("id", [todos os service_ids coletados de appointment_services + appointments.service_id])` em `services`
- Construir um único `Map<service_id, name>` e resolver `svcLabel` por:
  1. nomes vindos de `appointment_services` para o `appointment_id`
  2. fallback `appointments.service_id`
  3. `"—"` apenas se nenhum dos dois resolver
- Aplicar a mesma simplificação no bloco de "Top 5 serviços" (mesmo padrão: buscar `service_id` em `appointment_services` e mapear nomes em uma query separada à `services`).
- Adicionar `console.debug` curto com os ids não resolvidos, para o usuário conseguir diagnosticar dados antigos com IDs inválidos.

### 2. `src/features/inbox/schedule-modal.tsx` — garantir que novos agendamentos sempre tenham serviço válido

- Antes do insert de `appointments`, validar que todos os `selectedServices[*].id` existem realmente em `services` (query `select("id").in("id", ids)`). Se algum não existir (caso de fallback `SEED_SERVICES`), mostrar `toast.error("Cadastre serviços em /servicos antes de agendar")` e abortar.
- Trocar o `console.warn` do insert em `appointment_services` por `toast.error` + rollback (deletar o appointment recém-criado) em caso de falha, evitando agendamentos órfãos sem snapshot.

## Fora de escopo

- Nenhuma alteração em SQL/migrations, RLS, outros componentes ou estilos.
- Não alterar a lógica de KPIs, kanban, agentes online ou urgentes.

## Verificação

- Após o deploy, criar um novo agendamento via modal escolhendo um serviço real cadastrado em `/servicos`. O nome deve aparecer no card "Próximos agendamentos" e contar em "Top 5 serviços".
- Agendamentos antigos com `service_id` fake continuarão exibindo "—" (esperado — dado inválido no banco).
