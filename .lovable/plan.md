## Problema

Em **Configurações → Negócio**, o campo "Segmento" está com 4 opções hardcoded (Mecânico / Clínica / Dentista / Outro) e nem é salvo de verdade — é só um `useState` local. Enquanto isso, no Super Admin → IA → Segmentos já existe uma lista completa de **16+ segmentos** (Estética, Médico, Odontologia, Salão, Barbearia, Mecânica, Veterinária, Advocacia, etc.) gravada na tabela `ai_segments`, e o onboarding já usa essa mesma lista via `listActiveSegments`.

A correção é fazer o select de Segmento puxar dinamicamente da tabela `ai_segments` (igual ao onboarding) e persistir a escolha em `profiles.segment_id`.

## Plano

### 1. Reaproveitar `listActiveSegments` (já existe)
Em `src/lib/onboarding.functions.ts` já temos a função que retorna todos os segmentos ativos ordenados por `sort_order`, com `id, name, slug, description, icon`. Não precisa criar nada novo no backend para listar.

### 2. Criar server function para ler/atualizar dados do workspace
Em `src/lib/onboarding.functions.ts` (ou novo `workspace.functions.ts`), adicionar:

- `getWorkspaceProfile` — retorna `business_name, business_description, segment_id` do `profiles` do usuário.
- `updateWorkspaceSegment` — recebe `{ segment_id: uuid, business_name?: string }`, valida que o segmento existe e está ativo, e faz `update` em `profiles`.

> Escopo: vou cuidar **só do segmento + nome do negócio** nesse passo. Os outros campos da tela (endereço, telefone, site, horários, mensagem de boas-vindas) continuam mock — não fazem parte do pedido. Se quiser que eu também conecte esses, me avisa.

### 3. Atualizar a tela `_authenticated.settings.workspace.tsx`
- Trocar o `useState("Mecânico")` por `useState<string | null>(null)` guardando `segment_id`.
- Carregar `getWorkspaceProfile` + `listActiveSegments` via `useQuery` (paralelo).
- Renderizar o `<select>` com `<option value={s.id}>{s.icon} {s.name}</option>` para cada segmento ativo.
- Pré-selecionar o `segment_id` atual do perfil.
- No botão "Salvar alterações", chamar `updateWorkspaceSegment({ segment_id, business_name })` e mostrar toast de sucesso/erro real (substitui o `setTimeout` falso).
- Invalidar a query depois de salvar.

### 4. Mostrar descrição do segmento (opcional)
Logo abaixo do select, exibir a `description` do segmento selecionado em texto pequeno (ex.: "Salões de cabeleireiro, manicure, pedicure, sobrancelhas") pra confirmar visualmente a escolha — exatamente como aparece nos cards do Super Admin.

## Resultado

- O dropdown de Segmento em Configurações → Negócio mostra a **mesma lista completa** que o onboarding e o Super Admin.
- A escolha é persistida em `profiles.segment_id`, então a IA passa a usar o prompt do segmento certo desse workspace.
- Se o super admin adicionar/desativar segmentos, a tela atualiza sozinha sem deploy.