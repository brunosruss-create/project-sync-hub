# Requirements Document

## Introduction

Este documento define os requisitos do **AI_Creative_Layout_Engine** (Motor de Layout Criativo por IA), uma nova capacidade dentro do módulo já existente `ai-content-generation` do ZapFlow — SaaS multi-tenant voltado a pequenos negócios brasileiros (salão, barbearia, academia, clínica, etc.).

Hoje o módulo gera posts assim: a IA de texto (Gemini) escreve a copy e extrai campos estruturados de oferta (preço, ocasião, urgência, serviço); a IA de imagem (Flux Schnell via Together.ai) gera a foto de fundo; e um compositor determinístico (`layout-templates.ts`) desenha camadas de texto/badges/botão/logo por cima da foto, escolhendo entre poucos templates fixos por nicho. O resultado é um `LayerComposition` (JSON de camadas com posição absoluta) que o `LayerEditor` renderiza como blocos editáveis e o worker converte em PNG final via Satori no publish.

A evolução pedida é sair de "poucos moldes fixos preenchidos" para um **motor de layout dirigido por IA no estilo Canva**: cada post vira um criativo único e rico em blocos, mantendo a edição por camadas. A IA atua como "arquiteta do layout" — decide estrutura de blocos, hierarquia, ênfase e agrupamento — mas **dentro de um sistema restrito com regras de correção que garantem que o criativo nunca quebra**. A observação central do produto é: um LLM inventando coordenadas livremente gera layout quebrado (sobreposição, elementos fora da margem). Portanto o motor é **híbrido**: a IA escolhe entre estruturas/grids validados, seleciona variações, define ênfase e agrupa blocos; o sistema traduz essas escolhas em coordenadas por meio de um mecanismo de layout com **correção automática** (constraint solving / auto-layout) que impõe as invariantes de qualidade.

O foco deste documento é o **comportamento e a correção** do criativo gerado: sem sobreposição de blocos, tudo dentro de margens seguras, legibilidade garantida sobre a foto, campos de oferta preservados, variedade entre posts, determinismo por seed, e degradação graciosa para um layout seguro conhecido quando a IA falha.

## Escopo

Esta capacidade substitui/estende o mecanismo de decisão de layout de `layout-templates.ts`, preservando o contrato de saída `LayerComposition` consumido pelo `LayerEditor` (edição) e por `layer-renderer.server.tsx` (render Satori no publish).

## Fora de Escopo (nesta fase)

- Alterar o pipeline de geração de copy (Gemini) ou de foto de fundo (Flux). Estes permanecem como estão; o motor consome suas saídas.
- Alterar o renderizador Satori (`layer-renderer.server.tsx`) além do necessário para suportar novos tipos/campos de camada, se houver.
- Permitir que o cliente final escolha fontes. O pareamento de fontes por nicho continua automático.
- Carrossel multi-slide com layouts distintos por slide. O formato carrossel é previsto na arquitetura (extensibilidade), mas os requisitos de layout desta fase cobrem feed (1:1) e story (9:16).
- Edição livre de coordenadas por IA sem validação (explicitamente proibido por este documento).
- Definição de limites por plano para uso do motor (herda os medidores existentes do módulo).

## Glossary

