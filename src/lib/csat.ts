/**
 * CSAT — interpretação da resposta do cliente. Lógica pura, sem I/O.
 *
 * O cliente responde por WhatsApp em texto livre, então isto é heurística, não
 * parsing de formulário. O viés é conservador: na dúvida, `none` — devolver a
 * conversa para o fluxo normal custa uma pesquisa perdida, enquanto interpretar
 * errado grava uma nota falsa no relatório e engole uma mensagem real do
 * cliente.
 */

export type CsatParse =
  | { kind: "rating"; rating: 1 | 2 | 3 | 4 | 5 }
  /** Número reconhecido, mas fora de 1–5 (ex.: "10", "0"). */
  | { kind: "out_of_range"; value: number }
  | { kind: "none" };

/**
 * Acima disso é reclamação ou pedido, não nota. É o que separa
 * "4 mas demorou" (aceita) de um desabafo de três linhas que por acaso
 * contém um "4".
 */
const MAX_ANSWER_LEN = 40;

/**
 * Unidades que grudam em número e criariam falso positivo. "5 minutos" é o
 * caso mais provável na prática: o cliente pede um tempo e leva nota 5.
 */
const UNIT_AFTER = /^(?:\s*)(?:min|mins|minuto|minutos|h|hs|hora|horas|dia|dias|reais|real|r\$|%|km|kg|un|x)\b/i;
const CURRENCY_BEFORE = /(?:r\$|\$)\s*$/i;

const WORD_TO_RATING: Record<string, 1 | 2 | 3 | 4 | 5> = {
  um: 1,
  uma: 1,
  dois: 2,
  duas: 2,
  tres: 3,
  quatro: 4,
  cinco: 5,
};

/** Remove acento para "três" casar com "tres". */
function normalize(raw: string): string {
  return raw
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
}

function asRating(n: number): CsatParse {
  if (Number.isInteger(n) && n >= 1 && n <= 5) {
    return { kind: "rating", rating: n as 1 | 2 | 3 | 4 | 5 };
  }
  return { kind: "out_of_range", value: n };
}

export function parseCsatRating(raw: string): CsatParse {
  if (typeof raw !== "string") return { kind: "none" };
  const text = normalize(raw);
  if (!text) return { kind: "none" };
  if (text.length > MAX_ANSWER_LEN) return { kind: "none" };

  // 1) Primeiro número isolado que não seja parte de uma medida.
  const numeric = /(?:^|\D)(\d{1,3})(?=\D|$)/g;
  let m: RegExpExecArray | null;
  while ((m = numeric.exec(text)) !== null) {
    const digits = m[1];
    const start = m.index + m[0].length - digits.length;
    const before = text.slice(0, start);
    const after = text.slice(start + digits.length);
    // "5 minutos", "as 15h", "R$ 5" — número com unidade não é nota.
    if (UNIT_AFTER.test(after) || CURRENCY_BEFORE.test(before)) continue;
    return asRating(Number(digits));
  }

  // 2) Por extenso. `\b` é obrigatório: "um" aparece dentro de dezenas de
  //    palavras ("algum", "nenhum", "umidade").
  for (const [word, rating] of Object.entries(WORD_TO_RATING)) {
    if (new RegExp(`\\b${word}\\b`).test(text)) {
      return { kind: "rating", rating };
    }
  }

  // 3) Estrelas — bastante gente responde assim.
  const stars = (raw.match(/[⭐🌟★]/gu) ?? []).length;
  if (stars >= 1 && stars <= 5) {
    return { kind: "rating", rating: stars as 1 | 2 | 3 | 4 | 5 };
  }

  return { kind: "none" };
}
