# Requirements Document

## Introduction

O ZapFlow é um SaaS multi-tenant de atendimento e agora também de publicação em redes sociais (Facebook, Instagram, TikTok e YouTube via módulo Social_Publishing_Module). Este documento define os requisitos de um novo módulo de **Geração Automática de Conteúdo com IA** (AI_Content_Generation_Module), destinado aos clientes finais para que suas equipes criem posts prontos (imagem + legenda + hashtags + CTA) a partir de alguns cliques, sem precisar de designer nem redator.

A promessa ao cliente final é: "descreve o que você quer comunicar, escolhe o tom e a rede, o sistema cria o post e você aprova". Sob o capô, o sistema é **híbrido**:

1. Camada de **Templates de design pré-desenhados** renderizados server-side (custo zero de IA para o layout).
2. Camada de **Banco de imagens** de terceiros (Pexels/Unsplash/Pixabay) selecionadas automaticamente por segmento/cor/tema — **invisível ao cliente final**, que percebe tudo como "gerado por IA".
3. Camada de **Geração de texto** (legenda, gancho, CTA, hashtags) com Google Gemini Flash usando estrutura viral (gancho → retenção → cliffhanger → CTA).
4. Camada de **Fallback com geração de imagem via IA** (Google Nano Banana) apenas para casos extremos, quando o Image_Bank não retorna resultado adequado ao briefing.

O módulo consome dados reais do Workspace (Services do catálogo, preços, profissionais, fotos cadastradas) para personalizar posts. A saída final (imagem renderizada + textos) alimenta o Social_Publishing_Module já existente, que faz a publicação nas redes.

Este módulo é **totalmente independente do módulo de mensageria** (Inbox/WhatsApp/Instagram DM). Ele **consome, de forma somente-leitura, o catálogo de Services**, e **entrega Post_Drafts ao Social_Publishing_Module** — sem tocar em Contact, Conversation ou Message.

O modelo de cobrança/planos ao cliente final para este módulo (quantidade de posts gerados/mês, quantidade de fallbacks Nano Banana/mês, presença de recursos avançados) será decidido em fase posterior. Por isso, este documento define **os pontos de controle onde limites por plano serão futuramente aplicados**, sem impor números.

## Fora de Escopo (nesta fase)

- Editor drag-and-drop tipo Canva para edição livre de templates.
- Gerador de anúncios pagos (Ads Manager, budgets, targeting).
- Página "Link na Bio" gerada pelo módulo.
- Testes A/B automáticos entre variações de um mesmo post.
- Analytics de performance dos posts após publicação (alcance, engajamento). O Social_Publishing_Module também não cobre isso nesta fase.
- Vídeo gerado 100% por IA (text-to-video). Vídeos aparecem apenas via Image_Bank quando disponíveis.
- Publicação direta: o módulo entrega Post_Drafts. A publicação em si continua sendo feita pelo Social_Publishing_Module.
- Definição concreta de tiers/preços dos planos. O módulo apenas registra medidores (contadores por período) que planos futuros poderão consultar.

## Glossary

