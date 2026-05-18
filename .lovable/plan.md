## Objetivo

Dar à IA memória completa do histórico do cliente em duas camadas: (1) aumentar a janela de mensagens recentes de 20 → 100 com índice composto correto, e (2) adicionar sumarização progressiva persistida em `contacts.ai_summary` para histórico longo.

## Regra de escopo (estrita)

Tocar APENAS:
- `src/routes/api/public/evolution.$instanceId.ts` (duas ocorrências da query de histórico, ~468–483 e ~562–566)
- `src/lib/ai-respond.server.ts` (apenas montagem do `systemInstruction` + tipo do input)
- Novos arquivos: `supabase/manual/20260601000002_contact_ai_summary.sql`, `src/lib/ai-summary.ts`

NÃO mexer em: kanban, modo chat, agenda, componentes visuais, outras rotas, RLS existentes, lógica de booking autônomo.

---

## Camada 1 — Janela de 100 mensagens (aplicar e validar primeiro)

Nas duas ocorrências em `evolution.$instanceId.ts`, substituir a query atual por:

```ts
const { data: history } = await supabaseAdmin
  .from("messages")
  .select("direction,content,created_at")
  .eq("owner_user_id", row.owner_user_id)   // usa índice composto (owner_user_id, contact_id)
  .eq("contact_id", contactId)
  .order("created_at", { ascending: false })
  .limit(100);                               // 20 → 100

const conversation_history = (history ?? [])
  .reverse()
  .filter((h) => h.content && String(h.content).trim().length > 0)
  .map((h) => ({
    role: h.direction === "inbound" ? "user" as const : "assistant" as const,
    content: String(h.content).slice(0, 2000), // 8000 → 2000 (~200k chars no total)
  }));
// remover slice(-20) e pop() — a msg atual já é passada como `message`
```

Observação importante sobre o `pop()`: hoje ele remove o ÚLTIMO item do array já invertido em ordem cronológica — que é a mensagem mais recente. Ao remover esse `pop()`, é preciso confirmar que a mensagem atual (`caption` / texto recebido) ainda não foi inserida em `messages` ANTES dessa query. Vou ler o arredor das duas ocorrências para confirmar a ordem (insert vs. select) antes de remover o `pop()`; se a mensagem atual já estiver inserida no banco quando o select roda, mantemos um `pop()` apenas para evitar duplicar a última inbound.

### Checklist Camada 1
- [ ] Duas ocorrências atualizadas (welcome + fluxo principal)
- [ ] `owner_user_id` adicionado em ambas
- [ ] LIMIT 20 → 100 em ambas
- [ ] Truncamento 8000 → 2000 em ambas
- [ ] `slice(-20)` removido
- [ ] Decisão sobre `pop()` validada pela ordem real do código
- [ ] Build passa; nenhuma outra linha alterada

---

## Camada 2 — Sumarização progressiva (somente após Camada 1 validada)

### 2.1 Migration

`supabase/manual/20260601000002_contact_ai_summary.sql`:

```sql
ALTER TABLE public.contacts
  ADD COLUMN IF NOT EXISTS ai_summary TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS ai_summary_updated_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS ai_summary_message_count INTEGER DEFAULT 0;

CREATE INDEX IF NOT EXISTS contacts_ai_summary_updated_idx
  ON public.contacts(owner_user_id, ai_summary_updated_at);
```

Coluna dedicada (não reusar `notes`, que é do atendente). SQL colado na resposta conforme regra de memória do projeto.

### 2.2 Helper `src/lib/ai-summary.ts`

Duas funções, ambas usando `supabaseAdmin` do path correto do projeto (`@/integrations/supabase/client.server`, não `./supabase-admin`):

- `getContactAiSummary(contactId, ownerUserId): Promise<string>` — leitura simples para injetar no contexto.
- `maybeUpdateAiSummary(contactId, ownerUserId, totalMessageCount, geminiApiKey, geminiModel)` — gera resumo via Gemini quando:
  - total ≥ 80 mensagens E
  - chegaram ≥ 20 mensagens novas desde o último resumo.

Resume as 60 mensagens mais antigas, concatena com o resumo anterior, limita a 200 palavras, `temperature: 0.3`, `maxOutputTokens: 500`. Falha silenciosa (try/catch + retorno void) — nunca quebra o fluxo da IA.

### 2.3 Integração no webhook

Em `evolution.$instanceId.ts`, nas mesmas duas regiões da Camada 1, após o select de histórico:

```ts
const { count: totalCount } = await supabaseAdmin
  .from("messages")
  .select("*", { count: "exact", head: true })
  .eq("owner_user_id", row.owner_user_id)
  .eq("contact_id", contactId);

const aiSummary = await getContactAiSummary(contactId, row.owner_user_id);

if (totalCount && totalCount > 80) {
  // background — não bloqueia a resposta
  maybeUpdateAiSummary(
    contactId,
    row.owner_user_id,
    totalCount,
    g.gemini_api_key,
    g.gemini_model ?? "gemini-2.0-flash-lite",
  ).catch((err) => console.error("[ai-summary]", err));
}
```

E passar para `runAiResponse({ ..., ai_summary: aiSummary })`.

Import no topo: `import { getContactAiSummary, maybeUpdateAiSummary } from "@/lib/ai-summary";` (alias `@/`, não path relativo `../../../`).

### 2.4 Injeção no prompt em `ai-respond.server.ts`

- Adicionar `ai_summary?: string` ao tipo `AiRunInput`.
- Antes de montar o `finalPrompt`, inserir como PRIMEIRA seção (antes do `nowLayer`/`ai_base_prompt`):

```ts
const summarySection = data.ai_summary
  ? `=== HISTÓRICO ANTERIOR DO CLIENTE (resumo automático) ===\n${data.ai_summary}\n=== FIM DO HISTÓRICO ANTERIOR ===`
  : "";
```

Anexar via `.filter(Boolean).join("\n\n---\n\n")` no array que já compõe o `finalPrompt`. Nenhuma outra parte do prompt (booking, knownClient, contactAppts, business hours) é alterada.

### Checklist Camada 2
- [ ] Migration aplicada manualmente no Supabase (colunas + índice)
- [ ] `src/lib/ai-summary.ts` criado com os imports corretos do projeto
- [ ] Webhook chama `getContactAiSummary` e dispara `maybeUpdateAiSummary` em background nas duas regiões
- [ ] `runAiResponse` recebe `ai_summary` e injeta no topo do `systemInstruction`
- [ ] `ai-respond.functions.ts` (validator zod) aceita `ai_summary` opcional, se for o caso
- [ ] Falha de sumarização não derruba a resposta
- [ ] Build passa; nenhuma regressão em kanban, agenda, modo chat manual

---

## Pontos de verificação antes de codar (faço na implementação)

1. Confirmar a ordem real "insert da mensagem atual" vs. "select do histórico" nas duas regiões — define se `pop()` fica ou sai.
2. Confirmar nome do export do admin client (`supabaseAdmin` em `@/integrations/supabase/client.server`).
3. Confirmar se `g.gemini_api_key` e `g.gemini_model` estão no escopo das duas regiões do webhook (a região "welcome" pode não ter — se não tiver, pular o disparo de summary lá e manter só no fluxo principal).
4. Confirmar se `ai-respond.functions.ts` valida o input com zod estrito — se sim, adicionar `ai_summary` ao schema.

## Resultado

| Camada | Cobre | Como |
|---|---|---|
| 1 | Últimas ~100 mensagens | LIMIT 100 + índice composto |
| 2 | Toda a vida do contato | Resumo persistido em `contacts.ai_summary` |
