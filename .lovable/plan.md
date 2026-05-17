# Diagnóstico

Ao clicar em "Novo Agendamento" na agenda e salvar, aparece:

> Falha ao salvar: invalid input syntax for type uuid: "ap-1779051139566"

## Causa raiz

`src/routes/_authenticated.schedule.tsx` (linha 1786), no formulário `AppointmentForm`:

```ts
const draft: Appointment = {
  id: initial?.id ?? `ap-${Date.now()}`,
  ...
};
```

Para agendamentos novos, é gerado um ID temporário no formato `ap-<timestamp>` e enviado para o `upsert` em `public.appointments`, cuja coluna `id` é `uuid`. O Postgres rejeita o valor e o agendamento nunca é criado.

Como consequência, **nada do fluxo posterior funciona**:
- `notifyAppointmentChange` valida `appointmentId: z.string().uuid()` (em `src/lib/appointments.functions.ts`), então mesmo se o insert passasse, a notificação WhatsApp seria rejeitada com erro de validação Zod.
- O evento `appointment_events` (histórico do lead) também não é gravado porque depende da mesma função.
- A confirmação por WhatsApp (`sendBookingConfirmation`) nunca dispara.

O resto do formulário (contato, serviço, agente, horários, fuso) está integrado corretamente ao core — o único bloqueio é o ID inválido.

# Correção (mínima, sem regressão)

## Arquivo único: `src/routes/_authenticated.schedule.tsx`

**1. Linha 1786** — gerar UUID válido para novos agendamentos:

```ts
id: initial?.id ?? (crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`),
```

Usa `crypto.randomUUID()` (disponível no browser moderno e SSR Node 19+). O fallback existe apenas por segurança de tipos; na prática `crypto.randomUUID` está presente nos ambientes-alvo.

Isso garante:
- `appointments.id` recebe um uuid válido → insert no Supabase funciona
- `notifyAppointmentChange({ appointmentId: draft.id })` passa na validação Zod
- WhatsApp de confirmação dispara
- Evento `created` é registrado em `appointment_events` → histórico do lead aparece
- Realtime channel (`appointments-rt`) recebe o INSERT e o card renderiza para outros clientes

## Verificações que NÃO precisam mudar

Já estão corretos:
- `payload.owner_user_id` é preenchido via `useWorkspaceOwnerId()`
- `starts_at` / `ends_at` são convertidos com `zonedLocalToUtc(..., tz)` antes do envio
- Detecção de conflito ignora `status === 'cancelled'`
- `notifyChangeFn` é chamado com `kind: "created"` após upsert bem-sucedido

# Como validar após aplicar

1. Abrir `/schedule` → "Novo Agendamento" → preencher contato, serviço, agente, horário → Salvar.
2. Toast: "Agendamento criado."
3. Card aparece no grid no horário escolhido.
4. Se `notify_whatsapp` estiver ativo: cliente recebe a mensagem de confirmação com data/hora batendo com o slot da agenda.
5. Abrir o lead na Inbox → aba "Histórico" → evento "created" registrado com serviço e horário.

# Escopo

- 1 arquivo, 1 linha alterada.
- Sem mudanças de schema, auth, libs externas, ou qualquer outro fluxo.
