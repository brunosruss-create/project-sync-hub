## Diagnóstico

### Bug 1 — Áudio enviado aparece só com "agora" (sem player)
O `sendWhatsAppAudio` (e o `sendWhatsAppMedia`) JÁ persiste corretamente no banco com `message_type: "audio"`, `media_url`, `media_mime`, `content: ""`. O problema é **100% no frontend**:

- `conversation-panel.tsx:153` — o SELECT só pega `id,direction,content,message_type,status,created_at`. Os campos `media_url, media_mime, media_name` são descartados.
- `conversation-panel.tsx:184-198` — a subscription realtime mapeia o payload ignorando os mesmos campos.
- `interface Message` (linha 40-47) não declara os campos de mídia.
- `MessageBubble` (linha 521-590) renderiza apenas `m.content`. Como `content` é `""` para áudio, sobra só o timestamp "agora".

### Bug 2 — Mídia recebida cai como "[mídia]"
No webhook `src/routes/api/public/evolution.$instanceId.ts` (linha ~95), a extração faz:
```ts
const text = m?.message?.conversation
  ?? m?.message?.extendedTextMessage?.text
  ?? m?.message?.imageMessage?.caption
  ?? m?.message?.videoMessage?.caption
  ?? "[mídia]";
```
e sempre insere com `message_type: "text"`. Quando a mensagem é `imageMessage / audioMessage / documentMessage / videoMessage / stickerMessage`, nada do binário é baixado nem persistido — só o fallback string.

## Correções (4 arquivos)

### A. `src/features/inbox/conversation-panel.tsx`
1. **Estender `interface Message`** com `media_url?: string | null`, `media_mime?: string | null`, `media_name?: string | null`.
2. **SELECT** (linha 153): adicionar `media_url,media_mime,media_name`.
3. **Mapeamento do SELECT** (160-169) e do **realtime INSERT** (190-198): incluir os 3 campos.
4. **`MessageBubble`**: antes do `{m.content}`, renderizar bloco de mídia conforme `message_type`:
   - `audio` → `<audio controls preload="metadata" src={media_url} style={{ width: '100%', maxWidth: 260 }} />`
   - `image` → `<img src={media_url}>` clicável (abre em nova aba), `max-width: 260, border-radius: 8`
   - `video` → `<video controls src={media_url} style={{ maxWidth: 260, borderRadius: 8 }} />`
   - `document` → link com ícone (FileText) + `media_name` + `Download` size, abre em nova aba
   - Renderizar `m.content` (caption) **abaixo** da mídia se não vazio.

### B. `src/lib/evolution.server.ts`
Adicionar helper `getMediaBase64(instance, messagePayload)` que faz POST em `/chat/getBase64FromMediaMessage/{instance}` com o body `{ message: { key, message } }` e devolve `{ base64, mimetype, fileName }`. Esse é o endpoint padrão da Evolution API para baixar mídia recebida (a mídia chega criptografada no webhook; precisa ser baixada via API da própria Evolution).

### C. `src/routes/api/public/evolution.$instanceId.ts`
Refatorar o branch `messages.upsert` para mensagens inbound:

1. Detectar tipo: examinar `m.message` keys → `imageMessage`, `audioMessage` (incl. `pttMessage` quando ptt=true), `videoMessage`, `documentMessage`, `stickerMessage`. Mapear para `message_type` interno (`image|audio|video|document`).
2. Se for mídia:
   - Extrair `caption`, `mimetype` e `fileName` do nó correspondente.
   - Chamar `getMediaBase64(instance, m)`.
   - `Buffer.from(base64, "base64")` → upload em `supabaseAdmin.storage.from("chat-media").upload("${owner_user_id}/inbound-${Date.now()}-${randomUUID()}.${ext}", buffer, { contentType: mimetype, upsert: false })`.
   - Pegar `getPublicUrl(path).publicUrl`.
   - INSERT em `messages` com `message_type` correto, `content: caption ?? ""`, `media_url`, `media_mime`, `media_name`.
   - Se o download falhar, cair no comportamento atual (insert com content="[mídia]" e message_type="text") + `console.error`.
3. Texto continua igual.
4. `last_message` na tabela `contacts`: usar `caption || `🎵 Áudio` / 📷 Imagem / 🎬 Vídeo / 📎 Documento` para preview legível na lista.

### D. Sem mudanças de schema
A migração `20260514130000_chat_media.sql` já criou as colunas `media_url/media_mime/media_name` e o bucket `chat-media`. O webhook usa `supabaseAdmin` (service role), então bypassa RLS do storage — não precisa policy nova.

## Notas
- Não vou tocar o composer, modo de gravação ou envio. Os bugs estão na renderização e no webhook.
- Se a Evolution responder erro 404 no endpoint `getBase64FromMediaMessage` (raro, depende da versão), o fallback `[mídia]` continua funcionando para não derrubar a recepção.