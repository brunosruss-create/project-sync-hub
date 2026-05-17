# Notificação WhatsApp em criação, reagendamento e cancelamento via /schedule

## Diagnóstico

Hoje a confirmação por WhatsApp (`sendBookingConfirmation` em `src/lib/booking-confirmation.server.ts`) só é disparada em dois lugares:

1. `src/routes/api/public/book.$slug.ts` — quando o cliente agenda pelo link público.
2. `createAppointmentFromAI` — quando a IA cria pelo WhatsApp.

A tela **Agenda** (`src/routes/_authenticated.schedule.tsx`, função `upsert`, linhas 233–263) só faz `supabase.from("appointments").upsert(...)`. Não chama nada de notificação. Por isso editar/reagendar (e mesmo criar manualmente) **não dispara WhatsApp**, mesmo com o toggle "Notificar cliente via WhatsApp" ligado no modal.

O mesmo vale para `setStatus` (cancelar) e `remove`.

## O que vou implementar

### 1. Nova server function: `src/lib/appointments.functions.ts`

`notifyAppointmentChange({ appointmentId, kind })` protegida por `requireSupabaseAuth`. `kind` ∈ `"created" | "rescheduled" | "cancelled"`.

Ela carrega via `supabaseAdmin` (server-side):
- `appointments` (com `contact_id`, `service_id`, `professional_id`, `starts_at`, `notify_whatsapp`, `owner_user_id`)
- `profiles` do owner (nome do negócio + timezone + instância)
- `contacts` (nome + phone)
- `services` (nome, preço, duração)
- `professionals` (nome, opcional)

Regras:
- Aborta silenciosamente se `notify_whatsapp = false`.
- Aborta silenciosamente se a instância WA não estiver `connected` (mesmo padrão atual).
- `kind = "created"` → reusa `sendBookingConfirmation` (texto atual de confirmação).
- `kind = "rescheduled"` → mensagem nova: "Seu agendamento foi *reagendado* para 📅 *<data> às <hora>* — <serviço> · <profissional>".
- `kind = "cancelled"` → mensagem nova: "Seu agendamento de 📅 *<data> às <hora>* foi *cancelado*."

Erros viram `console.warn` (best-effort, não quebram o fluxo da UI), igual à confirmação atual.

### 2. Chamada a partir de `_authenticated.schedule.tsx`

- Em `upsert` (linhas 233–263): comparar com o item anterior em `items`. Se `exists && previous.starts_at !== draft.starts_at` → `kind = "rescheduled"`. Se `!exists` → `kind = "created"`. Só dispara se `draft.notify_whatsapp` e o upsert no Supabase não der erro.
- Em `setStatus` (linhas 265–269): se novo status for `"cancelled"` e `appt.notify_whatsapp` → `kind = "cancelled"`.
- `remove` (linhas 271–276): mantém sem notificação (já está deletado; cancelamento é o caminho correto para notificar).

Disparo via `useServerFn(notifyAppointmentChange)`, em background (`void fn(...)`), para não bloquear o `nfy.success`.

### 3. Sem mudanças em schema/SQL

Tudo reusa colunas existentes (`notify_whatsapp`, `professional_id`, etc.). Nenhuma migration nova.

## Validação após implementar

1. Em `/schedule`, abrir um agendamento existente, mudar horário e salvar → cliente recebe WhatsApp "reagendado".
2. Criar agendamento novo pela Agenda → cliente recebe confirmação (igual ao link público).
3. Marcar status como "Cancelado" → cliente recebe aviso de cancelamento.
4. Com WhatsApp desconectado ou toggle off → nenhuma mensagem, sem erro visível.

## Arquivos afetados

- `src/lib/appointments.functions.ts` (novo)
- `src/lib/booking-confirmation.server.ts` (exporta helper `sendBookingReschedule` / `sendBookingCancellation` reusando `evo` + formatadores)
- `src/routes/_authenticated.schedule.tsx` (chamadas em `upsert` e `setStatus`)
