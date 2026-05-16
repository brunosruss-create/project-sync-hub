Diagnóstico confirmado:
- O formato visual 24h está correto.
- A decisão de “fora do horário” acontece no servidor em `src/lib/ai-respond.server.ts`.
- Os logs mostram que o servidor já está usando `America/Sao_Paulo`, não o horário do PC.
- O problema observado foi a configuração efetiva da IA: no log, sexta estava com `endMin:1200` = `20:00`, por isso às 21:22 Brasília a IA respondeu fora do horário mesmo a tela mostrando `23:00`.

Plano de correção:
1. Ajustar somente a lógica de horário efetivo da IA em `src/lib/ai-respond.server.ts`:
   - Normalizar horários antes da comparação.
   - Continuar usando `America/Sao_Paulo` por padrão.
   - Evitar fallback para horário local do servidor/PC quando o timezone estiver ausente ou inválido.

2. Garantir prioridade correta entre horários:
   - Se `ai_working_hours` estiver salvo, usar ele.
   - Se não estiver salvo, usar `business_hours`.
   - Se a IA tiver horários antigos `20:00` mas o negócio estiver atualizado para `23:00`, alinhar a configuração efetiva para não continuar respondendo com dado antigo invisível para o usuário.

3. Melhorar logs de diagnóstico sem mudar comportamento visual:
   - Registrar `timezone`, dia, hora atual calculada em Brasília, horário de início/fim e fonte usada (`ai_working_hours` ou `business_hours`).
   - Isso confirma rapidamente se o problema é dado salvo, timezone inválido ou comparação.

4. Não mexer em layout, aparência, campos visuais ou outras partes do sistema.

Validação após implementar:
- Testar com sexta/sábado até `23:00`.
- Confirmar nos logs que `endMin` vira `1380`.
- Confirmar que às 21h/22h Brasília a IA não retorna mais `send_out_of_hours`.