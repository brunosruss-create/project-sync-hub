
## Objetivo
Hoje a IA tem o catálogo de profissionais + serviços + compromissos genéricos (próximos 7 dias do workspace), mas **não enxerga os agendamentos do próprio cliente** e **só sabe criar** (bloco `APPOINTMENT_JSON`). Falta:

1. Responder "quando é minha próxima consulta?" / "tenho consulta marcada?"
2. Reagendar (`RESCHEDULE_JSON`)
3. Cancelar (`CANCEL_JSON`)
4. Refletir tudo na agenda em tempo real (já temos realtime na tabela `appointments` — basta o `UPDATE` server-side).

Tudo respeita os toggles já existentes `ai_can_reschedule` e `ai_can_cancel` (não regredir comportamento atual quando estiverem desligados).

---

## Arquivos a alterar

### 1. `src/lib/ai-respond.server.ts`

**(a) Carregar agendamentos do contato atual** (quando `contact_id` é fornecido) — janela: últimas 24h até +60 dias, qualquer status:

```ts
let contactAppointments: Array<{
  id: string; starts_at: string; ends_at: string; status: string;
  service_name: string | null; professional_id: string | null; professional_name: string | null;
}> = [];
if (data.contact_id) {
  const { data: rows } = await supabaseAdmin
    .from("appointments")
    .select("id, starts_at, ends_at, status, services(name), professionals(id,name)")
    .eq("owner_user_id", data.workspace_owner_id)
    .eq("contact_id", data.contact_id)
    .gte("starts_at", new Date(Date.now() - 24*3600_000).toISOString())
    .lte("starts_at", new Date(Date.now() + 60*24*3600_000).toISOString())
    .order("starts_at", { ascending: true })
    .limit(20);
  contactAppointments = (rows ?? []).map(r => ({...}));
}
```

**(b) Nova função `buildContactAppointmentsLayer`** — bloco `=== AGENDAMENTOS DESTE CLIENTE ===` que lista cada agendamento futuro/recente com `id`, data, hora, serviço, profissional, status. Regras:
- Se `status === "cancelled"` → marca "(CANCELADO)".
- Inclui instrução obrigatória: "Quando o cliente perguntar sobre 'minha consulta', 'meu horário', 'quando eu tenho marcado', responda EXATAMENTE com base nesta lista. Se a lista estiver vazia, diga que não há agendamentos ativos."
- Lista os `id` (UUID) de cada appointment para a IA referenciar nos blocos JSON de reagendar/cancelar.

**(c) Atualizar `bookingLayer`** para incluir os novos blocos JSON quando `ai_can_reschedule` / `ai_can_cancel` estão ativos:

```
RESCHEDULE_JSON:{"appointment_id":"<uuid existente>","new_starts_at":"YYYY-MM-DDTHH:mm:00-03:00"}
CANCEL_JSON:{"appointment_id":"<uuid existente>","reason":"..."}
```

Instruir que só pode emitir um JSON por resposta, e só se o cliente confirmar textualmente. Manter `APPOINTMENT_JSON` como já é.

**(d) Pós-processamento** (logo após o match de `APPOINTMENT_JSON`):
- `match RESCHEDULE_JSON` → `rescheduleAppointmentFromAI(payload, profile)` e remove bloco.
- `match CANCEL_JSON` → `cancelAppointmentFromAI(payload, profile)` e remove bloco.
- Reaproveita lógica de extração (regex no final do texto).

**(e) Adicionar o `buildContactAppointmentsLayer` ao `finalPrompt`** entre `professionalsLayer` e `servicesLayer`.

### 2. `src/lib/booking-confirmation.server.ts`

Adicionar duas funções novas (mesmo padrão de `createAppointmentFromAI`):

