// Jornada de trabalho: normalização, herança (profissional → negócio) e
// validação de slot. Módulo puro (sem I/O) para ser testável e reutilizável
// tanto no servidor (IA, criação de agendamento) quanto na UI.
//
// Dois formatos convivem de propósito:
//   - legado (profiles.business_hours): { active|enabled, start, end } — 1 bloco/dia
//   - novo (professionals.working_hours): { active, ranges: [{start,end}] } — N blocos/dia
// Tudo é lido através de normalizeHours(), então o resto do código só conhece
// o formato novo e o legado nunca precisou ser migrado no banco.

export type TimeRange = { start: string; end: string };
export type NormalizedDay = { active: boolean; ranges: TimeRange[] };
/** Chaveado por "mon".."sun". Dia ausente = não trabalha. */
export type NormalizedHours = Record<string, NormalizedDay>;

/** Formato aceito na entrada — legado, novo, ou mistura. */
export type RawDay = {
  enabled?: boolean;
  active?: boolean;
  start?: string;
  end?: string;
  ranges?: TimeRange[];
};
export type RawHours = Record<string, RawDay> | null | undefined;

/** Ordem canônica da semana, começando na segunda (como a UI mostra). */
export const DAY_ORDER = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;
export type DayKey = (typeof DAY_ORDER)[number];

export const DAY_LABEL: Record<DayKey, string> = {
  mon: "Seg",
  tue: "Ter",
  wed: "Qua",
  thu: "Qui",
  fri: "Sex",
  sat: "Sáb",
  sun: "Dom",
};

// Aceita as várias grafias que já circulam no banco/prompt (pt e en, curto e longo).
const DAY_ALIASES: Record<string, DayKey> = {
  sunday: "sun", sun: "sun", dom: "sun", domingo: "sun",
  monday: "mon", mon: "mon", seg: "mon", segunda: "mon", "segunda-feira": "mon",
  tuesday: "tue", tue: "tue", ter: "tue", terca: "tue", "terça": "tue",
  "terca-feira": "tue", "terça-feira": "tue",
  wednesday: "wed", wed: "wed", qua: "wed", quarta: "wed", "quarta-feira": "wed",
  thursday: "thu", thu: "thu", qui: "thu", quinta: "thu", "quinta-feira": "thu",
  friday: "fri", fri: "fri", sex: "fri", sexta: "fri", "sexta-feira": "fri",
  saturday: "sat", sat: "sat", sab: "sat", "sábado": "sat", sabado: "sat",
};

/** Índice de Date.getDay() (0=domingo) → chave canônica. */
const INDEX_TO_DAY: DayKey[] = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];

export function parseHM(v: string | undefined | null): number | null {
  if (!v || typeof v !== "string") return null;
  const m = v.trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

function normalizeRange(r: TimeRange): TimeRange | null {
  const start = parseHM(r?.start);
  // "até 00:00" é ambíguo (meia-noite = início ou fim do dia?) — trata como
  // fim do dia, mesma convenção que a tela Negócio já aplica ao carregar.
  const rawEnd = r?.end === "00:00" ? "23:59" : r?.end;
  const end = parseHM(rawEnd);
  if (start === null || end === null) return null;
  if (end <= start) return null;
  return { start: r.start.trim(), end: (rawEnd as string).trim() };
}

/**
 * Converte qualquer formato aceito para o formato normalizado.
 * Devolve null quando não há nada configurado (nunca um objeto vazio) — é isso
 * que permite `effectiveHours` distinguir "não configurado" de "não trabalha".
 */
export function normalizeHours(raw: RawHours): NormalizedHours | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const entries = Object.entries(raw);
  if (entries.length === 0) return null;

  const out: NormalizedHours = {};
  for (const [rawKey, cfg] of entries) {
    const key = DAY_ALIASES[String(rawKey).toLowerCase().trim()];
    if (!key || !cfg || typeof cfg !== "object") continue;

    // `enabled` e `active` coexistem no banco — ausência de ambos = inativo.
    const active = cfg.active ?? cfg.enabled ?? false;

    let ranges: TimeRange[] = [];
    if (Array.isArray(cfg.ranges)) {
      ranges = cfg.ranges.map(normalizeRange).filter((r): r is TimeRange => r !== null);
    } else if (cfg.start || cfg.end) {
      const single = normalizeRange({ start: cfg.start ?? "", end: cfg.end ?? "" });
      if (single) ranges = [single];
    }

    ranges.sort((a, b) => (parseHM(a.start) ?? 0) - (parseHM(b.start) ?? 0));
    // Um dia "ativo" sem nenhuma faixa válida não tem como ser trabalhado.
    out[key] = { active: active && ranges.length > 0, ranges };
  }

  return Object.keys(out).length > 0 ? out : null;
}

