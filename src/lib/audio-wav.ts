// Conversão de áudio para WAV no navegador (sem libs).
//
// Por quê: o Instagram DM (Meta) aceita apenas aac/m4a/wav/mp4. O MediaRecorder
// do Chrome grava em webm/opus, que a Meta rejeita com "This attachment format
// is not supported". WhatsApp (Cloud e Evolution) aceita opus, então só o
// Instagram precisa desta conversão. WAV é o formato mais simples de gerar sem
// dependência — decodifica o áudio gravado e reencoda como PCM 16-bit.
//
// Client-only: usa AudioContext (browser). Não importar em código de servidor.

/** Monta um Blob WAV (PCM 16-bit) a partir de um AudioBuffer decodificado. */
function encodeWav(audioBuffer: AudioBuffer): Blob {
  const numChannels = Math.min(audioBuffer.numberOfChannels, 2);
  const sampleRate = audioBuffer.sampleRate;
  const numFrames = audioBuffer.length;
  const bytesPerSample = 2; // 16-bit
  const blockAlign = numChannels * bytesPerSample;
  const dataSize = numFrames * blockAlign;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);

  const writeString = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i));
  };

  // Cabeçalho RIFF/WAVE
  writeString(0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
  writeString(8, "WAVE");
  writeString(12, "fmt ");
  view.setUint32(16, 16, true); // subchunk1 size (PCM)
  view.setUint16(20, 1, true); // audio format = PCM
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * blockAlign, true); // byte rate
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, 8 * bytesPerSample, true); // bits per sample
  writeString(36, "data");
  view.setUint32(40, dataSize, true);

  // Intercala canais e converte float [-1,1] → int16.
  const channels: Float32Array[] = [];
  for (let c = 0; c < numChannels; c++) channels.push(audioBuffer.getChannelData(c));

  let offset = 44;
  for (let i = 0; i < numFrames; i++) {
    for (let c = 0; c < numChannels; c++) {
      let sample = channels[c][i];
      sample = Math.max(-1, Math.min(1, sample));
      view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
      offset += 2;
    }
  }

  return new Blob([view], { type: "audio/wav" });
}

/**
 * Converte um blob de áudio (ex.: webm/opus do MediaRecorder) para WAV.
 * Se o navegador não conseguir decodificar (ex.: Safari com opus), lança —
 * o chamador decide o fallback.
 */
export async function blobToWav(blob: Blob): Promise<Blob> {
  const arrayBuffer = await blob.arrayBuffer();
  const Ctx: typeof AudioContext =
    (window as any).AudioContext || (window as any).webkitAudioContext;
  const ctx = new Ctx();
  try {
    // decodeAudioData aceita callback ou promise conforme o browser; embrulha.
    const audioBuffer: AudioBuffer = await new Promise((resolve, reject) => {
      ctx.decodeAudioData(arrayBuffer.slice(0), resolve, reject);
    });
    return encodeWav(audioBuffer);
  } finally {
    void ctx.close();
  }
}
