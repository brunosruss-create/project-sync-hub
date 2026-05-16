## Objetivo
Esconder o campo "Mensagem fora do horário" (textarea) na tela de configurações da IA. O checkbox "Enviar mensagem fora do horário" continua visível. A mensagem usada será a definida em **Configurações → Negócio**.

## Mudanças
**Arquivo único:** `src/routes/_authenticated.ai-agent.tsx`

1. Remover o `<Field label="Mensagem fora do horário">` (linhas ~694-700) — esconder o textarea apenas.
2. Manter o checkbox `offHoursEnabled` intacto.
3. Continuar enviando `ai_out_of_hours_message` no save (mantém valor atual no banco para compatibilidade) — sem alterar lógica de backend.

## Não muda
- `src/lib/ai-respond.server.ts` (já lê a mensagem de Negócio quando aplicável)
- `src/routes/_authenticated.settings.workspace.tsx` (Negócio continua dono da mensagem)
- Webhook, IA, transferência humana, dedup, horários — nada disso é tocado.
