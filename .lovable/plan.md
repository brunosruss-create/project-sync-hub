## Diagnóstico

O `<input type="time">` herda o formato (12h AM/PM vs 24h) do **locale do navegador/SO**, não do código. Os valores enviados pelo `onChange` (`e.target.value`) sempre vêm em `HH:mm` 24h — então **o bug visual não afeta o que é salvo no banco**. O `endMin: 1200` (=20:00) que aparece nos logs é o valor real salvo, e a função `isWithinHours` está correta.

Mesmo assim, o display em AM/PM confunde o usuário ao configurar (ele pensou que tinha salvo 23:00 quando salvou outra coisa). A correção é forçar o navegador a renderizar 24h.

## Mudanças

1. **`src/routes/_authenticated.ai-agent.tsx`** (linhas 632–648): adicionar `lang="pt-BR"` e `step={60}` nos dois `<input type="time">`.
2. **`src/routes/_authenticated.settings.workspace.tsx`** (linhas 287, 297): mesmo ajuste nos dois inputs.
3. Opcional: adicionar uma regra CSS global em `src/styles.css` escondendo `::-webkit-datetime-edit-ampm-field` como fallback para navegadores que ignoram `lang`.

## Verificação

- Abrir `/ai-agent` e `/settings/workspace` e confirmar que os horários aparecem `08:00`, `23:00` (sem AM/PM).
- Editar Sex para 23:00, salvar, e checar logs: `endMin` deve virar `1380`.
- Mandar mensagem de teste às 22:00 → IA deve responder normalmente.

## Nota técnica

Não há mudança em lógica de horário, parsing, fuso ou backend. Apenas atributos HTML/CSS de apresentação dos inputs.