# Link público de agendamento

Implementação completa do fluxo `/book/[slug]` — página pública sem login, server routes públicas, botão de envio manual no chat e no kanban, e integração com a IA para injetar o link e criar agendamentos reais. Tudo cirúrgico: novas tabelas/colunas via migration aditiva, novos arquivos isolados, edições mínimas nos arquivos existentes. Sem tocar kanban, sidebar, auth, Evolution helper ou outras abas de configurações.

## Arquivos novos

1. `supabase/manual/20260601000001_booking_link.sql`
   - `ALTER TABLE profiles ADD COLUMN IF NOT EXISTS booking_slug TEXT UNIQUE, booking_enabled BOOLEAN DEFAULT false, booking_service_ids TEXT[] DEFAULT '{}', booking_title TEXT DEFAULT 'Agende seu horário', booking_description TEXT DEFAULT ''`.
   - Backfill de `booking_slug` (slugify de `business_name` + 4 chars) para linhas existentes.
   - Policy `SELECT ... TO anon USING (booking_enabled=true AND booking_slug IS NOT NULL)` em `profiles` — apenas linhas habilitadas; o select da API pública lista colunas explicitamente, nunca `*`.
   - Sem nova tabela de availability — slots calculados on-the-fly a partir de `ai_working_hours` + `appointments`.
   - Sem policy anon em `appointments` — escrita sempre via `supabaseAdmin` na server route.

2. `src/routes/book.$slug.tsx` (fora de `_authenticated`)
   - Wizard 4 etapas: Serviço → Profissional (condicional) → Data/Hora → Dados do cliente + confirmação.
   - Carrega `/api/public/book/$slug/info` no mount; 404 amigável se `error: not_found`.
   - Etapa 2 pulada quando `has_multiple_professionals=false` ou apenas 1 profissional ativo.
   - Etapa 3: calendário (shadcn `Calendar`), dias filtrados por `ai_working_hours`, datas passadas desabilitadas; ao escolher data faz GET de `/slots`.
   - Etapa 4: nome, WhatsApp (10–11 dígitos), notas opcionais; resumo antes de confirmar; POST `/create`; trata `409 slot_taken` voltando para etapa 3.
   - Tela de sucesso com resumo. Usa tokens do design system (`var(--bg-base)`, `--brand-400` etc.). Mobile-first.

3. `src/routes/api/public/book.$slug.ts`
   - Handlers em `createHandlers`, com sub-roteamento por query/path:
     - `GET ?action=info` → carrega profile (apenas campos públicos), services filtrados por `booking_service_ids` + `status='active'`, professionals ativos.
     - `GET ?action=slots&date=&professional_id=&service_id=` → valida dia útil em `ai_working_hours`, gera grid de slots com passo = `duration_minutes`, exclui colisões com appointments existentes (status ≠ cancelled), filtra passado usando `business_timezone`.
     - `POST` (action=create no body) → valida payload com Zod (phone regex `^\d{10,11}$`, data não passada), normaliza phone (prefixo 55), upsert de contact por (`owner_user_id`,`phone`), recheck de conflito, insert em `appointments` + `appointment_services`, dispara confirmação WhatsApp (não bloqueia em caso de erro).
   - CORS headers + OPTIONS handler. Tudo via `supabaseAdmin`.

4. `src/lib/booking-url.ts` — `getBookingUrl(slug)` retornando `https://github-vercel-bridge.lovable.app/book/${slug}`.

5. `src/lib/booking-confirmation.ts`
   - `sendBookingConfirmation({ profile, appointment, service, professional, client })` — busca instância Evolution conectada do workspace e reusa o helper de envio já existente (a investigar entre `sendWhatsAppMessage` em `src/lib/evolution.functions.ts` / `evolution.server.ts`); se sem instância conectada, retorna silenciosamente.
   - `createAppointmentFromAI(data, profile)` — resolve service por nome, upsert contact, valida slot, cria appointment + appointment_services via `supabaseAdmin`, chama `sendBookingConfirmation`.

