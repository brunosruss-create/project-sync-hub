## Plano — 3 correções

### 1. Cancelamento libera o slot na agenda
Hoje o agendamento cancelado continua ocupando o horário visualmente e bloqueando a detecção de conflito.

- `src/routes/_authenticated.schedule.tsx`
  - No `upsert`, ignorar conflitos com `status === "cancelled"`.
  - Derivar `visibleItems = items.filter(a => a.status !== "cancelled")` e passar esse array para `WeekView`, `DayView`, `MonthView` e `AgendaList`.
  - Mantém `items` completo internamente (não quebra o modal de detalhes nem o histórico).

### 2. Histórico do lead registra todas as ações
Hoje o "Histórico" mostra o estado atual do appointment (só 1 linha), não as ações.

Criar tabela `appointment_events` (created / rescheduled / cancelled) e exibir como timeline.

- Nova migration: `supabase/manual/20260609000000_appointment_events.sql` (SQL colado no chat).
- `src/lib/appointments.functions.ts`: dentro de `notifyAppointmentChange`, gravar uma linha em `appointment_events` (kind + starts_at antigo/novo) antes do envio do WhatsApp. Assim cobre create + reschedule + cancel disparados pela agenda.
- `src/routes/_authenticated.schedule.tsx`: passar o `previous.starts_at` para a server fn quando for `rescheduled`, para registrar o de/para.
- `src/features/inbox/conversation-panel.tsx` → `HistoryTab`: buscar `appointment_events` JOIN com `appointments` + `services`, renderizar uma linha por evento com badge ("Agendado", "Reagendado", "Cancelado") e horário formatado em pt-BR.

### 3. Horário da mensagem WhatsApp bate com o da agenda
A agenda usa `Date.getHours()` (tz do navegador). O servidor formata com `business_timezone`. Quando os dois divergem → diferença de horas (ex.: agenda 08:00, mensagem 06:00).

Solução: tratar o horário escolhido sempre no `business_timezone`, ignorando o tz do navegador.

- Novo helper `src/features/schedule/tz.ts`:
  - `zonedToUtc(year, month, day, hour, minute, tz): Date` — converte H/M no tz do negócio para o instante UTC correto.
  - `utcToZonedFields(d: Date, tz): { y, mo, da, h, mi }` — extrai os campos wall-clock no tz do negócio.
  - `makeLocalLikeDate(fields)` — cria `new Date(y,mo,da,h,mi)` para que `getHours()` reflita o tz do negócio mesmo no navegador.
- `src/routes/_authenticated.schedule.tsx`:
  - Obter `tz` via `useProfile()` (com fallback `America/Sao_Paulo`).
  - No `mapAppt`: armazenar `starts_at` / `ends_at` como "fake-local Date" reproduzindo as horas do `business_timezone` (mantém todo o grid/`getHours()` funcionando sem mexer nos cálculos de layout).
  - No `upsert`: ao enviar `toISOString()`, converter de volta usando `zonedToUtc` para que o instante UTC gravado corresponda ao H/M escolhido no tz do negócio.
  - No modal `AppointmentForm`: idem — `baseDate.getHours()` continua valendo porque `mapAppt` já normalizou.

Com isso a agenda e a mensagem mostram exatamente o mesmo H:M.

## Detalhes técnicos

### SQL (será colado aberto no chat)
```sql
create table if not exists public.appointment_events (
  id uuid primary key default gen_random_uuid(),
  appointment_id uuid not null references public.appointments(id) on delete cascade,
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  contact_id uuid references public.contacts(id) on delete set null,
  kind text not null check (kind in ('created','rescheduled','cancelled')),
  starts_at timestamptz,        -- novo horário (created/rescheduled) ou horário cancelado
  previous_starts_at timestamptz, -- só em rescheduled
  created_at timestamptz not null default now()
);
create index if not exists appointment_events_contact_idx
  on public.appointment_events(contact_id, created_at desc);
create index if not exists appointment_events_owner_idx
  on public.appointment_events(owner_user_id, created_at desc);
alter table public.appointment_events enable row level security;
drop policy if exists "ws members read appointment_events" on public.appointment_events;
create policy "ws members read appointment_events"
  on public.appointment_events for select to authenticated
  using (owner_user_id = public.get_my_workspace_owner());
```
(insert via service role no server fn — sem policy de insert para o usuário.)

### Restrições
- Sem libs externas de data.
- Sem mexer em auth/schema fora da nova tabela.
- Sem regressão nas funções existentes do schedule grid.

## Riscos
- Refator de tz pode quebrar comparações de data (`sameDay`, ordenação). Mitigado por manter Dates "fake-local" consistentes — todas as comparações continuam valendo.
- Conflito: filtrar cancelled libera o slot mas não impede que histórico/relatórios contem cancelados (ok, eles vêm do banco direto).
