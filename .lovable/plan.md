## Problema

No refresh da página `/inbox`, manager só vê as conversas atribuídas a ele (aba "Meus"), em vez de "Todos". Não é RLS — é UI.

Em `src/routes/_authenticated.inbox.tsx`:

```ts
const { isAgent } = useRole();
const [filter, setFilter] = React.useState<Filter>(isAgent ? "mine" : "all");
```

`useRole()` devolve `"agent"` como default enquanto o RPC `get_my_role` carrega (fail-closed). No primeiro render após refresh:
- `isAgent === true` → `filter` inicia como `"mine"`
- Quando o role real chega (`manager`), `useState` já cristalizou `"mine"` e não atualiza
- O filtro client-side esconde tudo que não está atribuído ao usuário

Quando o usuário navega para /inbox de outra rota, `useRole` está em cache (staleTime 60s), então já devolve `"manager"` no primeiro render e o filter nasce como `"all"` — por isso aparece tudo.

## Correção

1. Pegar `loading` do `useRole` também.
2. Inicializar `filter` sempre como `"all"`.
3. Adicionar um `useEffect` que, **apenas uma vez** depois de `loading` virar `false`, define `filter` para `"mine"` se for agente. Usar um `ref` para garantir que só roda na primeira vez (não sobrescrever escolha manual do usuário depois).

```ts
const { isAgent, loading: roleLoading } = useRole();
const [filter, setFilter] = React.useState<Filter>("all");
const filterInitialized = React.useRef(false);

React.useEffect(() => {
  if (roleLoading || filterInitialized.current) return;
  filterInitialized.current = true;
  if (isAgent) setFilter("mine");
}, [roleLoading, isAgent]);
```

Sem alterações em backend/RLS/SQL — o problema está só no estado inicial do filtro.

## Arquivos

- `src/routes/_authenticated.inbox.tsx` (linhas ~47–52)