- **AI_Creative_Layout_Engine**: O motor descrito neste documento. Recebe o conteúdo do post (copy, campos de oferta, marca, foto, formato) e produz um Layer_Composition válido.
- **Layer_Composition**: Estrutura de dados de saída já existente (`LayerComposition { canvasWidth, canvasHeight, layers[] }`), com camadas de posição absoluta que o editor renderiza e o Render_Engine converte em PNG. É o contrato de saída obrigatório do motor.
- **Layer**: Bloco individual do criativo, de um dos tipos existentes: `text`, `pill`, `rect`, `line`, `button`, `image`.
- **Canvas**: Área do criativo, com `canvasWidth` × `canvasHeight`. Feed = 1080×1080; Story = 1080×1920.
- **Post_Format**: Formato do criativo: `single` (feed 1:1), `story` (9:16). `carousel` é previsto para fase futura.
- **Copy_Bundle**: Saída textual do AI_Text_Provider (Gemini), contendo hook, cta, e campos estruturados de oferta.
- **Offer_Field**: Campo estruturado de oferta extraído pela IA de texto, quando presente no briefing: `priceText` (preço), `occasion` (ocasião), `urgency` (urgência) e `offerLabel` (serviço/produto).
- **Design_DNA**: Definição por nicho (paleta, par de fontes, estilo tipográfico, mood) já existente em `design-dna.ts`. Fornece as fontes e cores default do criativo.
- **Font_Pairing**: Trio de fontes derivado do Design_DNA e do estilo tipográfico do nicho: `displayFont` (título), `accentFont` (preço/números), `bodyFont` (detalhes). Escolhido automaticamente; o cliente nunca escolhe fonte.
- **Layout_Structure**: Estrutura de composição validada e pré-aprovada (ex.: rodapé editorial, painel lateral, vinheta central, grid de terços) entre as quais a IA escolhe. Cada Layout_Structure define regiões e regras de fluxo, não coordenadas fixas por post.
- **Layout_Intent**: Saída estruturada da IA arquiteta — escolha de Layout_Structure, agrupamento de blocos, hierarquia/ênfase e variação — expressa como dados validáveis, **sem coordenadas livres**.
- **Layout_Intent_Schema**: Esquema formal (allow-list) que restringe o Layout_Intent a valores válidos (estruturas conhecidas, papéis de bloco conhecidos, níveis de ênfase enumerados). Entradas fora do esquema são rejeitadas.
- **Layout_Solver**: Componente determinístico que traduz um Layout_Intent + conteúdo + formato em coordenadas absolutas de cada Layer, aplicando as Correction_Rules. É a única parte autorizada a definir coordenadas.
- **Correction_Rules**: Conjunto de invariantes que o Layout_Solver garante no criativo final: sem sobreposição de blocos de conteúdo, respeito às Safe_Margins, hierarquia tipográfica consistente e contraste legível.
- **Safe_Margins**: Margens de segurança internas ao Canvas dentro das quais todo bloco de conteúdo deve permanecer. Definidas por formato.
- **Content_Block**: Bloco portador de conteúdo (texto, preço, botão CTA, logo, badge). Distingue-se de blocos de fundo/decorativos (overlay `rect`, gradiente, `line` de acento) para fins de regra de sobreposição.
- **Legibility_Contrast**: Razão de contraste entre o texto e a região da foto/overlay diretamente atrás dele, avaliada contra um limiar mínimo.
- **Layout_Seed**: Semente determinística associada ao Generated_Asset (deriva de id do asset + rede) que fixa todas as escolhas aleatórias/variacionais do motor, garantindo reprodutibilidade.
- **Safe_Fallback_Layout**: Layout_Structure conhecido e sempre-válido usado quando a IA falha, retorna Layout_Intent inválido, ou o resultado não passa nas Correction_Rules.
- **Render_Engine**: Renderizador server-side (Satori, em `layer-renderer.server.tsx`) que converte o Layer_Composition em PNG no publish.
- **Layer_Editor**: Editor React de camadas já existente, onde o cliente pode ajustar o criativo. Passa a ser opcional: a IA entrega o criativo pronto para publicar.

## Requirements

### Requirement 1: Saída como composição de camadas válida (contrato preservado)

**User Story:** Como responsável técnico do módulo, eu quero que o motor produza sempre um Layer_Composition compatível com o editor e o renderizador atuais, para que a nova capacidade encaixe no pipeline existente sem reescrever editor nem render.

#### Acceptance Criteria

