// Helpers de timezone para a Agenda.
// O Date nativo carrega apenas um instante (epoch ms). Para que a UI da agenda
// (que usa getHours/getMinutes do navegador) exiba sempre o wall-clock do
// `business_timezone`, normalizamos as datas como "phantom local": criamos um
// `new Date(y, mo-1, da, h, mi)` cujos campos coincidem com o que o relógio
// do negócio mostraria. Ao salvar, convertemos de volta para o instante UTC.

function fieldsInTz(d: Date, tz: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(d);
  const obj: Record<string, string> = {};
  for (const p of parts) obj[p.type] = p.value;
  return {
    year: Number(obj.year),
    month: Number(obj.month),
    day: Number(obj.day),
    hour: Number(obj.hour === "24" ? "0" : obj.hour),
    minute: Number(obj.minute),
    second: Number(obj.second),
  };
}

/**
 * Converte (year, month, day, hour, minute) expressos em `tz` para o instante
 * UTC equivalente. Faz uma correção iterativa pelo offset (cobre DST).
 */
export function zonedToUtc(
  year: number,
  month: number, // 1-12
  day: number,
  hour: number,
  minute: number,
  tz: string,
): Date {
  const guess = new Date(Date.UTC(year, month - 1, day, hour, minute, 0));
  const f = fieldsInTz(guess, tz);
  const asUtc = Date.UTC(f.year, f.month - 1, f.day, f.hour, f.minute, f.second);
  const offset = asUtc - guess.getTime();
  return new Date(guess.getTime() - offset);
}

/**
 * Recebe um Date (instante UTC) e retorna um Date "phantom local" cujos campos
 * (getFullYear/getMonth/getDate/getHours/getMinutes no navegador) refletem o
 * wall-clock daquele instante no `tz` fornecido.
 */
export function utcToZonedLocal(d: Date, tz: string): Date {
  const f = fieldsInTz(d, tz);
  return new Date(f.year, f.month - 1, f.day, f.hour, f.minute, 0, 0);
}

/**
 * Converte um Date "phantom local" (já com campos no tz do negócio) de volta
 * para o instante UTC, usando seus próprios campos como verdade.
 */
export function zonedLocalToUtc(d: Date, tz: string): Date {
  return zonedToUtc(
    d.getFullYear(),
    d.getMonth() + 1,
    d.getDate(),
    d.getHours(),
    d.getMinutes(),
    tz,
  );
}
