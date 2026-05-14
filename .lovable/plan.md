## Escopo

Você confirmou:
- **Multi-tenant por `userId`** (não criar tabela `workspaces` agora — o app já isola tudo por `owner_user_id`).
- **Aplicar UI + fix do primeiro connect já**, junto com o multi-tenant.

Alterações ficam contidas em **2 arquivos**:
- `src/lib/evolution.server.ts` (1 função)
- `src/routes/_authenticated.settings.whatsapp.tsx` (UI)

Sem mudanças em: kanban, chat, dashboard, agendamentos, contatos, serviços, schema do DB, RLS (a tabela `whatsapp_instances` já tem `owner_user_id` + RLS por owner — vide `20260513133500_whatsapp_owner_rls.sql`).

---

## Passo 1 — Limpar a UI (`_authenticated.settings.whatsapp.tsx`)

Remover do JSX:
- Os dois `<Info>` técnicos: **"Instância"** (linha 378) e **"Webhook"** (linha 379).
- O bloco `<FieldGroup label="Integração">` inteiro (linhas 404–430), incluindo o botão **"Re-registrar neste ambiente"**.
- O link **"Documentação Evolution API"** (linhas 432–440).

Também remover imports e mutations órfãos resultantes:
- `ExternalLink` do `lucide-react`.
- `registerWebhook` do import de `evolution.functions`.
- `doRegisterWebhook` (`useServerFn`) e a mutation `register`.

A descrição do `SettingsLayout` passa de "…via Evolution API" para algo neutro: **"Conexão da sua conta WhatsApp ao ZapFlow."**

Mantido intacto: status badge, QR flow, foto de perfil, Número/Nome do perfil/Conectado em, botão Reconectar, botão Desconectar com confirmação.

## Passo 2 — Tornar o primeiro connect tolerante (`evolution.functions.ts`, função `connectInstance`)

O código atual em `connectInstance` (linhas 152–165) já faz `try/catch` em volta do `evo.logout` e `evo.deleteInstance`, mas:
- Re-lança se `isAuthError(msg)` — correto, manter.
- Não dá tempo da Evolution processar a deleção antes do `createInstance`.
- O loop de retry em `connect` usa apenas 600 ms entre tentativas.

Ajustes mínimos:
1. Após o bloco `delete`, adicionar `await new Promise(r => setTimeout(r, 1500))` somente quando o delete não tiver dado 404 (instância existia de fato). Para detectar isso, capturar a flag `existed` no catch.
2. No loop de retry do `connect` (linhas 191–199), aumentar para **5 tentativas com backoff progressivo** (`(attempt + 1) * 800 ms`) — tolera o tempo extra do Baileys subir na primeira criação.
3. Mensagem de erro final mais clara quando ainda assim falhar: "Não foi possível obter o QR Code. Tente novamente em alguns segundos."

Sem alterar `getOrCreateRow`, webhook flow, RLS, ou qualquer outra função do arquivo.

## Passo 3 — Multi-tenant por usuário (`evolution.server.ts`)

Trocar **só a função `instanceNameForOwner`**:

```ts
export function instanceNameForOwner(userId: string | null | undefined): string {
  if (!userId) throw new Error("userId required for instance name");
  const safe = userId.replace(/-/g, "").slice(0, 24);
  return `zf_${safe}`;
}
```

Todas as 14 chamadas existentes em `evolution.functions.ts` já passam `context.userId` (ou `userId` em `getOrCreateRow`) — **nenhuma chamada precisa mudar**. O webhook por instância (`/api/public/evolution/${row.id}`) já é per-row, então cada usuário recebe os próprios eventos.

### Migração da linha existente (`zapflow_main`)

A linha atual no DB tem `instance_name = "zapflow_main"` e o `owner_user_id` do usuário que conectou primeiro. Após o deploy, o `getOrCreateRow` desse usuário vai procurar `zf_<userId>`, não achar, e criar uma nova linha — deixando a `zapflow_main` órfã.

Duas opções:

**A. Renomear a linha existente (recomendado, sem reconectar):**
Você roda 1 vez no SQL Editor do Supabase:
```sql
UPDATE public.whatsapp_instances
SET instance_name = 'zf_' || replace(owner_user_id::text, '-', '')
WHERE instance_name = 'zapflow_main';
```
E também renomeia a instância no Evolution API (Railway) para o novo nome — ou simplesmente reconecta uma vez (gera novo QR), o que é mais simples.

**B. Reconectar do zero:** ignora a linha velha, usuário escaneia QR novamente. Mais simples, mas exige reconexão.

Recomendo **B** pela simplicidade — reconectar leva 10 s e evita mexer no Railway.

## Passo 4 — Verificação

- `/settings/whatsapp` abre, sem URL de webhook, sem nome de instância, sem botão "Re-registrar", sem link de docs.
- Reconectar uma vez (Passo 3B): QR aparece **na primeira tentativa**.
- Status "Conectado", foto, número e nome aparecem normalmente.
- Mensagens continuam chegando no kanban (webhook por `row.id` continua funcional).
- Criar segundo usuário em outro browser → conecta outro número → os dois funcionam em paralelo (cada um com sua row e sua instância `zf_<userId>` no Evolution).

## Fora de escopo (não mexer)

- Tabela `workspaces` / `workspace_id` em profiles (decisão sua: por usuário).
- RLS de `whatsapp_instances` — já está correta por `owner_user_id`.
- Super admin / outras telas.
