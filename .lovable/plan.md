## Plano para corrigir o QR estático do WhatsApp

O problema está claro: a tela fica em `Aguardando QR`, mas o código não muda sozinho e não existe uma ação explícita para gerar outro QR. A causa no código é que `refreshInstanceStatus` só tenta buscar novo QR quando `row.qr_code` está vazio; como o QR antigo continua salvo, o sistema apenas reapresenta a mesma imagem.

### O que vou mudar

1. **Renovar QR automaticamente quando expirar**
   - Usar `qr_expires_at` para detectar QR vencido.
   - Se estiver em `pending` e o QR estiver vencido, chamar `evo.connect(name)` e salvar um novo `qr_code` + novo `qr_expires_at`.
   - Se a Evolution não devolver QR, marcar como `error` em vez de deixar a tela congelada.

2. **Adicionar ação manual “Gerar novo QR”**
   - Na tela de WhatsApp, quando estiver `pending`, o botão principal vira “Gerar novo QR”/“Atualizar QR”.
   - Essa ação força buscar um QR novo, mesmo antes de expirar.

3. **Adicionar contador visual de expiração**
   - Mostrar algo como “QR expira em 42s”.
   - Quando chegar a zero, a UI chama a renovação automaticamente.
   - Isso evita a sensação de tela estática.

4. **Manter o fluxo atual de conectar intacto**
   - Não alterar Supabase auth.
   - Não alterar webhook.
   - Não alterar schema do banco.
   - Não mexer na lógica de envio/recebimento de mensagens.

### Arquivos envolvidos

```text
src/lib/evolution.functions.ts
  - Ajustar refreshInstanceStatus para renovar QR expirado
  - Opcionalmente aceitar forceQrRefresh para renovação manual

src/routes/_authenticated.settings.whatsapp.tsx
  - Mostrar contador regressivo
  - Trocar botão em pending para gerar/renovar QR
  - Acionar refresh automático ao expirar
```

### Resultado esperado

A tela deixa de parecer estática: o QR passa a expirar visualmente, renova sozinho e o usuário também pode gerar um novo código manualmente.