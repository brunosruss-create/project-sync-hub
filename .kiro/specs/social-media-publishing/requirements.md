# Requirements Document

## Introduction

O ZapFlow é um SaaS multi-tenant de atendimento via WhatsApp/Instagram com IA. Este documento define os requisitos de um novo módulo de **publicação de posts em redes sociais** (Facebook, Instagram, TikTok e YouTube), destinado aos clientes finais (empresas que assinam o ZapFlow) para que suas equipes componham, agendem e publiquem conteúdo diretamente do produto.

Este módulo é **totalmente independente do módulo de mensageria** já existente (Inbox, WhatsApp Cloud/Instagram DM via Zernio, WhatsApp QR via Evolution). Não há compartilhamento de rotas, tabelas, dados de contatos/conversas, credenciais OAuth ou lógica de negócio entre os dois módulos, mesmo quando a conta social subjacente (ex: mesma página do Facebook) é a mesma usada para mensageria.

O modelo de cobrança/planos ao cliente final será decidido em uma fase posterior, após a implantação ponta a ponta deste módulo. Por isso, nenhum requisito deste documento assume ou impõe limites vinculados a planos.

## Fora de Escopo (nesta fase)

- Modelo de cobrança/planos e qualquer limite numérico derivado de plano (ex: quantidade máxima de posts agendados por mês). Limites poderão ser adicionados em fase futura.
- Analytics/métricas de desempenho de posts (alcance, engajamento, etc.).
- Gestão de campanhas de anúncios (ads).
- Catálogo de produtos e publicação de produtos (shopping tags).
- Qualquer integração, leitura ou escrita de dados do módulo de mensageria (Inbox, Contatos, Conversas, Mensagens, contas Zernio/Evolution de mensageria).

## Glossary

- **Workspace**: Conta de um cliente (empresa) no ZapFlow; unidade de isolamento multi-tenant.
- **Workspace_Member**: Usuário pertencente a um Workspace, com papel Manager ou Agent.
- **Manager**: Papel de Workspace_Member com direitos administrativos plenos por padrão dentro do Social_Publishing_Module.
- **Agent**: Papel de Workspace_Member com direitos restritos por padrão dentro do Social_Publishing_Module.
- **Social_Publishing_Module**: O conjunto de funcionalidades descritas neste documento para compor, agendar e publicar Posts em Social_Networks externas.
- **Social_Network**: Uma das quatro plataformas externas suportadas: Facebook, Instagram, TikTok ou YouTube.
- **Social_Account_Connection**: Registro de uma autorização OAuth entre um Workspace e uma conta específica em uma Social_Network, criado e gerenciado exclusivamente pelo Social_Publishing_Module.
- **Post**: Unidade de conteúdo composta por um Workspace_Member para publicação em uma ou mais Social_Networks.
- **Post_Target**: Representação específica de um Post para uma Social_Network e Social_Account_Connection, com texto, mídia e tipo de publicação próprios.
- **Post_Type**: O formato de publicação dentro de uma Social_Network (ex.: feed, story, reel, carrossel no Instagram; vídeo ou carrossel de fotos no TikTok; vídeo ou short no YouTube; feed no Facebook).
- **Post_Status**: Estado do ciclo de vida de um Post_Target: draft, scheduled, publishing, published ou failed.
- **Scheduled_Time**: Data e hora futura em que um Post_Target deve ser publicado automaticamente.
- **Publish_Attempt**: Execução única da operação de publicação de um Post_Target contra a API de uma Social_Network.
- **Publishing_Permission**: Configuração que determina quais ações (criar/editar rascunho, conectar/desconectar conta, agendar, publicar imediatamente) um Workspace_Member pode executar no Social_Publishing_Module de um Workspace.

## Requirements

### Requirement 1: Isolamento total do módulo de publicação (Total Module Isolation)

**User Story:** Como responsável técnico do produto, eu quero que o módulo de publicação de posts seja estruturalmente independente do módulo de mensageria, para que os dois domínios possam evoluir, falhar e ser mantidos sem afetar um ao outro.

