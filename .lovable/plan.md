
# Diagnóstico

Analisei `buildWorkspaceLayer` em `src/lib/ai-respond.server.ts` e o webhook em `src/routes/api/public/evolution.$instanceId.ts`. Encontrei dois problemas reais e independentes.

## Bug 1 — IA agendou mesmo com toggle "Agente pode agendar" OFF

Hoje, quando `ai_schedule_enabled = false`, o prompt simplesmente **não menciona agendamento**. A IA, sem instrução proibitiva, segue o fluxo natural de uma oficina e "confirma" um horário (alucina o agendamento). O sistema permite tudo que não é proibido.

Mesma falha em outros toggles: a maioria só ativa instruções quando ON, sem negar comportamento quando OFF. A IA preenche as lacunas.

## Bug 2 — Mensagem "fora do horário" + resposta normal aparecem juntas

No screenshot (`image-173.png`), cada mensagem do cliente recebe **duas** respostas seguidas: a de fora do horário e uma resposta normal contextualizada. Isso indica que o webhook está processando a mesma mensagem duas vezes (Evolution reentrega `messages.upsert` ou envia o evento em variações diferentes).

A dedupe atual usa `floor(now/10000)` como bucket — se a reentrega vem após 10s, os buckets divergem e ambas as execuções passam. Pior: a primeira execução cai em "fora do horário" e a segunda, por algum motivo, escapa do filtro (provavelmente porque a dedupe key **inclui o timestamp**, então é uma chave diferente — não é a mesma mensagem do ponto de vista da dedupe).

A dedupe correta deve usar o **ID da mensagem do WhatsApp** (`m.key.id`), que é estável e único por mensagem real.

# O que vou alterar (apenas os arquivos permitidos)

## 1. `src/lib/ai-respond.server.ts` — prompt cirúrgico para cada toggle

Reescrever `buildWorkspaceLayer` para emitir uma **regra absoluta para CADA configuração**, nas duas direções (ON e OFF), com cabeçalho `OBRIGATÓRIO:` quando proibitiva. Em particular:

- **Agendamento OFF** (`ai_schedule_enabled = false`):  
  `OBRIGATÓRIO: Você NÃO pode agendar, marcar, reservar, confirmar nem propor horários. Se o cliente pedir agendamento, responda que um atendente humano entrará em contato para confirmar e NÃO confirme nenhum horário, mesmo que o cliente insista.`
- **Agendamento ON** mantém a instrução atual + reforço de antecedência mínima.
- **Reagendar OFF**: regra OBRIGATÓRIA, não apenas informativa.
- **Cancelar OFF**: idem.
- **Preço `never`**: `OBRIGATÓRIO: Nunca, sob nenhuma circunstância, informe valores, preços, faixas, "a partir de", estimativas ou descontos.`
- **Preço `on_request`**: só responder com valor após pergunta direta e literal sobre preço.
- **Múltiplos profissionais OFF**: regra OBRIGATÓRIA de não perguntar com quem atender.
- **Apresentar pelo nome OFF**: instrução explícita para NÃO se apresentar pelo nome (hoje só omite a regra).
- **Mencionar negócio OFF**: instrução explícita para não mencionar o nome do negócio.
- **Declarar como IA OFF**: já existe, manter.
- **Campos obrigatórios**: já existe, manter.
- **Máx perguntas por mensagem**: já existe, manter.

Também consolidar essas proibições no bloco final `REGRAS ABSOLUTAS` para reforçar.

## 2. `src/routes/api/public/evolution.$instanceId.ts` — dedupe por `whatsapp_message_id`

**Antes** de chamar `runAiResponse`, verificar se já existe uma mensagem outbound `is_ai = true` no banco vinculada ao mesmo `whatsapp_message_id` inbound (via metadados) — ou mais simples: verificar se a mensagem inbound (`m.key.id`) já gerou um log em `ai_usage_logs` com a nova `dedup_key = wa:<message_id>`.

Mudança mínima: passar `m.key.id` para `runAiResponse` como hint de dedupe estável.

## 3. `src/lib/ai-respond.server.ts` — dedupe estável

Adicionar parâmetro opcional `wa_message_id` em `AiRunInput`. Quando presente, usar `dedup_key = "wa:" + wa_message_id` (estável por mensagem). Fallback para o esquema atual baseado em bucket quando ausente (ex.: testador de prévia).

## 4. `src/lib/onboarding.functions.ts`

Sem mudanças. Os campos já estão todos no select/update.

## 5. `src/routes/_authenticated.ai-agent.tsx`

Sem mudanças funcionais. Toda a UI já existe e dispara os campos corretos. (A imagem `image-172.png` confirma o toggle "Agendamento automático" desligado, e o estado já é persistido como `ai_schedule_enabled: false`.)

## 6. SQL

Nenhuma migration nova. As colunas já existem.

# Como validar

1. **Agendamento OFF** → enviar "quero agendar amanhã 10h" pelo WhatsApp. IA deve recusar e direcionar a humano. Não deve confirmar horário.
2. **Preço `never`** → "quanto custa?" → IA recusa informar.
3. **Apresentar nome OFF** → primeira mensagem da conversa NÃO começa com "Olá, eu sou Sofia".
4. **Mensagem dupla "fora do horário"** → enviar mensagem fora do horário; verificar que apenas UMA resposta chega (mesmo se o webhook reentregar).
5. **Toggle OFF de reagendar** → "quero remarcar" → IA orienta a falar com atendente, não remarca.

# Escopo restrito (regra absoluta da sessão)

- Edito apenas: `src/lib/ai-respond.server.ts` e `src/routes/api/public/evolution.$instanceId.ts`.
- **NÃO** edito autenticação, agendamento, evolution.server, etc.

> Observação: o usuário disse anteriormente "não tocar em `evolution.$instanceId.ts`". Mas a dedupe duplicada exige passar o `m.key.id` adiante — caso contrário, o problema das mensagens dobradas não tem como ser resolvido apenas em `ai-respond.server.ts`. **Preciso da sua confirmação** se posso fazer essa edição mínima nesse arquivo (apenas adicionar 1 campo `wa_message_id: m.key.id` na chamada `runAiResponse`), ou se devo deixar o Bug 2 de fora deste turno e tratar somente o Bug 1 (agendamento e demais regras de prompt).
