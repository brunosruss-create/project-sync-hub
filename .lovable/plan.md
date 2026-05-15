## Escopo

Mudanças cirúrgicas APENAS em:
1. `supabase/manual/20260601000000_ai_behavior_fields.sql` (nova)
2. `src/lib/ai-respond.server.ts`
3. `src/lib/onboarding.functions.ts`
4. `src/routes/_authenticated.ai-agent.tsx`

`src/routes/api/public/evolution.$instanceId.ts` **NÃO** será tocado.

---

## Conflito identificado antes de executar — preciso de decisão

### A. "Dupla resposta" — análise read-only de evolution.$instanceId.ts (linhas 380–460)

Existe **apenas UM caminho** que envia mensagem de volta ao WhatsApp para cada evento: `runAiResponse` → `evo.sendText` (linhas 424–443). **Não há chamada duplicada no código.** Se houver dupla resposta em produção, a causa é uma das duas:

1. **Evolution reentrega o mesmo webhook** (retry por timeout/ack) → mesmo `whatsapp_message_id` chega 2x.
2. **Cliente envia 2 mensagens curtas em sequência** e a IA responde cada uma separadamente.

Para resolver (1) com lock, o ideal é dedupe por `whatsapp_message_id` logo na entrada do webhook — mas isso exige editar `evolution.$instanceId.ts`, que está bloqueado.

**Alternativa proposta dentro da regra:** lock dentro de `runAiResponse` usando `(workspace_owner_id, contact_id, message, janela de 10s)` em `ai_usage_logs`. Não é tão preciso quanto messageId, mas funciona sem tocar o webhook.

→ A migration adicionará `ai_usage_logs.dedup_key TEXT` + índice único parcial para suportar isso.

**Pergunta:** ok seguir com esse lock "soft" em `runAiResponse`? Ou prefere abrir exceção e me deixar adicionar 5 linhas em `evolution.$instanceId.ts` para um dedupe correto por `whatsapp_message_id`?

### B. Coluna `ai_segments.transfer_keywords`

O código atual lê `default_transfer_keywords` (não `transfer_keywords`). Vou manter o nome existente no select para não quebrar.

### C. Coluna `ai_segments.slug`

Verificar se existe — os UPDATEs por `slug` podem ser no-op. Vou usar **somente** os matches por `name ILIKE` no SQL para garantir compatibilidade (mantém o comportamento, sem depender de `slug`).

### D. Cliente Supabase em `runAiResponse`

O arquivo usa `supabaseAdmin` (não `supabase` autenticado). Vou manter `supabaseAdmin` no novo select com join — não trocar para `supabase`.

---

## 1. Migration — `supabase/manual/20260601000000_ai_behavior_fields.sql`

