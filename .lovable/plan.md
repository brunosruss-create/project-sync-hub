## O que vamos fazer

Hoje o segmento, a página **Agente IA** e a **IA do Super Admin** são três peças soltas: o segmento muda só no perfil do negócio sem refletir no agente, a tela do Agente IA é totalmente fake (state local + stats inventados), e workspaces existentes não estão marcados como "IA ativa" para usar a config global. Vamos costurar tudo.

---

### 1. Trocar segmento aplica defaults da IA (com confirmação)

Em `src/routes/_authenticated.settings.workspace.tsx`, ao selecionar um segmento diferente do atual:

- Abrir um modal de confirmação avisando: *"Os defaults da IA (nome do assistente, tom, palavras-chave de transferência e prompt do segmento) serão substituídos pelos do novo segmento. Suas customizações serão sobrescritas. Continuar?"*
- Se confirmar, chama um novo server-fn `updateWorkspaceSegmentWithDefaults` que:
  1. Lê o segmento alvo (`default_assistant_name`, `default_tone`, `default_transfer_keywords`, `default_transfer_after_messages`).
  2. Em uma única `UPDATE` no `profiles`, grava `segment_id` + esses defaults.
- Invalida as queries `["workspace-profile"]` e `["workspace-ai-config"]` para que a página `/ai-agent` recarregue com os novos valores na hora.
- Se o segmento escolhido for o mesmo já salvo, comportamento atual (só atualiza nome do negócio) — sem modal.

### 2. Conectar a página Agente IA ao banco

`src/routes/_authenticated.ai-agent.tsx` hoje guarda tudo em `useState`. Vamos:

- Substituir os `useState` iniciais por `useQuery(getWorkspaceAiConfig)` (já existe em `onboarding.functions.ts`).
- Hidratar form a partir do `config` retornado: `ai_enabled`, `ai_assistant_name`, `ai_tone`, `ai_custom_prompt`, `ai_transfer_keywords`, `ai_transfer_after_messages`, `ai_schedule_enabled`, `ai_schedule_instruction`, `ai_working_hours`, `ai_out_of_hours_message`.
- Mapear o `ai_working_hours` (formato `{monday: {enabled,start,end}, ...}` que o `aiRespond` já consome) para os toggles de Seg/Ter/... da UI.
- Botão **Salvar alterações** vira `useMutation(updateWorkspaceAiConfig)`; on success, `invalidateQueries`.
- Toggle "Agente IA ativo" também salva `ai_enabled` (debounced ou no Salvar).
- Lista de **Serviços que o agente pode agendar**: trocar o mock pela query existente que lista serviços do workspace; persistir os IDs habilitados em uma nova coluna `ai_enabled_service_ids uuid[]` em `profiles` (migration nova).
- Botão **Testar agente** chama `aiRespond` com `preview: true` e renderiza a resposta no modal `TesterModal` (hoje só ecoa).

### 3. Métricas reais do topo da página

Criar server-fn `getWorkspaceAiStats` (em `onboarding.functions.ts` ou novo `ai-stats.functions.ts`) que, para `context.userId`:

- `messages_today`: `count` de `ai_usage_logs` com `action='send_message'` e `created_at >= hoje 00:00`.
- `transfers_today`: `count` com `action='transfer_to_human'` no mesmo intervalo.
- `errors_today`: `count` com `action='error'`.

A UI passa a mostrar **Atendimentos hoje** (real), **Transferidas** e **Erros** — substitui os 3 cards atuais (Taxa de resolução / Satisfação são removidos porque não temos sinal pra calcular).

### 4. Vincular IA global do Super Admin a TODOS os workspaces

Migração SQL nova:

```text
-- a) Default true para futuros workspaces
ALTER TABLE public.profiles
  ALTER COLUMN ai_enabled SET DEFAULT true;

-- b) Backfill nos workspaces existentes que ainda não têm IA ligada
UPDATE public.profiles
SET ai_enabled = true
WHERE ai_enabled IS DISTINCT FROM true;

-- c) Defaults razoáveis quando o campo está NULL
UPDATE public.profiles
SET ai_assistant_name = COALESCE(ai_assistant_name, 'Sofia'),
    ai_tone           = COALESCE(ai_tone, 'Amigável'),
    ai_transfer_keywords = COALESCE(
      ai_transfer_keywords, ARRAY['humano','atendente','reclamação']
    ),
    ai_transfer_after_messages = COALESCE(ai_transfer_after_messages, 5),
    ai_working_hours = COALESCE(
      ai_working_hours,
      jsonb_build_object(
        'monday',    jsonb_build_object('enabled', true, 'start','08:00','end','20:00'),
        'tuesday',   jsonb_build_object('enabled', true, 'start','08:00','end','20:00'),
        'wednesday', jsonb_build_object('enabled', true, 'start','08:00','end','20:00'),
        'thursday',  jsonb_build_object('enabled', true, 'start','08:00','end','20:00'),
        'friday',    jsonb_build_object('enabled', true, 'start','08:00','end','20:00'),
        'saturday',  jsonb_build_object('enabled', true, 'start','08:00','end','20:00'),
        'sunday',    jsonb_build_object('enabled', false,'start','08:00','end','20:00')
      )
    ),
    ai_out_of_hours_message = COALESCE(
      ai_out_of_hours_message,
      'Olá! No momento estamos fora do horário de atendimento.'
    );

-- d) Trigger handle_new_user: se já existir, atualizamos para incluir ai_enabled=true
--    e os defaults acima quando insere a linha em profiles.

-- e) Coluna nova p/ serviços habilitados pela IA
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS ai_enabled_service_ids uuid[] NOT NULL DEFAULT '{}';
```

Resultado: o `aiRespond` (que já lê `gemini_api_key`, `gemini_model`, `ai_base_prompt` de `global_settings` + `segment_prompt` de `ai_segments` + camada do workspace) passa a funcionar **out-of-the-box em qualquer workspace**, novo ou antigo, porque `ai_enabled=true` deixa de ser o gargalo.

### 5. Banner no Super Admin → IA

No `src/routes/_authenticated.super-admin.ia.tsx`, adicionar um indicador no card de status: "**IA global ativa em N workspaces**" usando o count `ai_active_workspaces` que `getAiUsageMetrics` já retorna — confirma visualmente que a configuração global está cobrindo todo mundo.

---

## Detalhes técnicos

**Arquivos editados:**
- `src/lib/onboarding.functions.ts` — adicionar `updateWorkspaceSegmentWithDefaults` e `getWorkspaceAiStats`.
- `src/routes/_authenticated.settings.workspace.tsx` — modal de confirmação ao trocar segmento.
- `src/routes/_authenticated.ai-agent.tsx` — substituir state local por queries/mutations reais; remover `SERVICES_MOCK` e usar serviços do workspace; stats reais; botão "Testar agente" usa `aiRespond` com `preview:true`.
- `src/routes/_authenticated.super-admin.ia.tsx` — exibir contagem de workspaces com IA ativa no card principal.
- Nova migration SQL com os blocos (a)–(e) acima.

**Sem mexer em:** `aiRespond`, `ai-admin.functions.ts`, segmentos do super admin — já estão prontos para isso.

**Compatibilidade:** A coluna `ai_enabled_service_ids` é opcional para o fluxo atual do `aiRespond` (que ainda não consulta agenda); é só persistência para a UI. Quando ligarmos agendamento automático, ela já estará lá.
