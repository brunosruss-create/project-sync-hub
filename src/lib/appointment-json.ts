// Extrai o(s) payload(s) do bloco APPOINTMENT_JSON emitido pela IA, de forma
// resiliente. O prompt pede "no máximo 1 marcador por resposta", mas o
// modelo pode violar isso — um regex ingênuo ancorado no fim da string
// (/APPOINTMENT_JSON:(\{[\s\S]*?\})\s*$/) quebra nesse caso: o quantificador
// não-guloso continua expandindo até achar um "}" no fim, capturando um blob
// com o 2º marcador no meio, que nunca é JSON válido.
//
// Aqui, cada ocorrência do marcador vira um segmento independente (aceita
// objeto único OU array), processado isoladamente — múltiplos marcadores
// nunca corrompem uns aos outros.
export type AppointmentBatchExtraction = {
  payloads: Record<string, unknown>[];
  malformedCount: number;
  cleanedText: string;
};

export function extractAppointmentPayloads(text: string): AppointmentBatchExtraction | null {
  const marker = "APPOINTMENT_JSON:";
  const firstIdx = text.indexOf(marker);
  if (firstIdx === -1) return null;

  const idxs: number[] = [];
  let i = firstIdx;
  while (i !== -1) {
    idxs.push(i);
    i = text.indexOf(marker, i + marker.length);
  }

  const payloads: Record<string, unknown>[] = [];
  let malformedCount = 0;
  for (let k = 0; k < idxs.length; k++) {
    const start = idxs[k] + marker.length;
    const end = k + 1 < idxs.length ? idxs[k + 1] : text.length;
    const segment = text.slice(start, end).trim();
    if (!segment) continue;
    try {
      const parsed = JSON.parse(segment);
      if (Array.isArray(parsed)) payloads.push(...parsed);
      else payloads.push(parsed);
    } catch {
      malformedCount++;
    }
  }

  const cleanedText = text.slice(0, firstIdx).trim();
  return { payloads, malformedCount, cleanedText };
}
