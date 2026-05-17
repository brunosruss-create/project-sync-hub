
## Inventário: mensagens enviadas ao cliente hoje

Levantamento dos pontos onde o sistema dispara texto para o cliente final (WhatsApp). Marquei quais já têm configuração e quais estão **hardcoded**.

### 1. Mensagens transacionais (não dependem de IA — string pura)

| # | Evento | Arquivo | Estado atual |
|---|---|---|---|
| 1 | **Boas-vindas no 1º contato** | `src/routes/api/public/evolution.$instanceId.ts` (lê `profiles.welcome_message` + `welcome_message_enabled`) | ✅ já configurável em Settings → Workspace |
| 2 | **Fora do horário (IA)** | `src/lib/ai-respond.server.ts:498` — fallback `"Estamos fora do horário de atendimento."` | ⚠️ parcial: editável (`ai_out_of_hours_message`) mas com fallback hardcoded |
| 3 | **Transferência para humano (IA)** | `ai-respond.server.ts:529` — `"Entendi! Vou passar você para um atendente humano agora. Aguarde um momento."` | ❌ hardcoded |
| 4 | **Confirmação de agendamento** | `src/lib/booking-confirmation.server.ts:161-166` (`"Olá X! ✅ Seu agendamento em *Y* foi confirmado..."`) | ❌ hardcoded |
| 5 | **Reagendamento** | `booking-confirmation.server.ts:99-104` (`"Olá X! 🔄 Seu agendamento foi reagendado..."`) | ❌ hardcoded |
| 6 | **Cancelamento** | `booking-confirmation.server.ts:127-131` (`"Olá X. Seu agendamento foi cancelado..."`) | ❌ hardcoded |

### 2. Mensagens "guardrails" da IA (system prompt — devem continuar no prompt)

Esses são instruções para a LLM, não strings enviadas direto. Ficam onde estão (`ai-respond.server.ts:191, 259, 279, 335`), porém o **negócio** pode querer alterar tom — fica para uma fase futura.

### 3. Fora de escopo

- Mensagens internas/UI (toasts em pt-BR) — são da interface do operador, não vão para o cliente. Não centralizamos.
- Texto livre digitado pelo atendente humano no chat.

---

## Proposta

### A. Nova página: `Settings → Mensagens`

Rota: `src/routes/_authenticated.settings.messages.tsx`
Item no sidebar (`src/features/settings/settings-layout.tsx`), seção "Agenda" ou nova seção "Mensagens automáticas".

Layout: 6 cards, um por mensagem. Cada card tem:
- **Switch enabled/disabled** (quando faz sentido)
- **Textarea** com a string atual
- Botão "Restaurar padrão"
- Lista de **placeholders disponíveis** clicáveis (insere na posição do cursor)
- Mini-preview à direita com placeholders substituídos por valores fictícios (ex: "João", "10/06/2026 às 14:00")

### B. Placeholders padronizados (template engine simples)

Substituição via `{{var}}`. Sem libs novas, helper próprio em `src/lib/message-templates.ts`:

```ts
export function renderTemplate(tpl: string, vars: Record<string,string>): string {
  return tpl.replace(/\{\{(\w+)\}\}/g, (_, k) => vars[k] ?? "");
}
```

Placeholders por mensagem:
- **Boas-vindas**: `{{cliente}}`, `{{negocio}}`
- **Fora do horário**: `{{negocio}}`, `{{proximo_horario}}`
- **Transferência humano**: `{{cliente}}`
- **Confirmação / Reagendamento / Cancelamento**: `{{cliente}}`, `{{negocio}}`, `{{data}}`, `{{hora}}`, `{{servico}}`, `{{profissional}}`

### C. Persistência

Uma migration nova (`supabase/manual/20260608000000_message_templates.sql`) adiciona em `profiles`:

```sql
alter table public.profiles
  add column if not exists msg_transfer_enabled    boolean not null default true,
  add column if not exists msg_transfer_text       text,
  add column if not exists msg_booking_confirmed_enabled boolean not null default true,
  add column if not exists msg_booking_confirmed_text    text,
  add column if not exists msg_booking_rescheduled_enabled boolean not null default true,
  add column if not exists msg_booking_rescheduled_text   text,
  add column if not exists msg_booking_cancelled_enabled boolean not null default true,
  add column if not exists msg_booking_cancelled_text    text;

notify pgrst, 'reload schema';
```

(`welcome_message*` e `ai_out_of_hours_*` já existem; apenas reaproveitamos.)

### D. Defaults centralizados

Novo arquivo `src/lib/message-defaults.ts` exporta cada template padrão. Tanto a UI quanto o servidor importam daí — fonte única de verdade.

### E. Wiring no servidor (substituir hardcodes)

- `booking-confirmation.server.ts` → ler `msg_booking_*_text/enabled` do `profile`, cair no default se vazio, e abortar envio se `enabled=false`.
- `ai-respond.server.ts:498` → usar `profile.ai_out_of_hours_message || DEFAULTS.outOfHours`.
- `ai-respond.server.ts:529` → ler `msg_transfer_text`, respeitar `msg_transfer_enabled`.

### F. Server functions

Em `src/lib/onboarding.functions.ts` (ou novo `messages.functions.ts`):
- `getMessageTemplates()` — devolve os 6 templates + flags.
- `updateMessageTemplates(input)` — Zod schema validando `max(2000)` em cada texto.

---

## Detalhes técnicos

**Arquivos novos**
- `src/routes/_authenticated.settings.messages.tsx`
- `src/lib/messages.functions.ts`
- `src/lib/message-templates.ts` (renderTemplate)
- `src/lib/message-defaults.ts`
- `supabase/manual/20260608000000_message_templates.sql`

**Arquivos alterados**
- `src/features/settings/settings-layout.tsx` (adiciona item "Mensagens")
- `src/lib/booking-confirmation.server.ts` (usa templates do profile)
- `src/lib/ai-respond.server.ts` (usa templates p/ out-of-hours + transferência)
- `src/routes/api/public/evolution.$instanceId.ts` (welcome continua igual, mas opcionalmente passa pelo `renderTemplate` para suportar `{{cliente}}`)

**Não muda nesta etapa**
- Toggle `notify_whatsapp` por agendamento (continua no modal).
- Prompts/guardrails da IA.
- Toasts da UI interna.

---

## Resultado para o usuário

Uma única tela mostrando as 6 mensagens que o sistema envia, cada uma com:
- on/off
- texto editável
- placeholders documentados
- preview ao vivo
- botão "restaurar padrão"

Zero string hardcoded saindo do servidor para o cliente.