1. WHEN the AI_Creative_Layout_Engine finishes generating a creative, THE AI_Creative_Layout_Engine SHALL output a Layer_Composition containing canvasWidth, canvasHeight, and a layers array.
2. THE AI_Creative_Layout_Engine SHALL emit only Layer entries whose type is one of text, pill, rect, line, button, or image.
3. WHEN Post_Format is single, THE AI_Creative_Layout_Engine SHALL set canvasWidth to 1080 and canvasHeight to 1080.
4. WHEN Post_Format is story, THE AI_Creative_Layout_Engine SHALL set canvasWidth to 1080 and canvasHeight to 1920.
5. THE AI_Creative_Layout_Engine SHALL assign a unique id to each Layer within a single Layer_Composition.
6. THE AI_Creative_Layout_Engine SHALL emit each Layer with all required fields populated for its declared type as defined by the Layer type contract.

### Requirement 2: IA como arquiteta do layout, restrita a um esquema (sem coordenadas livres)

**User Story:** Como responsável pela qualidade do produto, eu quero que a IA decida a estrutura do criativo escolhendo entre opções validadas em vez de inventar coordenadas, para que o layout nunca quebre por causa de posições inventadas pelo modelo.

#### Acceptance Criteria

1. THE AI_Creative_Layout_Engine SHALL obtain layout decisions from the AI_Text_Provider only as a Layout_Intent that conforms to the Layout_Intent_Schema.
2. THE Layout_Intent_Schema SHALL restrict the AI selection to a Layout_Structure drawn from a defined allow-list of validated structures.
3. THE Layout_Intent_Schema SHALL restrict block emphasis to an enumerated set of hierarchy levels.
4. THE AI_Creative_Layout_Engine SHALL derive every Layer coordinate exclusively through the Layout_Solver, and SHALL NOT use any x or y value supplied directly by the AI_Text_Provider.
5. IF the Layout_Intent returned by the AI_Text_Provider does not conform to the Layout_Intent_Schema, THEN THE AI_Creative_Layout_Engine SHALL discard the Layout_Intent and apply the Safe_Fallback_Layout.
6. IF the Layout_Intent references a Layout_Structure that is not in the allow-list, THEN THE AI_Creative_Layout_Engine SHALL apply the Safe_Fallback_Layout.

### Requirement 3: Sem sobreposição de blocos de conteúdo

**User Story:** Como cliente que aprova o post sem editar, eu quero que os textos e elementos nunca fiquem sobrepostos, para que o criativo saia legível e profissional sem eu precisar corrigir.

#### Acceptance Criteria

1. THE Layout_Solver SHALL position Content_Blocks such that the bounding boxes of any two Content_Blocks do not overlap.
2. WHERE a background or decorative Layer (overlay rect, gradient rect, accent line) is placed behind Content_Blocks, THE Layout_Solver SHALL exempt that Layer from the Content_Block non-overlap rule.
3. IF applying a chosen Layout_Structure would cause two Content_Blocks to overlap given the current content, THEN THE Layout_Solver SHALL adjust block sizing or spacing so that the overlap is removed before producing the Layer_Composition.
4. IF the Layout_Solver cannot remove a Content_Block overlap through adjustment, THEN THE AI_Creative_Layout_Engine SHALL apply the Safe_Fallback_Layout.

### Requirement 4: Tudo dentro das margens seguras

**User Story:** Como cliente, eu quero que nenhum texto ou elemento fique cortado na borda ou fora da margem, para que o post fique bem enquadrado em qualquer rede.

#### Acceptance Criteria

1. THE AI_Creative_Layout_Engine SHALL define Safe_Margins for each Post_Format as an inset region within the Canvas.
2. THE Layout_Solver SHALL position every Content_Block such that its entire bounding box lies within the Safe_Margins.
3. IF a Content_Block's content is too large to fit within the Safe_Margins at its assigned size, THEN THE Layout_Solver SHALL reduce the block's size or wrap its text so that the block fits within the Safe_Margins.
4. WHERE a Layer is an intentional full-bleed background (overlay or photo tint rect), THE Layout_Solver SHALL allow that Layer to extend to the Canvas edges.
5. IF a Content_Block cannot be made to fit within the Safe_Margins after reduction to the minimum legible size, THEN THE AI_Creative_Layout_Engine SHALL apply the Safe_Fallback_Layout.