- **Workspace**: Conta de um cliente (empresa) no ZapFlow; unidade de isolamento multi-tenant.
- **Workspace_Member**: Usuário pertencente a um Workspace, com papel Manager ou Agent.
- **Manager**: Papel de Workspace_Member com direitos administrativos plenos por padrão dentro do AI_Content_Generation_Module.
- **Agent**: Papel de Workspace_Member com direitos restritos por padrão dentro do AI_Content_Generation_Module.
- **AI_Content_Generation_Module**: O conjunto de funcionalidades descritas neste documento.
- **Social_Publishing_Module**: Módulo já existente responsável pela publicação de Posts nas redes sociais. Este documento não redefine seu comportamento; apenas se conecta a ele como consumidor.
- **Service**: Registro do catálogo de serviços do Workspace, já existente em outro módulo. Referenciado apenas para leitura.
- **Brand_Kit**: Conjunto de identidade visual e verbal do Workspace usado para personalizar todos os posts: paleta de cores primária/secundária/apoio, logotipo, fontes preferenciais display/corpo, tom de voz e assinatura padrão.
- **Design_Template**: Layout de post pré-desenhado, versionado e mantido pelo produto, parametrizado por slots (headline, subheadline, imagem de fundo, preço, CTA, logo). Existe em variantes de proporção (feed 1:1, story/reel 9:16).
- **Template_Category**: Classificação de propósito de um Design_Template: promo, novidade, depoimento, agenda, dica, institucional, antes_depois, catálogo.
- **Post_Format**: Formato final do post gerado: single (uma imagem), carousel (múltiplos slides), story (9:16 rápido). Alinha com Post_Types suportados pelo Social_Publishing_Module.
- **Content_Brief**: Entrada do Workspace_Member descrevendo o que quer comunicar: objetivo, texto livre opcional, Service opcional, Template_Category desejada, redes de destino, tom de voz opcional.
- **Content_Job**: Execução de geração iniciada a partir de um Content_Brief. Percorre estágios de rascunho e produz um ou mais Generated_Assets.
- **Generated_Asset**: Resultado individual de uma execução: uma imagem renderizada + copy textual (legenda longa, legenda curta, hashtags, CTA), pronto para revisão e envio.
- **Copy_Bundle**: Conjunto textual gerado pelo AI_Text_Provider para um Generated_Asset: um campo por rede quando os limites divergem, mais hashtags e CTA.
- **Viral_Structure**: Padrão editorial aplicado à Copy_Bundle: gancho de abertura, corpo de retenção, cliffhanger opcional, chamada para ação. Configurável por Template_Category e tom de voz.
- **Image_Bank**: Camada abstrata de fornecimento de imagens de estoque, agregando provedores externos (Pexels, Unsplash, Pixabay) por ordem de preferência. **Invisível ao Workspace_Member final.**
- **Image_Bank_Provider**: Provedor concreto (pexels | unsplash | pixabay) da Image_Bank.
- **Image_Bank_Result**: Imagem retornada pelo Image_Bank contendo URL, dimensões, autor e URL de atribuição obrigatória do provedor.
- **AI_Image_Provider**: Provedor de geração de imagem por IA (Google Nano Banana). Usado apenas como fallback controlado.
- **AI_Text_Provider**: Provedor de geração de texto (Google Gemini Flash). Usado para toda Copy_Bundle.
- **Render_Engine**: Componente server-side que combina Design_Template + Brand_Kit + imagem selecionada + textos gerados e produz o arquivo de imagem final (PNG/JPEG) do Generated_Asset.
- **Asset_Approval_Status**: Estado do Generated_Asset no fluxo de revisão: pending, approved, rejected.
- **Content_Usage_Meter**: Contador por período (dia/mês) de eventos consumíveis por plano futuro: posts gerados, imagens IA (fallback) usadas, execuções de Content_Job. Não impõe limites nesta fase.
- **Plan_Quota_Hook**: Ponto de decisão explícito, no código do módulo, onde uma consulta a limites de plano será feita em fase futura. Nesta fase, sempre retorna "permitido".

## Requirements

### Requirement 1: Isolamento total do módulo de geração (Total Module Isolation)

**User Story:** Como responsável técnico do produto, eu quero que o AI_Content_Generation_Module seja estruturalmente independente dos módulos de mensageria e de publicação, para que os três domínios evoluam, falhem e sejam mantidos sem acoplamento oculto.

#### Acceptance Criteria

1. THE AI_Content_Generation_Module SHALL persist Brand_Kit, Content_Brief, Content_Job, Generated_Asset, and Content_Usage_Meter data in tables that are not referenced by, and do not reference, the messaging module's Contact, Conversation, or Message tables.
2. THE AI_Content_Generation_Module SHALL expose its own top-level navigation entry point, independent from the messaging module and independent from the Social_Publishing_Module.
3. THE AI_Content_Generation_Module SHALL read Service catalog data only through a read-only interface, and SHALL NOT write to Service tables.
4. WHEN a Generated_Asset is approved for publishing, THE AI_Content_Generation_Module SHALL hand it off to the Social_Publishing_Module through its public server function interface, and SHALL NOT bypass that interface by writing directly to Social_Publishing_Module tables.
5. THE AI_Content_Generation_Module SHALL store rendered image outputs and cached Image_Bank_Result files in a storage location dedicated to this module, isolated from messaging and Social_Publishing_Module storage.

### Requirement 2: Brand Kit por workspace

**User Story:** Como Manager de um Workspace, eu quero cadastrar a identidade visual e verbal da minha empresa uma única vez, para que todos os posts gerados fiquem consistentes com a marca.

#### Acceptance Criteria

