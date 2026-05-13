# Composer estilo WhatsApp — tarefas restantes

Item 1 (scrollbar nativa) já está feito. Abaixo só o que falta.

## Tarefas

1. **Redesign visual do `Composer`** (`src/features/inbox/conversation-panel.tsx`)
   - Container externo flex `align-items: flex-end`, padding `10px 12px`, gap 8px.
   - "Balão" interno: `bg-overlay`, `border-strong`, `border-radius: 24px`, padding `8px 14px`, min-height 40px.
   - Textarea sem borda, transparente, `min-height: 20px`, `max-height: 120px`, placeholder simples "Mensagem".
   - Botões `Smile` e `Paperclip` à esquerda dentro do balão (20px, `text-muted` → `text-primary` no hover).
   - Botão circular 40px à direita (`brand-400`, hover `brand-600` + `scale(1.05)`, active `scale(0.95)`).
   - Auto-resize já existente continua funcionando.

2. **Botão dinâmico Mic ↔ Send**
   - Estado derivado `hasText = draft.trim().length > 0`.
   - Vazio → ícone `Mic`. Com texto → ícone `Send` com transição (rotate/scale 150ms).
   - Click no Send dispara `send()`. Mic entra na lógica do item 5.

3. **Emoji picker** (nova dependência)
   - `bun add @emoji-mart/react @emoji-mart/data`.
   - Estado `showEmojiPicker`. Abre acima do composer (`position: absolute; bottom: 100%`).
   - Inserir emoji na posição do cursor (`selectionStart/End`), reposicionar cursor, manter foco.
   - Não fecha ao selecionar; fecha em Escape ou click-fora (listener no document).
   - Tema `dark`, locale `pt`, sem preview/skin tone.

4. **Menu de anexos + preview**
   - Popover acima do composer com 3 botões circulares (Imagem roxo, Documento azul, Câmera vermelho).
   - `<input type="file" hidden>` configurado conforme opção (accept/multiple/capture).
   - Ao selecionar arquivo, fechar menu e abrir **AttachmentPreview** acima do composer:
     - Imagens → thumbnail via `URL.createObjectURL`.
     - Outros → ícone do tipo + nome + tamanho.
     - Múltiplos → grid (máx 4 + "+N").
     - Campo "Adicionar legenda".
     - Botões `[✕]` cancelar e `▶` enviar.
   - Envio: por enquanto chamar `toast.info("Anexo — em breve")` e limpar (backend de upload não está no escopo desta UI).

5. **Gravação de áudio (long-press no Mic)**
   - Long-press ≥300ms inicia `MediaRecorder` (`audio/webm`); tap curto mostra toast "Segure para gravar".
   - Modo gravação substitui o composer: botão lixeira, indicador `●●` pulsante vermelho, timer `m:ss`, waveform simples animado, botão "soltar para enviar".
   - Deslizar para esquerda (`pointermove` >80px) cancela e descarta.
   - Soltar → para gravação, abre **AudioPreview** (player com play/pause, waveform, duração, lixeira, enviar).
   - Limite 5 min com auto-stop.
   - Erro de permissão → `toast.error`.
   - Envio efetivo: stub com toast "Áudio — em breve".

6. **Atalhos extras no textarea**
   - Manter Enter envia / Shift+Enter quebra.
   - Escape fecha emoji picker / menu de anexos / preview se algo aberto; senão fecha o painel (`onClose`).
   - `paste` de imagem → abrir AttachmentPreview com o blob (e `preventDefault`).

7. **Limpeza do painel de chat**
   - Auditar `ConversationPanel` por qualquer `<nav>` ou barra de navegação interna além de Header + Tabs + Body + Composer. Hoje o arquivo só tem esses 4 — confirmar e remover qualquer extra que apareça (placeholder "digitando", barras decorativas, etc.).
   - Garantir tabs em 36px com estilos especificados (atualmente ~40px com padding `10px 12px` — ajustar para `height: 36px`, `bg-overlay`).

## Detalhes técnicos

- Toda mudança fica isolada em `src/features/inbox/conversation-panel.tsx` + 2 novos arquivos:
  - `src/features/inbox/composer.tsx` — extrai/re-escreve `Composer` com toda a lógica nova (emoji, anexos, gravação).
  - `src/features/inbox/attachment-preview.tsx` — preview de arquivos/áudio.
- Hook utilitário `useClickOutside` inline ou em `src/hooks/use-click-outside.ts`.
- CSS adicional em `src/styles.css`: animação pulse vermelho do indicador de gravação e barras de waveform.
- Não tocar em: lógica de `send`, realtime de `messages`, Evolution, tabs `contact/services/history`, ScheduleModal, drag-and-drop, kanban, badges.

## Não-regressão a validar ao final

Enter envia · sem duplicação · realtime · DnD kanban · painel abre/fecha · todas as tabs · ScheduleModal · dark mode · badge não lidas · textarea sem scrollbar · botão circular verde · troca Mic↔Send · emoji no cursor · paste de imagem.