### Requirement 5: Legibilidade garantida sobre a foto

**User Story:** Como cliente, eu quero que o texto seja sempre legível sobre a foto de fundo, para que a mensagem apareça mesmo quando a foto é clara ou visualmente carregada.

#### Acceptance Criteria

1. THE Layout_Solver SHALL ensure that every text-bearing Content_Block has a backing treatment (overlay, tint, gradient, or solid panel) between the text and the photo.
2. THE Layout_Solver SHALL ensure that the Legibility_Contrast between each text Content_Block and the region directly behind it is at least the defined minimum contrast threshold.
3. IF the Legibility_Contrast for a text Content_Block is below the minimum threshold, THEN THE Layout_Solver SHALL strengthen the backing treatment or adjust the text color until the threshold is met.
4. THE AI_Creative_Layout_Engine SHALL keep the minimum contrast threshold at a value that meets or exceeds the WCAG AA ratio for large text.

### Requirement 6: Preservação dos campos de oferta

**User Story:** Como dono do negócio, eu quero que preço, ocasião, urgência e serviço apareçam no criativo sempre que existirem no briefing, para que a promoção não perca a informação que motivou o post.

#### Acceptance Criteria

1. WHEN an Offer_Field is present and non-empty in the Copy_Bundle, THE AI_Creative_Layout_Engine SHALL include a corresponding Content_Block for that Offer_Field in the Layer_Composition.
2. WHEN priceText is present in the Copy_Bundle, THE AI_Creative_Layout_Engine SHALL render the price as a Content_Block using the Font_Pairing accent font with the highest emphasis level among the Offer_Fields.
3. WHEN an Offer_Field is absent or empty in the Copy_Bundle, THE AI_Creative_Layout_Engine SHALL omit its Content_Block without leaving placeholder text.
4. THE AI_Creative_Layout_Engine SHALL preserve the textual value of each included Offer_Field without truncating it below its full readable content.
5. WHERE the Safe_Fallback_Layout is applied, THE AI_Creative_Layout_Engine SHALL still include a Content_Block for every Offer_Field present in the Copy_Bundle.

### Requirement 7: Hierarquia tipográfica consistente e pareamento de fontes por nicho

**User Story:** Como dono do negócio, eu quero que os posts tenham uma hierarquia tipográfica clara e fontes coerentes com o meu nicho, sem eu escolher fonte, para que o criativo pareça feito por uma agência.

#### Acceptance Criteria

1. THE AI_Creative_Layout_Engine SHALL derive the Font_Pairing from the Design_DNA of the Workspace segment, and SHALL NOT expose font selection to the Workspace_Member.
2. THE Layout_Solver SHALL assign font sizes so that a Content_Block with a higher emphasis level has a font size greater than or equal to a Content_Block with a lower emphasis level.
3. THE Layout_Solver SHALL apply the display font to headline Content_Blocks, the accent font to numeric and price Content_Blocks, and the body font to supporting-detail Content_Blocks.
4. WHERE a Brand_Kit defines custom fonts, THE AI_Creative_Layout_Engine SHALL use the Brand_Kit fonts in place of the Design_DNA fonts while preserving the display/accent/body role assignment.

### Requirement 8: Variedade entre posts

**User Story:** Como dono do negócio que publica com frequência, eu quero que meus posts não pareçam o mesmo molde repetido, para que meu feed tenha aparência variada e criativa.

#### Acceptance Criteria

1. THE AI_Creative_Layout_Engine SHALL support a set of at least three distinct Layout_Structures applicable per Post_Format.
2. WHEN generating creatives for the same Workspace across different Content_Jobs, THE AI_Creative_Layout_Engine SHALL vary the selected Layout_Structure according to the Layout_Intent and Layout_Seed rather than always selecting a single fixed structure.
3. THE AI_Creative_Layout_Engine SHALL keep every Layout_Structure in the allow-list compliant with the Correction_Rules, so that added variety never produces a broken creative.

