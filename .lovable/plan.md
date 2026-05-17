## Problemas e correções

### 1. Data em formato americano (MM/DD/YYYY) no modal de editar/criar agendamento
**Causa:** o campo usa `<input type="date">` nativo, cuja apresentação visual segue o locale do SO/navegador — não há como forçar pt-BR via atributo. No modal aparece `05/18/2026` porque o navegador está em en-US.

**Correção:** trocar por um `<input type="text" inputMode="numeric">` com máscara `dd/mm/aaaa`, reusando os helpers já existentes `formatDateBR` / `parseDateBR` em `src/features/schedule/data.ts`. O estado interno continua em ISO `yyyy-mm-dd`, apenas a apresentação muda. Validar no `submit` que a data é válida antes de montar `starts_at`.

Arquivo: `src/routes/_authenticated.schedule.tsx` (campo "Data" no modal de agendamento, ~linha 1923).

---

### 2 e 3. Reagendamento não persiste no banco e WhatsApp de reagendamento não dispara
Os dois sintomas têm a **mesma causa raiz**: o `upsert` em `src/routes/_authenticated.schedule.tsx` (linha ~253) está falhando silenciosamente.

Trecho atual:
```ts
const { error } = await supabase.from("appointments").upsert({ ... });
if (error) {
  console.warn("[schedule] persistência ignorada:", error.message);
  return true;            // ← engole o erro
}
if (draft.notify_whatsapp) { /* dispara notifyChangeFn aqui */ }
```

Como o `upsert` falha:
- a UI atualiza otimisticamente (por isso o card "muda de posição"),
- o banco **não** é atualizado (por isso volta ao reagendamento anterior ao recarregar),
- e o bloco de notificação WhatsApp **não roda** (por isso a mensagem de reagendamento nunca chega).

**Causa provável:** o payload do upsert não inclui `owner_user_id`, então:
- em INSERT a RLS rejeita,
- em UPDATE, dependendo do papel (agent vs manager), a checagem `owner_user_id = get_my_workspace_owner()` também pode falhar.

**Correções:**

a) **Surfacing do erro** — trocar `console.warn` por `nfy.error("Falha ao salvar: " + error.message)` e `return false`, para nunca mais perder esse tipo de bug silenciosamente.

b) **Incluir `owner_user_id`** no payload do upsert, resolvido via `useWorkspaceOwnerId()` (hook já existe em `src/hooks/use-workspace-owner.tsx`). Mesmo padrão usado nas outras telas.

c) **Disparar a notificação WhatsApp só após o upsert dar OK** — manter a ordem atual já está correta; o ajuste em (a) garante que não chega no bloco de notify quando o save falhou. Importante: a função `notifyAppointmentChange` (em `src/lib/appointments.functions.ts`) já lê `starts_at` do banco, então só funciona se o UPDATE realmente persistir — confirma que (b) é pré-requisito.

d) **Verificação após o fix** — abrir o console do navegador ao reagendar para confirmar que não há mais warning de upsert, e checar no banco (`select id, starts_at from appointments where id = ...`) que `starts_at` mudou. Se ainda falhar, a mensagem de erro agora visível dirá exatamente qual policy/coluna está rejeitando, e ajustamos a partir dali (provavelmente uma policy de UPDATE em `appointments` que precisa ser revisada via migration).

---

## Arquivos afetados
- `src/routes/_authenticated.schedule.tsx` — campo de data + função `upsert` (incluir `owner_user_id`, surfacing de erro)
- possível migration adicional em `supabase/manual/` caso o erro do passo (d) aponte para policy faltando

## Fora de escopo
- Mudanças no template da mensagem de reagendamento (já corrigido em conversa anterior).
- Mudanças no modal de criação a partir do Inbox (`schedule-modal.tsx`).