```ts
export async function rescheduleAppointmentFromAI(
  data: { appointment_id: string; new_starts_at: string },
  profile: { id: string; business_timezone: string | null; business_name: string | null },
): Promise<{ ok: boolean; reason?: string }> {
  // 1. busca appointment do owner com join services + professionals + contacts
  // 2. valida data: !cancelled, new_starts_at parseável, no futuro
  // 3. calcula new_ends_at = new_starts_at + duration_minutes do serviço
  // 4. anti-conflito por professional_id (mesmo query do create)
  // 5. update starts_at / ends_at
  // 6. await sendBookingReschedule(...) — helper já existente
}

export async function cancelAppointmentFromAI(
  data: { appointment_id: string; reason?: string },
  profile: { id: string; business_timezone: string | null; business_name: string | null },
): Promise<{ ok: boolean; reason?: string }> {
  // 1. busca appointment (não-cancelado) do owner
  // 2. update status = "cancelled", notes append motivo
  // 3. await sendBookingCancellation(...)
}
```

Ambas usam `supabaseAdmin` → `UPDATE` em `public.appointments` → como a tabela já está em `replica identity full` na `supabase_realtime` (migration `20260516000000_professionals.sql` e anteriores), o `/schedule` recebe o evento de update e re-renderiza em tempo real. **Sem migration nova.**

### 3. `src/routes/_authenticated.schedule.tsx` (verificação rápida — sem mudança esperada)

Confirmar que o canal realtime já escuta `postgres_changes` em `appointments` com `event: '*'` (UPDATE inclusive). Se hoje só escuta `INSERT`, ampliar para `*`. Sem mudança de lógica.

---

## Comportamentos & garantias

- **Toggles respeitados**: bloco `RESCHEDULE_JSON` só vai pro prompt se `ai_can_reschedule === true`. Idem cancelamento. Quando desativados, segue exatamente o texto de proibição que já existe hoje (sem regressão).
- **Escopo**: a IA só pode reagendar/cancelar appointments cujo `owner_user_id` é o do workspace E (de preferência) cujo `contact_id` bate com o `contact_id` da conversa. Validação no helper rejeita appointment de outro contato.
- **Anti-conflito** no reagendamento usa exatamente a mesma query do `createAppointmentFromAI` (excluindo o próprio appointment via `.neq("id", appointment_id)`).
- **WhatsApp**: confirmação de reagendamento/cancelamento sai pelos templates já existentes (`booking_rescheduled`, `booking_cancelled`) com fallback de `MESSAGE_DEFAULTS`. Se o usuário desativou o template, nenhum envio é feito (comportamento atual mantido).
- **Realtime**: nenhum código novo no front. O `supabase.channel('appointments-…').on('postgres_changes', ...)` já existente recebe o UPDATE.
- **Dedup / logs**: o `ai_usage_logs` continua sendo escrito 1× por mensagem (já há dedup_key). Adiciono `action: "ai_reschedule"` / `"ai_cancel"` quando o pós-processamento dispara — opcional, não bloqueador.

---

## QA manual após deploy

1. Ligar `ai_can_reschedule` e `ai_can_cancel` em /ai-agent.
2. Cliente: "quando tenho consulta marcada?" → IA responde com a data/hora exata do appointment (não mais "não tenho acesso…").
3. Cliente: "pode mudar para terça às 14h?" → IA confirma textualmente, emite `RESCHEDULE_JSON`, agenda muda em tempo real na tela `/schedule`, cliente recebe template de reagendamento no WhatsApp.
4. Cliente: "pode cancelar?" → mesma coisa para cancelamento; o slot some/ganha "cancelado" na agenda.
5. Desligar os toggles → IA volta a recusar ("vou encaminhar para um atendente humano"), sem regressão.
6. Conflito: pedir reagendar para horário já ocupado de outro profissional/cliente → helper retorna `slot_taken` e o JSON é descartado (a resposta de texto da IA é entregue normalmente).

---

## Resumo dos arquivos
- `src/lib/ai-respond.server.ts` — novo layer de agendamentos do contato, novos blocos JSON no `bookingLayer`, novo pós-processamento.
- `src/lib/booking-confirmation.server.ts` — `rescheduleAppointmentFromAI` e `cancelAppointmentFromAI`.
- `src/routes/_authenticated.schedule.tsx` — só se o canal realtime não estiver com `event:'*'` (verificar).

Sem migration SQL nesta rodada.
