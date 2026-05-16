# Corrigir confusão entre boas-vindas e fora-do-horário

## Diagnóstico

Hoje o checkbox em **Configurações → Negócio** está rotulado como "Enviar mensagem fora do horário", mas fica logo acima do textarea **"Mensagem de boas-vindas"**, o que causa confusão. Além disso:

- Esse checkbox grava `ai_out_of_hours_enabled = true` no perfil, então quando o cliente escreve fora do horário, o backend manda a **mensagem fora do horário** (campo `ai_out_of_hours_message`, configurado na tela de IA) — não a de boas-vindas.
- A `welcome_message` salva na tela de Negócio nunca é disparada como mensagem real; ela hoje só serve como "tom de referência" no prompt da IA (`ai-respond.server.ts:326`).
- O toggle "fora do horário" na tela de IA salva no mesmo `ai_out_of_hours_enabled`. Se o usuário ativa só esse toggle e o cliente está dentro do horário, nada é enviado (comportamento esperado: fora-do-horário só dispara fora do horário).

## Objetivo

1. Tela **Configurações → Negócio**: o checkbox passa a controlar **boas-vindas** (primeiro contato do cliente). Some o controle de fora-do-horário daqui.
2. Tela **Configurações da IA**: continua dona do toggle e do texto de **mensagem fora do horário**.
3. Backend: implementar de fato o envio da mensagem de boas-vindas no primeiro contato.

## Mudanças

### 1. Banco (nova migration manual)

Adicionar coluna `welcome_message_enabled boolean not null default false` em `profiles`.

```sql
alter table public.profiles
  add column if not exists welcome_message_enabled boolean not null default false;
```

### 2. `src/lib/onboarding.functions.ts`

- `getWorkspaceProfile`: selecionar e retornar `welcome_message_enabled`. Remover o segundo SELECT em `ai_out_of_hours_enabled` (não é mais usado nessa tela).
- `updateWorkspaceProfile`:
  - Trocar o campo `ai_out_of_hours_enabled` no schema por `welcome_message_enabled: z.boolean().optional()`.
  - Persistir `welcome_message_enabled` em `profiles`.
  - Remover toda a lógica de `mergeOutOfHoursMarker` desta função (ela permanece em `updateAiConfig`).

### 3. `src/routes/_authenticated.settings.workspace.tsx`

- Renomear estado `offHoursEnabled` → `welcomeEnabled`.
- Hidratar de `p.welcome_message_enabled`.
- Mover o checkbox para dentro do `FieldGroup "Mensagem de boas-vindas"`, logo acima do textarea, com label **"Enviar mensagem de boas-vindas no primeiro contato"**.
- Desabilitar textarea quando `!welcomeEnabled`.
- Enviar `welcome_message_enabled` no save; remover `ai_out_of_hours_enabled` do payload.

### 4. `src/routes/api/public/evolution.$instanceId.ts` (webhook Evolution)

Antes de chamar `runAiResponse` para uma mensagem inbound de texto sem humano atribuído:

1. Carregar `welcome_message_enabled, welcome_message` do perfil do dono.
2. Se ambos preenchidos, contar mensagens outbound prévias para esse `contact_id`. Se `count === 0` (primeiro contato), enviar `welcome_message` via `evo.sendText`, inserir em `messages` com `is_ai = true` e atualizar `contacts.last_message`.
3. Continuar com `runAiResponse` normalmente (a IA pode responder em seguida, ou mandar fora-do-horário se aplicável).

### 5. `src/lib/ai-respond.server.ts`

Sem mudanças funcionais necessárias. A lógica de fora-do-horário continua dependente apenas de `ai_out_of_hours_enabled` (controlada pela tela de IA) e `ai_out_of_hours_message`.

## Resultado esperado

- Checkbox em **Negócio** → controla **boas-vindas** (1º contato), independente do horário.
- Checkbox em **IA** → controla **fora do horário** (apenas quando fora do expediente).
- Os dois podem coexistir: 1º contato fora do horário envia boas-vindas + mensagem fora do horário; dentro do horário envia boas-vindas + resposta normal da IA.
