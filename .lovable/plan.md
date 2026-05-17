## Objetivo

Limpar o card de serviço em `/services`: remover ícones emoji da meta, remover a barra colorida vertical ao lado do nome, e mover ações para um menu de 3 pontinhos com Editar, Arquivar e Excluir.

## Mudanças em `src/routes/_authenticated.services.tsx`

### 1. Card de serviço (`ServiceCard`)
- **Remover a barra vertical colorida** (`<div>` com `width:10, height:36, background:accent`) ao lado do nome. Manter apenas o `borderLeft: 3px solid accent` do card como indicação de categoria.
- **Header simplificado**:
  - Linha 1 (label): "Nome do serviço" em fonte pequena e muted.
  - Linha 2: nome do serviço em destaque.
  - Categoria continua abaixo (opcional manter).
- **Meta sem emojis**: remover os ícones `⏱`, `💰`, `📝`. Trocar pelo formato:
  - `Tempo: 30 min`
  - `Valor: R$ 20,00`
  - `Descrição: testando`
  - Labels em muted, valores em primary. Sem o componente `Meta` com `icon` — usar texto puro.
- **Badge de status (ATIVO)** continua no topo direito.

### 2. Ações: menu de 3 pontinhos
- Remover os botões inline "Editar" e "Arquivar" do rodapé do card.
- Adicionar botão `MoreVertical` (lucide) no topo direito do card, ao lado do badge de status (ou logo abaixo dele).
- Ao clicar, abrir um popover/menu ancorado com 3 itens, seguindo o padrão já usado em `src/routes/_authenticated.settings.professionals.tsx`:
  - **Editar** (ícone `Pencil`) → chama `onEdit`
  - **Arquivar** (ícone `Archive`) → chama `onArchive` (alterna entre ativo/inativo, comportamento atual)
  - **Excluir** (ícone `Trash2`, cor destrutiva) → chama novo `onDelete`
- Fechar menu ao clicar fora ou em um item. Usar mesmo estilo visual dos menus existentes (background `--bg-surface`, border `--border`, sombra suave).

### 3. Excluir serviço (nova funcionalidade)
- Criar função `deleteService(id)` no componente da página:
  - Abre `ConfirmDialog` (`src/components/confirm-dialog.tsx`) com título "Excluir serviço" e mensagem de confirmação.
  - Ao confirmar, `await supabase.from("services").delete().eq("id", id)`.
  - Atualiza estado local removendo o serviço da lista.
  - Toast de sucesso ou erro via `sonner`.
- Passar `onDelete` como prop para `ServiceCard`.

### 4. Limpeza
- Remover o componente auxiliar `Meta` (ou mantê-lo sem uso) — preferência: remover se não for usado em outro lugar do arquivo.
- Remover imports não usados.

## Fora do escopo
- Nenhuma alteração de schema SQL.
- Sem mexer em outras telas (agenda, página pública, modal de agendamento).
- Sem mudar cores do design system.

## Arquivos afetados
- `src/routes/_authenticated.services.tsx` (única alteração)
