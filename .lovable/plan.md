# Plano de correção — Agenda + Notificações WhatsApp

Dois bugs isolados. Sem mexer em schema, auth, libs externas ou outras rotas.

---

## Issue 1 — Grid da agenda (visual)

Arquivo: `src/routes/_authenticated.schedule.tsx`

### Causas

1. **08:00 cortado**: em `TimeColumn` (linha ~719), o label do primeiro horário usa `top: i*HOUR_HEIGHT - 6`. Para `i=0` resulta em `top: -6px` → cortado pelo `overflow: hidden`/scroll do container pai.
2. **Headers desalinhados das colunas**: na `WeekView` (linha ~815), o header (`day header`) **não** tem `overflow: auto`, mas o grid abaixo tem `overflow: auto`. Quando aparece a scrollbar vertical no grid, as 7 colunas do grid encolhem mas o header continua usando 100% da largura → as datas deslocam para a direita em relação às colunas.
3. **Polimento**: a linha de hora cheia + a dashed da meia-hora estão coladas na borda; o header não tem leve separação visual.

### Fix

Em `TimeColumn` (~719):
- Adicionar `paddingTop: 8` ao container (ou trocar `top: i*HOUR_HEIGHT - 6` por `top: i*HOUR_HEIGHT`) e adicionar `marginTop: 8` à área da grid para que o label de `HOUR_START` fique inteiramente visível.
- Aplicar o mesmo `paddingTop` em `HourGrid` (ou aumentar `height` em +8) para manter o alinhamento entre labels e linhas.

Em `WeekView` header (~817):
- Reservar espaço da scrollbar: adicionar `paddingRight: var(--scrollbar-w, 0px)` no header e calcular dinamicamente com `useRef` + `ResizeObserver` no container `flex: 1; overflow: auto` (medir `offsetWidth - clientWidth`). Alternativa simples e robusta: dar ao header `overflow-y: scroll` com `visibility: hidden` na scrollbar via `scrollbar-gutter: stable` (suportado nos browsers alvo) **OU** envolver header+grid no mesmo container scrollável (header sticky `position: sticky; top: 0; z-index: 4; background: var(--bg-surface)`) — preferir esta segunda, que elimina a divergência por construção.

Refatoração mínima recomendada (sticky header):
- Mover a área de scroll para um único `<div style={{ flex: 1, overflow: 'auto' }}>` envolvendo header + grid.
- Tornar a linha do header `position: sticky; top: 0` com `background: var(--bg-surface)` e `borderBottom`.
- Resultado: header e colunas compartilham o mesmo eixo horizontal, scrollbar não afeta mais o alinhamento.

Polimento visual:
- `HourGrid`: trocar `borderTop: 1px solid var(--border)` da primeira linha por nenhuma borda (apenas a partir de `i>=1`) para não duplicar com header.
- Aumentar contraste sutil das linhas de hora cheia (`var(--border-strong)`) e manter dashed sutil (`opacity: 0.4`) na meia-hora.
- `TimeColumn`: aumentar `width` para 60, label com `letterSpacing: 0.02em` e alinhamento `textAlign: 'right'`.
- Linha de hoje no header: já existe pill; adicionar leve `boxShadow` ao pill.

Sem mudar `HOUR_START/HOUR_END/PX_PER_MIN/SLOT_MIN` em `src/features/schedule/data.ts`.

---

## Issue 2 — Horário errado nas mensagens WhatsApp

Arquivo: `src/lib/booking-confirmation.server.ts`

### Análise

- `formatDateBR`/`formatTimeBR` já passam `timeZone: tz` para `Intl.DateTimeFormat` (linhas ~38–67). Conceitualmente está correto.
- As 3 funções `sendBooking*` já derivam `tz = profile.business_timezone || "America/Sao_Paulo"`.
- O caller `src/lib/appointments.functions.ts` carrega `business_timezone` do `profiles` e monta `profileLite` corretamente.
- Sintoma "08:00 vira 06:00" (−2h) indica um dos casos:
  a) `appt.starts_at` retornado pelo Supabase chega como string **sem `Z`** (formato `"2026-…T11:00:00"`) — `new Date(...)` interpreta como **local** do runtime (UTC no Worker), e o `Intl` com `America/Sao_Paulo` aplica −3h em cima → desalinha.
  b) `business_timezone` do workspace está salvo como algo diferente de SP (ex.: `"UTC"` ou `"Etc/GMT+2"`) — caller passa, mas valor está errado no DB. Fora do escopo de código.

A causa (a) é a única que conseguimos corrigir de forma defensiva sem libs externas.

### Fix

1. Em `booking-confirmation.server.ts`, criar helper interno `toUtcDate(iso: string): Date` que **garante** parsing como UTC quando a string vier sem offset:
   - Se `iso` casar `/Z$|[+-]\d{2}:?\d{2}$/` → `new Date(iso)`.
   - Senão → `new Date(iso.replace(' ', 'T') + 'Z')`.
2. Usar `toUtcDate(iso)` dentro de `formatDateBR` e `formatTimeBR` antes de passar ao `Intl.DateTimeFormat`.
3. Manter `timeZone: tz` explícito; manter fallback `"America/Sao_Paulo"` nas 3 funções `sendBooking*` (já presente — apenas confirmar).
4. Não tocar em `renderTemplate` nem em `appointments.functions.ts` (a query já seleciona `starts_at` e o profile já entrega `business_timezone`).

### Verificação manual após o fix
- Criar agendamento 08:00 horário local SP → mensagem deve mostrar `08:00`.
- Reagendar para 14:30 → mensagem `14:30`.
- Cancelar → mensagem com a mesma hora exibida na agenda.

---

## Restrições respeitadas
- Sem libs de data novas.
- Sem trocar o grid por FullCalendar/react-big-calendar.
- Sem mudanças em schema, RLS, auth ou outras features.
- Edits limitados a `src/routes/_authenticated.schedule.tsx` e `src/lib/booking-confirmation.server.ts`.