1. THE AI_Content_Generation_Module SHALL allow a Workspace_Member with brand-edit permission to create or update a single Brand_Kit per Workspace, containing at minimum primary color, secondary color, support color, logotype image, display font, body font, tone-of-voice descriptor, and default signature text.
2. WHEN a Workspace has no Brand_Kit and a Workspace_Member starts a Content_Brief, THE AI_Content_Generation_Module SHALL prompt the Workspace_Member to create the Brand_Kit before continuing, or SHALL apply a documented default Brand_Kit while flagging that the workspace is using defaults.
3. WHERE a Workspace_Member provides a public Instagram handle or a public website URL during Brand_Kit setup, THE AI_Content_Generation_Module SHALL attempt an automated extraction of primary color, secondary color, and logotype, and SHALL present the extracted values to the Workspace_Member for confirmation or editing before persisting them.
4. IF an automated extraction fails or returns incomplete data, THEN THE AI_Content_Generation_Module SHALL fall back to manual entry for the missing fields and SHALL NOT block Brand_Kit creation.
5. THE AI_Content_Generation_Module SHALL restrict the selectable display font and body font to a curated whitelist of licensed fonts documented in the design system.
6. WHEN a Brand_Kit is updated, THE AI_Content_Generation_Module SHALL apply the updated values to all subsequent Content_Jobs, and SHALL NOT re-render Generated_Assets that already exist.

### Requirement 3: Catálogo de templates e categorias

**User Story:** Como Workspace_Member, eu quero escolher entre categorias de post claras (promo, novidade, dica, depoimento, agenda, institucional, antes_depois, catálogo), para que eu componha rapidamente sem precisar pensar em layout.

#### Acceptance Criteria

1. THE AI_Content_Generation_Module SHALL maintain a curated catalog of Design_Templates versioned by the product team, each classified into exactly one Template_Category.
2. THE AI_Content_Generation_Module SHALL provide, for every Template_Category listed in the Glossary, at least one Design_Template variant for feed proportion 1:1 and at least one Design_Template variant for story/reel proportion 9:16.
3. WHEN a Workspace_Member browses templates for a given Template_Category, THE AI_Content_Generation_Module SHALL display a live preview of each available Design_Template rendered with the current Workspace's Brand_Kit values.
4. THE AI_Content_Generation_Module SHALL declare, for each Design_Template, the exact set of parameterized slots it requires (for example headline, subheadline, image, price, cta_label, logo_position), so that the Content_Brief flow can request only the fields relevant to the chosen template.
5. WHEN the product team retires a Design_Template, THE AI_Content_Generation_Module SHALL keep the retired Design_Template referenced by historical Generated_Assets viewable, and SHALL prevent it from being selected for new Content_Jobs.

### Requirement 4: Fornecimento de imagens abstraído (Image Bank)

**User Story:** Como Workspace_Member, eu quero que o sistema encontre sozinho uma imagem bonita e relevante para o post, sem eu precisar procurar em bancos externos, para que a criação seja rápida e o resultado profissional.

#### Acceptance Criteria

1. THE AI_Content_Generation_Module SHALL expose to the Workspace_Member a single conceptual image source labeled as generated by the product, and SHALL NOT reveal to the Workspace_Member the identity of the underlying Image_Bank_Provider used to obtain any specific image.
2. WHEN the AI_Content_Generation_Module needs a background or hero image for a Generated_Asset and no Service photo has been chosen, THE AI_Content_Generation_Module SHALL query the Image_Bank using search terms derived from the Content_Brief, the Template_Category, and the Brand_Kit primary color.
3. THE AI_Content_Generation_Module SHALL attempt Image_Bank_Providers in a documented preferred order (Pexels first, Unsplash second, Pixabay third), and SHALL fall through to the next provider only when the current provider returns no acceptable result.
4. WHEN an Image_Bank_Provider returns an Image_Bank_Result that requires author or provider attribution by that provider's terms of service, THE AI_Content_Generation_Module SHALL record the attribution metadata against the Generated_Asset and SHALL make it available in an internal audit view, without displaying it inside the visible post area.
5. IF all Image_Bank_Providers return no acceptable result for a given Content_Brief, THEN THE AI_Content_Generation_Module SHALL either offer the AI_Image_Provider fallback described in Requirement 5, or SHALL allow the Workspace_Member to proceed with a Service photo or Brand_Kit-only rendered background.
6. THE AI_Content_Generation_Module SHALL cache downloaded Image_Bank_Result files in this module's dedicated storage so that re-renders of the same Generated_Asset do not repeatedly download from the external provider.

