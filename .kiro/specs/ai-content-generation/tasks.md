# Implementation Plan

## Overview

Plano de 22 tarefas incrementais para entregar o AI_Content_Generation_Module ponta a ponta. As tarefas seguem a arquitetura do design: começam pela infraestrutura (migrations, tipagem, fontes, deps), constroem os componentes de servidor (render engine, image bank, AI providers, worker), depois server functions e permissões, terminam com UI, observabilidade e verificação final. Cada tarefa é auto-contida e verificável isoladamente.

## Tasks

- [x] 1. Criar migration das tabelas do módulo e bucket de storage
  - Criar `supabase/manual/20260810000100_ai_content_tables.sql` com as 6 tabelas (`brand_kits`, `content_briefs`, `content_jobs`, `generated_assets`, `content_usage_meters`, `content_publishing_permissions`), RLS habilitada e policies `owner_user_id = auth.uid() or owner_user_id = public.get_my_workspace_owner()` em cada uma
  - Criar `supabase/manual/20260810000200_ai_content_bucket.sql` com o bucket privado `ai-content` + policies de leitura/escrita restritas ao workspace, padrão idêntico ao bucket `social-media`
  - Ambas migrations terminam com `insert into public.schema_manual_migrations (filename) values ('...') on conflict do nothing;`
  - Rodar `npm run migrations:apply` para aplicar no banco de produção
  - _Requirements: 1.1, 1.5, 14.1, 14.2, 14.4_

- [x] 2. Publicar módulos de tipagem compartilhada do domínio
  - Criar `src/features/content-generation/types.ts` com `BrandKit`, `ContentBrief`, `ContentJob`, `GeneratedAsset`, `CopyBundle`, `ImageBankResult`, `TemplateCategory`, `PostFormat` como tipos TS + schemas Zod
  - Criar `src/features/content-generation/brand-kit-row.ts` com mapeamento `mapBrandKitRow(row: any): BrandKit` seguindo o padrão de `*-row.ts` do projeto
  - Criar `src/features/content-generation/asset-row.ts`, `brief-row.ts`, `job-row.ts` no mesmo padrão
  - _Requirements: 1.1_

- [x] 3. Adicionar whitelist de fontes e catalogá-las no repo
  - Baixar arquivos `.ttf` das 11 fontes do Google Fonts (Playfair Display, Bebas Neue, Montserrat, Poppins, Oswald, Inter, DM Sans, Lato, Nunito, Dancing Script, Caveat) para `src/features/content-generation/assets/fonts/`
  - Criar `src/features/content-generation/fonts/whitelist.ts` exportando `DISPLAY_FONTS`, `BODY_FONTS`, `SCRIPT_FONTS` como tuplas readonly
  - Criar `src/features/content-generation/fonts/font-loader.server.ts` com `loadFonts(names: string[]): Promise<Font[]>` cacheado em memória por processo, lendo arquivos com `fs/promises` e retornando `{ name, data: ArrayBuffer, weight, style }` no formato que o Satori espera
  - _Requirements: 2.5_

- [x] 4. Instalar e configurar dependências de render server-side
  - Adicionar `satori@^0.10`, `@resvg/resvg-js@^2`, `cheerio@^1`, `node-vibrant@^3.2` ao `package.json` (versões exatas pinadas)
  - Rodar `npm install`
  - Verificar que build passa com `npx tsc --noEmit`
  - _Requirements: 10.1_

- [x] 5. Implementar render engine com Satori + resvg
  - Criar `src/features/content-generation/render-engine.server.ts` exportando `renderTemplate(input: { templateId, brandKit, slots, slideIndex?, slideTotal? }): Promise<Buffer>` que carrega o componente do registry, chama Satori pra SVG, converte com Resvg em PNG
  - Criar `src/features/content-generation/templates/registry.ts` mapeando `templateId → { component, category, ratio, slots, width, height, retired }`
  - Criar 2 templates iniciais da categoria `promo`: `templates/promo/promo-01-1x1.tsx` (1080x1080) e `templates/promo/promo-01-9x16.tsx` (1080x1920), ambos consumindo `TemplateProps`
  - _Requirements: 3.1, 3.4, 10.1, 10.2, 10.3, 10.4_