```sql
-- Novos campos comportamentais em profiles
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS ai_introduce_by_name         BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS ai_declare_as_ai             BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS ai_mention_business_name     BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS ai_has_multiple_professionals BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS ai_price_disclosure_policy   TEXT DEFAULT 'on_request',
  ADD COLUMN IF NOT EXISTS ai_can_reschedule            BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS ai_can_cancel                BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS ai_min_advance_hours         INTEGER DEFAULT 2,
  ADD COLUMN IF NOT EXISTS ai_required_fields           JSONB   DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS ai_max_questions_per_message INTEGER DEFAULT 1;

-- default_required_fields por segmento
ALTER TABLE ai_segments
  ADD COLUMN IF NOT EXISTS default_required_fields JSONB DEFAULT '[]'::jsonb;

-- Lock soft para deduplicar respostas da IA
ALTER TABLE ai_usage_logs
  ADD COLUMN IF NOT EXISTS dedup_key TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS ai_usage_logs_dedup_key_uq
  ON ai_usage_logs (dedup_key) WHERE dedup_key IS NOT NULL;

-- Popular defaults por segmento (apenas matches por name ILIKE — slug pode não existir)
UPDATE ai_segments SET default_required_fields = '["placa","marca","modelo","ano","descricao_problema"]'::jsonb WHERE name ILIKE '%oficina%';
UPDATE ai_segments SET default_required_fields = '["area_interesse"]'::jsonb WHERE name ILIKE '%estét%' OR name ILIKE '%estet%';
UPDATE ai_segments SET default_required_fields = '["primeira_vez_ou_retorno","especialidade","convenio_ou_particular"]'::jsonb WHERE name ILIKE '%médic%' OR name ILIKE '%medic%';
UPDATE ai_segments SET default_required_fields = '["emergencia_ou_eletivo","primeira_vez_ou_paciente"]'::jsonb WHERE name ILIKE '%odonto%';
UPDATE ai_segments SET default_required_fields = '["tem_pedido_medico","convenio_ou_particular"]'::jsonb WHERE name ILIKE '%laborat%';
UPDATE ai_segments SET default_required_fields = '["tipo_aparelho","marca","modelo","problema","em_garantia"]'::jsonb WHERE name ILIKE '%assistên%' OR name ILIKE '%assisten%';
UPDATE ai_segments SET default_required_fields = '["nome_animal","especie","raca","idade","peso"]'::jsonb WHERE name ILIKE '%veterin%';
UPDATE ai_segments SET default_required_fields = '["tipo_veiculo","porte_veiculo"]'::jsonb WHERE name ILIKE '%lava%';
UPDATE ai_segments SET default_required_fields = '["objetivo_principal"]'::jsonb WHERE name ILIKE '%nutri%';
UPDATE ai_segments SET default_required_fields = '["area_do_direito"]'::jsonb WHERE name ILIKE '%advoc%' OR name ILIKE '%juríd%';
UPDATE ai_segments SET default_required_fields = '["objetivo","nivel_experiencia"]'::jsonb WHERE name ILIKE '%academ%' OR name ILIKE '%personal%' OR name ILIKE '%pilates%';
UPDATE ai_segments SET default_required_fields = '["queixa_principal"]'::jsonb WHERE name ILIKE '%fisio%';

-- Atualização dos prompts de segmento (usar UPDATEs do briefing original, todos por name ILIKE)
-- ... (todos os UPDATEs de segment_prompt do prompt do usuário, sem alteração)
```

## 2. `src/lib/ai-respond.server.ts`

- Adicionar tipos `PriceDisclosurePolicy` e `AiBehaviorConfig` no topo.
- Substituir `buildWorkspaceLayer` (linhas 47–58) pela versão expandida do briefing (identidade, tom, profissionais, preços, agendamento, required fields com `fieldLabels`, custom prompt, `welcome_message`, regras absolutas).
- Trocar o select de `profiles` (linhas 87–91) por select com join em `ai_segments(segment_prompt, default_transfer_keywords, default_required_fields, id)`. Substitui o select separado de segmento que existe hoje (linhas 95–101).
- Passar `segment_default_required_fields` ao `buildWorkspaceLayer`.
- **Lock soft no início** de `runAiResponse` (após carregar `globalRows`):
  ```ts
  const dedupKey = `${data.workspace_owner_id}|${data.contact_id ?? ''}|${data.message.slice(0,200)}|${Math.floor(Date.now()/10000)}`;
  const { data: locked } = await supabaseAdmin
    .from('ai_usage_logs').select('id').eq('dedup_key', dedupKey).maybeSingle();
  if (locked) return { action: 'skip', reason: 'duplicate' };
  // adicionar dedup_key em todos os inserts subsequentes em ai_usage_logs
  ```

## 3. `src/lib/onboarding.functions.ts`

- Em `getOnboardingConfig` (linha ~125): adicionar os 10 novos campos ao select.
- Em `saveOnboardingConfig` schema Zod (linhas ~152–162): adicionar validators para os 10 campos (booleans, enum para `ai_price_disclosure_policy`, integers com min, array para `ai_required_fields`).
- No update do profile: incluir os 10 novos campos com defaults conforme briefing.

## 4. `src/routes/_authenticated.ai-agent.tsx`

Adicionar os controles do briefing **após** os campos existentes em "Personalidade do Agente", agrupados em seções: Apresentação, Profissionais, Preços, Agendamento (extra), Comportamento. Sem mover/remover nada existente. Estado lido/gravado via `getOnboardingConfig`/`saveOnboardingConfig`.

---

## Decisões pedidas antes de eu implementar

1. **Lock para dupla resposta:** soft (sem tocar webhook, dedup por janela de 10s) **OU** abrir exceção mínima no webhook para dedup por `whatsapp_message_id`?
2. **Migration de prompts dos segmentos:** vai junto na mesma migration `20260601…` (como acima), **OU** prefere arquivo separado `20260601000001_ai_segment_prompts.sql`?
