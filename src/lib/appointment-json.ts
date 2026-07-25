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

/**
 * Remove QUALQUER bloco de protocolo (`*_JSON:` até o fim do texto).
 *
 * Rede de segurança de última linha: por contrato os marcadores só aparecem no
 * fim da resposta, então tudo dali pra frente é protocolo interno. Existe
 * porque um parser específico que não casa (ex.: regex que só aceitava objeto
 * e recebeu array) deixava o JSON cru — com uuids — ser enviado ao cliente no
 * WhatsApp. Nunca dependa só do parser: passe por aqui antes de responder.
 */
export function stripProtocolBlocks(text: string): string {
  return text.replace(/\s*[A-Z][A-Z_]*_JSON:[\s\S]*$/, "").trim();
}

/**
 * Extrai payloads de um marcador de protocolo, aceitando objeto único OU array,
 * e tolerando múltiplas ocorrências do mesmo marcador (cada uma é um segmento
 * independente). `cleanedText` sempre remove tudo a partir do 1º marcador —
 * mesmo quando o JSON está quebrado, o cliente nunca vê o bloco.
 */
export function extractJsonBlocks(
  text: string,
  marker: string,
): AppointmentBatchExtraction | null {
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

  // Limpa a partir do 1º marcador e ainda passa pelo scrubber genérico, caso
  // a resposta traga também um marcador de OUTRO tipo.
  const cleanedText = stripProtocolBlocks(text.slice(0, firstIdx));
  return { payloads, malformedCount, cleanedText };
}

export function extractAppointmentPayloads(text: string): AppointmentBatchExtraction | null {
  return extractJsonBlocks(text, "APPOINTMENT_JSON:");
}
