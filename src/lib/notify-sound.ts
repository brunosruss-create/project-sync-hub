// Beep curto sintetizado pra notificação de mensagem nova.
//
// Sem arquivo de áudio de propósito: (a) elimina round-trip de rede, (b) não
// depende de bundler resolver asset binário, (c) é 20 linhas em vez de subir
// mp3 pro Storage. O trade-off é que fica um beep genérico — se depois quiser
// um som "de marca", basta trocar o corpo desta função.
//
// Client-only: usa AudioContext.

let ctx: AudioContext | null = null;

function getCtx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (ctx) return ctx;
  const Ctor: typeof AudioContext =
    (window as any).AudioContext || (window as any).webkitAudioContext;
  if (!Ctor) return null;
  try {
    ctx = new Ctor();
    return ctx;
  } catch {
    return null;
  }
}

/**
 * Toca um beep curto (dois tons rápidos). Best-effort — se o navegador bloquear
 * (autoplay policy antes de qualquer interação do usuário), sai silenciosamente.
 */
export function playNotifySound() {
  const audioCtx = getCtx();
  if (!audioCtx) return;
  try {
    // Alguns browsers suspendem o AudioContext até haver gesto do usuário.
    if (audioCtx.state === "suspended") {
      void audioCtx.resume().catch(() => {});
    }

    const now = audioCtx.currentTime;

    const play = (freq: number, start: number, duration: number) => {
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0, now + start);
      gain.gain.linearRampToValueAtTime(0.15, now + start + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + start + duration);
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start(now + start);
      osc.stop(now + start + duration + 0.02);
    };

    // Dois tons curtos, tipo "ding" duplo — familiar sem ser gritante.
    play(880, 0, 0.12); // A5
    play(1175, 0.09, 0.14); // D6
  } catch {
    // Silêncio: notificação nunca é motivo pra quebrar a UI.
  }
}
