// Mini template engine — substitui {{var}} pelos valores fornecidos.
// Variáveis ausentes viram string vazia (sem quebrar o texto).
export function renderTemplate(
  tpl: string,
  vars: Record<string, string | number | null | undefined>,
): string {
  return tpl.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, key) => {
    const v = vars[key];
    return v === null || v === undefined ? "" : String(v);
  });
}
