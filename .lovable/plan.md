## Objetivo

Adicionar comportamento de sidebar recolhível em `src/components/app-sidebar.tsx`, com toggle manual + persistência em localStorage + auto-recolher ao entrar em `/conversations-chat` (e restaurar ao sair). Tooltips do shadcn/ui aparecem nos ícones quando colapsada. Mobile sidebar permanece intocada.

## Mudanças

### 1. `src/components/app-sidebar.tsx`

**Imports adicionais:**
- `ChevronsLeft`, `ChevronsRight` de `lucide-react`.
- `Tooltip, TooltipContent, TooltipTrigger, TooltipProvider` de `@/components/ui/tooltip`.

**Estado de colapso (dentro de `AppSidebar`):**
```ts
const [isCollapsed, setIsCollapsed] = React.useState<boolean>(() =>
  typeof window !== "undefined" && localStorage.getItem("sidebar_collapsed") === "true"
);
React.useEffect(() => {
  localStorage.setItem("sidebar_collapsed", String(isCollapsed));
}, [isCollapsed]);
React.useEffect(() => {
  const handler = (e: Event) => {
    const detail = (e as CustomEvent<{ collapsed: boolean }>).detail;
    if (detail) setIsCollapsed(detail.collapsed);
  };
  window.addEventListener("sidebar:setCollapsed", handler);
  return () => window.removeEventListener("sidebar:setCollapsed", handler);
}, []);
```

**Aside:** largura dinâmica + animação:
```ts
style={{ width: isCollapsed ? 64 : 240, height: "100vh",
  background: "var(--bg-surface)", borderRight: "1px solid var(--border)",
  transition: "width 200ms ease", overflow: "hidden" }}
```

**Logo:** ocultar o `<span>ZapFlow</span>` quando `isCollapsed`. Centralizar o "Z" (`justifyContent: center` no header). Padding lateral menor quando colapsada.

**Botão toggle** (novo, logo abaixo do header do logo):
```tsx
<button onClick={() => setIsCollapsed((p) => !p)}
  title={isCollapsed ? "Expandir menu" : "Recolher menu"}
  style={{ display: "flex", alignItems: "center",
    justifyContent: isCollapsed ? "center" : "flex-end",
    width: "100%", padding: "6px 8px", background: "transparent",
    border: "none", cursor: "pointer", color: "var(--text-muted)" }}>
  {isCollapsed ? <ChevronsRight size={14} /> : <ChevronsLeft size={14} />}
</button>
```

**Workspace selector:** quando colapsada, renderizar apenas o quadrado da inicial (`{name.charAt(0)}`) centralizado em 36×36, sem o texto "Workspace pessoal" nem `ChevronsUpDown`.

**Nav items:** envolver tudo em `<TooltipProvider delayDuration={0}>`. Para cada item:
- `Link` renderiza ícone + `<span>` com `display: isCollapsed ? "none" : "inline"`.
- Quando `isCollapsed`, ajustar `paddingLeft`/`paddingRight` para centralizar o ícone (`justifyContent: center`, gap 0, padding 0 8px, sem `borderLeft` deslocando — usar `borderLeft: "2px solid transparent"` sempre, mantendo o realce ativo só pela cor de fundo quando colapsada).
- Envolver o `Link` em `<Tooltip><TooltipTrigger asChild>…</TooltipTrigger><TooltipContent side="right">{item.label}</TooltipContent></Tooltip>` apenas quando `isCollapsed`. Quando expandida, renderiza o `Link` direto (sem Tooltip) para evitar overhead/regressão.

**Rodapé do usuário:** quando `isCollapsed`, ocultar o bloco com nome + email (manter apenas o avatar/quadrado da inicial centralizado, `justifyContent: center`, sem padding lateral excessivo).

### 2. `src/routes/_authenticated.conversations-chat.tsx`

Adicionar `useEffect` no `ChatPage` que dispara o evento e restaura ao desmontar:
```ts
import { useEffect } from "react";

useEffect(() => {
  const previous = localStorage.getItem("sidebar_collapsed") ?? "false";
  localStorage.setItem("sidebar_chat_previous", previous);
  window.dispatchEvent(new CustomEvent("sidebar:setCollapsed", { detail: { collapsed: true } }));
  return () => {
    const wasCollapsed = localStorage.getItem("sidebar_chat_previous") === "true";
    window.dispatchEvent(new CustomEvent("sidebar:setCollapsed", { detail: { collapsed: wasCollapsed } }));
    localStorage.removeItem("sidebar_chat_previous");
  };
}, []);
```

## Validação

- Outras rotas (kanban, agenda, contatos, etc.): sidebar respeita estado salvo em localStorage; toggle manual funciona com animação de 200ms.
- `/conversations-chat`: ao entrar, sidebar recolhe para 64px automaticamente; ao sair (via navegação para outra rota), restaura ao estado anterior.
- Recolhida: ícones centralizados, tooltip à direita ao hover, "Z" do logo visível sem "ZapFlow", avatar do usuário visível sem nome/email.
- `mobile-sidebar.tsx`, `ChatView.tsx`, kanban e demais arquivos não são tocados.

## Riscos

- O auto-recolher usa `useEffect` sem dependências; se o componente da rota remontar (por exemplo, ao trocar `?id=`), o "previous" capturado seria sobrescrito com `true`. Mitigação: a rota usa `validateSearch` sem `key`, então a troca de `?id=` não remonta o componente — apenas atualiza o search. Caso queira garantia extra, podemos checar se `sidebar_chat_previous` já existe antes de salvar; incluo essa proteção na implementação.
