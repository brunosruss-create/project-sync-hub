## Objetivo

Padronizar todos os seletores e grids de agenda em intervalos de **15 minutos**, mantendo o tamanho atual da página (adicionando scroll vertical onde necessário).

## Onde está hoje

1. **Picker de horário no modal de agendamento** (`src/features/inbox/schedule-modal.tsx`, linhas 52–59):
   - Constante local `SLOTS` gera somente `:00` e `:30` (passo de 30 min).
   - Renderizado em grid 6 colunas, `maxHeight: 140`, já com `overflowY: auto` (linhas 850–857).
2. **Snap do horário inicial** ao abrir (linha 201): arredonda para `00` ou `30`.
3. **Grid de Dia/Semana** (`src/features/schedule/data.ts`): `SLOT_MIN = 30`, `PX_PER_MIN = 1.4` (~42 px por linha de 30 min ≈ 84 px/h).
4. **Helper `timeSlots(stepMin = 15)`** já existe com passo padrão de 15 min — não está sendo usado pelo modal novo.

## Mudanças propostas

### A. Modal de agendamento (picker de horários) — passo de 15 min

`src/features/inbox/schedule-modal.tsx`:
- Substituir a `SLOTS` local por `timeSlots(15)` do `@/features/schedule/data` (gera `08:00, 08:15, 08:30, …, 20:00` → 49 horários).
- Ajustar o snap inicial (linha 201) para o múltiplo de 15 min mais próximo:
  ```ts
  const m = Math.floor(baseDate.getMinutes() / 15) * 15;
  ```
- Manter o grid 6 colunas + `overflowY: auto`, aumentar `maxHeight` para `~180px` (≈ 4 linhas visíveis ainda, com scroll suave).
- Não mexer em `blockMin` (duração mínima do bloqueio de conflito continua sendo a duração do serviço, com piso de 30 min).

### B. Grid Dia/Semana da página `/schedule` — linhas a cada 15 min

`src/features/schedule/data.ts`:
- `SLOT_MIN = 15`.
- `PX_PER_MIN = 1.4` (mantém). Isso resulta em ~21 px por linha de 15 min e ~84 px/h — **a altura total do dia não muda** (continua `(20-8)*60*1.4 ≈ 1008 px`), apenas dobra a densidade de linhas-guia.

Como a altura total não muda, **a página não cresce**; o container do grid já vive dentro de `height: calc(100vh - 48px - 48px)` com scroll interno (verificar `HourGrid` em `_authenticated.schedule.tsx` e ajustar `overflowY: auto` no wrapper das views se ainda não estiver).

### C. Verificações

- Confirmar que `EventBlock` (posicionamento por `PX_PER_MIN`) segue correto — não depende de `SLOT_MIN`.
- Conferir `NowLine` e `TimeColumn`: o `TimeColumn` mostra rótulos de hora cheia; manter rótulos só na hora (não a cada 15 min) para não poluir.
- O cálculo de conflito (`overlap`) e `slotState` continuam corretos pois operam em minutos absolutos, não em índices de slot.

## Fora do escopo

- Não muda duração de serviços, regras de bloqueio, nem fuso.
- Não muda a coluna de horas (continua marcando a cada hora cheia).

## Arquivos afetados

- `src/features/inbox/schedule-modal.tsx` — picker de horário e snap inicial.
- `src/features/schedule/data.ts` — `SLOT_MIN: 30 → 15`.
- `src/routes/_authenticated.schedule.tsx` — verificar/garantir `overflowY: auto` no wrapper das views Dia/Semana (provavelmente já existe).
