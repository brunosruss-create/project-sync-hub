## Diagnóstico

O problema não parece ser ausência de serviços no banco: a tela de Serviços e o agendamento manual conseguem listar serviços ativos.

O ponto provável é divergência de `owner_user_id`/workspace:
- A tela de Serviços e o agendamento manual leem via cliente autenticado/RLS, usando o workspace atual.
- O link público lê via API pública/admin e filtra por `services.owner_user_id = profiles.id` do slug.
- Se os serviços foram criados/salvos com outro `owner_user_id` ou sem `owner_user_id`, eles aparecem na UI autenticada por fallback/RLS/seeds, mas a API pública retorna vazio.

Também há um detalhe importante: a tela de Serviços inicia com `SEED_SERVICES`, então ela pode mostrar serviços mesmo quando o banco real não retornou linhas. Já o agendamento manual também tem fallback para seeds se a consulta vier vazia. O link público não usa seed, então ele expõe só dados reais do banco.

## Plano de correção

1. **Remover a ilusão de seed como dado real nas telas críticas**
   - Ajustar a tela de Serviços para diferenciar serviços reais do banco versus exemplos/fallback.
   - Evitar que o usuário ache que serviços seed são serviços cadastrados quando eles não existem no banco.

2. **Garantir `owner_user_id` ao criar/editar serviços**
   - Na tela `/services`, usar o `workspaceOwnerId` ao inserir/atualizar serviços.
   - Enviar `owner_user_id: workspaceOwnerId` no payload quando criar serviço novo.
   - Isso alinha os serviços com o mesmo dono que o link público usa.

3. **Corrigir a API pública do link para ser tolerante com legado**
   - Manter o filtro principal por `owner_user_id = profile.id` e `status = active`.
   - Adicionar tratamento seguro para serviços antigos sem `owner_user_id` apenas se necessário, evitando expor serviços de outro workspace.
   - Aplicar a mesma regra em `info`, `slots` e `POST`, para a seleção, horários e confirmação ficarem consistentes.

4. **Adicionar migração SQL de reparo/backfill**
   - Criar SQL para diagnosticar serviços sem `owner_user_id` ou com dono divergente.
   - Criar SQL seguro para preencher `owner_user_id` dos serviços existentes quando o workspace tiver apenas um dono/for possível associar sem ambiguidade.
   - Conforme sua regra, vou mandar o SQL aberto no chat em bloco ```sql também.

5. **Melhorar mensagem quando realmente não houver serviços reais**
   - No link público, trocar a mensagem genérica por algo que indique que o estabelecimento ainda não possui serviços ativos cadastrados para agendamento.

## Arquivos previstos

- `src/routes/_authenticated.services.tsx`
- `src/features/inbox/schedule-modal.tsx` se precisar alinhar a leitura com workspace real
- `src/routes/api/public/book.$slug.ts`
- Nova migration em `supabase/manual/...sql`

## Resultado esperado

Depois de aprovado e aplicado:
- Serviços cadastrados em `/services` passam a aparecer no link público `/book/:slug`.
- O agendamento manual e o link público passam a usar a mesma fonte real de serviços.
- Serviços de exemplo não confundem mais com serviços persistidos.
- O SQL de correção/backfill fica disponível aberto para rodar no Supabase.