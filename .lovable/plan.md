
# Plano de correção: Profissionais ↔ IA ↔ Agenda

## Problemas identificados

1. **IA não conhece os profissionais cadastrados.** O prompt (`buildWorkspaceLayer` em `src/lib/ai-respond.server.ts`) só adiciona uma frase genérica "tem mais de um profissional". A tabela `professionals` nunca é carregada nem injetada no contexto. Por isso, ao perguntarem "Dr Pedro tem horário?", a IA não reconhece o nome.

2. **IA responde "não temos catálogo de serviços" mesmo quando a pergunta era sobre profissional/horário.** O bloco `buildServicesLayer` (quando services=0) instrui a IA a usar essa resposta para *qualquer* pergunta de "serviço, preço, agendar". Essa regra vaza para perguntas de profissional/agenda. Precisa ser escopo apenas para "o que vocês fazem / quais serviços", não para profissional/horário.

3. **Toggle "tem mais de um profissional" é manual e desconectado da realidade.** Deveria ser derivado do número de profissionais **ativos** cadastrados: 0 → nunca pergunta e nem cita nome; 1 → assume aquele profissional implicitamente (nome no prompt); ≥2 → pergunta apenas se o cliente não tiver preferência. O toggle vira opcional (apenas para forçar "não perguntar" mesmo com vários).

4. **IA não tem acesso à agenda dos profissionais.** Não consegue responder "Dr Pedro tem horário amanhã?". Precisa receber os próximos compromissos por profissional (janela curta, ex.: próximos 7 dias) e a regra de horário de funcionamento já existente, para sugerir slots livres ou redirecionar.

5. **Agenda filtra por `agent_id` legado.** `appointments` antigos só têm `agent_id` (uuid do mock de agentes). Profissionais novos (Dr Pedro/Dra Pamela) nunca aparecem porque seus `professional_id` não batem com `agent_id`. Precisamos:
   - Migration que faça backfill: `update appointments set professional_id = agent_id where professional_id is null` (quando o `agent_id` existir em `professionals.id`) e, simétrico, ao criar/editar sempre gravar **os dois** campos (já é feito) e usar `professional_id` como fonte de verdade.
   - Toda leitura/filtro/conflito da Agenda deve usar `professional_id` (com fallback para `agent_id` só no `mapAppt` durante a transição).

6. **Filtro de profissionais na Agenda é multi-checkbox e gera o estado mostrado na foto 4.** Trocar por um **dropdown único** (estilo foto 5: "Todos os profissionais" + um item por profissional), como já é o select do modal de novo agendamento.

## Mudanças a implementar

### A. Banco (migration nova `20260613000000_appointments_professional_backfill.sql`)
- `update public.appointments set professional_id = agent_id where professional_id is null and agent_id in (select id from public.professionals);`
- Índice extra `appointments_owner_professional_starts_idx (owner_user_id, professional_id, starts_at)` para a consulta de disponibilidade da IA.
- `notify pgrst, 'reload schema';`

### B. IA (`src/lib/ai-respond.server.ts`)
1. Em `runAiResponse`, **carregar profissionais ativos**:
   ```ts
   const { data: pros } = await supabaseAdmin
     .from("professionals")
     .select("id,name,role")
     .eq("owner_user_id", data.workspace_owner_id)
     .eq("is_active", true)
     .order("created_at");
   ```
2. Carregar **agenda futura** (próximos 7 dias) para esses profissionais:
   ```ts
   const { data: upcoming } = await supabaseAdmin
     .from("appointments")
     .select("professional_id,starts_at,ends_at,status")
     .eq("owner_user_id", data.workspace_owner_id)
     .gte("starts_at", nowIso)
     .lte("starts_at", sevenDaysIso)
     .neq("status", "cancelled");
   ```
3. Criar `buildProfessionalsLayer(pros, upcoming, businessHours, tz)`:
   - Lista nominal: `- Dr Pedro (Dentista)` etc.
   - Para cada profissional, agrupar `upcoming` em "ocupado em: dd/mm HH:MM–HH:MM" (no `tz` do negócio).
   - Combinar com `business_hours` para descrever janelas livres aproximadas ("Dr Pedro amanhã está livre 9h–12h e 14h–18h, ocupado 12h30–13h30").
   - Regras: "Use APENAS estes nomes. Se o cliente perguntar por outro profissional, diga que não atende aqui. Para confirmar horário definitivo, ofereça o link de agendamento (se houver) ou encaminhe humano."
