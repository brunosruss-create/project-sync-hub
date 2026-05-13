## Problema

Hoje o botão redondo verde no canto direito alterna entre Send (quando há texto) e Mic (quando vazio, com o ícone girado -90°). O usuário quer paridade visual com WhatsApp: o botão redondo deve ser **sempre Send**, e o microfone deve ser um **ícone sutil ghost** dentro da bolha, ao lado de emoji e anexo.

## Mudanças (apenas `src/features/inbox/composer.tsx`)

1. **Adicionar botão Mic ghost dentro da bolha**, depois do Paperclip e antes do textarea. Usa o mesmo `iconBtn` style de Smile/Paperclip (cor `--text-muted`, hover `--text-primary`, sem fundo). Recebe os handlers `onPointerDown/Move/Up` que hoje estão no botão redondo.

2. **Botão redondo externo vira Send puro**:
   - Remover lógica de Mic e a animação de rotação (`rotate(-90deg)`).
   - Renderizar sempre `<Send size={18} />`.
   - `aria-label="Enviar"` fixo.
   - `onClick={onSend}` direto, sem checagem `hasText`.
   - Remover `onPointerDown/Move/Up` (movem para o Mic ghost).
   - Quando `!hasText`: aplicar `opacity: 0.45` + `cursor: not-allowed` + `disabled` (mantém o botão visível mas indica que não há nada para enviar — padrão WhatsApp Web).

3. **Ajuste em `onMicPointerDown`**: remover o early-return `if (hasText) return;` — o Mic agora é um botão dedicado, sempre disponível para long-press, independente de ter texto ou não. (Comportamento: long-press grava; tap curto mostra toast "Segure para gravar".)

4. **Não mexer**: modo gravação (linha 293-353), preview de áudio, anexos, emoji, autoresize, paste — tudo permanece igual.

## Resultado visual

```
[😊] [📎] [🎤] [    Mensagem...    ]   ( ➤ )
 ghost ghost ghost   textarea          round green
```

Mic só inicia gravação via long-press (≥300ms). Send redondo sempre visível, esmaecido quando draft vazio.