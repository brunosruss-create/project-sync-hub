# Tasks

## Task 1: Migration SQL das tabelas novas
- [ ] 1.1 Criar migration para a tabela `social_account_connections` com colunas id, owner_user_id, platform (check in facebook/instagram/tiktok/youtube), zernio_profile_id, account_id, account_name, status (check in connecting/connected/expired/disconnected), connected_at, created_at, updated_at e índice único (owner_user_id, platform, account_id)
- [ ] 1.2 Criar migration para a tabela `social_posts` com colunas id, owner_user_id, created_by, base_text, status (draft/scheduled/publishing/published/failed/partially_published), created_at, updated_at
- [ ] 1.3 Criar migration para a tabela `social_post_targets` com colunas id, post_id (FK social_posts), owner_user_id, social_account_connection_id (FK social_account_connections), platform, post_type, text, media_urls (jsonb), status (draft/scheduled/publishing/published/failed), scheduled_for, timezone, zernio_post_id, zernio_target_id, platform_post_id, published_at, error_message, created_at, updated_at
- [ ] 1.4 Criar migration para a tabela `social_publish_attempts` com colunas id, post_target_id (FK social_post_targets), owner_user_id, attempt_number, result (success/failure), error_message, started_at, finished_at — append-only (sem UPDATE/DELETE)
- [ ] 1.5 Criar migration para a tabela `social_publishing_permissions` com colunas id, owner_user_id, scope (member/role), member_user_id (nullable FK auth.users), role (nullable, manager/agent), create_edit_draft, connect_account, schedule, publish_now, updated_at e índices únicos parciais (owner_user_id, scope, member_user_id) e (owner_user_id, scope, role)
- [ ] 1.6 Habilitar RLS em todas as tabelas novas com policies baseadas em owner_user_id = auth.uid()

## Task 2: Bucket de storage dedicado
- [ ] 2.1 Criar o bucket `social-media` no Supabase Storage (isolado de `chat-media`)
- [ ] 2.2 Configurar policies de acesso ao bucket: upload autenticado com path `${ownerUserId}/${postTargetId ?? "draft"}-${timestamp}-${uuid}.${ext}`, leitura pública das URLs geradas
- [ ] 2.3 Criar helper utilitário `uploadSocialMedia(file, ownerUserId, postTargetId?)` que retorna a URL pública do Supabase Storage

## Task 3: Client HTTP dedicado para publicação (zernio-publishing.server.ts)
- [ ] 3.1 Criar `src/lib/zernio-publishing.server.ts` com helper `call()` próprio (Bearer token, base URL `https://zernio.com/api/v1`), isolado de `zernio.server.ts`
- [ ] 3.2 Implementar tipos `SocialPlatform` e `ZernioPostTargetInput` conforme o design
- [ ] 3.3 Implementar métodos: `getConnectUrl`, `listAccounts`, `presignMedia`, `createPost`, `getPost`, `retryPostTarget`
- [ ] 3.4 Implementar `ensureSocialProfile(workspaceLabel)` com prefixo `zapflow-social:` (distinto do `zapflow:` de mensageria)

## Task 4: Server functions — Conexão OAuth (contas sociais)
- [ ] 4.1 Criar server function `getConnectUrl(platform)` que chama `zernioPublishing.getConnectUrl` e retorna a URL de autorização OAuth
- [ ] 4.2 Criar rota de callback OAuth `social-callback.tsx` análoga a `zernio-callback.tsx`, tratando sucesso (cria `social_account_connections` com status `connecting`) e erro (toast descritivo, sem registro)
- [ ] 4.3 Criar server function `listConnectedAccounts()` que retorna as `social_account_connections` do workspace com status e metadados
- [ ] 4.4 Criar server function `disconnectAccount(connectionId)` que seta status para `disconnected` e impede seleção para novos Post_Targets
- [ ] 4.5 Tratar eventos de webhook `account.connected` e `account.disconnected`/`account.token_expired` para atualizar status da conexão automaticamente

## Task 5: Server functions — Composição de posts (CRUD de rascunhos)
- [ ] 5.1 Criar server function `createDraft(baseText?, mediaUrls?)` que insere `social_posts` com status `draft` e retorna o id
- [ ] 5.2 Criar server function `updatePost(postId, { baseText, mediaUrls })` para editar texto/mídia base do post
- [ ] 5.3 Criar server function `addPostTarget(postId, { connectionId, platform, postType, text, mediaUrls })` que insere em `social_post_targets` com status `draft`
- [ ] 5.4 Criar server function `updatePostTarget(targetId, { text, mediaUrls, postType })` para editar campos específicos de um target individual
- [ ] 5.5 Criar server function `removePostTarget(targetId)` para remover um target em draft
- [ ] 5.6 Criar server function `deletePost(postId)` que remove post e targets associados (somente se todos em `draft`)

