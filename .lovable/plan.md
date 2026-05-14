## Problemas

1. **Áudio recebido vira "[mídia]"** — o webhook da Evolution recebe o áudio mas armazena como mensagem de texto com preview `[mídia]`, em vez de salvar como `message_type: "audio"` com player.
2. **Áudio enviado mostra a foto do contato** — o `AudioPlayer` no balão sempre usa o avatar do contato, mesmo quando a mensagem é minha (`isMe=true`).

## Causa

### Problema 1 — `src/routes/api/public/evolution.$instanceId.ts`
- `detectMediaNode()` (linhas 21-32) só olha campos no nível raiz de `m.message`. A Evolution frequentemente embrulha áudios PTT do WhatsApp em wrappers como `ephemeralMessage.message.audioMessage`, `viewOnceMessage.message.audioMessage`, `viewOnceMessageV2.message.audioMessage` ou `messageContextInfo` — nesses casos retorna `null` e cai no caminho de texto, gerando o preview `[mídia]`.
- Se a detecção funciona mas `downloadInboundMedia` falha (ex.: endpoint base64 da Evolution retorna vazio), o código mantém `mediaType="text"` e também grava `[mídia]`, perdendo a informação de que era áudio.

### Problema 2 — `src/features/inbox/conversation-panel.tsx` (linhas 807-812)
- O `<AudioPlayer>` recebe sempre `avatarName={contactName}` e `avatarUrl={contactAvatar}`. Não há ramificação para usar o avatar do usuário logado quando `isMe=true`.

## Correções

### 1. Detectar mais formatos de áudio inbound
Em `src/routes/api/public/evolution.$instanceId.ts`:
- Refatorar `detectMediaNode` para desembrulhar recursivamente envelopes comuns: `ephemeralMessage.message`, `viewOnceMessage.message`, `viewOnceMessageV2.message`, `viewOnceMessageV2Extension.message`, `editedMessage.message`, `protocolMessage.editedMessage`, ignorando `messageContextInfo`.
- Reconhecer também `audioMessage` com flag `ptt: true` (já cai em `audio`, ok) e o campo legado `pttMessage`.

### 2. Não regredir para texto quando detecção foi bem-sucedida
Ainda em `evolution.$instanceId.ts`, no bloco `if (detected) { ... }`:
- Mesmo se o download/upload falhar, definir `mediaType = detected.kind` e `mediaMime = declaredMime` para que a mensagem seja gravada como `audio` (sem `media_url`). Assim o preview vira "🎵 Áudio" em vez de "[mídia]" e dá pra reprocessar depois.

### 3. Avatar correto no player de áudio
Em `src/features/inbox/conversation-panel.tsx`:
- Importar `useProfile` de `@/hooks/use-profile` no componente que renderiza o balão de áudio (ou propagar via prop a partir do `ConversationPanel`).
- No bloco do áudio (linhas 807-812), passar `avatarName` e `avatarUrl` condicionalmente:
  - `isMe ? (profile?.full_name ?? "Eu") : contactName`
  - `isMe ? (profile?.avatar_url ?? null) : (contactAvatar ?? null)`

## Fora do escopo

- Não mexer no envio (composer, forward-modal) nem em outras mensagens além das duas correções acima.
- Não alterar estilos/cores do balão de áudio.
