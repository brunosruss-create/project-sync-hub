## Escopo

Apenas `src/routes/_authenticated.reports.tsx`. Não tocar em dashboard, inbox, schedule, services nem em nenhum outro arquivo de feature. Dashboard fica para um plano separado.

## Diagnóstico atual

A página `/reports` chama exclusivamente `mockData()` e `mockSeries()` — KPIs, séries dos gráficos, ranking de agentes, top serviços, receita: tudo literal. Nada vem do banco.

## Tabelas reais disponíveis (já em uso no app)

- `messages` (owner_user_id, contact_id, direction `inbound|outbound`, status, sent_by, created_at, message_type)
- `appointments` (owner_user_id, contact_id, service_id, agent_id, starts_at, ends_at, status)
- `appointment_services` (appointment_id, service_id, owner_user_id)
- `services` (id, name, price_cents, duration_minutes, status)
- `contacts` (id, owner_user_id)
- `kanban_columns` (id, slug, label)

Não existe tabela `agents` no banco — agentes hoje são `MOCK_AGENTS` em `schedule/data.ts`. O ranking por agente usará `sent_by` (uuid de `auth.users`) agrupado, exibindo o nome via `profiles.full_name` quando possível e fallback para o uuid abreviado. Sem tabela `agents` real, a aba "Equipe" some o conceito de "Sofia (IA)" hardcoded.

## Plano por aba

### A. Aba "Atendimento" (service)

Fonte: `messages` filtrado por `owner_user_id = auth.uid()` e `created_at` no período selecionado.

- **Volume por dia (gráfico)**: `count(*) where direction='inbound' group by date_trunc('day', created_at)` — preencher dias vazios com 0. Para `today`, agrupar por hora (00h–23h).
- **Tempo médio de resposta (TMR)**: para cada `inbound`, achar o próximo `outbound` do mesmo `contact_id` posterior; média dos deltas em segundos. Calculado client-side após puxar `id, contact_id, direction, created_at` do período (limit alto, paginar se >5k).
- **Taxa de resolução**: `appointments.completed / total_appointments` no período (proxy honesto). Documentar no tooltip "% de agendamentos concluídos".
- **Ranking por agente**: `group by sent_by` em `messages where direction='outbound'`. Colunas: nome (resolvido via `profiles`), atendimentos (contagem de conversas distintas — `count(distinct contact_id)`), TMR por agente, resolvidos (count de appointments com `agent_id = sent_by` e status `completed`).
- **Delta vs. período anterior**: refazer mesma query no intervalo anterior de mesmo tamanho; calcular `(atual-anterior)/anterior`. Se anterior=0, exibir "—".

### B. Aba "Agendamentos" (appointments)

Fonte: `appointments` + `appointment_services` no período (`starts_at` no range), `owner_user_id = auth.uid()`.

- **Agendamentos por dia (linha)**: `count(*) group by date(starts_at)`. Para `today`, por hora.
- **No-show rate**: `count(status='cancelled') / count(*)` (sem coluna `no_show`, usar `cancelled` como proxy e renomear o card para "Taxa de cancelamento").
- **Receita estimada**: somar `services.price_cents` via join `appointment_services → services` para appointments com status em `('confirmed','in_progress','completed')`. Formatar BRL.
- **Top serviços agendados**: `group by service_id`, count e soma de receita. Resolver nomes via `services`.

### C. Aba "Serviços" (services)

Mesma base (appointments concluídos no período + appointment_services + services).

- **Receita total**: soma `price_cents` de serviços em appointments `completed`.
- **Ticket médio**: receita_total / count(distinct appointment_id).
- **Receita por serviço**: `group by service_id` → vendas (qty), receita, ticket médio (receita/qty).

### D. Aba "Equipe" (team)

- Mesmo agrupamento de "Ranking por agente" da aba A, mas adiciona "Tempo médio" (= TMR) e omite "Satisfação" (não há dado real — remover a coluna; não inventar).

## Arquitetura de dados

- Criar `src/features/reports/data.functions.ts` com **server functions** TanStack (`createServerFn` + `requireSupabaseAuth`) — uma por aba: `getServiceReport`, `getAppointmentsReport`, `getServicesReport`, `getTeamReport`. Cada uma recebe `{ period: 'today'|'7d'|'30d' }`, calcula `[start, end]` server-side e retorna o shape exato consumido pela UI.
- Em `_authenticated.reports.tsx`, substituir `mockData/mockSeries` por `useQuery` (TanStack Query) com `queryKey: ['reports', tab, period]`, `staleTime: 30_000`. Loading mantém os `SkeletonCard`. Erro: `EmptyState` com mensagem.
- Realtime opcional (fora deste plano) — manter polling implícito do refetch ao trocar período/aba.
- Resolução de nomes (serviços, agentes/profiles) feita server-side em uma única query com `in('id', [...])` para evitar N+1.

## Detalhes técnicos

- Janela de período (server-side, timezone do servidor UTC; UI exibe local):
  - `today` → `[startOfDay(now), now]`
  - `7d` → `[now - 7d, now]`
  - `30d` → `[now - 30d, now]`
- Período anterior para deltas: mesma duração imediatamente antes do início.
- Formatação: `Intl.NumberFormat('pt-BR', { style:'currency', currency:'BRL' })` para receita, `mm:ss` para TMR (`<1min` em segundos).
- Export CSV continua client-side, mas usando os dados reais retornados (não mock).
- Paginação defensiva: `messages.select(...).range(0, 9999)`; se `count > 10k`, exibir aviso e usar agregação SQL via RPC (fora do escopo desta primeira passada — adicionar TODO).
- Estados vazios: cada aba mostra `EmptyState` quando o resultado for 0 linhas em todas as métricas.

## Critérios de aceite

1. Sem chamadas a `mockData`/`mockSeries` no arquivo final (grep deve retornar 0).
2. Trocar período/aba dispara request e atualiza números.
3. Criar um appointment `completed` em `/schedule` → recarregar `/reports` (aba Serviços) → receita e ticket médio refletem.
4. Enviar uma mensagem no inbox → "Volume por dia" da aba Atendimento incrementa o bucket do dia atual.
5. Sem dados no período → cada card/tabela mostra "—" ou `EmptyState`, sem números fictícios.
6. Nenhum outro arquivo do projeto modificado (apenas `_authenticated.reports.tsx` + novo `src/features/reports/data.functions.ts`).

## Fora deste plano (pedidos pelo usuário em separado)

- Dashboard (`_authenticated.dashboard.tsx`) também está mockado, mas o usuário pediu explicitamente para não tocar agora. Será endereçado em plano próprio.
- Tabela real de `agents` / "Sofia (IA)" / métrica de satisfação — exigem schema novo, fora do escopo.
