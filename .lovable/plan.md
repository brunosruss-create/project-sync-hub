## Ajustar emojis dos templates padrão

Editar `src/lib/message-defaults.ts` removendo emojis dos defaults:

**`booking_confirmed`** — remover ✅, 📅, 💼, 👤 (manter 😊 do "Até lá!"):
```
Olá {{cliente}}!

Seu agendamento em *{{negocio}}* foi confirmado:

*{{data}} às {{hora}}*
{{servico}}
{{profissional}}

Até lá! 😊
```

**`booking_rescheduled`** — remover 🔄, 📅, 💼, 👤 (manter 😊):
```
Olá {{cliente}}!

Seu agendamento em *{{negocio}}* foi *reagendado*:

*{{data}} às {{hora}}*
{{servico}}
{{profissional}}

Até lá! 😊
```

**`booking_cancelled`** — remover todos os emojis (📅, 💼, 🙏):
```
Olá {{cliente}}.

Seu agendamento em *{{negocio}}* foi *cancelado*:

{{data}} às {{hora}}
{{servico}}

Caso queira remarcar, é só responder esta mensagem.
```

### Observação
Isso só altera os **defaults**. Usuários que já salvaram texto customizado em `profiles.msg_booking_*_text` continuam vendo o próprio texto — precisam clicar em "Restaurar padrão" na página `/settings/messages` para pegar a nova versão sem emojis.

Nenhuma migration SQL é necessária.