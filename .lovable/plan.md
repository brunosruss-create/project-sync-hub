## Objetivo

Áudios no modo chat (`/conversations-chat`) devem aparecer com o mesmo player rico do kanban — incluindo a foto do remetente (lead em inbound, perfil do atendente em outbound) — em vez do `<audio>` HTML nativo atual.

## Decisões confirmadas

- **Reuso por extração**: mover `AudioPlayer` + `AudioPlayerWithMe` + helper `fmtTime` para um arquivo compartilhado. O kanban passa a importar de lá (única alteração permitida fora do escopo do chat, comportamento idêntico ao atual).
- **Outbound usa perfil do usuário logado** (`useProfile`), idêntico ao kanban. Sem mudança de fonte de avatar.

## Mudanças

### 1. Criar `src/components/chat/AudioPlayer.tsx` (novo)
- Copiar literalmente `AudioPlayer`, `AudioPlayerWithMe` e a função `fmtTime` de `src/features/inbox/conversation-panel.tsx` (linhas 1185-1416).
- Imports necessários: `React`, `Mic/Play/Pause` de `lucide-react`, `ContactAvatar` (mesmo caminho atual), `useProfile` (mesmo hook atual).
- Exportar `AudioPlayerWithMe` (named export).

### 2. `src/features/inbox/conversation-panel.tsx` (kanban — refator mínimo)
- Remover as definições locais de `AudioPlayer`, `AudioPlayerWithMe` e `fmtTime`.
- Adicionar `import { AudioPlayerWithMe } from "@/components/chat/AudioPlayer";`.
- Nenhuma outra mudança. A chamada existente em ~linha 833 continua igual.

### 3. `src/components/chat/MessageBubble.tsx` (modo chat)
- Estender `ChatMessage` com dois campos opcionais: `contactName?: string` e `contactAvatar?: string | null` (preenchidos pelo `MessageThread`).
- Substituir o bloco `m.message_type === "audio"` (`<audio controls .../>`) por um wrapper estilo kanban que renderiza `<AudioPlayerWithMe src={m.media_url} contactName={m.contactName ?? ""} contactAvatar={m.contactAvatar ?? null} isMe={outbound} />` dentro de uma bolha com mesmo background suave (`color-mix(...var(--brand-400)...)` para outbound, `var(--bg-overlay)` para inbound) e mantendo o relógio + ticks no canto.
- Texto, imagem, documento e system permanecem intocados.

### 4. `src/components/chat/MessageThread.tsx` (modo chat)
- Onde monta cada `ChatMessage`, anexar `contactName: contact.name` e `contactAvatar: contact.avatar ?? null` (esses dados já existem no escopo — ver linha 222).

## Validação

- `/inbox` (kanban): áudios continuam idênticos visualmente e funcionalmente (mesmo componente, agora importado).
- `/conversations-chat`: áudios inbound mostram avatar do lead com badge de microfone; outbound mostram avatar do perfil logado. Play/pause, seek e tempo funcionam como no kanban.
- Mensagens de texto/imagem/documento/system no chat permanecem inalteradas.
- Nenhuma tabela, hook de dados, server function ou lógica de envio é tocada.

## Riscos

- Único arquivo do kanban tocado é `conversation-panel.tsx`, e apenas para trocar definição local por import — comportamento idêntico. Se preferir zero toque no kanban, a alternativa seria duplicar ~200 linhas em `src/components/chat/AudioPlayer.tsx` (já discutido e rejeitado).
