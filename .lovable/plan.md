## Contexto

A mensagem anterior dizendo que "Lovable Cloud está desativado" foi um falso positivo do meu lado — o projeto usa Supabase direto (`@/integrations/supabase/client.server`) e a stack está intacta. Os testes automatizados de reagendamento passam (4/4).

Olhando os logs reais de produção (`server-function-logs`), o erro que está acontecendo AGORA é:

```
[log]  [ai reschedule] payload: {"appointment_id":"5fcef71d-…","new_starts_at":"2026-05-23T15:00:00-03:00"}
[warn] [ai reschedule] falhou: missing_fields
```

`missing_fields` só pode vir de dois lugares em `booking-confirmation.server.ts`:
- linha 493 (reschedule topo): só dispara se `new_starts_at` for vazio — não é o caso, o payload tem.
- linha 343 (`createAppointmentFromAI`): dispara se `starts_at` OU `service_name` vier vazio.

Como o reschedule chama `createAppointmentFromAI({ service_name: svc.name, starts_at: newStart.toISOString(), ... })` e simplesmente repassa `reason`, a hipótese forte é que o relacionamento embutido `services(id,name,duration_minutes,price_cents)` na query do `oldAppt` está vindo como **array** (`svc = [{...}]`) em vez de objeto. O cast `as ServiceLite` mascara isso no TypeScript; em runtime `svc.name` é `undefined` → cascateia como `missing_fields`. O check `if (!svc)` passa porque um array vazio/preenchido não é falsy.

Não temos logs de `APPOINTMENT_JSON` (criação nova) caindo agora, mas a mesma classe de bug pode estar afetando todas as criações que dependem desse caminho. Precisamos diagnosticar com precisão antes de mudar mais código.

## Plano

### 1. Logging diagnóstico (1 arquivo)

Em `src/lib/booking-confirmation.server.ts`:

- `createAppointmentFromAI`: ao retornar `missing_fields`, logar quais campos faltam:
  ```ts
  if (!data.starts_at || !data.service_name) {
    console.warn("[booking create] missing_fields", {
      has_starts_at: !!data.starts_at,
      has_service_name: !!data.service_name,
      payload_keys: Object.keys(data),
    });
    return { ok: false, reason: "missing_fields" };
  }
  ```
- `rescheduleAppointmentFromAI`: depois de carregar `oldAppt`, logar a forma de `services` e `contacts`:
  ```ts
  console.log("[booking reschedule] oldAppt shape", {
    appt_id: oldAppt.id,
    services_is_array: Array.isArray(oldAppt.services),
    service_name: Array.isArray(oldAppt.services) ? oldAppt.services[0]?.name : oldAppt.services?.name,
    contact_present: !!oldAppt.contacts,
  });
  ```
- Tag de fase nos retornos do reschedule para parar de mascarar:
  - `cancelRes.reason` → `"cancel:" + reason`
  - `createRes.reason` → `"create:" + reason`

Em `src/lib/ai-respond.server.ts` o `friendlyReason` passa a aceitar reasons prefixadas (`startsWith("create:slot_taken")` etc.) para não quebrar a UX.

### 2. Correção do embed singular vs array

Normalizar o acesso ao embed independente do que o PostgREST devolver:

```ts
const svcRaw = oldAppt.services as ServiceLite | ServiceLite[] | null;
const svc: ServiceLite | null = Array.isArray(svcRaw) ? (svcRaw[0] ?? null) : svcRaw;

const contactRaw = oldAppt.contacts as { name: string; phone: string } | { name: string; phone: string }[] | null;
const contact = Array.isArray(contactRaw) ? (contactRaw[0] ?? null) : contactRaw;
```

Como fallback de segurança, se `svc` ainda vier sem `name` ou `duration_minutes`, refazer um SELECT direto em `services` por `oldAppt.service_id` antes de chamar `createAppointmentFromAI` (em vez de cascatear um erro misterioso).

### 3. Defesa no `createAppointmentFromAI`

Quando chamado internamente (reschedule) com `service_name` vindo de embed, aceitar também `service_id` direto para curto-circuitar o `ilike` por nome:

```ts
// no início:
let serviceRow: ServiceLite | null = null;
if (data.service_id) {
  const { data: s } = await supabaseAdmin
    .from("services")
    .select("id,name,duration_minutes,price_cents")
    .eq("id", data.service_id)
    .eq("owner_user_id", profile.id)
    .maybeSingle();
  serviceRow = s ?? null;
}
if (!serviceRow && data.service_name) {
  // caminho atual por ilike
}
```

E no reschedule, passar `service_id: oldAppt.service_id` junto com `service_name`. Isso elimina dependência do embed.

### 4. Verificar criação nova (`APPOINTMENT_JSON`)

Reproduzir um payload típico via `invoke-server-function` no endpoint público do webhook (ou via teste unitário com supabase mockado) para confirmar que a criação nova segue funcionando depois do patch. Se aparecer outra falha, registrar em log e iterar.

### 5. Testes automatizados

Adicionar em `src/lib/__tests__/reschedule.test.ts`:

- Caso "embed services vem como array" → reschedule continua funcionando (regressão do bug atual).
- Caso "service_id presente, service_name ausente" no `createAppointmentFromAI` → cria normalmente.
- Caso "reschedule reason é prefixada" → quando o create interno falha por `slot_taken`, o reason final é `create:slot_taken`.

Rodar `bunx vitest run` ao final; só fechar a tarefa com tudo verde.

### 6. Confirmação em produção

Depois do deploy, pedir ao usuário para tentar de novo. Reler `server-function-logs` filtrando por `[booking reschedule]` / `[booking create]` para confirmar que o caminho do bug agora aparece com detalhe (ou desapareceu).

## Arquivos afetados

- `src/lib/booking-confirmation.server.ts` (logging + normalização embed + aceitar `service_id`)
- `src/lib/ai-respond.server.ts` (`friendlyReason` aceitar prefixo)
- `src/lib/__tests__/reschedule.test.ts` (novos casos)

Nenhuma migration SQL é necessária — bug é puramente de runtime.
