O bug real está claro:

- O switch grande desliga `ai_enabled`, então ele desliga a IA inteira.
- A mensagem fora do horário depende de `ai_out_of_hours_enabled`, mas essa coluna não existe no banco publicado.
- Sem a coluna, o backend cai no fallback antigo e assume `true`; por isso a IA desliga, mas a mensagem fora do horário continua saindo.

Plano de correção, com risco mínimo:

1. Criar a coluna real da configuração

Adicionar somente schema:

```sql
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS ai_out_of_hours_enabled boolean DEFAULT false;
```

Não vou colocar `UPDATE` dentro da migration, porque migration deve ser só estrutura.

2. Corrigir a decisão no backend

Em `src/lib/ai-respond.server.ts`:

- Se `ai_out_of_hours_enabled` existir, usar esse valor.
- Se ainda não existir, aceitar apenas fallback JSON explícito.
- Se não existir coluna nem fallback explícito, assumir `false`, nunca `true`.

Resultado: workspace antigo sem configuração explícita para de mandar a mensagem fora do horário.

3. Salvar o toggle certo sem mexer na IA

Em `src/lib/onboarding.functions.ts`:

- Quando salvar “Enviar mensagem fora do horário”, gravar `ai_out_of_hours_enabled`.
- Também manter `ai_working_hours.__out_of_hours.enabled` sincronizado por compatibilidade.
- Não alterar `ai_enabled` nesse fluxo além do que a tela já faz quando o usuário mexe no switch principal.

4. Ajustar a UI para evitar confusão

Em `/ai-agent`:

- Deixar o switch grande explicitamente como “IA ativa/pausada”.
- Deixar “Enviar mensagem fora do horário” separado como controle exclusivo dessa mensagem.
- Não mudar layout amplo nem fluxo principal.

5. Não tocar no core

Não vou alterar:

- Webhook Evolution.
- Conexão de múltiplas instâncias.
- Prompt/Gemini.
- Resposta normal da IA.
- Transferência para humano.
- Dedup.
- Cálculo de horário/timezone.

Resultado esperado:

- A IA pode ficar ligada normalmente.
- O checkbox de fora do horário desliga só a mensagem fora do horário.
- A mensagem não será enviada por padrão quando a configuração estiver ausente.