## Usar o nome real do negócio no preview de `/settings/messages`

### Diagnóstico
O envio real já usa `profile.business_name` (ver `booking-confirmation.server.ts:163/191/219`). O "Salão Bela Vista" aparece **apenas** no preview porque vem do objeto `preview` em `src/lib/message-defaults.ts` (fallback fictício).

### Mudança
Em `src/routes/_authenticated.settings.messages.tsx`, ao montar as variáveis do preview, sobrescrever `negocio` com o nome real do workspace (usar o hook `useProfile` que já existe no projeto, lendo `profile.business_name`). Se vazio, manter o valor fictício do default.

Pseudo:
```ts
const { profile } = useProfile();
const previewVars = {
  ...meta.preview,
  negocio: profile?.business_name || meta.preview.negocio,
};
renderTemplate(text, previewVars);
```

### Escopo
- Apenas frontend (`_authenticated.settings.messages.tsx`).
- Sem migration, sem mudar defaults, sem mudar lógica de envio.
- Os defaults em `message-defaults.ts` continuam com "Salão Bela Vista" como fallback caso o workspace ainda não tenha nome configurado.