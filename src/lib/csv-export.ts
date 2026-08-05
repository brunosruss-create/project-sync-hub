// Utilitário compartilhado de exportação CSV. Concentra em um lugar só:
// - a escapada de aspas (RFC 4180)
// - o BOM UTF-8 (senão o Excel-BR lê acentos errado)
// - o `download`, evitando 5 cópias divergentes espalhadas por telas.
//
// `rows` é uma lista de objetos flat. Colunas: por default, as chaves do
// primeiro objeto — se quiser outra ordem/label, passe `columns`.

export type CsvColumn<T> = {
  header: string; // aparece no cabeçalho do CSV
  value: (row: T) => string | number | null | undefined;
};

function escape(cell: string): string {
  // RFC 4180: campos com aspas, vírgula ou quebra de linha vão entre aspas
  // duplas, com aspas internas dobradas.
  if (/[",\r\n]/.test(cell)) return `"${cell.replace(/"/g, '""')}"`;
  return cell;
}

function toCell(v: string | number | null | undefined): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "number") return Number.isFinite(v) ? String(v) : "";
  return String(v);
}

export function toCsv<T>(rows: T[], columns?: CsvColumn<T>[]): string {
  if (rows.length === 0) return "";
  const cols: CsvColumn<T>[] =
    columns ??
    Object.keys(rows[0] as any).map((k) => ({
      header: k,
      value: (r) => (r as any)[k],
    }));
  const headerLine = cols.map((c) => escape(c.header)).join(",");
  const dataLines = rows.map((r) =>
    cols.map((c) => escape(toCell(c.value(r)))).join(","),
  );
  return [headerLine, ...dataLines].join("\r\n");
}

/**
 * Dispara o download do CSV no browser. Prefixa BOM UTF-8 pra Excel-BR não
 * quebrar acentos. Retorna void — no server (SSR) é no-op silencioso porque
 * `document` não existe; a chamada acontece só depois de click do usuário.
 */
export function downloadCsv(filename: string, csv: string) {
  if (typeof document === "undefined") return;
  const bom = "\uFEFF";
  const blob = new Blob([bom + csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename.endsWith(".csv") ? filename : `${filename}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

/** Timestamp legível pra colar em nome de arquivo (evita cache no navegador). */
export function csvTimestamp(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`;
}
