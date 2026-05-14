
## Objetivo

1. Em **Configurações → WhatsApp**, exibir a foto de perfil já vinculada ao número conectado e permitir **trocar a foto** — a troca aplica também na conta real do WhatsApp via Evolution API.
2. Resolver o problema de **áudio recebido não chegar** no Inbox.

---

## 1. Foto de perfil do WhatsApp na tela de Configurações

### Comportamento

- Ao abrir Configurações → WhatsApp com a instância conectada, a página mostra:
  - Avatar circular grande (96 px) com a foto atual.
  - Botão "Trocar foto" (abre file picker — JPG/PNG, ≤ 2 MB).
  - Botão "Atualizar do WhatsApp" (re-puxa a foto atual do WhatsApp real).
- Trocar foto:
  - Upload em `chat-media/avatars/{user_id}-{timestamp}.{ext}` (público).
  - Chama Evolution `POST /chat/updateProfilePicture/{instance}` com `{ picture: <url pública> }`.
  - Atualiza `profiles.avatar_url` com a nova URL.
  - Toast de sucesso e invalidação dos queries de avatar.
- Se o usuário ainda não tiver foto sincronizada, a `syncMyWhatsAppAvatar` (já existe) roda automaticamente uma vez ao abrir a tela conectada.

### Mudanças técnicas

- `src/lib/evolution.server.ts`: adicionar `evo.updateProfilePicture(name, { picture })` chamando `/chat/updateProfilePicture/{instance}`.
- `src/lib/evolution.functions.ts`: adicionar `updateMyWhatsAppAvatar` (POST, autenticado):
  - Input: `{ url: string }` (URL pública já hospedada no Storage).
  - Chama `evo.updateProfilePicture` e em sucesso atualiza `profiles.avatar_url`.
  - Retorno: `{ ok: true, url }`.
- `src/routes/_authenticated.settings.whatsapp.tsx`:
  - Buscar `profiles.avatar_url` do usuário (query nova ou via hook existente).
  - Renderizar bloco "Foto do perfil" dentro do card quando `status === "connected"`.
  - Input file oculto + botão "Trocar foto"; ao escolher arquivo: upload no bucket `chat-media`, depois chama `updateMyWhatsAppAvatar`.
  - Botão "Atualizar do WhatsApp" reusa `syncMyWhatsAppAvatar` (já existe — apenas reposicionar a UI).
  - `useEffect` opcional: se conectado e `avatar_url` é null, dispara `syncMyWhatsAppAvatar` uma vez.

---

## 2. Áudio recebido não chega

### Diagnóstico atual

Logs em produção mostram que `messages.upsert` chega com `messageType` no payload, mas o log adicional `[evolution upsert] msg type` não aparece — sugere que ou (a) o build atual em prod ainda não tem esse log, ou (b) `detectMediaNode` retorna null porque a estrutura de `m.message` para áudio difere do esperado (Baileys às vezes envelopa em `audioMessage`/`pttMessage` dentro de wrappers diferentes).

### Mudanças

- `src/routes/api/public/evolution.$instanceId.ts`:
  - Trocar o log condicional por um log **sempre** dentro do loop, mostrando `messageType`, chaves de `m.message` e o resultado de `detectMediaNode` — isso garante diagnóstico mesmo em mensagens de texto.
  - Estender `detectMediaNode` para considerar:
    - `m.messageType === "audioMessage" | "pttMessage"` quando `m.message` está vazio (alguns webhooks da Evolution mandam só `messageType` + payload achatado em `m`).
    - Fallback: se `messageType` indica áudio mas `detectMediaNode(m.message)` retornou null, tratar como `kind: "audio"` com `node = m.message?.audioMessage ?? m.message?.pttMessage ?? m`.
  - Em `downloadInboundMedia`, adicionar mais um padrão de body: `{ key: m.key, message: m.message }` (sem o wrapper `message:`), que é a forma aceita por algumas versões da Evolution v2.x.
  - Em caso de falha de download, ainda inserir a mensagem com `message_type = "audio"` (já é o comportamento atual) e gravar a URL `null` — assim o usuário vê o balão correto e o motivo aparece nos logs.

### Validação

- Após deploy, pedir ao usuário para enviar um áudio de outro WhatsApp para o número conectado.
- Inspecionar logs (`server-function-logs search="upsert msg type"`) para confirmar `detected.kind = "audio"` e ver se `downloadInboundMedia` retornou conteúdo.
- Se o áudio chegar com `media_url` preenchida, o player no Inbox renderiza normalmente (a UI já está pronta).

---

## Arquivos alterados

- `src/lib/evolution.server.ts` — `evo.updateProfilePicture` + ajuste opcional em `downloadInboundMedia`.
- `src/lib/evolution.functions.ts` — server fn `updateMyWhatsAppAvatar`.
- `src/routes/api/public/evolution.$instanceId.ts` — `detectMediaNode` mais robusto + log sempre presente.
- `src/routes/_authenticated.settings.whatsapp.tsx` — UI de avatar (mostrar, trocar, ressincronizar).

Sem mudanças em outras áreas do app.
