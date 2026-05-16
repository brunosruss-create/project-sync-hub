Minha opinião: adicionar apenas um botão para “desativar mensagem fora do horário” ajuda a testar, mas não resolve a causa raiz sozinho. Pelos logs, a mensagem está saindo do próprio fluxo da IA (`send_out_of_hours`) e a duplicidade vem porque duas entradas/processamentos chegam quase juntas. Então o melhor é fazer um ajuste pequeno, mas definitivo: permitir desligar o envio dessa mensagem e registrar claramente qual fonte de horário decidiu bloquear.

Plano cirúrgico:

1. Criar um controle único para a mensagem fora do horário
- Adicionar no perfil um campo booleano, por exemplo `ai_out_of_hours_enabled`, padrão `true`.
- Esse campo controla somente se a IA deve enviar a mensagem “fora do horário”.
- Não mexe na IA inteira, nem em boas-vindas, nem em atendimento normal.

2. Mostrar esse controle nas duas telas
- Em Configurações do Negócio: opção “Enviar mensagem fora do horário”.
- Em Configuração da IA: a mesma opção, lendo e salvando o mesmo campo.
- Assim, se desativar em qualquer uma das telas, a resposta automática fora do horário para de ser enviada.

3. Alterar o disparo no servidor
- Quando estiver fora do horário:
  - se `ai_out_of_hours_enabled = true`: mantém o comportamento atual e envia a mensagem.
  - se `ai_out_of_hours_enabled = false`: não envia nada e registra `skip`/motivo interno.
- Isso permite testar se a mensagem vem realmente desse ponto da IA.

4. Melhorar logs sem mudar comportamento extra
- Logar qual fonte bloqueou: `business_hours`, `ai_working_hours`, ou ambas.
- Logar o horário atual em Brasília, início/fim usados e se a mensagem estava ativada/desativada.
- Isso vai mostrar exatamente qual configuração está causando conflito.

5. Ajuste recomendado para evitar conflito permanente
- Como existem dois campos de horário (`business_hours` e `ai_working_hours`), manter as duas telas salvas separadamente é a fonte do problema.
- A correção final mais limpa é a IA usar somente `ai_working_hours` para decidir se responde fora do horário, e deixar `business_hours` apenas como horário informativo do negócio.
- Se quiser máxima segurança agora, faço primeiro o toggle + logs. Depois, com o diagnóstico confirmado, unificamos a regra.

Arquivos envolvidos:
- `supabase/manual/...`: migration para adicionar `ai_out_of_hours_enabled`.
- `src/lib/onboarding.functions.ts`: carregar/salvar o novo campo nas duas telas.
- `src/routes/_authenticated.settings.workspace.tsx`: exibir o controle em Configurações do Negócio.
- `src/routes/_authenticated.ai-agent.tsx`: exibir o controle em Configuração da IA.
- `src/lib/ai-respond.server.ts`: respeitar o controle e melhorar logs do horário.

Resultado esperado:
- Você consegue desligar só a mensagem fora do horário sem desligar a IA.
- Se ela continuar chegando mesmo desligada, saberemos que vem de outro lugar fora desse fluxo.
- Se parar, confirmamos que o conflito está no check de horário da IA e seguimos para unificar a origem dos horários.