## Diagnóstico

1. **A IA realmente está desativada no banco para o workspace testado**
   - O snapshot de rede mostra o perfil do usuário com `ai_enabled: false`.
   - Por isso o teste retorna `(Pulado: IA desativada)` antes mesmo de montar o prompt final.
   - A migração criada para ativar IA globalmente tem timestamp anterior à migração principal de IA (`202605160...` antes de `202605190...`), então ela pode não ter sido aplicada na ordem correta ou pode ter sido sobrescrita pelo default antigo `false`.

2. **O prompt do segmento não aparece no workspace por design atual, mas deveria ser usado em runtime**
   - O Super Admin salva `ai_segments.segment_prompt`.
   - O endpoint `aiRespond` busca esse prompt via `profile.segment_id` e monta as 3 camadas: prompt global + prompt do segmento + prompt do workspace.
   - Porém como `ai_enabled` está `false`, o fluxo para antes disso. Visualmente, o workspace também só mostra `ai_custom_prompt`, então parece que o prompt do segmento não refletiu.

3. **Horário de funcionamento em Configurações > Negócio é cosmético hoje**
   - `settings/workspace` mantém `hours`, `tz` e `welcome` apenas em estado local.
   - O `getWorkspaceProfile` só lê `business_name`, `business_description`, `segment_id`.
   - O `updateWorkspaceProfile` só salva `business_name` e `segment_id`.
   - Por isso o sistema mostra “salvo”, mas ao recarregar volta para 08:00–18:00 padrão.

4. **Fuso horário não é funcional para a IA**
   - `aiRespond` usa `new Date()` e `getHours()` no timezone do servidor, não no fuso selecionado no workspace.
   - Não existe coluna persistida de timezone no fluxo atual da IA.
   - Resultado: mesmo que a UI mostre `America/Sao_Paulo`, a regra de horário pode ser avaliada no horário do servidor.

## Plano de correção

### 1. Criar uma migração nova e posterior às migrações atuais
- Adicionar/persistir em `profiles`:
  - `business_hours jsonb`
  - `business_timezone text default 'America/Sao_Paulo'`
  - `welcome_message text`
  - `ai_timezone text default 'America/Sao_Paulo'`
  - garantir `ai_enabled_service_ids uuid[]` se ainda não existir
- Corrigir definitivamente IA global:
  - `alter column ai_enabled set default true`
  - backfill: `update profiles set ai_enabled = true where ai_enabled is distinct from true`
- Backfill de horários:
  - `business_hours`: segunda a sábado 08:00–18:00, domingo fechado
  - `ai_working_hours`: manter valor existente; se nulo, preencher padrão
  - `ai_timezone`: usar `business_timezone` quando existir

### 2. Fazer Configurações > Negócio persistir horários, fuso e boas-vindas
- Atualizar `getWorkspaceProfile` para retornar:
  - `business_hours`
  - `business_timezone`
  - `welcome_message`
  - opcionalmente dados básicos da IA para invalidar/mostrar vínculo
- Atualizar `updateWorkspaceProfile` para salvar:
  - nome
  - segmento
  - horários
  - fuso
  - mensagem de boas-vindas
- Ajustar a UI para hidratar esses valores reais do banco, em vez de sempre iniciar com o padrão.

### 3. Ao trocar segmento, aplicar defaults de IA e garantir IA ativa
- Atualizar `completeOnboarding` e `updateWorkspaceSegmentWithDefaults` para também gravar:
  - `ai_enabled: true`
  - `ai_assistant_name`
  - `ai_tone`
  - `ai_transfer_keywords`
  - `ai_transfer_after_messages`
- Manter `segment_prompt` no `ai_segments` como camada do Super Admin, sem copiar para `profiles`, para que alterações futuras no Super Admin reflitam automaticamente em todos os workspaces daquele segmento.

### 4. Tornar o prompt do segmento visível no workspace
- Atualizar `getWorkspaceAiConfig` para retornar os dados do segmento atual:
  - nome do segmento
  - `segment_prompt`
- Na página Agente IA, mostrar uma área somente leitura como “Prompt do segmento aplicado pelo Super Admin”.
- Manter “Instruções específicas” como campo do workspace (`ai_custom_prompt`), deixando claro na interface que ele é uma camada adicional.

### 5. Corrigir teste e execução da IA com fuso horário real
- Atualizar `aiRespond` para buscar `business_timezone`/`ai_timezone`.
- Substituir `getHours()` local por cálculo via `Intl.DateTimeFormat(..., { timeZone })`.
- A avaliação do horário da IA deve usar:
  - `ai_working_hours`
  - `ai_timezone`, caindo para `business_timezone`, caindo para `America/Sao_Paulo`
- Assim São Paulo deixa de ser cosmético e passa a controlar de verdade se a IA responde ou manda mensagem fora do horário.

### 6. Ajustar Agente IA para salvar e exibir timezone
- Incluir `ai_timezone` no formulário da página Agente IA.
- Salvar `ai_timezone` junto com `ai_working_hours`.
- Após salvar, reidratar corretamente sem voltar para defaults.

### 7. Validação final
- Confirmar que o perfil do workspace fica com `ai_enabled=true`.
- Confirmar que trocar segmento atualiza assistente/tom/palavras e mantém o prompt do segmento vindo do Super Admin.
- Confirmar que horários de Configurações > Negócio persistem após salvar/recarregar.
- Confirmar que o teste da IA deixa de retornar “IA desativada”.
- Confirmar que a regra de horário usa `America/Sao_Paulo` de fato.