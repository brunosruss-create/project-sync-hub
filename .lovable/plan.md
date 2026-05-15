## Diagnóstico

A tela mostra "✕ API key não configurada" porque o backend (`testGeminiConnection`) lê a chave do banco `global_settings.gemini_api_key` e recebe vazio. O input mascarado na tela não significa que está salvo — pode ser apenas texto digitado pendente de save. Além disso, o modelo padrão `gemini-3.1-flash-lite` **não existe** na API REST direta do Google (`generativelanguage.googleapis.com/v1beta`), o que causaria 404 mesmo após a chave ser salva.

## Plano (apenas 2 ajustes cirúrgicos, sem quebrar nada)

### 1. Mensagens de erro mais claras + log do que veio do banco
Em `src/lib/ai-admin.functions.ts` → `testGeminiConnection`:
- Distinguir 3 estados:
  - chave nunca salva no DB → "API key não foi salva no banco. Clique em **Salvar configurações** antes de testar."
  - chave salva mas Google retorna 401/403 → "Chave inválida ou sem permissão (HTTP 401/403)."
  - chave OK mas modelo inválido (404) → "Modelo `<x>` não disponível na sua conta Google."
- Mostrar no payload o tamanho da chave lida (`apiKey.length`) para confirmar que chegou.

### 2. Corrigir lista de modelos para os ids reais da API REST do Google
Em `src/routes/_authenticated.super-admin.ia.tsx` (dropdown) e `src/lib/ai-admin.functions.ts` / `src/lib/ai-respond.functions.ts` (fallback):

Trocar default de `gemini-3.1-flash-lite` por um id que **realmente existe** na API direta:
- `gemini-2.5-flash` (recomendado — barato, rápido, multimodal)
- `gemini-2.5-pro` (qualidade máxima)
- `gemini-2.0-flash`
- `gemini-1.5-flash` (legado, ainda funciona)
- `gemini-1.5-pro` (legado)

Remover as opções `gemini-3.1-*` e `gemini-3-flash` do dropdown (são marcas Vertex/preview, não funcionam via `generativelanguage.googleapis.com`). Atualizar o fallback default para `gemini-2.5-flash`.

### 3. Verificação após as mudanças
Pedir para você:
1. Colar a chave no campo
2. Clicar em **Salvar configurações** (toast verde "Configurações salvas")
3. Só então clicar em **Testar agora**
4. Se ainda falhar, o erro novo vai dizer exatamente onde — chave ausente vs. chave inválida vs. modelo inválido.

## Arquivos alterados
- `src/lib/ai-admin.functions.ts` (mensagens do test + default do modelo)
- `src/lib/ai-respond.functions.ts` (default do modelo)
- `src/routes/_authenticated.super-admin.ia.tsx` (dropdown de modelos + default)

## Não tocado
- Fluxo de save, kanban, chat, agenda, super admin de workspaces/usuários, RLS, schema do DB.
