## Causa provável

A migration rodou (tabela `professionals` criada), mas a página continua mostrando "workspace owner não encontrado". Isso vem de `getOwnerId()` em `src/lib/professionals.functions.ts`, que chama `supabase.rpc("get_my_workspace_owner")`.

A função `get_my_workspace_owner()` existe no banco e usa `coalesce(..., auth.uid())`, então em teoria sempre devolve algo. Como ela continua falhando para esse manager, o problema mais provável é uma das duas:

1. A função foi recriada por uma migration mais recente sem `grant execute ... to authenticated`, ou
2. O retorno está chegando como `null` no cliente PostgREST por causa do nome de coluna na resposta da RPC.

Em ambos os casos a correção sem risco é **parar de depender da RPC** nesse arquivo e derivar o `owner_user_id` direto da tabela `workspace_members` (que o usuário consegue ler pela política existente). Se mesmo assim não houver linha, faz fallback para `auth.uid()` (o próprio manager).

## Fix (escopo cirúrgico, 1 arquivo só)

Editar **apenas** `src/lib/professionals.functions.ts`:

- Trocar a implementação de `getOwnerId(supabase)` por uma que recebe `userId` e consulta `workspace_members` direto:

  ```ts
  async function getOwnerId(supabase: any, userId: string): Promise<string> {
    const { data, error } = await supabase
      .from("workspace_members")
      .select("workspace_owner_id")
      .eq("member_user_id", userId)
      .eq("active", true)
      .limit(1)
      .maybeSingle();
    if (error) {
      throw new Error(`Falha ao identificar workspace: ${error.message}`);
    }
    return (data?.workspace_owner_id as string) ?? userId;
  }
  ```

- Atualizar as 4 chamadas no mesmo arquivo (`listProfessionals`, `createProfessional`, `updateProfessional`, `deleteProfessional`) para passar o `userId` que já está disponível em `context`.

## Não vou tocar

- Nenhum outro arquivo do projeto.
- Schema/SQL no Supabase (a tabela e RLS já estão corretas).
- UI da página de profissionais.
- Inbox, Agenda, Equipe, WhatsApp, Serviços, Auth.

## Validação

- Recarregar `/settings/professionals` → o banner vermelho some, aparece o estado vazio.
- "Adicionar primeiro profissional" cria um registro normalmente.