- [x] 6. Adicionar templates para as 8 categorias restantes
  - Para cada `Template_Category` do glossário (`novidade`, `depoimento`, `agenda`, `dica`, `institucional`, `antes_depois`, `catalogo`), criar 1 variante 1:1 e 1 variante 9:16, todas registradas no `registry.ts`
  - Cada template consome slots parametrizados e usa `brandKit.primary_color`/`secondary_color`/`support_color`/`display_font`/`body_font`
  - _Requirements: 3.1, 3.2, 3.4_

- [x] 7. Implementar server function de listagem de templates com preview renderizado
  - Criar `src/lib/templates.functions.ts` exportando `listTemplates` (server fn) que retorna, por categoria, as entradas do registry filtradas por `retired=false` com uma URL de preview gerada renderizando o template contra o Brand_Kit do workspace autenticado
  - Preview é cacheado no bucket em `ai-content/{owner}/template-previews/{templateId}.png` e regerado quando o Brand_Kit atualiza (invalidação por hash do Brand_Kit)
  - _Requirements: 3.3, 3.5_

- [x] 8. Implementar CRUD do Brand_Kit e extractors
  - Criar `src/lib/brand-kit.functions.ts` com server fns `getBrandKit`, `upsertBrandKit`, `uploadLogo`, `extractFromInstagram`, `extractFromWebsite`
  - Criar `src/lib/brand-extractor.server.ts` com `extractFromInstagram(handle)` usando fetch + regex simples da bio pública + node-vibrant sobre profile pic, e `extractFromWebsite(url)` usando fetch + cheerio pra og:image/favicon/theme-color + node-vibrant pra paleta
  - `upsertBrandKit` valida que `display_font ∈ DISPLAY_FONTS` e `body_font ∈ BODY_FONTS ∪ SCRIPT_FONTS` senão rejeita
  - Extração nunca lança pra fora: em caso de erro, retorna objeto parcial com os campos que conseguiu preencher
  - _Requirements: 2.1, 2.3, 2.4, 2.5, 2.6_

- [x] 9. Implementar Image_Bank com falha em cascata
  - Criar `src/lib/image-bank.server.ts` com `searchImage(query, opts): Promise<ImageBankResult | null>` que percorre `[pexels, unsplash, pixabay]` em ordem, com timeout de 3s por provedor via `AbortController`
  - Criar `src/lib/image-bank/pexels-adapter.ts`, `unsplash-adapter.ts`, `pixabay-adapter.ts`, cada um exportando `search(query, opts): Promise<ImageBankResult | null>` com fetch autenticado, filtro por aspectRatio e colorHint quando o provedor suporta
  - Criar `src/lib/image-bank/cache.server.ts` com `cacheImageBankImage(result, ownerUserId): Promise<string>` que hasheia URL+provider, verifica existência no bucket e faz upload se necessário, retornando URL pública final
  - Adicionar `PEXELS_API_KEY`, `UNSPLASH_ACCESS_KEY`, `PIXABAY_API_KEY` em `.env.example`
  - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.6_

- [x] 10. Implementar AI_Text_Provider com Gemini Flash e Copy_Bundle estruturado
  - Criar `src/lib/ai-text.server.ts` com `generateCopyBundle(input): Promise<CopyBundle>` que monta prompt viral (gancho → retenção → cliff → CTA) usando brief + brandKit + service + targetNetworks, chama `gemini-flash-latest` via `@google/genai` já existente forçando `responseMimeType: 'application/json'` e `responseSchema`
  - Definir `COPY_BUNDLE_SCHEMA` em Zod + versão OpenAPI-like que o Gemini aceita; validar resposta com Zod e rejeitar não-conformes
  - Criar `moderateCopy(bundle)` que rejeita bundles com termos vetados (lista curta hardcoded inicialmente, pluggable depois)
  - _Requirements: 6.1, 6.2, 6.3, 6.4_

- [x] 11. Implementar Plan_Quota_Hook e Content_Usage_Meter
  - Criar `src/lib/plan-quota-hook.server.ts` exportando `checkQuota(workspaceId, metric): Promise<{ allowed: boolean; reason?: string }>` que nesta fase sempre retorna `{ allowed: true }`
  - Criar `src/lib/content-meters.server.ts` com `incrementMeter(workspaceId, metric)` que faz upsert em `content_usage_meters` com `period_year_month` calculado na tz do workspace
  - _Requirements: 15.1, 15.2, 15.3, 15.4, 15.5, 15.6_