## Arquivos modificados (cirurgicamente)

6. `src/lib/ai-respond.server.ts`
   - Adicionar `booking_slug, booking_enabled` ao `select` de `profiles`.
   - Em `buildWorkspaceLayer`: se `booking_enabled && booking_slug`, anexar instrução com a URL e orientação de uso; se `ai_schedule_enabled`, anexar contrato `APPOINTMENT_JSON:{...}` ao final da resposta.
   - Pós-processamento: regex `APPOINTMENT_JSON:(\{.*\})`, `JSON.parse`, `createAppointmentFromAI`, remover bloco antes de enviar ao cliente; erros apenas logados.

7. `src/lib/onboarding.functions.ts` — adicionar `booking_enabled, booking_title, booking_description, booking_service_ids` ao schema Zod e ao update de profile (defaults conforme spec). Get retorna os mesmos campos.

8. Configurações do workspace — nova seção "Link de Agendamento" (a investigar arquivo exato: `_authenticated.settings.workspace.tsx` é o candidato; se for melhor uma rota dedicada, criar `_authenticated.settings.booking.tsx` sem tocar nas outras).
   - Toggle `booking_enabled`, exibição read-only do slug + botão Copiar, inputs `booking_title`/`booking_description`, lista de serviços ativos com checkboxes para `booking_service_ids`, botão Salvar (chama `saveOnboardingConfig`) e link "Visualizar página" abrindo `/book/[slug]` em nova aba.

9. `src/components/chat/MessageInput.tsx` — botão (ícone `Link2` do lucide) ao lado do Send, visível apenas se `profile.booking_enabled`, que insere a URL do booking no `draft`. Lê profile via `useProfile` existente.

10. Composer do kanban — botão equivalente. A investigar: `src/features/inbox/composer.tsx` (provável). Mesma lógica, mesmo gate de `booking_enabled`. Nenhum outro arquivo de `features/inbox/` será tocado.

## Detalhes técnicos

- **Slot calc**: grid baseado em `duration_minutes` do serviço (não em SLOT_MIN fixo) para evitar sobreposição parcial. Conflito = `appt.starts_at < slot.end && appt.ends_at > slot.start`.
- **Race condition**: recheck dentro do POST com mesma cláusula de overlap; retorna 409 + `error:'slot_taken'`.
- **Telefone**: client envia apenas dígitos; server normaliza para começar com 55 se faltar; armazena formato consistente com o que o resto do sistema usa em `contacts.phone` (validar no arquivo).
- **Contact dedup**: lookup por (`owner_user_id`,`phone`), insert apenas se não existir.
- **Realtime**: insert em `appointments` já é replicado — agenda do atendente atualiza sozinha.
- **Segurança**: server route nunca retorna `*` de profiles; só os campos listados. Zod valida todo input. RLS da policy anon é defesa em profundidade, mas o acesso real passa pelo `supabaseAdmin`.
- **IA**: o bloco `APPOINTMENT_JSON` fica ao final da resposta e é removido por regex antes do envio; falha de parse não interrompe a resposta ao cliente.

## Investigação antes de codar (sem editar)

- `src/lib/onboarding.functions.ts` — formato atual do schema e nomes dos campos.
- Arquivo de configurações de workspace (`_authenticated.settings.workspace.tsx`) — onde encaixar a nova seção sem tocar nas outras abas.
- `src/features/inbox/composer.tsx` — confirmar que é o composer do kanban e seu shape.
- `src/lib/evolution.server.ts` / `evolution.functions.ts` — qual helper server-side já existe para envio WhatsApp; reusar tal qual.
- `src/lib/ai-respond.server.ts` — localizar o select de profile e a função `buildWorkspaceLayer` para edição mínima.

## Fora de escopo

Kanban (drag/colunas/tabs), modo chat (bolhas/badges/separadores), sidebar, autenticação, demais abas de settings, ai-respond fora dos pontos listados, qualquer alteração em colunas existentes de tabelas, Evolution helper.
