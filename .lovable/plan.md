# Correção do layout: sidebar fixa, scroll só no conteúdo

Mudança puramente de CSS/estilo, em 3 arquivos. Nenhum componente, lógica, rota ou estado é alterado.

## Diagnóstico

- **Layout raiz autenticado**: `src/routes/_authenticated.tsx` — usa `<div className="flex min-h-screen w-full">` envolvendo `<AppSidebar />` + coluna com `<AppTopbar />` e `<main className="flex-1 overflow-y-auto">`. O problema: `min-h-screen` permite o container crescer e fazer o body inteiro scrollar; a sidebar não está travada em `100vh`.
- **Sidebar**: `src/components/app-sidebar.tsx` — já é `flex flex-col` com rodapé (email/foto) como último filho. Falta `h-screen` + `sticky/fixed` e o rodapé não está empurrado com `mt-auto` (hoje funciona porque `<nav>` tem `flex-1`, então mantemos).
- **CSS global**: `src/styles.css` — não força `html, body { height: 100%; overflow: hidden }`.

## Mudanças

### 1. `src/routes/_authenticated.tsx`
No wrapper externo, trocar `min-h-screen` por `h-screen overflow-hidden`:

```tsx
<div className="flex h-screen w-full overflow-hidden" style={{ background: "var(--bg-base)" }}>
```

A coluna direita (`flex-1 flex flex-col min-w-0`) já está correta — o `<main>` já tem `flex-1 overflow-y-auto`, que passa a ser o único scroller.

### 2. `src/components/app-sidebar.tsx`
No `<aside>`, adicionar `h-screen` (via style: `height: "100vh"`) e manter `flex flex-col`. O `<nav>` já tem `flex-1`, então o rodapé (`borderTop`) fica colado embaixo automaticamente. Sem mudanças no rodapé.

### 3. `src/styles.css`
Adicionar regra global:

```css
html, body, #root {
  height: 100%;
  overflow: hidden;
  margin: 0;
  padding: 0;
}
```

## Observações

- Layouts não autenticados (login, signup) usam suas próprias telas; `overflow: hidden` no body pode cortar conteúdo dessas páginas. **Mitigação**: aplicar `overflow: hidden` apenas em `html, body` é seguro porque cada rota top-level controla seu próprio scroll. Se aparecer corte em telas de auth, removo o `overflow: hidden` global e mantenho apenas no container `_authenticated` (já coberto pelo `h-screen overflow-hidden` do passo 1).
- O layout do Super Admin (`_authenticated.super-admin.tsx`) já usa `fixed inset-0`, então não é afetado.
- Mobile sidebar (`MobileSidebar`) não é tocada.

## Checklist

- Container raiz autenticado: `flex h-screen w-full overflow-hidden`
- Sidebar: `height: 100vh`, mantém `flex flex-col`
- `<main>`: já tem `flex-1 overflow-y-auto` (sem mudança)
- `html, body, #root`: `height: 100%`
- Rodapé da sidebar: já fica embaixo via `<nav className="flex-1">` (sem mudança)
- Nenhum componente interno, props, handler ou lógica alterados