- [x] 12. Implementar AI_Image_Provider (Nano Banana) como stub controlado
  - Criar `src/lib/ai-image.server.ts` exportando `generateImage(prompt, aspectRatio, colorHint?): Promise<{ url: string; prompt_used: string }>` que chama o endpoint Google Gemini image generation (Nano Banana / Imagen 3 API — endpoint concreto e SDK a confirmar) e salva o resultado no bucket em `ai-content/{owner}/ai-generated/{uuid}.png`
  - Se as credenciais não estão configuradas (dev/staging), retornar erro claro `AI_IMAGE_NOT_CONFIGURED` — nunca gerar imagem falsa
  - Registrar variável `NANO_BANANA_API_KEY` (ou nome equivalente) em `.env.example`
  - _Requirements: 5.1, 5.4, 5.5, 5.6_

- [x] 13. Implementar Content_Generation_Worker (handler do job type)
  - Criar `src/lib/content-generation-worker.server.ts` com `processContentGenerationJob(payload)` conforme o pipeline do design (image → copy → render → save assets)
  - Registrar o handler em `src/lib/job-worker.ts` no switch de `job_type`, adicionando `'content_generation'`
  - Aplicar Property 3 (fallback controlado): worker só chama `generateImage` quando `imageBank == null` OU `brief.ai_image_optin === true`, e sempre passa pelo `checkQuota` antes
  - Ao completar, incrementa `content_jobs_started` no início e `posts_generated`/`ai_images_generated` conforme o caminho
  - _Requirements: 5.1, 5.2, 5.3, 8.2, 8.3, 8.5, 15.1, 15.2, 15.3, 16.1, 16.2_

- [x] 14. Implementar server functions do content generation
  - Criar `src/lib/content-generation.functions.ts` com `submitBrief`, `listJobs`, `listAssets`, `getAsset`, `regenerateAsset` (com modos `copy_only`, `image_only`, `both`), `rejectAsset`
  - `submitBrief` valida Zod, chama `checkQuota`, cria `content_briefs` + `content_jobs(status=pending)`, enfileira em `message_jobs(job_type='content_generation')`, retorna id
  - `regenerateAsset` cria novo asset com `parent_asset_id` referenciando o anterior; enfileira job com mode
  - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 12.1, 12.2, 12.3, 12.4_

- [ ] 15. Extrair variante interna do handoff no Social_Publishing_Module e implementar `approveAsset`
  - Ler `src/lib/social-publishing.functions.ts` para localizar `submitSocialPost` atual; se o handoff exigir formato de UI incompatível com o AI_Content_Generation_Module, extrair função interna `handoffSocialPost` que aceite `{ ownerUserId, mediaUrl, mediaType, copyPerNetwork, targets, scheduledFor? }` retornando `{ social_post_id }`, e refatorar `submitSocialPost` pra usar a interna
  - Criar `approveAsset` em `content-generation.functions.ts` que valida `can_asset_approve` + `can_publish_immediate` (se não agendado), valida character limits por rede via `social-post-validation.ts`, chama `handoffSocialPost`, grava `social_post_id` + `approval_status=approved` + `approved_at/by`, incrementa meter
  - Aplicar Property 7 (idempotência): se `social_post_id` já preenchido, retornar o existente sem chamar de novo
  - _Requirements: 11.1, 11.2, 11.3, 11.4, 11.5, 11.6, 13.5_

- [ ] 16. Implementar permissões do módulo
  - Criar `src/lib/content-permissions.server.ts` com `getContentPermissions(userId, workspaceId)` que consulta `content_publishing_permissions` procurando primeiro por `workspace_member_id`, senão fallback por `role`
  - Criar `content-permissions.functions.ts` com `listPermissions`, `updatePermission` (só Manager pode editar)
  - Aplicar defaults conforme Req 13.2 (Manager: tudo; Agent: brief-create + asset-approve dos próprios jobs)
  - Todos os pontos que precisam de permissão (submitBrief, upsertBrandKit, approveAsset, ai-image-optin) consultam esse helper e negam com erro descritivo
  - _Requirements: 13.1, 13.2, 13.3, 13.4_

