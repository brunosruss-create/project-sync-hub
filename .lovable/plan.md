## Problema encontrado

A tela mostra que a chave digitada não está salva porque o backend está tentando usar a variável `APP_SUPABASE_SERVICE_ROLE_KEY`, mas o padrão do projeto/Supabase é `SUPABASE_SERVICE_ROLE_KEY`. Quando essa variável não existe, o cliente admin não tem permissão real para gravar em `global_settings`, então a chave continua vazia.

## Plano de correção

1. **Corrigir o cliente admin do Supabase**
   - Alterar `src/integrations/supabase/client.server.ts` para usar `SUPABASE_SERVICE_ROLE_KEY` como variável principal.
   - Manter compatibilidade com `APP_SUPABASE_SERVICE_ROLE_KEY` como fallback, caso ela exista.
   - Usar também `SUPABASE_URL` com fallback para `VITE_SUPABASE_URL`.

2. **Corrigir a validação antes de salvar configurações de IA**
   - Alterar `src/lib/ai-admin.functions.ts` para validar a presença de `SUPABASE_SERVICE_ROLE_KEY` ou `APP_SUPABASE_SERVICE_ROLE_KEY`.
   - Melhorar a mensagem de erro para indicar exatamente qual secret está faltando, sem expor nenhum valor.

3. **Melhorar a confirmação de gravação da chave**
   - Após salvar, buscar novamente `global_settings` e confirmar se `gemini_api_key` ficou com valor.
   - Se o Supabase retornar erro de RLS/permissão/constraint, exibir mensagem clara no toast e no status da tela.

4. **Ajuste opcional de banco se necessário**
   - A migration manual já define `global_settings.key` como `primary key`, então o `upsert(..., { onConflict: 'key' })` está correto.
   - Se o banco real não tiver essa constraint, será necessário aplicar/rodar o SQL de `supabase/manual/20260519000000_ai_agent.sql` no Supabase.

## Resultado esperado

Depois da correção, ao clicar em **Salvar configurações**, a chave será persistida em `public.global_settings` na linha `gemini_api_key`, e a tela passará a mostrar `✓ Chave salva no banco`.