### Requirement 9: Determinismo por seed (reabrir mostra o mesmo layout)

**User Story:** Como cliente, eu quero que reabrir um post gerado mostre exatamente o mesmo layout, para que o que aprovei seja o que será publicado.

#### Acceptance Criteria

1. THE AI_Creative_Layout_Engine SHALL associate a Layout_Seed with each Generated_Asset.
2. WHEN the AI_Creative_Layout_Engine produces a Layer_Composition for a given Layout_Intent, Copy_Bundle, Post_Format, Brand_Kit, and Layout_Seed, THE AI_Creative_Layout_Engine SHALL produce an identical Layer_Composition for the same set of inputs on any subsequent run.
3. THE Layout_Solver SHALL derive every variational choice from the Layout_Seed, and SHALL NOT use any non-deterministic source such as the current time or a random generator without a fixed seed.

### Requirement 10: Degradação graciosa para layout seguro

**User Story:** Como cliente, eu quero que, se a IA falhar em montar um layout criativo, o sistema ainda entregue um post válido em vez de um criativo quebrado ou um erro, para que eu sempre tenha algo pronto para aprovar.

#### Acceptance Criteria

1. IF the AI_Text_Provider fails to return a Layout_Intent, THEN THE AI_Creative_Layout_Engine SHALL apply the Safe_Fallback_Layout.
2. IF the Layout_Solver output for a chosen Layout_Structure fails any Correction_Rule after adjustment, THEN THE AI_Creative_Layout_Engine SHALL apply the Safe_Fallback_Layout.
3. THE Safe_Fallback_Layout SHALL itself satisfy the non-overlap rule (Requirement 3), the Safe_Margins rule (Requirement 4), the Legibility_Contrast rule (Requirement 5), and the Offer_Field preservation rule (Requirement 6).
4. WHEN the AI_Creative_Layout_Engine applies the Safe_Fallback_Layout, THE AI_Creative_Layout_Engine SHALL still produce a valid Layer_Composition without raising an error to the Content_Job pipeline.
5. THE AI_Creative_Layout_Engine SHALL record which layout path was used (AI-selected structure or Safe_Fallback_Layout) for observability, without including Brand_Kit secrets or credentials in the log.

### Requirement 11: Editor de camadas opcional

**User Story:** Como cliente comum, eu quero aprovar o criativo direto sem abrir o editor, e como cliente avançado eu quero poder ajustar as camadas, para que o motor sirva os dois perfis.

#### Acceptance Criteria

1. THE AI_Creative_Layout_Engine SHALL produce a ready-to-publish Layer_Composition that requires no manual editing to be valid.
2. THE AI_Creative_Layout_Engine SHALL emit Layers that remain individually editable in the Layer_Editor (selectable, movable, and text-editable) as with the current composition.
3. WHEN a Workspace_Member edits a Layer in the Layer_Editor, THE AI_Creative_Layout_Engine SHALL NOT re-run the Layout_Solver over the edited Layer_Composition, so that manual adjustments are preserved.

### Requirement 12: Suporte a formatos e extensibilidade para carrossel

**User Story:** Como dono do negócio, eu quero gerar criativos em feed e story com o mesmo motor, e ter caminho para carrossel no futuro, para que o produto cresça sem reescrever o layout.

#### Acceptance Criteria

1. THE AI_Creative_Layout_Engine SHALL generate valid creatives for Post_Format single and Post_Format story.
2. WHERE the Post_Format is story, THE Layout_Solver SHALL use the story Safe_Margins and the story Canvas height while applying the same Correction_Rules.
3. THE AI_Creative_Layout_Engine SHALL define the Layout_Structure allow-list in a form that admits future addition of carousel structures without changing the Layer_Composition output contract.