- [ ] 17. Criar rotas e navegação da UI
  - Criar `src/routes/_authenticated.content.tsx` (layout com abas: Brand, Templates, Compor, Assets, Permissões)
  - Criar `_authenticated.content.index.tsx` (dashboard: últimos 10 assets + CTA "Criar post")
  - Criar `_authenticated.content.brand.tsx` (form do Brand_Kit + extração automática)
  - Criar `_authenticated.content.compose.tsx` (multi-step wizard: categoria → formato → serviço opcional → texto → redes → gerar)
  - Criar `_authenticated.content.assets.tsx` (lista pending/approved/rejected com filtros)
  - Criar `_authenticated.content.assets.$assetId.tsx` (split view aprovação: imagem + copy editável + botões approve/reject/regenerate)
  - Criar `_authenticated.content.permissions.tsx` (só Manager)
  - Adicionar entrada "Conteúdo IA" no `src/components/app-sidebar.tsx` com ícone `Sparkles`, entre "Publicações" e "Configurações"
  - Rodar `npx @tanstack/router-cli generate` para atualizar `routeTree.gen.ts`
  - _Requirements: 1.2, 2.1, 3.3, 8.1, 11.1_

- [ ] 18. Implementar formatos single, carousel e story
  - Estender `content-generation-worker.server.ts` para tratar `post_format='carousel'` gerando 1 asset com `slides_json` contendo N URLs renderizadas (cover + N-2 content + CTA), consumindo `carousel_slide_count` do brief
  - Validar em `submitBrief` que `carousel_slide_count` está entre 2 e 10 quando `post_format='carousel'`
  - Validar compatibilidade formato × rede: se `post_format='story'` mas rede alvo não suporta story/reel, ou dropar a rede com aviso ou bloquear submit conforme Req 9.5
  - Renderizar 9:16 para `story` usando as variantes de template correspondentes
  - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.5_

- [ ] 19. Integração com catálogo de Services (read-only)
  - Em `content-generation-worker.server.ts`, quando `brief.service_id` está presente, carregar Service do workspace via `supabaseAdmin.from('services').select('*, service_photos(*)').eq('id', ...).eq('owner_user_id', ...)` e usar `name`/`price`/`duration`/`description` nos slots
  - Se `service_photos` tem 1+ fotos, usar a primeira como imageResult e não chamar Image_Bank
  - Se `service_id` referencia um Service inexistente ou de outro workspace, falhar o job com stage `service_lookup` e mensagem clara
  - Nunca fazer INSERT/UPDATE em `services` ou `service_photos`
  - _Requirements: 7.1, 7.2, 7.3, 7.4_

- [ ] 20. Observabilidade e view de super_admin
  - Preencher `content_jobs.duration_ms`, `image_provider_used`, `ai_text_model`, `cost_estimate_cents` conforme o pipeline executa (estimativa: Gemini Flash ≈ 5 centavos/1000; Nano Banana ≈ 3600 centavos/1000)
  - Criar rota `src/routes/_authenticated.super-admin.content-jobs.tsx` listando jobs recentes cross-workspace com duração, provedores, custo, status — protegida por `requireSuperAdmin`
  - Adicionar logs Sentry nos catch blocks do worker com `content_job_id`, `owner_user_id`, `stage`, `provider_name` — nunca incluir corpo do Brand_Kit ou credenciais nos logs
  - _Requirements: 16.1, 16.2, 16.3, 16.4_

- [ ] 21. Testes unitários
  - `src/features/content-generation/__tests__/image-bank.test.ts` — mocks dos 3 provedores, cobre falha em cascata e ordem
  - `src/features/content-generation/__tests__/template-registry.test.ts` — cada categoria do glossário tem 1:1 e 9:16 registradas e não retiradas
  - `src/features/content-generation/__tests__/copy-bundle-schema.test.ts` — Zod aceita bundle válido e rejeita bundle malformado
  - `src/features/content-generation/__tests__/quota-hook.test.ts` — hook devolve permitido nesta fase e é chamado nos 3 pontos
  - `src/features/content-generation/__tests__/permissions.test.ts` — defaults por role e overrides
  - `src/features/content-generation/__tests__/plan-quota-property.test.ts` — property test verifica que nenhuma chamada a `generateImage` acontece sem passar por `checkQuota`
  - Rodar `npx vitest --run` — todos os testes existentes + novos devem passar
  - _Requirements: 4.1, 5.2, 5.3, 6.2, 13.1, 15.5, 15.6_

- [ ] 22. Verificação final ponta a ponta
  - Rodar `npx tsc --noEmit` sem erros
  - Rodar `npx vitest --run` sem falhas
  - Executar `npm run migrations:check` para garantir que as 2 novas migrations estão no ledger
  - Testar manualmente em dev: criar Brand_Kit → gerar post (categoria promo, single, IG) → revisar → aprovar → confirmar que o Social_Publishing_Module recebeu o handoff com `social_post_id` populado
  - _Requirements: 1.4, 11.3_