#### Acceptance Criteria

1. THE Social_Publishing_Module SHALL persist Post, Post_Target, and Social_Account_Connection data in tables that are not referenced by, and do not reference, the messaging module's Contact, Conversation, or Message tables.
2. THE Social_Publishing_Module SHALL expose its own top-level navigation entry point, independent from the messaging module's Inbox navigation entry point.
3. THE Social_Publishing_Module SHALL store OAuth credentials for each Social_Account_Connection independently of any credentials used by the messaging module, even when the underlying Social_Network account is the same account used for messaging.
4. THE Social_Publishing_Module SHALL store Post media files in a storage location dedicated to this module, isolated from the messaging module's media storage.

### Requirement 2: Conexão OAuth de contas sociais

**User Story:** Como Manager de um Workspace, eu quero conectar minhas contas de Facebook, Instagram, TikTok e YouTube dedicadas à publicação, para que o sistema possa publicar posts em meu nome.

#### Acceptance Criteria

1. WHEN a Workspace_Member with connect permission initiates connection of a Facebook, Instagram, TikTok, or YouTube account, THE Social_Publishing_Module SHALL redirect to that Social_Network's own OAuth authorization flow, requesting only the scopes required for content publishing.
2. WHEN an OAuth authorization flow completes successfully, THE Social_Publishing_Module SHALL create a Social_Account_Connection record associated with the initiating Workspace and the authorized account.
3. IF an OAuth authorization flow fails or is denied by the user, THEN THE Social_Publishing_Module SHALL display a descriptive error and SHALL NOT create a Social_Account_Connection record.
4. WHEN a Social_Account_Connection's access token expires or is revoked by the Social_Network, THE Social_Publishing_Module SHALL set that connection's status to expired and SHALL prevent new Publish_Attempts from using it until the Workspace_Member reconnects the account.

### Requirement 3: Gerenciamento de contas conectadas

**User Story:** Como Manager de um Workspace, eu quero ver e gerenciar as contas sociais conectadas, para que eu saiba quais contas estão disponíveis e possa desconectá-las quando necessário.

#### Acceptance Criteria

1. THE Social_Publishing_Module SHALL display, for each Workspace, the list of its Social_Account_Connections showing Social_Network, account name, and connection status.
2. WHEN a Workspace_Member with connect permission disconnects a Social_Account_Connection, THE Social_Publishing_Module SHALL prevent that connection from being selected as a target for new Posts.
3. THE Social_Publishing_Module SHALL preserve the publication history of Posts that used a disconnected Social_Account_Connection.

### Requirement 4: Composição de posts

**User Story:** Como Workspace_Member, eu quero compor um post com texto e mídia e escolher para quais redes ele será publicado, para que eu possa preparar conteúdo antes de publicá-lo.

#### Acceptance Criteria

1. WHEN a Workspace_Member with create permission starts a new Post, THE Social_Publishing_Module SHALL allow entry of text content and attachment of one or more media files.
2. THE Social_Publishing_Module SHALL allow saving a Post with Post_Status draft at any point during composition, without requiring a Social_Network target to be selected.
3. WHERE a Post targets more than one Social_Network, THE Social_Publishing_Module SHALL allow the Workspace_Member to customize the text, media, and Post_Type independently for each Post_Target.
4. THE Social_Publishing_Module SHALL require exactly one Post_Type to be selected for each Post_Target among the Post_Types supported by that Post_Target's Social_Network before the Post_Target can be scheduled or published.

### Requirement 5: Publicação imediata e agendamento

**User Story:** Como Workspace_Member com permissão de publicação, eu quero publicar um post imediatamente ou agendá-lo para o futuro, para que eu possa controlar quando o conteúdo aparece nas redes.

#### Acceptance Criteria

