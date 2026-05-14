## Diagnóstico

A causa **não** é string hardcoded `zapflow_main` — busquei no projeto inteiro e **não existe nenhuma referência**. Todas as 14 chamadas em `evolution.functions.ts` e o webhook em `routes/api/public/evolution.$instanceId.ts` já usam `instanceNameForOwner(userId)` ou consultam por `owner_user_id`/`id`.

A causa real está visível na sua screenshot do SQL Editor:

```
id                                    instance_name                  status
fffc7868-250d-4c88-bdbc-e8f044826942  zf_491da44f593147cca9f60388    connected
3b0f3e4e-f8ec-4fcf-b593-1b74ee2bd313  zf_SEUUSERID                   disconnected
```

A segunda linha (`zf_SEUUSERID`) é **lixo do UPDATE SQL** — você rodou `replace('SEU-USER-ID', '-', '')` literalmente sem substituir o placeholder, então criou uma row com `instance_name = 'zf_SEUUSERID'` e provavelmente o mesmo `owner_user_id` da row real.

A query do `/inbox` (linhas 72-76 de `src/routes/_authenticated.inbox.tsx`):

```ts
.from("whatsapp_instances")
.select("status")
.eq("owner_user_id", user?.id)
.maybeSingle();
```

`.maybeSingle()` **retorna erro** quando há mais de uma row para o mesmo owner. O `if (error || !data)` cai no `setWhatsappStatus("disconnected")` → Kanban mostra "WhatsApp não conectado".

## Correções (sem mexer em kanban/chat/realtime/dashboard)

**1. Limpar a row órfã no DB** (você roda 1x no SQL Editor):

```sql
DELETE FROM public.whatsapp_instances
WHERE instance_name = 'zf_SEUUSERID';
```

**2. Tornar a query do `/inbox` robusta** (`src/routes/_authenticated.inbox.tsx`, linhas 72-82):

Trocar `.maybeSingle()` por `.order("updated_at", { ascending: false }).limit(1)` e ler `data?.[0]`. Assim, mesmo se aparecer outra row futuramente (ex.: usuário desconecta/reconecta), a mais recente vence e nunca quebra a query.

```ts
const { data, error } = await supabase
  .from("whatsapp_instances")
  .select("status")
  .eq("owner_user_id", user?.id)
  .order("updated_at", { ascending: false })
  .limit(1);
if (cancelled) return;
const row = data?.[0];
if (error || !row) {
  setWhatsappStatus("disconnected");
  return;
}
setWhatsappStatus(row.status === "connected" ? "connected" : "disconnected");
```

Sem mudar nenhum import, nenhum outro arquivo, nenhuma lógica de kanban/realtime.

## Fora de escopo
- `evolution.functions.ts`, `evolution.server.ts`, webhook, settings/whatsapp — todos já corretos.
- Kanban, drag-and-drop, chat, dashboard, agenda — intocados.

## Verificação após aplicar
- `/inbox` mostra as 10 conversas existentes.
- Status "Conectado" continua aparecendo em `/settings/whatsapp`.
- Mensagens novas continuam chegando em tempo real.
