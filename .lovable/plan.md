## Problemas

**1. Data em formato EUA (MM/DD/YYYY)** — o `<input type="date">` herda o formato do SO/locale do navegador. No modal mostra "05/13/2026" em vez de "13/05/2026".

**2. Sem visibilidade de horários ocupados** — o grid de horários no `ScheduleModal` mostra todos os slots iguais. O atendente não sabe se 09:00 já está ocupado pela agenda. Hoje a única validação é "agente selecionado", e nem isso bloqueia conflito.

## Plano de correção

### A. Data em formato BR no modal (`src/features/inbox/schedule-modal.tsx`)

- Substituir o `<input type="date">` nativo por um seletor controlado que sempre exibe **DD/MM/AAAA**, independente do locale do SO.
- Implementação: input de texto com máscara `dd/mm/aaaa` + botão calendário (lucide `CalendarDays`) que abre um popover com um pequeno date-picker mensal já existente no projeto (mesmo estilo da `/schedule`). Mantém o estado interno em ISO `yyyy-mm-dd` para alimentar `fromDateTimeInput`.
- Adicionar helpers em `src/features/schedule/data.ts`:
  - `formatDateBR(iso)` → `"13/05/2026"`
  - `parseDateBR(str)` → ISO `yyyy-mm-dd` (com validação dia/mês, ano 2 ou 4 dígitos)
- Aplicar o mesmo componente onde houver outros `<input type="date">` no fluxo de agenda (varredura: `schedule-modal`, `_authenticated.schedule.tsx` se houver).

### B. Mostrar disponibilidade no grid de horários

Hoje os slots renderizados em `SLOTS` (08:00–19:30 a cada 30min) ignoram a agenda. Vamos:

1. **Buscar appointments do dia + agente selecionado** quando o modal abre ou quando `date`/`agentId` mudam:
   ```ts
   supabase.from("appointments")
     .select("id, starts_at, ends_at, agent_id, status")
     .gte("starts_at", startOfDayISO)
     .lt("starts_at", endOfDayISO)
     .neq("status", "cancelled")
     .eq("owner_user_id", user.id)
   ```
   Filtrar localmente por `agent_id === agentId` (mantém visíveis também os de outros agentes para UX futura, mas o bloqueio considera apenas o agente selecionado).

2. **Calcular ocupação por slot**: para cada slot de 30min, marcar como `busy` se houver overlap com qualquer appointment ativo do agente. Levar em conta a duração total dos serviços selecionados (`totalMin`) — um slot fica `busy` se qualquer 30min dentro de `[slot, slot + totalMin)` colidir.

3. **Renderização do slot**:
   - Disponível: estilo atual.
   - Ocupado: fundo `--bg-overlay`, texto riscado (`text-decoration: line-through`), `cursor: not-allowed`, `disabled`, tooltip "Ocupado — {nome do contato}".
   - Passado (hoje, slot < agora): mesmo tratamento "indisponível", tooltip "Horário passado".
   - Selecionado: igual hoje.

4. **Validação no submit**: re-checar conflito antes do insert; se conflitar, `toast.error("Esse horário ficou indisponível, escolha outro.")` e abortar.

5. **Atualização em tempo real**: assinar canal Realtime `appointments` enquanto o modal estiver aberto, para refletir mudanças feitas em outra aba/dispositivo.

### C. Mapeamento dos pontos de integração revisados

- `src/features/inbox/schedule-modal.tsx` — único modal de criação via WhatsApp; recebe ajustes A + B.
- `src/features/inbox/conversation-panel.tsx` (linha 684 / 1860) — abre o modal e faz uma operação de update em `appointments`; sem alteração funcional, mas validar que ainda recebe `onScheduled`.
- `src/routes/_authenticated.schedule.tsx` — fonte da verdade de leitura/insert/update/delete; já dispara realtime. Sem mudança lógica, apenas garantir que o helper `formatDateBR` seja usado em qualquer label visível de data (varredura).
- `src/routes/_authenticated.reports.tsx` — apenas leitura agregada; não precisa de mudança.

### D. Detalhes técnicos

- Reutilizar `fromDateTimeInput` / `toDateInput` (que já produzem ISO local sem timezone shift) para evitar o bug clássico de `new Date("2026-05-13")` virar dia anterior em UTC.
- Validação BR: regex `^(\d{2})\/(\d{2})\/(\d{4})$`, validar `Date.UTC` round-trip para rejeitar 31/02 etc.
- Slot busy detection: `slotStart < apt.ends_at && apt.starts_at < slotEnd` (mesma fórmula do helper `overlap`).
- Performance: cache em `useMemo` com chave `[date, agentId, appointments.length]`.

### E. Critérios de aceite

1. Abrir o modal → data exibe `13/05/2026` mesmo com PC em locale en-US.
2. Digitar `32/13/2026` → input rejeita (borda vermelha + mensagem inline).
3. Criar appointment 09:00–10:00 para Ana Silva → reabrir modal no mesmo dia/agente → slots 09:00 e 09:30 aparecem riscados/desabilitados com tooltip.
4. Mudar agente para Bruno Lima → slots voltam a ficar livres.
5. Tentar submit num slot que ficou ocupado entre a abertura e o clique → toast de erro, sem insert.
6. Hoje às 14:30 → slots 08:00–14:00 desabilitados como "passado".
