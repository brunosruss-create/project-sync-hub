## Objetivo

Reagendamento não está funcionando de forma confiável. Como cancelamento e agendamento individuais já funcionam, vamos reescrever o reagendamento como **uma composição dos dois fluxos que já funcionam**: cancela o horário antigo e cria um novo no lugar, em uma única operação atômica do ponto de vista da IA.

## Mudanças

### 1. `src/lib/booking-confirmation.server.ts`
Reescrever `rescheduleAppointmentFromAI` para internamente:
1. Buscar o appointment antigo (id, contact_id, service_id, professional_id) com escopo `owner_user_id`.
2. Validar nova data (futura, válida).
3. Chamar a mesma lógica de **cancelamento** já existente (marca status `cancelled`, libera o slot) — **sem disparar WhatsApp de cancelamento** (flag `silent: true`).
4. Chamar a mesma lógica de **criação** já existente (`createAppointmentFromAI`) reaproveitando service_id, professional_id e contact_id do antigo, com `new_starts_at` — **sem disparar WhatsApp de confirmação normal** (flag `silent: true`).
5. Se a criação falhar (slot ocupado, etc.) → **rollback**: reverter status do antigo para `scheduled` e retornar erro (`slot_taken` / `create_failed`).
6. Se ambos OK → disparar uma única mensagem `sendBookingReschedule` (já existe) com a referência antiga → nova.

Vantagens:
- Elimina o caminho de `update` direto que vinha falhando silenciosamente.
- Garante que o slot antigo é liberado de fato (mesmo código do cancelamento que funciona).
- Garante que o novo passa por todas as validações de conflito/horário do `createAppointmentFromAI` que já funciona.

### 2. `src/lib/booking-confirmation.server.ts` (helpers internos)
Adicionar parâmetro opcional `silent?: boolean` em `createAppointmentFromAI` e `cancelAppointmentFromAI` para suprimir o envio de WhatsApp quando chamados de dentro do reschedule (evita 3 mensagens: cancelado + agendado + reagendado).

### 3. Nenhuma mudança em:
- `src/lib/ai-respond.server.ts` (contrato `RESCHEDULE_JSON` permanece igual: `{appointment_id, new_starts_at}`)
- Prompt da IA
- Rotas, kanban, agenda visual, modo chat

## Comportamento esperado

Cliente: "quero mudar para sexta às 14h"
→ IA confirma (etapa 1) → cliente confirma → IA emite `RESCHEDULE_JSON` (etapa 2)
→ Backend: cancela antigo (libera slot) + cria novo (mesmo serviço/profissional/contato) → envia 1 mensagem "Reagendado!"
→ Se conflito no novo horário: rollback do cancelamento + IA responde que o horário não está disponível.

## Não-objetivos

- Não criar migrations.
- Não tocar em UI / agenda visual / kanban.
- Não alterar prompt da IA nem outros fluxos (criar, cancelar).