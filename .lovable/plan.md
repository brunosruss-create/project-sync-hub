## Plano

Criar as duas rotas que faltam, no mesmo padrão visual das demais (header com título + ações, filtros, tabela/cards, empty state, skeleton).

### 1. `/contacts` — Lista de Contatos do CRM

Arquivo: `src/routes/_authenticated.contacts.tsx`

- **Header**: título "Contatos" + busca (debounced 300ms) + botão "+ Novo Contato"
- **Filtros**: pílulas por coluna do kanban (Aguardando · Em atendimento · Resolvido · Urgente · Todos) e por tag
- **Tabela** (desktop) / cards (mobile): Avatar · Nome · Telefone · Última mensagem · Etiquetas · Atendente · Coluna · Última interação
  - Linhas clicam para abrir o painel de conversa (`ConversationPanel` já existe no inbox — reutilizar)
  - Scroll horizontal no mobile, primeira coluna sticky
- **Fonte de dados**: `supabase.from("contacts").select(...)`. Fallback para `MOCK_CONTACTS` de `@/features/inbox/data` se a tabela estiver vazia (mesmo padrão do inbox)
- **Loading**: `SkeletonCard` × 6
- **Empty state**: "Sua lista de contatos está vazia." + CTA "Conectar WhatsApp" → `/settings/whatsapp`
- **TanStack Query** com `staleTime: 30s` (já é o default)

### 2. `/reports` — Relatórios

Arquivo: `src/routes/_authenticated.reports.tsx`

O `/dashboard` cobre KPIs gerais. `/reports` é a versão **analítica/exportável**:

- **Header**: título "Relatórios" + filtro de período (Hoje · 7 dias · 30 dias · Customizado) + botão "Exportar CSV"
- **Abas** no topo:
  1. **Atendimento** — volume por dia (BarChart), tempo médio de resposta, taxa de resolução, distribuição por agente (tabela ranqueada)
  2. **Agendamentos** — agendamentos por dia, no-show rate, top serviços agendados, receita estimada
  3. **Serviços** — receita por serviço, ticket médio, serviços mais vendidos
  4. **Equipe** — produtividade por agente: atendimentos, tempo médio, satisfação
- Gráficos com `recharts` (já usado no dashboard)
- Loading com `SkeletonCard`; empty state quando filtro não retorna dados
- Período controlado por **search params** (`?period=7d`) com `validateSearch` + `zodValidator`+`fallback` para deep-link/refresh

### 3. Sidebar

`src/components/app-sidebar.tsx` e `src/components/mobile-sidebar.tsx`:
Trocar os destinos placeholder:

```diff
- { label: "Contatos",   to: "/dashboard", icon: Users },
- { label: "Relatórios", to: "/dashboard", icon: BarChart3 },
+ { label: "Contatos",   to: "/contacts", icon: Users },
+ { label: "Relatórios", to: "/reports",  icon: BarChart3 },
```

### 4. Command Palette

`src/components/command-palette.tsx`: adicionar entradas "Ir para Contatos" e "Ir para Relatórios" no grupo Navegar.

### 5. SQL — sem novas tabelas necessárias

Tudo lê de tabelas que já existem (`contacts`, `appointments`, `services`, `messages`). Nada de migração nesta entrega.

## Fora do escopo

- Edição inline na tabela de contatos (só visualização + abrir conversa)
- Exportar PDF (só CSV)
- Agendamento de relatórios por email