### Requirement 5: Fallback controlado de geração de imagem por IA

**User Story:** Como Manager de um Workspace, eu quero que a geração de imagem por IA (mais cara) só seja usada em casos extremos, para que o custo do produto continue previsível e o consumo permaneça controlado por plano.

#### Acceptance Criteria

1. THE AI_Content_Generation_Module SHALL treat the AI_Image_Provider (Google Nano Banana) as a fallback path only, and SHALL NOT invoke it by default when the Image_Bank returns an acceptable result.
2. THE AI_Content_Generation_Module SHALL invoke the AI_Image_Provider only when at least one of these conditions is met: the Image_Bank returned no acceptable result, or the Workspace_Member explicitly opted into AI-generated imagery in the Content_Brief.
3. WHEN the AI_Image_Provider is invoked, THE AI_Content_Generation_Module SHALL first consult the Plan_Quota_Hook to confirm the workspace is allowed to consume AI image generation in the current period, and SHALL abort the invocation with a descriptive error when the quota hook denies the operation.
4. WHENEVER the AI_Image_Provider produces an image successfully, THE AI_Content_Generation_Module SHALL increment the Content_Usage_Meter counter for AI images used in the current period for that Workspace.
5. THE AI_Content_Generation_Module SHALL persist the AI_Image_Provider prompt used to generate the image alongside the Generated_Asset, so that regenerations can reuse or refine the same prompt.
6. THE AI_Content_Generation_Module SHALL never expose the AI_Image_Provider brand name to the Workspace_Member as the source of the image; it SHALL present all images uniformly as generated by the product.

### Requirement 6: Geração de texto viral (Copy Bundle)

**User Story:** Como Workspace_Member, eu quero legendas que chamem atenção, prendam quem lê e terminem com uma chamada clara, para que meus posts convertam e não fiquem genéricos.

#### Acceptance Criteria

1. THE AI_Content_Generation_Module SHALL invoke the AI_Text_Provider to produce a Copy_Bundle for every Generated_Asset, using a prompt that includes the Content_Brief text, the Service data referenced by the Content_Brief when present, the Brand_Kit tone-of-voice descriptor, and the Viral_Structure directives applicable to the chosen Template_Category.
2. THE AI_Content_Generation_Module SHALL request from the AI_Text_Provider a structured response containing distinct fields for opening hook, retention body, optional cliffhanger, call-to-action, hashtags, and short caption variant, and SHALL reject responses that do not conform to that structure.
3. WHERE a single Generated_Asset targets more than one Social_Network with materially different character or format limits, THE AI_Content_Generation_Module SHALL produce a per-network variant of the Copy_Bundle sized to each Social_Network's Post_Type limits, so that the handoff to the Social_Publishing_Module already respects Requirement 7 of the Social_Publishing_Module.
4. IF the AI_Text_Provider returns content that a moderation check flags as unsafe or off-topic, THEN THE AI_Content_Generation_Module SHALL discard the generation and SHALL surface a descriptive error to the Workspace_Member without persisting the flagged content.
5. WHEN a Workspace_Member requests a regeneration of the Copy_Bundle without changing the Content_Brief, THE AI_Content_Generation_Module SHALL invoke the AI_Text_Provider again and SHALL preserve the previous Copy_Bundle in a history accessible to the Workspace_Member for the duration of the Content_Job.

### Requirement 7: Uso de dados reais do workspace

**User Story:** Como Workspace_Member, eu quero que o sistema preencha automaticamente preços, nomes de serviços, profissionais e horários que já cadastrei, para que eu não precise redigitar informação que o ZapFlow já conhece.

#### Acceptance Criteria

1. WHEN a Workspace_Member selects a Service in the Content_Brief, THE AI_Content_Generation_Module SHALL populate the relevant Design_Template slots (headline candidate, price, duration, description snippet) with data read from the Service catalog for that Workspace.
2. WHERE a selected Service has one or more photos registered in the Service catalog, THE AI_Content_Generation_Module SHALL offer those photos to the Workspace_Member as the image source for the Generated_Asset, ranked ahead of Image_Bank results.
3. THE AI_Content_Generation_Module SHALL never write back changes to the Service catalog as a side effect of generating content.
4. IF the referenced Service is deleted between Content_Brief creation and Content_Job execution, THEN THE AI_Content_Generation_Module SHALL fail the Content_Job with a descriptive error indicating the missing Service, and SHALL NOT substitute Service data silently.