## Task 6: Módulo de validação por rede/Post_Type (social-post-validation.ts)
- [ ] 6.1 Criar `src/lib/social-post-validation.ts` com a tabela hardcoded de limites por (Social_Network, Post_Type): caracteres, formatos de mídia, resolução, duração, contagem
- [ ] 6.2 Implementar `getSupportedPostTypes(platform): PostType[]` que retorna os Post_Types suportados por cada rede
- [ ] 6.3 Implementar `validatePostTarget(target): ValidationResult` que retorna lista de violações (`{ constraint, message }`) ou vazia se válido
- [ ] 6.4 Garantir que a função é pura (sem I/O, sem dependência de DB) e exportável para uso tanto no server quanto no client (preview em tempo real)

## Task 7: Server functions — Agendamento e publicação
- [ ] 7.1 Criar server function `submitPost(postId, targets[{ targetId, mode: "now"|"scheduled", scheduledFor?, timezone? }])` que orquestra validação, permissão e envio à Zernio
- [ ] 7.2 Dentro de `submitPost`: chamar `assertCan(memberId, "schedule"|"publish_now")` conforme o modo de cada target
- [ ] 7.3 Dentro de `submitPost`: chamar `validatePostTarget()` para cada target e rejeitar se houver violações
- [ ] 7.4 Dentro de `submitPost`: verificar que cada `social_account_connection` referenciada tem status `connected`
- [ ] 7.5 Validar que `scheduledFor` é estritamente futuro (> now()) quando modo é `scheduled`
- [ ] 7.6 Chamar `zernioPublishing.createPost()` com os targets montados (publishNow ou scheduledFor/timezone)
- [ ] 7.7 Gravar resposta da Zernio: atualizar `social_post_targets` com zernio_post_id, zernio_target_id, status (scheduled/publishing) e inserir `social_publish_attempts` iniciais

## Task 8: Webhook dedicado (api/public/zernio-social.ts)
- [ ] 8.1 Criar endpoint `src/routes/api/public/zernio-social.ts` com verificação HMAC usando `ZERNIO_SOCIAL_WEBHOOK_SECRET` (secret próprio, independente do de mensageria)
- [ ] 8.2 Implementar handler para evento `post.published`: localizar Post_Target por zernio_post_id + zernio_target_id, setar status=published, gravar platform_post_id e published_at
- [ ] 8.3 Implementar handler para evento `post.failed`: localizar Post_Target, setar status=failed, gravar error_message, inserir/atualizar social_publish_attempts
- [ ] 8.4 Implementar handler para eventos `account.connected` e `account.disconnected`/`account.token_expired`: atualizar social_account_connections.status
- [ ] 8.5 Extrair lógica compartilhada `applyZernioPostResult()` para reuso entre webhook e reconciliação (idempotente por zernio_target_id + status atual)
- [ ] 8.6 Retornar 200 OK sem processar para qualquer payload que não seja dos eventos suportados (ignorar payloads de mensageria se recebidos por engano)

## Task 9: Server function — Retry de Post_Target com falha
- [ ] 9.1 Criar server function `retryPostTarget(targetId)` que verifica status=failed, permissão publish_now, e conexão connected
- [ ] 9.2 Chamar `zernioPublishing.retryPostTarget(zernioPostId, platform, accountId)` e atualizar status para `publishing`
- [ ] 9.3 Inserir novo registro em `social_publish_attempts` com attempt_number incrementado, preservando todos os attempts anteriores (append-only)

## Task 10: Server functions — Permissões (social-permissions.server.ts)
- [ ] 10.1 Criar `src/lib/social-permissions.server.ts` com tipo `SocialAction = "create_edit_draft" | "connect_account" | "schedule" | "publish_now"`
- [ ] 10.2 Implementar `resolvePermissions(workspaceOwnerId, memberUserId)`: buscar override de member, depois override de role, depois default hardcoded (Manager=tudo, Agent=só create_edit_draft)
- [ ] 10.3 Implementar `assertCan(workspaceOwnerId, memberUserId, action)` que lança `PermissionDeniedError` se não permitido
- [ ] 10.4 Criar server function `updatePermissions(scope, targetId, permissions)` acessível apenas por Managers para configurar overrides
- [ ] 10.5 Criar server function `getPermissionsConfig(workspaceOwnerId)` para a UI de configuração listar estado atual de permissões

