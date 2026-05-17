# Objetivo

Unificar o motor de agendamento. Hoje existem dois caminhos:

- **Lead (Inbox → ScheduleModal)** — UI da foto 2, com grid de horários disponíveis (busy/passado riscado), realtime, multi-serviços, prévia da mensagem.
- **Agenda (`/schedule` → AppointmentModal)** — UI da foto 1, dropdown simples de horários sem checagem de disponibilidade, contato inline, sem snapshot de serviços, sem ligação com `appointment_events`.

Resultado esperado: ao abrir "Novo Agendamento" na Agenda, o usuário vê **a mesma tela da foto 2** (grid de slots com disponibilidade em tempo real). Mudar horário, cancelar ou criar pelo lead reflete **imediatamente** nos slots disponíveis em qualquer entrada (mesma fonte de verdade).

# Estratégia

Promover o `ScheduleModal` (do Inbox) ao único componente de criação/edição de agendamento. O `AppointmentModal` da agenda é descontinuado.

## Mudanças no `ScheduleModal` (`src/features/inbox/schedule-modal.tsx`)

Tornar o modal reutilizável tanto pelo lead quanto pela agenda.

1. **Tornar `contact` opcional**:
   - Quando `contact` for fornecido (uso atual no inbox) → comportamento atual.
   - Quando ausente → renderizar bloco "Contato" no topo, com autocomplete por nome/telefone + opção "Adicionar novo" (mesma UX que existe hoje no `AppointmentModal` da agenda). Carregar contatos via `supabase.from("contacts")`.

2. **Novo prop `initial?: Appointment`** (modo edição):
   - Pré-preenche serviços (via `appointment_services` do banco), data, hora, agente, observações, notify.
   - Submit faz `UPDATE` em vez de `INSERT`; recria snapshot em `appointment_services` (delete + insert) se conjunto de serviços mudou.
   - Mostra botões adicionais no rodapé: **Cancelar agendamento** (status `cancelled`) e **Excluir**.

3. **Novo prop `preset?: { starts_at?: Date; agent_id?: string }`**:
   - Quando o usuário clica numa célula vazia da grade da agenda, abre o modal já com a data/hora/profissional daquele slot.

4. **Centralizar disparo de notificações e histórico**:
   - Após `INSERT` bem-sucedido → chamar `notifyAppointmentChange({ appointmentId, kind: "created" })` (server fn). Hoje o ScheduleModal NÃO chama isso; só insere uma mensagem `outbound` direto. Substituir pela chamada à server fn, que já registra `appointment_events` + envia WhatsApp via template oficial.
   - Em modo edição, se `starts_at` mudou → `kind: "rescheduled"` com `previousStartsAt`.
   - Em cancelamento → `kind: "cancelled"`.
   - Remover o `messages.insert` outbound manual (a server fn de notificação já cuida disso).

5. **Bloquear self-conflict no modo edição**:
   - No cálculo de `slotState`, ignorar o próprio `initial?.id` ao verificar `busy`, para que o horário atual do agendamento sendo editado não apareça como ocupado por ele mesmo.

## Mudanças em `src/routes/_authenticated.schedule.tsx`

1. **Remover** o componente local `AppointmentModal` / `AppointmentForm` e toda a função `upsert` (linhas ~254–324), bem como a função `remove` direta (linhas ~338–343).

2. **Substituir o uso** (linhas ~568–593 e ~595–607) por:
   - `<ScheduleModal open={!!editing} ... initial={editing.appt} preset={editing.preset} onClose={...} onSubmitted={...} />`
   - O `DetailPanel` (clique em card existente) passa a abrir o `ScheduleModal` em modo edição, mantendo botões de status/cancelar/excluir dentro dele.

3. **Realtime**: a Agenda já assina `appointments-rt` (linha ~210). O ScheduleModal também assina `schedule-modal-busy-${date}`. Ambos disparam re-fetch a partir do mesmo `INSERT/UPDATE/DELETE`, então um agendamento criado pelo lead remove o slot na Agenda instantaneamente, e vice-versa. Nenhuma mudança nova — já funciona pelo Postgres Changes.

4. **Optimistic update**: o `upsert` otimista da agenda some. A grade espera o evento de realtime para renderizar. Para evitar flicker, o `ScheduleModal` pode emitir o `CustomEvent("zf:appointment-created")` (já existe na linha 326) e a Agenda escuta esse evento para inserir/atualizar localmente antes do realtime chegar.

## Itens fora do escopo (não tocar)

- Schema do banco. Tabelas `appointments`, `appointment_services`, `appointment_events`, `contacts`, `services`, `professionals` permanecem como estão.
- `src/lib/appointments.functions.ts` (`notifyAppointmentChange`) — já faz o necessário.
- Layout da grade da agenda, fuso horário (`zonedLocalToUtc`), formatação de WhatsApp (`booking-confirmation.server.ts`).
- Modal de detalhe (`DetailPanel`) só muda no callback `onEdit` para abrir o ScheduleModal.

# Como validar

1. Agenda → "Novo Agendamento" → modal mostra grid 6 colunas de horários, slots ocupados riscados, multi-seleção de serviços, prévia da mensagem WhatsApp. Idêntico à foto 2.
2. Criar pela Agenda → card aparece na grade, slot fica indisponível em qualquer outro modal aberto. WhatsApp chega. Lead recebe evento `created` no histórico.
3. Editar arrastando para outro horário (ou via modal) → notify dispara `rescheduled`, slot antigo libera, slot novo bloqueia.
4. Cancelar → notify dispara `cancelled`, slot volta a ficar disponível.
5. Criar pelo Inbox e abrir a Agenda em outra aba → card aparece sozinho (realtime).

# Escopo de arquivos

- `src/features/inbox/schedule-modal.tsx` (expandir API + reorganizar fluxo de notificação)
- `src/routes/_authenticated.schedule.tsx` (remover modal local, plugar ScheduleModal)
- Nenhum outro arquivo, nenhuma migration.