### Requirement 8: Composição do brief e execução do content job

**User Story:** Como Workspace_Member, eu quero preencher um formulário curto com o objetivo do post, o que quero comunicar e as redes de destino, para que o sistema me devolva um ou mais posts prontos para revisão.

#### Acceptance Criteria

1. THE AI_Content_Generation_Module SHALL allow a Workspace_Member with create permission to submit a Content_Brief containing at minimum the Template_Category, the target Social_Networks, and either a free-text objective or a selected Service, plus optional tone-of-voice override and optional AI-image opt-in.
2. WHEN a valid Content_Brief is submitted, THE AI_Content_Generation_Module SHALL create a Content_Job in status running and SHALL return control to the Workspace_Member immediately, executing the job asynchronously.
3. THE AI_Content_Generation_Module SHALL produce, for each Content_Job, one Generated_Asset per selected target Social_Network by default, unless the chosen Post_Format is carousel in which case it SHALL produce a single Generated_Asset comprising multiple slides addressed to all selected Social_Networks.
4. WHEN a Content_Job completes successfully, THE AI_Content_Generation_Module SHALL notify the initiating Workspace_Member in-app and SHALL make the resulting Generated_Assets available in an approval view with Asset_Approval_Status pending.
5. IF any stage of a Content_Job fails (Image_Bank, AI_Image_Provider, AI_Text_Provider, or Render_Engine), THEN THE AI_Content_Generation_Module SHALL mark the Content_Job as failed with a stage-specific error message and SHALL allow the Workspace_Member to retry the failed stage without redoing the successful stages.

### Requirement 9: Formatos suportados (single, carrossel, story)

**User Story:** Como Workspace_Member, eu quero poder gerar posts únicos, carrosséis com vários slides e stories verticais, para cobrir os principais formatos das redes.

#### Acceptance Criteria

1. THE AI_Content_Generation_Module SHALL support Post_Format values single, carousel, and story.
2. WHERE the Content_Brief selects Post_Format carousel, THE AI_Content_Generation_Module SHALL allow the Workspace_Member to specify a slide count between two and ten inclusive, and SHALL produce that number of slides in a single Generated_Asset.
3. THE AI_Content_Generation_Module SHALL render slide 1 of a carousel as a designed cover slide, intermediate slides as content slides matching the chosen Design_Template, and the last slide as a CTA slide with the Brand_Kit signature.
4. WHERE the Content_Brief selects Post_Format story, THE AI_Content_Generation_Module SHALL render the Generated_Asset at 9:16 proportion and SHALL only permit target Social_Networks that support a Post_Type in the story/reel family.
5. IF the Workspace_Member selects a Post_Format not supported by every selected target Social_Network, THEN THE AI_Content_Generation_Module SHALL either drop the incompatible target with a visible warning or SHALL block submission of the Content_Brief until the incompatibility is resolved.

### Requirement 10: Renderização server-side determinística

**User Story:** Como Workspace_Member, eu quero que a imagem preview que eu vejo seja idêntica à imagem que será publicada, para que não haja surpresa depois de aprovar.

#### Acceptance Criteria

1. THE AI_Content_Generation_Module SHALL perform image composition (Design_Template + Brand_Kit + selected image + textual slots) entirely server-side in the Render_Engine, producing a final image file that is the single source of truth for both preview and publication.
2. WHEN the Workspace_Member views a preview of a Generated_Asset, THE AI_Content_Generation_Module SHALL display the exact rendered image file produced by the Render_Engine, and SHALL NOT re-compose the preview in the browser.
3. THE AI_Content_Generation_Module SHALL guarantee that the same Content_Brief, Brand_Kit version, template version, and inputs produce the same rendered image bytes, so that regenerating without changes does not silently alter the output.
4. IF the Render_Engine fails to produce a Generated_Asset (missing font, missing image, size overflow), THEN THE AI_Content_Generation_Module SHALL fail the Content_Job with a descriptive error and SHALL NOT return a partial or fallback image without notifying the Workspace_Member.

### Requirement 11: Fluxo de aprovação e handoff para publicação