/**
 * Jornada efetiva de um profissional: a própria quando configurada, senão a do
 * negócio (herança). NULL em ambos = sem restrição configurada.
 */
export function effectiveHours(
  professionalHours: RawHours,
  businessHours: RawHours,
): NormalizedHours | null {
  return normalizeHours(professionalHours) ?? normalizeHours(businessHours);
}

/** Dia da semana + minutos desde a meia-noite, no fuso do negócio. */
function zonedParts(date: Date, tz: string): { day: DayKey; minutes: number } {
  let parts: Record<string, string>;
  try {
    const dtf = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      hour12: false,
      weekday: "short",
      hour: "2-digit",
      minute: "2-digit",
    });
    parts = Object.fromEntries(
      dtf
        .formatToParts(date)
        .filter((p) => p.type !== "literal")
        .map((p) => [p.type, p.value]),
    );
  } catch {
    // Fuso inválido: cai pro horário local em vez de explodir.
    return {
      day: INDEX_TO_DAY[date.getDay()],
      minutes: date.getHours() * 60 + date.getMinutes(),
    };
  }
  const wd: Record<string, DayKey> = {
    Sun: "sun", Mon: "mon", Tue: "tue", Wed: "wed", Thu: "thu", Fri: "fri", Sat: "sat",
  };
  const day = wd[parts.weekday] ?? INDEX_TO_DAY[date.getDay()];
  // en-US com hour12:false devolve "24" para meia-noite.
  const hour = parts.hour === "24" ? 0 : Number(parts.hour);
  return { day, minutes: hour * 60 + Number(parts.minute) };
}

export type WithinResult =
  | { ok: true }
  | { ok: false; reason: "day_off" | "outside_ranges" };

/**
 * O atendimento INTEIRO (início + duração) cabe dentro de uma única faixa do
 * dia? Precisa caber inteiro: começar 17:30 um serviço de 1h num expediente que
 * fecha 18:00 deve ser recusado.
 *
 * `hours` null = nada configurado → permite (não inventa restrição).
 *
 * Ponto de extensão: exceções por data (férias/feriado) entram aqui, checadas
 * antes da jornada semanal.
 */
export function isWithinWorkingHours(
  hours: NormalizedHours | null,
  startsAt: Date,
  tz: string,
  durationMinutes: number,
): WithinResult {
  if (!hours) return { ok: true };
  const { day, minutes } = zonedParts(startsAt, tz);
  const cfg = hours[day];
  if (!cfg || !cfg.active || cfg.ranges.length === 0) return { ok: false, reason: "day_off" };

  const endMinutes = minutes + Math.max(0, durationMinutes);
  for (const r of cfg.ranges) {
    const rs = parseHM(r.start);
    const re = parseHM(r.end);
    if (rs === null || re === null) continue;
    if (minutes >= rs && endMinutes <= re) return { ok: true };
  }
  return { ok: false, reason: "outside_ranges" };
}

/**
 * Resumo legível da jornada, agrupando dias com o mesmo horário.
 * Ex.: "Seg, Ter, Qua 09:00–12:00 e 14:00–18:00; Sáb 09:00–13:00".
 * Usado no prompt da IA e na UI de Profissionais.
 */
export function describeHours(hours: NormalizedHours | null): string {
  if (!hours) return "";
  const groups = new Map<string, DayKey[]>();
  for (const day of DAY_ORDER) {
    const cfg = hours[day];
    if (!cfg?.active || cfg.ranges.length === 0) continue;
    const sig = cfg.ranges.map((r) => `${r.start}–${r.end}`).join(" e ");
    const list = groups.get(sig) ?? [];
    list.push(day);
    groups.set(sig, list);
  }
  if (groups.size === 0) return "";
  return [...groups.entries()]
    .map(([sig, days]) => `${days.map((d) => DAY_LABEL[d]).join(", ")} ${sig}`)
    .join("; ");
}
