## Problema

A lista de modelos no `/super-admin/ia` está desatualizada. Mostra Gemini 1.5 (legado/descontinuado) e 2.0, e não tem nenhum modelo da família **Gemini 3** — incluindo o **Gemini 3.1 Flash-Lite** (último modelo estável e mais barato/rápido) e o **Gemini 3 Flash**, que é o recomendado atual.

## Modelos válidos hoje na API oficial Google (`generativelanguage.googleapis.com/v1beta/.../:generateContent`)

Confirmado em https://ai.google.dev/gemini-api/docs/models — modelos de texto/chat suportados:

| Código (API) | Nome amigável | Status | Quando usar |
|---|---|---|---|
| `gemini-3.1-pro-preview` | Gemini 3.1 Pro | Preview | Qualidade máxima, raciocínio complexo |
| `gemini-3-flash-preview` | Gemini 3 Flash | Preview | **Recomendado** — equilíbrio frontier-class |
| `gemini-3.1-flash-lite` | Gemini 3.1 Flash-Lite | **Estável** | Mais rápido e barato da família 3 |
| `gemini-3.1-flash-lite-preview` | Gemini 3.1 Flash-Lite (preview) | Preview | Acesso antecipado a melhorias |
| `gemini-2.5-pro` | Gemini 2.5 Pro | Estável | Raciocínio profundo (geração anterior) |
| `gemini-2.5-flash` | Gemini 2.5 Flash | Estável | Custo/performance família 2.5 |
| `gemini-2.5-flash-lite` | Gemini 2.5 Flash-Lite | Estável | Mais barato família 2.5 |

**Removidos** (deprecados/sem valor):
- `gemini-2.0-flash` — substituído por 2.5/3.x
- `gemini-1.5-flash` / `gemini-1.5-pro` — descontinuados pelo Google

## Plano de correção

### 1. Atualizar lista de modelos no select
Arquivo: `src/routes/_authenticated.super-admin.ia.tsx` (linhas 168–172)

Trocar pelas 7 opções acima, agrupadas com `<optgroup>`:
- **Gemini 3 (mais novos)** — 3.1 Flash-Lite (estável), 3 Flash, 3.1 Pro, 3.1 Flash-Lite preview
- **Gemini 2.5 (estáveis)** — 2.5 Flash, 2.5 Flash-Lite, 2.5 Pro

Marcar `gemini-3.1-flash-lite` como **recomendado** (rápido, barato e estável).

### 2. Atualizar default em todo o backend
Trocar todos os fallbacks `"gemini-2.5-flash"` para `"gemini-3.1-flash-lite"`:
- `src/routes/_authenticated.super-admin.ia.tsx` linha 77
- `src/lib/ai-admin.functions.ts` (função `testGeminiConnection`)
- `src/lib/ai-respond.functions.ts` linha 148

### 3. Atualizar comentário de custo em `ai-respond.functions.ts`
Já cita "Gemini 3.1 Flash-Lite" mas o código real usa 2.5-flash. Alinhar tudo em 3.1 Flash-Lite com os preços oficiais ($0.10 input / $0.40 output por 1M tokens, conforme Google).

### 4. (Opcional) Validar modelo antes de salvar
Em `updateAiGlobalSettings`, validar com `z.enum([...])` se `gemini_model` é um dos 7 códigos válidos, evitando o usuário salvar um modelo escrito errado.

## Resultado

- O select passa a mostrar apenas modelos válidos hoje na API Gemini, com o **3.1 Flash-Lite como recomendado**.
- Default do sistema atualizado pra 3.1 Flash-Lite (mais barato e rápido que o 2.5-flash que está hoje).
- Custos no log batem com o modelo real chamado.