4. Substituir o trecho atual `// === PROFISSIONAIS ===` por lógica derivada do array:
   - `pros.length === 0`: proibição "Não cite nomes de profissionais. Trate como atendimento genérico."
   - `pros.length === 1`: parts.push: "O atendimento é feito por **{Nome}** ({role}). Quando o cliente perguntar 'qual médico/profissional', assuma este. Não pergunte preferência."
   - `pros.length >= 2`: usa toggle `ai_has_multiple_professionals` como override. Default = perguntar preferência somente quando relevante e o cliente não tiver mencionado nome. Se o cliente citar um nome existente, responda direto sem perguntar.
5. **Corrigir vazamento do `servicesLayer` para perguntas de profissional/horário.** Reescrever as regras quando `services.length === 0`:
   - Trocar "Se o cliente perguntar o que vocês fazem / quais serviços / preços / agendar algo" por "Se o cliente perguntar **quais serviços** ou **preços**...".
   - Adicionar: "Perguntas sobre profissionais ou horários NÃO são bloqueadas por ausência de catálogo — responda usando o bloco PROFISSIONAIS e AGENDA."

### C. Onboarding/perfil
- `getWorkspaceAiConfig`/`updateWorkspaceAiConfig` não precisam mudar (toggle continua existindo). Apenas atualizar o label do toggle em `_authenticated.ai-agent.tsx`:
  "Forçar a IA a perguntar a preferência de profissional? (recomendado quando você tem vários profissionais e o cliente normalmente escolhe)" — texto auxiliar deixando claro que com 1 só profissional a IA já assume sozinha.

### D. Agenda (`src/routes/_authenticated.schedule.tsx`)
1. **Filtro de profissional**: substituir o popover de checkboxes (botão `Profissionais` da foto 4) por um `<select>` único com opções "Todos os profissionais" + cada `agents[i]`. Estado vira `agentFilter: string | "all"` ao invés de `Set<string>`.
2. Atualizar `filtered`: 
   ```ts
   items.filter(a => a.status !== "cancelled" && (agentFilter === "all" || a.agent_id === agentFilter))
   ```
   Remover a regra "manter visíveis appointments cujo agent_id não é conhecido" (era patch para o problema legado; o backfill resolve).
3. `mapAppt` já lê `professional_id ?? agent_id` — manter.
4. `upsert` já grava ambos campos — manter; remover gravação de `agent_id` no futuro (não nesse PR).
5. Detecção de conflito (`a.agent_id === draft.agent_id`) continua válida porque ambos refletem o mesmo uuid após backfill.

### E. QA manual após deploy
- Rodar migration no SQL Editor.
- Verificar na Agenda: filtro dropdown lista os 3 profissionais; selecionar "Dr Pedro" mostra os agendamentos dele depois de criar um novo.
- No simulador da IA com 1 profissional ativo: perguntar "qual médico atende?" — deve citar o nome sem perguntar preferência.
- Com 3 profissionais e a pergunta "Dr Pedro tem horário amanhã?": IA deve reconhecer o nome e responder com a janela livre/ocupada baseada na agenda real.
- Sem nenhum serviço cadastrado, perguntar "Dr Pedro tem horário?": IA NÃO deve responder "não temos catálogo".

## Arquivos afetados
- `supabase/manual/20260613000000_appointments_professional_backfill.sql` (novo)
- `src/lib/ai-respond.server.ts` (carregar profissionais + agenda, novo `buildProfessionalsLayer`, reescrever services layer vazio, reescrever bloco PROFISSIONAIS)
- `src/routes/_authenticated.schedule.tsx` (filtro como select único, ajuste do `filtered`)
- `src/routes/_authenticated.ai-agent.tsx` (apenas texto do toggle "tem mais de um profissional")

Nada na tabela `professionals`, nada na auth, nada de novos toggles.
