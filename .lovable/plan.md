Plano para corrigir o problema sem piorar as permissões:

1. Criar um SQL de reparo seguro para Supabase
   - Corrigir a regra de função efetiva: gerente/dono do workspace deve ser `manager`; membro não-dono marcado como agente deve ser `agent`.
   - Remover roles duplicadas/invertidas causadas por triggers/backfill, especialmente `manager` em usuários que deveriam ser agentes.
   - Garantir que o gerente seja membro ativo do próprio workspace.
   - Recriar `get_my_role`, `is_workspace_manager`, `get_my_workspace_owner`, `is_contact_visible` e `is_appointment_visible` com regras consistentes.

2. Recriar as policies RLS das tabelas afetadas
   - Derrubar policies antigas/permissivas de `contacts`, `messages`, `appointments`, `appointment_services` e `kanban_columns` para evitar efeito OR entre policies.
   - Gerente: ver e gerenciar tudo do workspace.
   - Agente: ver apenas conversas atribuídas a ele e dados ligados a essas conversas.
   - `kanban_columns`: agente pode ler colunas; apenas gerente altera colunas.

3. Corrigir permissões no app para menus/telas
   - Desktop sidebar já filtra por `useRole`, mas o mobile sidebar mostra tudo; vou aplicar a mesma regra no mobile.
   - Revisar páginas sensíveis para manter `ManagerOnly` onde precisa: Equipe, WhatsApp, Negócio/Workspace, Serviços, Relatórios, Agente IA, Dashboard e Super Admin.
   - Garantir que o gerente veja todos os menus e o agente veja apenas o conjunto correto: Conversas, Agenda, Contatos e Configurações de perfil.

4. Corrigir funções server-side que validam gerente
   - Ajustar validações como `assertManager` e transferência de conversa para usarem a função efetiva de gerente, em vez de confiar apenas na existência bruta de uma linha `manager` em `user_roles`.
   - Isso evita que agente com role duplicada acidental ganhe telas ou ações de gerente.

5. Entregar instruções claras para rodar no Supabase
   - Gerar um novo arquivo SQL manual, separado, com nome de reparo.
   - Incluir uma consulta final de verificação mostrando email, roles, workspace owner, role efetiva e contagem de conversas visíveis.
   - Orientar você a rodar esse arquivo inteiro no SQL Editor do Supabase, depois deslogar/logar gerente e agente para validar.