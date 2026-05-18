
## Diagnóstico (a partir dos logs reais)

Os logs do worker mostram **exatamente** por que o reagendamento falha — a IA está emitindo o JSON, mas o backend o rejeita silenciosamente:

```
[warn] [ai reschedule] falhou: missing_fields
[warn] [ai reschedule] parse falhou: Invalid time value
[warn] [ai reschedule] parse falhou: Invalid time value
```

Três problemas em cadeia:

1. **`Invalid time value`** — A IA está mandando `new_starts_at` num formato que `new Date()` não consegue parsear (ex.: `"2026-05-23T14:00"` sem offset, ou `"2026-05-23 14:00:00"`, ou com fuso errado). O prompt pede `YYYY-MM-DDTHH:mm:00-03:00`, mas modelos pequenos (Gemini Flash Lite) frequentemente quebram esse formato.
2. **`missing_fields`** — Depois do 1º reagendamento, o appointment antigo foi cancelado e um NOVO foi criado com outro id. Na 2ª tentativa, a IA pega o id do CANCELADO da lista (ou simplesmente não preenche) e o backend rejeita.
3. **Mentira para o cliente** — A IA escreve `"Reagendado!"` ANTES do JSON. Se o JSON falhar no backend, o cliente recebe o "Reagendado!" via WhatsApp, mas nada muda na agenda. Foi exatamente o que aconteceu no print do WhatsApp.

## Plano (3 ajustes cirúrgicos, só em 2 arquivos)

**Arquivos tocados:**
- `src/lib/booking-confirmation.server.ts` (parser de data + fallback de id)
- `src/lib/ai-respond.server.ts` (truthful reply: se falhar, manda erro real)

Nada em rotas, UI, kanban, agenda visual ou outras tabelas.

---

### 1) Parser de data tolerante (booking-confirmation.server.ts)

Criar uma função `parseAiDate(input, tz)` que aceita os formatos comuns que a IA emite e SEMPRE interpreta como horário de Brasília quando não houver offset:

- `2026-05-23T14:00:00-03:00` → ok (já tem offset)
- `2026-05-23T14:00:00` → interpreta como tz do negócio
- `2026-05-23T14:00` → idem
- `2026-05-23 14:00` → idem
- `23/05/2026 14:00` → idem

Usar essa função tanto em `createAppointmentFromAI` quanto em `rescheduleAppointmentFromAI`. Elimina o `Invalid time value`.

### 2) Resolver appointment_id quando a IA erra (booking-confirmation.server.ts)

Em `rescheduleAppointmentFromAI` e `cancelAppointmentFromAI`:

- Se `appointment_id` veio vazio, ou aponta para um appointment `cancelled/completed`, ou não pertence ao `contact_id` da conversa → fazer um lookup automático:
  - buscar o agendamento ATIVO (`status not in ('cancelled','completed')`) mais recente do `contact_id` no `owner_user_id`, no futuro
  - se existir exatamente UM → usar esse id
  - se existir mais de um → retornar `ambiguous_appointment` (IA precisa perguntar qual)
  - se nenhum → retornar `no_active_appointment`

Isso resolve o `missing_fields` e o problema de pegar id do cancelado.

### 3) Resposta verdadeira ao cliente (ai-respond.server.ts)

Hoje, mesmo quando `rescheduleAppointmentFromAI` retorna `{ok:false}`, o `text` da IA com "Reagendado!" é retornado normalmente e enviado pelo WhatsApp. Mudar para:

- Guardar o `result` (ok + reason) das três execuções: create / reschedule / cancel.
- Se `result.ok === false`, **substituir** o texto da IA por uma frase verdadeira baseada no `reason`, ex.:
  - `slot_taken` → "Esse horário acabou de ser ocupado, posso te oferecer outro?"
  - `past_date` → "Esse horário já passou, qual outro fica bom pra você?"
  - `ambiguous_appointment` → "Você tem mais de um agendamento ativo — qual deles você quer mudar? (me diga o dia/hora)"
  - `no_active_appointment` → "Não encontrei nenhum agendamento ativo seu. Quer marcar um novo?"
  - `bad_date` / outros → "Tive um problema técnico aqui, pode repetir a data e hora desejadas?"
- Logar o `payload` cru recebido da IA (`console.log("[ai reschedule] payload:", m[1])`) pra facilitar debug futuro.

Mesmo tratamento para `CANCEL_JSON` e `APPOINTMENT_JSON` (já existe na infraestrutura — só não estavam usando o `reason`).

### 4) Pequeno reforço de prompt (ai-respond.server.ts)

No `bookingLayer`, adicionar duas linhas curtas (não reescrever o prompt):
- "Para reagendar/cancelar, use APENAS [id:...] de agendamento que NÃO esteja marcado como (CANCELADO) ou (CONCLUÍDO). Se houver mais de um ativo, pergunte ao cliente qual."
- "`new_starts_at` DEVE ter o offset `-03:00` no fim. Exemplo: `2026-05-23T14:00:00-03:00`. Sem isso o sistema rejeita."

---

## Resultado esperado

| Cenário | Antes | Depois |
|---|---|---|
| IA manda data sem offset | Backend silenciosamente falha, cliente vê "Reagendado!" | Parser interpreta como tz do negócio, agenda muda |
| IA pega id do cancelado | `missing_fields`, cliente vê "Reagendado!" | Sistema resolve para o ativo, agenda muda |
| Slot novo já ocupado | Cliente vê "Reagendado!" mas nada muda | Cliente recebe "Esse horário acabou de ser ocupado..." |
| Reagendamento legítimo | Mensagem dupla "Reagendado!" sem efeito | Agenda muda + 1 única confirmação correta |

Sem mexer em mais nada do sistema.
