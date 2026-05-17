## Objetivo

Remover qualquer exibição de emoji de serviço em toda a UI. A coluna `services.emoji` do banco permanece intacta (sem migration) — apenas paramos de ler/escrever/exibir no app.

## Mudanças

### 1. `src/routes/_authenticated.services.tsx`
- Remover o `ModalField "Ícone"` inteiro (linhas ~909–935) e o estado `emoji`/`setEmoji`.
- Remover `emoji` do payload de submit e do `draft` enviado ao Supabase.
- Remover `{service.emoji}` da listagem (linha 403).
- Remover import `PRESET_EMOJIS`.

### 2. `src/routes/_authenticated.schedule.tsx`
- Não selecionar mais `emoji` no `select(...)` e remover `emoji: s.emoji ?? "🔧"` do mapeamento.
- Remover `{service?.emoji}` dos textos em EventBlock, tooltip, painel de detalhes e dropdown de serviços (linhas ~1048, 1324, 1422, 1480, 1966).

### 3. `src/features/inbox/schedule-modal.tsx`
- Remover `emoji` do `select` e do mapeamento de serviços (linhas 84 e 100).
- Conferir se algum render usa `s.emoji` — se sim, remover.

### 4. `src/routes/book.$slug.tsx` (página pública de booking)
- Remover o `<div>{s.emoji ?? "🔧"}</div>` da listagem de serviços (linha 353).
- Remover o campo `emoji` do tipo local.

### 5. `src/routes/api/public/book.$slug.ts`
- Se devolve `emoji` no JSON da rota pública, remover do `select` e do shape de resposta para manter consistência.

### 6. `src/features/services/data.ts`
- Tornar `emoji` opcional no tipo (`emoji?: string`) ou remover do tipo. Limpar valores `emoji: "..."` dos SEEDs.
- Remover constante `PRESET_EMOJIS` se ficar sem uso.

### Substituição visual

Onde o emoji aparecia como "ícone" do serviço (lista, EventBlock, painel, página pública), usar apenas o **bullet colorido** já existente baseado em `service.color` — sem trocar por outro ícone. Em texto inline (ex.: `{emoji} {name}`) o emoji simplesmente some, ficando só o nome.

## Fora do escopo
- Sem migration SQL (coluna `emoji` continua na tabela).
- Sem mexer em ícones de UI (lucide) ou em emojis fora de "serviços".

## Arquivos afetados
- `src/routes/_authenticated.services.tsx`
- `src/routes/_authenticated.schedule.tsx`
- `src/features/inbox/schedule-modal.tsx`
- `src/routes/book.$slug.tsx`
- `src/routes/api/public/book.$slug.ts`
- `src/features/services/data.ts`