## Task 11: Reconciliação periódica (social-reconciliation.server.ts + rota cron)
- [ ] 11.1 Criar `src/lib/social-reconciliation.server.ts` com função `reconcileStalePostTargets()` que busca targets em scheduled/publishing há mais de 5 minutos após scheduled_for
- [ ] 11.2 Para cada target preso: chamar `zernioPublishing.getPost(zernio_post_id)` e aplicar `applyZernioPostResult()` com idempotência
- [ ] 11.3 Criar rota `src/routes/api/public/social-reconcile.ts` protegida por secret de cron (header ou query param), que invoca `reconcileStalePostTargets()`
- [ ] 11.4 Configurar cron no Vercel (vercel.json) para chamar a rota de reconciliação a cada 5 minutos

## Task 12: Módulos de mapeamento de linhas (row mappers)
- [ ] 12.1 Criar `src/features/social-publishing/social-account-connection-row.ts` com tipagem e mapeamento de `social_account_connections`
- [ ] 12.2 Criar `src/features/social-publishing/social-post-row.ts` com tipagem e mapeamento de `social_posts`
- [ ] 12.3 Criar `src/features/social-publishing/social-post-target-row.ts` com tipagem e mapeamento de `social_post_targets`
- [ ] 12.4 Criar `src/features/social-publishing/social-publish-attempt-row.ts` com tipagem e mapeamento de `social_publish_attempts`
- [ ] 12.5 Criar `src/features/social-publishing/social-publishing-permission-row.ts` com tipagem e mapeamento de `social_publishing_permissions`

## Task 13: UI — Tela de contas conectadas (Social Accounts Settings)
- [ ] 13.1 Criar rota `_authenticated.social.accounts.tsx` com listagem de Social_Account_Connections (nome, plataforma, status via Badge com variantes success/warning/danger)
- [ ] 13.2 Implementar botão "Conectar conta" por plataforma (ícones das 4 redes), que chama `getConnectUrl` e redireciona
- [ ] 13.3 Implementar ação "Desconectar" por conexão com confirmação modal e chamada a `disconnectAccount`
- [ ] 13.4 Exibir estado de erro/expiração com badge `expired` e botão "Reconectar"
- [ ] 13.5 Usar componente EmptyState quando não houver contas conectadas, seguindo design system (Card, buttonPrimary/buttonSecondary)

## Task 14: UI — Tela de composição de post (ComposerPanel)
- [ ] 14.1 Criar rota `_authenticated.social.compose.tsx` com layout de composição (editor de texto + upload de mídia)
- [ ] 14.2 Implementar seleção de targets: lista de contas conectadas (status=connected) com checkbox, ao selecionar cria Post_Target com cópia do texto/mídia base
- [ ] 14.3 Implementar edição independente por Post_Target: ao clicar num target, mostrar campos de texto/mídia/postType editáveis individualmente
- [ ] 14.4 Implementar seletor de Post_Type por target usando `getSupportedPostTypes(platform)` com dropdown
- [ ] 14.5 Implementar preview por rede com contagem de caracteres e indicadores visuais de limite (verde/amarelo/vermelho)
- [ ] 14.6 Implementar exibição inline de violações de validação (resultado de `validatePostTarget`) com mensagens descritivas
- [ ] 14.7 Implementar botões de ação: "Salvar rascunho", "Agendar" (abre picker de data/hora + timezone), "Publicar agora" — desabilitados enquanto houver violações
- [ ] 14.8 Implementar upload de mídia para o bucket `social-media` com progress bar e preview de thumbnail

## Task 15: UI — Tela de listagem/calendário de posts
- [ ] 15.1 Criar rota `_authenticated.social.posts.tsx` com listagem de posts em formato lista (default) e opção calendário
- [ ] 15.2 Implementar listagem com colunas: texto resumido, targets (ícones das redes), status agregado do post, data de criação/agendamento
- [ ] 15.3 Implementar expansão de um post para ver status individual por Post_Target (Badge com status: draft/scheduled/publishing/published/failed)
- [ ] 15.4 Implementar ação "Tentar novamente" em Post_Targets com status=failed (chama `retryPostTarget`)
- [ ] 15.5 Implementar visualização em calendário (agrupamento por scheduled_for) com indicadores visuais de status
- [ ] 15.6 Implementar filtros: por plataforma, por status, por período

