
# Transferir atendimento entre membros do workspace

## Objetivo
Permitir que qualquer membro ativo (manager ou agente) transfira uma conversa para outro membro ativo do mesmo workspace. A coluna `contacts.assigned_agent_id` (uuid) já existe e é compartilhada via RLS por workspace — vamos usá-la corretamente, sem mexer no schema atual.

## Escopo (o que muda e o que NÃO muda)

Muda:
- Botão "Transferir" no header da conversa (hoje só mostra um toast "em breve").
- Item "Transferir para agente" no menu "..." da conversa.
- Item "Transferir para agente" no menu "..." de cada card do Kanban (`card-menu` → ação `assign`).
- Filtro "Meus" da inbox (hoje compara `email.split("@")[0]` com `assigned_agent_id`, o que nunca bate — pequeno bug a corrigir junto, sem mudar visual).
- Exibição do agente responsável (chip discreto no header da conversa e no card).

NÃO muda:
- Schema do banco (apenas usa `assigned_agent_id`).
- RLS (já permite UPDATE para qualquer membro do workspace via `owner_user_id = get_my_workspace_owner()`).
- Fluxos de envio de WhatsApp, encaminhamento, agendamento, kanban.
- `forward-modal.tsx` (encaminhar mensagem ≠ transferir conversa) — fica intocado.
- Tabelas `team`, `workspace_members`, `user_roles` — apenas leitura.

## UX

1. Header da conversa → botão "Transferir" abre `TransferConversationModal`.
2. Modal lista membros ativos do workspace (busca `listAssignableMembers`), exclui o usuário atual e o atual responsável, mostra avatar + nome + role (Manager/Agente).
3. Opções: "Atribuir a mim", "Tirar atribuição" (apenas se já houver responsável), e clique em qualquer membro = transferir.
4. Confirma → chama `assignContact({ contactId, agentUserId | null })` → toast e fecha.
5. Header passa a mostrar "Atendente: Nome" abaixo do telefone (quando atribuído). Card no Kanban ganha um avatarzinho do agente no canto.
6. Filtro "Meus" passa a usar `user.id === assignedAgent` (uuid).

Permissões:
- Manager pode transferir qualquer conversa para qualquer membro ativo.
- Agente pode transferir qualquer conversa do workspace (todos compartilham caixa) para qualquer membro ativo, inclusive desatribuir/atribuir a si.
- Validações server-side garantem que `agentUserId` pertence ao mesmo workspace e está `active = true`.

## Implementação técnica

Arquivos novos:
- `src/lib/assignment.functions.ts` — server functions:
  - `listAssignableMembers()` (auth) → retorna `{ user_id, full_name, email, role, is_self }[]`, filtrando `workspace_members.active = true` do `get_my_workspace_owner()`. Usa `supabaseAdmin` para join com `profiles` + `auth.admin.getUserById` fallback (mesmo padrão de `team.functions.ts`).
  - `assignContact({ contactId: uuid, agentUserId: uuid | null })` (auth) →
    1. Resolve `ownerId = get_my_workspace_owner()` via RPC.
    2. Confirma que `contacts.id = contactId AND owner_user_id = ownerId` existe.
    3. Se `agentUserId` não nulo, confirma membership ativa em `workspace_members`.
    4. `update contacts set assigned_agent_id = agentUserId where id = contactId`.
    5. Retorna `{ ok: true, assignedTo: { user_id, full_name } | null }`.
  - Tudo com `zod` (mesmo estilo de `team.functions.ts`); admin client só para leitura cruzada de `auth.users`/`profiles`.

Arquivos novos (frontend):
- `src/features/inbox/transfer-conversation-modal.tsx` — modal isolado, mesmo visual/tokens do `forward-modal.tsx` (reaproveita estilos, sem alterar o forward).

Edits cirúrgicos:
- `src/features/inbox/conversation-panel.tsx`:
  - Substituir `onClick={() => toast.info("Transferir — em breve.")}` por abrir o novo modal.
  - Item de menu "Transferir para agente" também abre o modal.
  - Renderizar nome do agente atribuído (recebido via prop nova `assignedAgentName?: string | null`).
- `src/routes/_authenticated.inbox.tsx`:
  - Buscar `listAssignableMembers` uma vez (cache) para mapear `assigned_agent_id` → nome no card e no header.
  - Corrigir filtro "Meus": `c.assignedAgent === user?.id`.
  - Tratar ação `assign` do `card-menu` abrindo o modal (hoje cai no `setEditTarget`, vamos roteá-la para o modal de transferência).
  - Após sucesso do `assignContact`, otimisticamente atualizar `contacts[].assignedAgent` (Realtime já vai reconciliar via canal `contacts` existente).
- `src/features/inbox/contact-card.tsx` (se necessário): adicionar avatar/iniciais do responsável no canto. (Mudança visual mínima; só se não atrapalhar layout atual.)

## Garantias anti-regressão

- Nenhuma mudança em RLS, migrations, tabelas, ou nos fluxos de WhatsApp/forward/kanban/agenda.
- `forward-modal.tsx` continua sendo o "encaminhar mensagem"; o "transferir conversa" é um modal separado para evitar confusão de responsabilidade.
- Server function `assignContact` valida workspace e membership — agente não consegue atribuir para fora do próprio workspace mesmo manipulando o request.
- Filtro "Meus" passa a funcionar (era bug silencioso); comportamento dos outros filtros ("Todos", "Sem atendente") permanece idêntico.
- Realtime existente em `contacts` já propaga `assigned_agent_id` para os outros membros conectados — sem precisar de canal novo.

## Fora de escopo (sugerido para depois)
- Notificação push/sonora para o agente quando recebe uma transferência.
- Histórico/auditoria de transferências (tabela `assignment_history`).
- Mensagem de sistema na timeline ("Bruno transferiu para Jaqueline").
