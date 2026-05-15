## Contexto

O projeto usa Supabase diretamente (não Lovable Cloud secrets). A chave do Gemini é salva na tabela `global_settings` via `updateAiGlobalSettings` (server function com `supabaseAdmin`). A resposta atual de `getAiGlobalSettings` mostra `gemini_api_key.value = ""`, então a chave não está sendo persistida — apesar de outras colunas (`gemini_model`, prompt) estarem.

## Investigação (read-only, antes de qualquer fix)

1. **Conferir o estado real da tabela `global_settings`** via Supabase:
   - Listar todas as linhas com `key IN ('gemini_api_key','gemini_model','gemini_temperature','gemini_max_tokens','ai_base_prompt')` para ver `value`, `updated_at`.
   - Verificar se há constraint `UNIQUE(key)` (necessária para o `upsert` funcionar como update).
   - Verificar políticas RLS da tabela e se `supabaseAdmin` (service role) realmente bypassa.
2. **Testar o save end-to-end** chamando `updateAiGlobalSettings` com uma chave de teste e logando o retorno do `upsert` (capturar `error`).
3. **Confirmar com o usuário** se ao clicar em "Salvar configurações" aparece o toast verde "Configurações salvas". Se não, o erro está sendo silenciado.

## Possíveis correções (escolher após investigação)

- **Se faltar UNIQUE constraint**: criar migração `ALTER TABLE global_settings ADD CONSTRAINT global_settings_key_unique UNIQUE (key);` e ajustar o upsert para `.upsert(rows, { onConflict: 'key' })`.
- **Se RLS estiver bloqueando**: como já usamos `supabaseAdmin` (service role) o RLS deveria ser ignorado; se não for, revisar qual cliente está sendo importado em `client.server.ts`.
- **Se o save funciona mas a leitura mostra vazio**: pode ser cache do TanStack Query — invalidar `["ai-globals"]` após o save.
- **Melhorar feedback no UI**: mostrar no card de "Credenciais" um indicador "✓ Chave salva (••••1234)" lendo os últimos 4 caracteres do banco, para o usuário ter certeza visual de que a chave está persistida.

## Detalhes técnicos

Arquivos envolvidos:
- `src/lib/ai-admin.functions.ts` — `updateAiGlobalSettings` (linhas 41-67) faz `supabaseAdmin.from("global_settings").upsert(rows)` sem `onConflict`. Isso é provavelmente o bug raiz: sem constraint única, o upsert vira insert e pode estar falhando silenciosamente em uma duplicata ou criando linhas órfãs.
- `src/routes/_authenticated.super-admin.ia.tsx` — fluxo do save (linhas 81-88). O `try/catch` mostra toast de erro, então se aparece toast verde o servidor retornou ok.

## Próximo passo imediato

Antes de codar, eu preciso rodar uma query SELECT direto na tabela `global_settings` para ver o que está lá. Posso fazer isso pelas ferramentas de banco do Supabase. Você confirma que posso prosseguir com a investigação?