**User Story:** Como Workspace_Member com permissão de publicação, eu quero revisar, editar textos, aprovar ou rejeitar o post gerado e mandar para publicação em uma ação só, para fechar o ciclo sem sair da tela.

#### Acceptance Criteria

1. THE AI_Content_Generation_Module SHALL present each pending Generated_Asset in an approval view showing the final rendered image, the Copy_Bundle per target Social_Network, the target Social_Networks, and the actions edit-copy, regenerate, reject, approve.
2. WHEN a Workspace_Member edits the Copy_Bundle text in the approval view, THE AI_Content_Generation_Module SHALL validate the edited text against each target Social_Network's Post_Type character limit before persisting, and SHALL block persistence with a descriptive error when a limit is violated.
3. WHEN a Workspace_Member with publish permission approves a Generated_Asset, THE AI_Content_Generation_Module SHALL hand it off to the Social_Publishing_Module by invoking the module's public server function interface, providing the rendered image file, the per-network Copy_Bundle, the target Social_Account_Connections, and the requested Post_Type per target.
4. WHEN a Workspace_Member with publish permission chooses to schedule the handoff for a future time instead of publishing immediately, THE AI_Content_Generation_Module SHALL forward the requested scheduled time to the Social_Publishing_Module handoff and SHALL rely on the Social_Publishing_Module for the actual scheduled execution.
5. WHEN a Workspace_Member rejects a Generated_Asset, THE AI_Content_Generation_Module SHALL transition the Asset_Approval_Status to rejected and SHALL preserve the asset for reference, without invoking the Social_Publishing_Module.
6. IF the Social_Publishing_Module rejects the handoff (for example because the target Social_Account_Connection is disconnected or a validation rule fails), THEN THE AI_Content_Generation_Module SHALL surface the exact rejection reason returned by the Social_Publishing_Module in the approval view and SHALL keep the Generated_Asset available for correction and re-approval.

### Requirement 12: Regeneração e histórico

**User Story:** Como Workspace_Member, eu quero regerar apenas o texto ou apenas a imagem quando não gostar de uma parte, sem começar do zero, para economizar tempo e chamadas de IA.

#### Acceptance Criteria

1. THE AI_Content_Generation_Module SHALL support regeneration of a Generated_Asset in three modes: regenerate-copy-only, regenerate-image-only, and regenerate-both.
2. WHEN a Workspace_Member requests regenerate-copy-only, THE AI_Content_Generation_Module SHALL invoke the AI_Text_Provider only, SHALL reuse the existing image, and SHALL invoke the Render_Engine to combine the new copy with the existing image into a new Generated_Asset version.
3. WHEN a Workspace_Member requests regenerate-image-only, THE AI_Content_Generation_Module SHALL invoke the Image_Bank (or the AI_Image_Provider under the rules of Requirement 5) only, SHALL reuse the existing Copy_Bundle, and SHALL invoke the Render_Engine to combine the existing copy with the new image.
4. THE AI_Content_Generation_Module SHALL retain the previous Generated_Asset version each time a regeneration occurs, and SHALL allow the Workspace_Member to switch back to a prior version until the Content_Job is closed.
5. THE AI_Content_Generation_Module SHALL count each successful regeneration against the appropriate Content_Usage_Meter (post count for image-changing regenerations, AI image count for AI_Image_Provider regenerations), consistent with Requirement 15.

### Requirement 13: Permissões granulares

**User Story:** Como Manager de um Workspace, eu quero controlar quais membros da minha equipe podem criar briefs, aprovar posts, editar o Brand_Kit e forçar uso de IA de imagem, para separar responsabilidades e evitar gasto indevido.

#### Acceptance Criteria

1. THE AI_Content_Generation_Module SHALL maintain, for each Workspace, a permission set that determines, per Workspace_Member or per role, whether the following actions are allowed: brand-edit, content-brief-create, content-asset-approve, content-asset-publish-immediate, ai-image-optin.
2. THE AI_Content_Generation_Module SHALL apply, before any Manager configuration, a default permission set granting Manager Workspace_Members all listed actions, and granting Agent Workspace_Members only content-brief-create and content-asset-approve for their own Content_Jobs.
3. WHEN a Manager updates the AI_Content_Generation_Module permission set for a Workspace, THE AI_Content_Generation_Module SHALL apply the updated settings to all subsequent actions by the affected Workspace_Members.
4. IF a Workspace_Member attempts an action not allowed by their current permission set, THEN THE AI_Content_Generation_Module SHALL deny the action and display a descriptive error.
5. THE AI_Content_Generation_Module SHALL treat the publish-immediate handoff to the Social_Publishing_Module as also requiring that the Workspace_Member holds the corresponding publish permission inside the Social_Publishing_Module, and SHALL deny the handoff when either permission is missing.

