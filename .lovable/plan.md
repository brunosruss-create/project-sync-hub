## Diagnóstico

### Bug 1 — Filtrar por "Dr Bruno" oculta todos os agendamentos
Em `_authenticated.schedule.tsx`, `mapAppt` define `agent_id = r.professional_id ?? r.agent_id`. Quando o appointment foi criado antes do cadastro de profissionais (ou via fluxo público de booking / IA), `professional_id` é `null` e `agent_id` guarda um texto legado (ex.: `"a1"`). O filtro `agentFilter === a.agent_id` só bate quando o agendamento já tem `professional_id` igual ao UUID do Dr Bruno. Conclusão: faltam dois passos:
- A migração `20260613000000_appointments_professional_backfill.sql` precisa ser executada (vincula `agent_id` ↔ `professional_id` quando os IDs já casam por UUID).
- Para appointments que **não** têm nenhum vínculo (legacy + criados sem profissional), precisamos uma estratégia: associá-los ao único profissional ativo quando só existir um, caso contrário deixá-los visíveis em "Todos" mas também acessíveis num bucket "Sem profissional" no filtro.

### Bug 2 — Card do agendamento ultrapassa a linha de baixo
Em `EventCard` (linha ~942), o `<button>` define `height: dur * PX_PER_MIN - 2` com `padding: "5px 7px"` e `border: 1px`. Como `box-sizing` herda `content-box` (não há reset global do elemento `<button>` para `border-box`), padding + border são somados à altura visual → 60 min vira ~94 px em vez de ~82 px e invade a próxima faixa. Mesmo defeito em outros lugares que usam `height` com padding em `<button>`/`<div>` posicionados absolutamente dentro do grid.

### Bug 3 — Serviços excluídos continuam aparecendo no agendamento manual
`ScheduleModal` (linha ~88) faz fallback para `SEED_SERVICES` sempre que a query do Supabase retorna `data.length === 0`. Quando o usuário apaga **todos** os serviços, o catálogo mockado reaparece como se fossem reais. O mesmo padrão acontece em `_authenticated.schedule.tsx` (estado inicial `useState<Service[]>(SEED_SERVICES)` e a condição `if (svc && svc.length > 0)` deixa o seed quando o banco está vazio). Resultado: a agenda e o modal ficam dessincronizados da lista oficial de `/servicos`.

---

## Plano de correção

### 1. Bug 3 — Remover fallback de SEED_SERVICES em produção
**Arquivo:** `src/features/inbox/schedule-modal.tsx`
- Trocar o bloco do `useEffect` que carrega serviços (linhas 78–107) para:
  - Em qualquer caso (erro ou lista vazia) **setar `[]`** e mostrar estado vazio com link "Cadastre em /servicos". Sem fallback para `SEED_SERVICES`.
  - Manter o filtro `.eq("status", "active")`.
- Adicionar UI de estado vazio dentro do painel "SERVIÇOS" do modal quando `services.length === 0`: mensagem curta + `Link to="/services"` ("Cadastrar serviço").
- Desabilitar o botão "Confirmar Agendamento" se `services.length === 0` (já é coberto por `selectedServices.length > 0`, mas adicionar mensagem clara).

**Arquivo:** `src/routes/_authenticated.schedule.tsx`
- Estado inicial: `useState<Service[]>([])` em vez de `SEED_SERVICES`.
- No `reload()` (linhas 174–188), remover a condição `if (svc && svc.length > 0)` — sempre setar (mesmo vazio).
- Manter `SEED_SERVICES` apenas como tipo/seed em ambiente DEV se necessário (preferência: remover import).

### 2. Bug 2 — Corrigir overflow visual do card
**Arquivo:** `src/routes/_authenticated.schedule.tsx`, função `EventCard` (linha ~942)
- Adicionar `boxSizing: "border-box"` ao `style` do `<button>` raiz.
- Auditar e replicar o `boxSizing: "border-box"` nos outros elementos posicionados absolutamente do grid (chips de mês na linha ~1113, indicador de "now" linha ~894, etc.) onde há `height` fixo + padding/borda.

### 3. Bug 1 — Profissionais e filtro robustos
**Arquivo:** `supabase/manual/20260613000000_appointments_professional_backfill.sql`
- Confirmar que a migração existente faz dois passos (ela já cobre o caso UUID-match). Adicionar passo extra: quando o workspace tiver **exatamente 1 profissional ativo**, atribuir todos os appointments `professional_id IS NULL` desse owner a esse profissional. Algo como:

```sql
update public.appointments a
   set professional_id = sub.pid
  from (
    select owner_user_id, min(id) as pid
      from public.professionals
     where is_active = true
     group by owner_user_id
    having count(*) = 1
  ) sub
 where a.owner_user_id = sub.owner_user_id
   and a.professional_id is null;
```

**Arquivo:** `src/routes/_authenticated.schedule.tsx`
- No `<select>` do filtro (linha ~386), acrescentar uma opção extra `"unassigned"` ("Sem profissional") logo após "Todos os profissionais", para o usuário visualizar appointments órfãos sem precisar voltar para "Todos".
- Ajustar `filtered` (linha 233):
  ```ts
  items.filter((a) =>
    a.status !== "cancelled" &&
    (agentFilter === "all" ||
     (agentFilter === "unassigned" ? !a.agent_id || !agents.some(g => g.id === a.agent_id) : a.agent_id === agentFilter)),
  )
  ```
- No `mapAppt`, manter `agent_id = r.professional_id ?? r.agent_id ?? ""`, mas adicionar log único `console.warn` (debug only) quando aparecer um `agent_id` que não bate com nenhum profissional carregado, para facilitar diagnóstico futuro.

**Arquivo:** `src/lib/ai-respond.server.ts` e fluxos que criam appointments via WhatsApp/IA
- Garantir que toda inserção em `appointments` passe `professional_id` explicitamente quando houver. Se a IA não souber qual escolher e existir só 1 profissional ativo, usar esse automaticamente (mesma regra do bug do prompt). Adicionar busca rápida `professionals where is_active=true` antes do insert.

### 4. QA manual após deploy (sem regressão)
1. Rodar a migração no SQL Editor → confirmar `notify pgrst`.
2. Apagar todos os serviços em `/services` → abrir modal de "Novo Agendamento" tanto pela Agenda quanto pelo Inbox/Kanban e validar que **nenhum** serviço aparece e mostra link para cadastrar.
3. Cadastrar 1 serviço, abrir modal → aparece somente esse 1.
4. Criar agendamento de 1h → confirmar visualmente que o card termina exatamente na linha da próxima hora.
5. Filtrar por Dr Bruno → todos os appointments dele aparecem (incluindo os criados antes da reforma).
6. Filtrar por "Sem profissional" → mostra os órfãos.
7. Receber agendamento via IA/WhatsApp com 1 profissional ativo → conferir que `professional_id` foi preenchido.

---

## Resumo dos arquivos tocados
- `src/features/inbox/schedule-modal.tsx` — remover fallback SEED, adicionar empty-state.
- `src/routes/_authenticated.schedule.tsx` — remover SEED inicial, corrigir `boxSizing` no `EventCard`, adicionar opção "Sem profissional" e filtro.
- `src/lib/ai-respond.server.ts` (e/ou helper de criação de appointment via IA/booking público) — preencher `professional_id` automaticamente quando houver só 1 ativo.
- `supabase/manual/20260613000000_appointments_professional_backfill.sql` — adicionar passo de auto-atribuição quando o workspace tem só 1 profissional.