1. WHEN a Workspace_Member with publish permission submits a Post for publishing, THE Social_Publishing_Module SHALL allow choosing, independently for each Post_Target, between publishing immediately or scheduling for a future Scheduled_Time.
2. IF a Workspace_Member attempts to set a Scheduled_Time that is not later than the current time, THEN THE Social_Publishing_Module SHALL reject the request and display a descriptive error.
3. WHEN the current time reaches a Post_Target's Scheduled_Time, THE Social_Publishing_Module SHALL automatically start a Publish_Attempt for that Post_Target without further user action.
4. THE Social_Publishing_Module SHALL allow any number of Posts to be scheduled concurrently per Workspace in this phase, with any plan-based quantity limit deferred to a future phase.

### Requirement 6: Ciclo de vida e tratamento de erro por rede

**User Story:** Como Workspace_Member, eu quero acompanhar o status de cada post por rede social e entender o motivo de eventuais falhas, para que eu possa corrigir e tentar novamente.

#### Acceptance Criteria

1. THE Social_Publishing_Module SHALL track Post_Status independently for each Post_Target, using the values draft, scheduled, publishing, published, or failed.
2. WHEN a Publish_Attempt for a Post_Target succeeds, THE Social_Publishing_Module SHALL set that Post_Target's Post_Status to published and record the resulting Social_Network post identifier and the published time.
3. IF a Publish_Attempt for a Post_Target fails, THEN THE Social_Publishing_Module SHALL set that Post_Target's Post_Status to failed and record a descriptive error message specific to that Social_Network.
4. WHEN a Post has multiple Post_Targets, THE Social_Publishing_Module SHALL process the Publish_Attempt of each Post_Target independently, so that a failure on one Social_Network's Post_Target does not change the Post_Status of any other Post_Target of the same Post.
5. WHEN a Workspace_Member with publish permission retries a Post_Target with Post_Status failed, THE Social_Publishing_Module SHALL create a new Publish_Attempt for that Post_Target and SHALL preserve the record of previous failed Publish_Attempts.

### Requirement 7: Preview e validação específica por rede

**User Story:** Como Workspace_Member, eu quero ver como meu post vai aparecer em cada rede e ser avisado sobre limites antes de publicar, para que eu evite falhas de publicação.

#### Acceptance Criteria

1. WHEN composing a Post_Target for a given Social_Network and Post_Type, THE Social_Publishing_Module SHALL display a preview reflecting that Social_Network's character limit and media constraints for the selected Post_Type.
2. IF a Post_Target's text length exceeds its Social_Network's character limit, THEN THE Social_Publishing_Module SHALL prevent that Post_Target from being scheduled or published and SHALL display a descriptive error indicating the limit.
3. IF a Post_Target's attached media does not satisfy the format, resolution, duration, or count constraints defined for its Social_Network and Post_Type, THEN THE Social_Publishing_Module SHALL prevent that Post_Target from being scheduled or published and SHALL display a descriptive error identifying the violated constraint.

### Requirement 8: Permissões granulares configuráveis

**User Story:** Como Manager de um Workspace, eu quero configurar quais membros da minha equipe podem criar, agendar, publicar posts e conectar contas sociais, para que eu controle o acesso ao módulo de publicação conforme a estrutura da minha equipe.

#### Acceptance Criteria

1. THE Social_Publishing_Module SHALL maintain, for each Workspace, a Publishing_Permission set that determines, per Workspace_Member or per role, whether the create/edit draft, connect/disconnect account, schedule, and publish immediately actions are allowed.
2. THE Social_Publishing_Module SHALL apply, before any Manager configuration, a default Publishing_Permission set granting Manager Workspace_Members the create/edit draft, connect/disconnect account, schedule, and publish immediately actions, and granting Agent Workspace_Members only the create/edit draft action.
3. WHEN a Manager updates Publishing_Permission settings for a Workspace, THE Social_Publishing_Module SHALL apply the updated settings to all subsequent actions by the affected Workspace_Members.
4. IF a Workspace_Member attempts an action not allowed by their current Publishing_Permission settings, THEN THE Social_Publishing_Module SHALL deny the action and display a descriptive error.