## Task 16: UI — Tela de permissões (configuração por membro/papel)
- [ ] 16.1 Criar rota `_authenticated.social.permissions.tsx` acessível apenas por Managers
- [ ] 16.2 Implementar tabela de permissões por papel (manager/agent) com toggles para cada SocialAction, mostrando defaults e overrides
- [ ] 16.3 Implementar seção de overrides por membro individual: busca de membro + configuração das 4 ações com toggles
- [ ] 16.4 Implementar salvamento de overrides via `updatePermissions` com feedback via toast (sonner)
- [ ] 16.5 Exibir indicador visual de qual nível está ativo para cada membro (default do papel / override de papel / override individual)

## Task 17: Entrada na sidebar (nav item "Publicações")
- [ ] 17.1 Adicionar entrada "Publicações" na sidebar (`app-sidebar.tsx`) com ícone `Share2` do Lucide, visível para membros com pelo menos create_edit_draft
- [ ] 17.2 Criar sub-itens de navegação: Compor, Posts, Contas, Permissões (Permissões visível apenas para Managers)
- [ ] 17.3 Garantir que a navegação usa rotas `_authenticated.social.*` sem qualquer link cruzado para `/inbox`

## Task 18: Testes unitários
- [ ] 18.1 Testar construção da URL/params de conexão OAuth para cada uma das 4 plataformas (Requirement 2.1)
- [ ] 18.2 Testar callback de OAuth bem-sucedido cria `social_account_connections` com campos corretos (Requirement 2.2)
- [ ] 18.3 Testar callback de OAuth com erro/negação não cria registro (Requirement 2.3)
- [ ] 18.4 Testar composição de Post: entrada de texto + múltiplos arquivos de mídia é preservada (Requirement 4.1)
- [ ] 18.5 Testar salvar Post como draft sem Post_Target selecionado (Requirement 4.2)
- [ ] 18.6 Testar tabela de limites por (rede, Post_Type): uma asserção por combinação suportada confirmando valores hardcoded (Requirement 7.1)
- [ ] 18.7 Testar isolamento estrutural: inspecionar schema confirmando que nenhuma tabela nova tem FK para contacts, messages, zernio_accounts, message_jobs (Requirement 1.1)
- [ ] 18.8 Testar que upload de mídia grava no bucket `social-media`, nunca em `chat-media` (Requirement 1.4)
- [ ] 18.9 Testar que o webhook dedicado ignora (200 OK sem processar) payloads de formato de mensageria (Requirement 1)

## Task 19: Testes de propriedade (fast-check)
- [ ] 19.1 Property 1 — Gate por status de conexão: gerar conexões com status aleatório dentre os 4 valores e verificar que só `connected` permite uso como target/Publish_Attempt
- [ ] 19.2 Property 2 — Preservação de histórico após desconexão: gerar histórico aleatório de Post_Targets/Publish_Attempts, desconectar, comparar snapshot antes/depois
- [ ] 19.3 Property 3 — Independência de campos entre Post_Targets: gerar N Post_Targets aleatórios do mesmo Post, mutar campos de um, verificar que os demais permanecem inalterados
- [ ] 19.4 Property 4 — Exigência de Post_Type válido: gerar post_type aleatório (válido/inválido) por rede e verificar aceitação/rejeição
- [ ] 19.5 Property 5 — Scheduled_Time estritamente futuro: gerar timestamps aleatórios relativos a "agora" e verificar que só futuros são aceitos
- [ ] 19.6 Property 6 — Ausência de limite de agendamentos concorrentes: gerar N aleatório de posts válidos e verificar que nenhum é rejeitado por contagem
- [ ] 19.7 Property 7 — Independência e validade de status entre Post_Targets: gerar N targets com sequências aleatórias de resultados e verificar que cada status depende apenas dos próprios resultados
- [ ] 19.8 Property 8 — Registro do resultado de um Publish_Attempt: gerar outcomes aleatórios de sucesso/falha e verificar mapeamento correto para status/campos
- [ ] 19.9 Property 9 — Preservação de histórico após retry: gerar sequência de attempts anteriores, executar retry, verificar contagem = anterior + 1 e conteúdo preservado
- [ ] 19.10 Property 10 — Validação de conteúdo contra restrições: gerar textos/mídias aleatórios (dentro e fora dos limites) por combinação (rede, Post_Type) e verificar aceite/rejeição com constraint correta
- [ ] 19.11 Property 11 — Precedência na resolução de permissão: gerar combinações aleatórias de overrides member/role/default e verificar precedência member > role > default
- [ ] 19.12 Property 12 — Enforcement de permissão por ação: gerar combinações aleatórias de ação × permissões resolvidas e verificar allow/deny correto