## Task Dependency Graph

```
1 (migrations) ──┬─► 2 (types) ──┬─► 8 (brand-kit)
                 │               ├─► 14 (server fns)
                 │               ├─► 15 (approve/handoff)
                 │               └─► 16 (permissions)
                 │
                 ├─► 7 (list templates)
                 ├─► 13 (worker)
                 └─► 20 (observability)

3 (fonts) ─────► 5 (render engine) ──► 6 (mais templates)
                                    └─► 7 (preview render)

4 (deps: satori/resvg/cheerio/vibrant) ─┬─► 5 (render)
                                        ├─► 8 (brand extractor usa cheerio+vibrant)
                                        └─► 9 (image bank)

9 (image bank) ──┐
10 (ai text)   ──┤
11 (quota hook)─►├──► 13 (worker orquestra tudo)
12 (ai image)  ──┘

13 (worker) + 14 (fns) + 16 (permissions) ──► 17 (UI)

15 (approve/handoff) depende de 14 (fns base) e 16 (permissions)

18 (formatos) estende 13 (worker) e 14 (fns)
19 (services read) estende 13 (worker)

21 (tests) valida 4, 5, 9, 10, 11, 13, 14, 15, 16
22 (verificação final) exige tudo pronto
```

Ordem sugerida de execução linear (respeitando dependências): 1 → 2 → 4 → 3 → 5 → 6 → 7 → 8 → 9 → 10 → 11 → 12 → 13 → 14 → 15 → 16 → 17 → 18 → 19 → 20 → 21 → 22.

Ondas de execução paralela (tarefas na mesma onda podem rodar em paralelo, ondas dependem de ondas anteriores):

```json
{
  "waves": [
    { "wave": 1, "tasks": [1, 4], "reason": "Infra base: migrations e deps não dependem de código do módulo" },
    { "wave": 2, "tasks": [2, 3], "reason": "Tipos e fontes dependem só do repo estar limpo" },
    { "wave": 3, "tasks": [5, 8, 9, 10, 11, 12], "reason": "Componentes de servidor: render engine, brand kit, image bank, ai text, quota, ai image são independentes entre si" },
    { "wave": 4, "tasks": [6, 7], "reason": "Templates adicionais e listagem dependem do render engine (5) e do brand kit (8)" },
    { "wave": 5, "tasks": [13, 16], "reason": "Worker orquestra tudo da onda 3; permissões dependem de tipos (2)" },
    { "wave": 6, "tasks": [14], "reason": "Server fns dependem do worker (13) para enfileirar jobs" },
    { "wave": 7, "tasks": [15, 18, 19], "reason": "Handoff, formatos e integração com services dependem de fns (14) e worker (13)" },
    { "wave": 8, "tasks": [17, 20], "reason": "UI e observabilidade dependem das server fns completas" },
    { "wave": 9, "tasks": [21], "reason": "Testes cobrem tudo pronto" },
    { "wave": 10, "tasks": [22], "reason": "Verificação final ponta a ponta" }
  ]
}
```

## Notes

- **Isolamento estrito**: nenhuma task pode importar do módulo de mensageria (`src/features/inbox/`, `src/routes/api/public/zernio.ts`, `src/routes/api/public/evolution.*`). Interação com Social_Publishing_Module é apenas via server function pública documentada na task 15.
- **Migrations**: aplicar via `npm run migrations:apply` (RPC `apply_migration_sql` já instalada). Sempre terminar cada arquivo com o insert no ledger.
- **Design system**: `--radius-pill` em botões de ação, `--radius-control` em inputs, `--radius-card` em cards. Reusar `Card`, `Badge` (variantes success/warning/danger/neutral), `EmptyState`, `ConfirmDialog`.
- **Sem tipos gerados do Supabase**: manter queries `any` isoladas em `*-row.ts`.
- **Testes**: rodar `npx tsc --noEmit && npx vitest --run` antes de fechar cada task grupo (tasks 5, 13, 14, 15, 17, 22).
- **RouteTree TanStack**: sempre rodar `npx @tanstack/router-cli generate` após criar rota nova. Não usar `as any` no `createFileRoute` — quebra o gerador.
- **Nano Banana**: nome e endpoint concretos da API de imagem serão confirmados na task 12. Interface pública do módulo já está estável e não muda com essa confirmação.
- **Cliente pensa que é tudo IA**: o nome do provedor Image_Bank nunca aparece na UI. Atribuição só na view de auditoria interna (super_admin).
