/**
 * Busca por conteúdo de mensagem, compartilhada entre as telas que listam
 * conversas. `.ilike` no client Supabase (RLS-scoped) — o escopo por
 * workspace/atendente vem da policy, não de filtro aqui.
 */

/** Mínimo de caracteres para consultar o banco — 1-2 letras trariam a base inteira. */
export const MIN_SEARCH_LEN = 3;
export const SEARCH_LIMIT = 50;

export type MessageHit = {
  id: string;
  contact_id: string;
  content: string;
  created_at: string;
  is_internal?: boolean;
};

/**
 * `%` e `_` são curingas no LIKE. Sem escapar, buscar "100%" viraria "100"
 * seguido de "qualquer coisa" e traria a base inteira.
 */
export function escapeLike(term: string): string {
  return term.replace(/[\\%_]/g, (c) => `\\${c}`);
}

/** Recorta o trecho ao redor da ocorrência, para o resultado mostrar contexto. */
export function snippet(content: string, term: string): { before: string; hit: string; after: string } {
  const idx = content.toLowerCase().indexOf(term.toLowerCase());
  if (idx < 0) return { before: content.slice(0, 90), hit: "", after: "" };
  const start = Math.max(0, idx - 30);
  return {
    before: (start > 0 ? "…" : "") + content.slice(start, idx),
    hit: content.slice(idx, idx + term.length),
    after: content.slice(idx + term.length, idx + term.length + 50),
  };
}
