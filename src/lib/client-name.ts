// Detecta "nome" que na verdade é um parentesco/apelido genérico
// ("mãe do Bruno", "minha esposa", "filha"), em vez do nome real da pessoa.
//
// Existe porque a regra equivalente no prompt da IA não é obedecida de forma
// confiável: em produção um agendamento foi criado com client_name
// "Mãe do Bruno". Sem o nome real, a agenda do salão não identifica quem vai
// ser atendido e a confirmação sai errada. Enforcement em código é o que
// realmente garante — o prompt só pede.

const KINSHIP = new Set([
  "mae", "pai", "filho", "filha", "irmao", "irma", "esposa", "esposo",
  "marido", "mulher", "namorado", "namorada", "noivo", "noiva",
  "sogra", "sogro", "genro", "nora", "cunhado", "cunhada",
  "avo", "avoh", "vo", "voh", "neto", "neta",
  "tio", "tia", "primo", "prima", "sobrinho", "sobrinha",
  "padrasto", "madrasta", "enteado", "enteada",
  "amigo", "amiga", "colega", "vizinho", "vizinha", "chefe", "patrao",
  "companheiro", "companheira", "parceiro", "parceira",
]);

/** minúsculas, sem acento, sem pontuação, espaços colapsados. */
function normalize(v: string): string {
  return v
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * true quando o texto parece um parentesco em vez de um nome próprio.
 *
 * Pega: "mãe", "Mãe do Bruno", "minha esposa", "meu filho mais novo".
 * Não pega: "Maria", "Ana Paula", "Bruno Russo" — nomes reais passam mesmo
 * que contenham a palavra depois do início ("Ana Maria da Silva").
 */
export function looksLikeGenericName(raw: string | null | undefined): boolean {
  const s = normalize(String(raw ?? ""));
  if (!s) return false;

  // "meu/minha <qualquer coisa>" é sempre descrição, nunca nome próprio.
  const words = s.split(" ");
  if (words[0] === "meu" || words[0] === "minha") return true;

  // Parentesco na primeira palavra: "mae", "mae do bruno", "filha da ana".
  return KINSHIP.has(words[0]);
}