### Requirement 14: Segurança multi-tenant e RLS

**User Story:** Como responsável pela segurança do produto, eu quero garantir que nenhum Workspace veja Brand_Kits, Content_Jobs ou Generated_Assets de outro Workspace, mesmo em caso de bug de query, para preservar o isolamento multi-tenant que o produto já garante nos demais módulos.

#### Acceptance Criteria

1. THE AI_Content_Generation_Module SHALL enable row-level security on every table it creates, with policies restricting selection, insertion, update, and deletion of a row to authenticated users whose auth identity equals that row's owner_user_id or whose auth identity's workspace owner equals that row's owner_user_id, consistent with the project-wide policy pattern used by other modules.
2. THE AI_Content_Generation_Module SHALL, in every server-side function that runs with the service role and therefore bypasses row-level security, explicitly filter every query and mutation by owner_user_id.
3. THE AI_Content_Generation_Module SHALL store any provider credentials or API keys used by the AI_Text_Provider, the AI_Image_Provider, or any Image_Bank_Provider outside of workspace-visible tables, and SHALL NOT return those credentials in any response to a Workspace_Member.
4. THE AI_Content_Generation_Module SHALL store rendered image files and cached Image_Bank_Result files behind access controls that only allow retrieval by members of the owning Workspace.

### Requirement 15: Medição de consumo para planos futuros (sem impor limites nesta fase)

**User Story:** Como responsável de produto, eu quero que o sistema já registre quantos posts cada Workspace gera, quantas imagens de IA usa e com que frequência, para que possamos definir planos com base em dados reais e ligar limites depois sem refatoração.

#### Acceptance Criteria

1. THE AI_Content_Generation_Module SHALL increment a Content_Usage_Meter counter for the metric posts-generated on every Generated_Asset that reaches Asset_Approval_Status approved.
2. THE AI_Content_Generation_Module SHALL increment a Content_Usage_Meter counter for the metric ai-images-generated on every successful invocation of the AI_Image_Provider.
3. THE AI_Content_Generation_Module SHALL increment a Content_Usage_Meter counter for the metric content-jobs-started on every Content_Job created.
4. THE AI_Content_Generation_Module SHALL scope every Content_Usage_Meter counter by Workspace and by calendar month in the Workspace's declared timezone.
5. THE AI_Content_Generation_Module SHALL call a Plan_Quota_Hook at each of the following decision points, and SHALL treat any refusal from the hook as a hard block with a descriptive error: submitting a Content_Brief, invoking the AI_Image_Provider, approving a Generated_Asset.
6. THE AI_Content_Generation_Module SHALL implement the Plan_Quota_Hook so that in this phase it always returns permitted, and so that swapping in a real plan enforcement implementation in a future phase requires no changes at the call sites.

### Requirement 16: Observabilidade e custo

**User Story:** Como operador do produto, eu quero enxergar, para cada Content_Job, quanto tempo levou, quais provedores foram usados e qual o custo estimado, para diagnosticar problemas e revisar margens.

#### Acceptance Criteria

1. THE AI_Content_Generation_Module SHALL persist, for every Content_Job, timestamps of start and end, the Image_Bank_Provider used (if any), whether the AI_Image_Provider was used, the AI_Text_Provider model identifier used, and the total wall-clock duration.
2. THE AI_Content_Generation_Module SHALL persist an estimated cost per Content_Job computed from documented per-invocation prices of the AI_Text_Provider and the AI_Image_Provider when used, so that operators can review margin without reconstructing calls.
3. THE AI_Content_Generation_Module SHALL expose an operator-only view (super_admin) listing recent Content_Jobs across workspaces with duration, providers used, cost estimate, and success or failure state.
4. THE AI_Content_Generation_Module SHALL log provider errors from Image_Bank_Providers, the AI_Image_Provider, and the AI_Text_Provider with enough context (Content_Job id, Workspace id, stage, provider name) to reproduce the failure, and SHALL NOT include user-provided secrets or Brand_Kit credentials in those logs.
