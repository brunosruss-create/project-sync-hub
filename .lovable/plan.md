## Diagnóstico

O problema está no cálculo de horário em `src/lib/ai-respond.server.ts`.

A tela de Configuração da IA salva os dias como:

```text
monday, tuesday, wednesday, thursday, friday, saturday, sunday
```

Mas a função `isWithinHours()` usa `Intl.DateTimeFormat(... weekday: "long")`. Em runtime, isso pode retornar variações como `Monday`/`segunda-feira` dependendo do ambiente/locale, e o código procura essa string diretamente dentro de `ai_working_hours`. Quando a chave não bate, ele cai aqui:

```ts
if (!cfg || !cfg.enabled) return false;
```

Resultado: mesmo com sexta/sábado até `23:00`, o sistema pode não encontrar `friday`/`saturday` corretamente e manda a mensagem de fora do horário.

Também existe uma segunda inconsistência: Configuração do Negócio usa chaves curtas (`mon`, `tue`, etc.) com campo `active`; Configuração da IA usa chaves longas (`monday`, `tuesday`, etc.) com campo `enabled`. Hoje o respondedor da IA só entende o formato da IA.

## Plano de correção

1. **Blindar o cálculo de horário da IA** em `src/lib/ai-respond.server.ts`:
   - trocar a detecção por nome de dia para um índice numérico confiável;
   - mapear o dia atual diretamente para `sunday/monday/...`;
   - aceitar também `mon/tue/...` como fallback;
   - aceitar tanto `enabled` quanto `active` para compatibilidade;
   - tratar horários no formato `HH:mm` de forma segura.

2. **Corrigir limite final do horário**:
   - manter `23:00` como válido até `23:00` inclusive;
   - evitar falso “fora do horário” por parse incorreto de hora, timezone ou chave de dia.

3. **Opcionalmente alinhar fallback com horário do negócio**:
   - se `ai_working_hours` estiver vazio/nulo, usar `business_hours` antes de considerar sempre aberto;
   - isso faz Configuração do Negócio e Configuração da IA trabalharem juntas sem quebrar quem já configurou horário específico da IA.

4. **Adicionar logs mínimos de diagnóstico** quando cair fora do horário:
   - dia resolvido;
   - hora atual em minutos;
   - timezone usado;
   - configuração encontrada para o dia.

Isso deixa o comportamento cirúrgico: se a IA está configurada até `11:00 PM`, ela só responderá “fora do horário” depois desse limite real no fuso selecionado.