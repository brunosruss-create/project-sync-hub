## Diagnóstico

O problema não parece estar no componente visual do QR Code. O fluxo chega a chamar a Evolution API, mas os logs do backend mostram repetidamente:

```text
[evolution] createInstance: Forbidden
```

Isso indica que a Evolution está recusando a criação/configuração da instância antes de devolver um QR válido. Pela documentação da Evolution API, `Forbidden` em `/instance/create` normalmente significa que a chave global enviada no header `apikey` não bate com `AUTHENTICATION_API_KEY` configurada no Railway, ou que a Evolution não está aceitando essa chave como global.

Também vi um segundo problema no código: quando `/instance/create` retorna `Forbidden`, o código atual apenas registra um warning e continua tentando `/instance/connect`. Isso pode produzir uma experiência enganosa: aparece toast “Escaneie o QR Code”, mas a tela volta para “Desconectado” ou não recebe QR.

## Plano de correção

1. Corrigir o tratamento de erro em `configureEvolutionInstance`
   - Se `/instance/create` falhar com `Forbidden`, `Unauthorized`, `Missing global api key` ou erro de autenticação, interromper o fluxo imediatamente.
   - Mostrar uma mensagem clara ao usuário: a chave `EVOLUTION_API_KEY` no Lovable precisa ser exatamente a mesma de `AUTHENTICATION_API_KEY` no Railway.
   - Só ignorar erro de create quando for realmente “instância já existe”.

2. Tornar o fluxo de QR mais resiliente
   - Antes de criar de novo, consultar/fazer connect da instância existente quando possível.
   - Se a instância estiver em estado inconsistente, deletar/recriar apenas quando a API permitir.
   - Não marcar sucesso nem salvar status `pending` sem QR válido.

3. Melhorar logs seguros para diagnóstico
   - Registrar status HTTP e mensagem resumida da Evolution sem expor API keys.
   - Logar qual endpoint falhou (`create`, `connect`, `setWebhook`) para separar erro de credencial de erro de QR.

4. Melhorar feedback na tela de WhatsApp
   - Quando o backend retornar erro de credencial/configuração, exibir essa causa no toast em vez de uma mensagem genérica.
   - Evitar o estado “Escaneie o QR Code” quando nenhum QR foi realmente salvo.

5. Validação após implementar
   - Conferir logs do backend após clicar em conectar.
   - O resultado esperado é: ou aparece o QR Code, ou aparece erro explícito de credencial/configuração da Evolution.

## Ação externa necessária

Mesmo com a correção no app, se o log continuar `Forbidden`, será necessário atualizar o secret `EVOLUTION_API_KEY` no Lovable para o mesmo valor de `AUTHENTICATION_API_KEY` no Railway e garantir que `EVOLUTION_API_URL` aponte para:

```text
https://aware-love-production.up.railway.app
```