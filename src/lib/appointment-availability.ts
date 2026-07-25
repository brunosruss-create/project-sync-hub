// Disponibilidade de horários: fonte única de verdade para "esse slot está livre?".
//
// Existia uma cópia dessa lógica em cada tela (modal do Kanban/Inbox, grade da
// Agenda, prompt da IA) e elas divergiam em silêncio — o modal chegou a mostrar
// como livre um horário que a Agenda exibia ocupado. Toda superfície agora passa
// por aqui.
//
// A regra que faz isso funcionar: um horário só existe como wall-clock no fuso do
// negócio ("sábado 09:00"), mas o banco guarda instantes UTC. Comparar os dois
// direto só acerta quando o navegador está no mesmo fuso do negócio. Então tudo é
// convertido para UTC ANTES de qualquer comparação, e é o instante que entra no
// overlap, no `past` e na jornada.
//
// Módulo puro (sem I/O), no mesmo espírito de working-hours.ts.

import { zonedToUtc } from "@/features/schedule/tz";
import { isWithinWorkingHours, type NormalizedHours } from "@/lib/working-hours";

/** O mínimo que precisamos de um agendamento para saber que ele ocupa espaço. */
export type BusyAppointment = {
  id: string;
  starts_at: string | Date;
  ends_at: string | Date;
  professional_id: string | null;
};

export type SlotState = {
  /** Conflita com outro agendamento do mesmo profissional (buffer incluso). */
  busy: boolean;
  /** Já passou. */
  past: boolean;
  /** Fora da jornada do profissional — avisa, mas não bloqueia (encaixe). */
  outside: boolean;
};

/**
 * Indisponível de verdade. `outside` fica de fora de propósito: encaixe fora da
 * jornada é decisão do humano, então a UI manual só sinaliza. Quem bloqueia por
 * jornada é o caminho da IA, onde não há ninguém para decidir.
 */
export function isSlotBlocked(state: SlotState | undefined): boolean {
  return !!(state?.busy || state?.past);
}

function toMs(v: string | Date): number {
  return v instanceof Date ? v.getTime() : Date.parse(v);
}

/** "YYYY-MM-DD" + "HH:mm" lidos no fuso do negócio → instante UTC. */
export function slotToUtc(dateIso: string, time: string, tz: string): Date {
  const [y, mo, da] = dateIso.split("-").map(Number);
  const [h, mi] = time.split(":").map(Number);
  return zonedToUtc(y, mo ?? 1, da ?? 1, h ?? 0, mi ?? 0, tz);
}

/**
 * Janela [from, to) cobrindo o dia inteiro no fuso do negócio.
 *
 * Filtre com `starts_at < to AND ends_at > from` — filtrar só por `starts_at`
 * perde o atendimento que começa antes da meia-noite e atravessa para o dia
 * seguinte. O fim sai da meia-noite do dia seguinte (e não de "+24h") para o
 * dia de virada de horário de verão não ficar curto ou longo demais.
 */
export function dayWindowUtc(dateIso: string, tz: string): { from: Date; to: Date } {
  const [y, mo, da] = dateIso.split("-").map(Number);
  // Date.UTC normaliza a virada de mês/ano sozinho.
  const next = new Date(Date.UTC(y, (mo ?? 1) - 1, (da ?? 1) + 1));
  const nextIso = `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, "0")}-${String(next.getUTCDate()).padStart(2, "0")}`;
  return {
    from: slotToUtc(dateIso, "00:00", tz),
    to: slotToUtc(nextIso, "00:00", tz),
  };
}

export type ComputeSlotStatesParams = {
  /** Horários "HH:mm" a avaliar (normalmente `timeSlots(15)`). */
  slots: string[];
  /** Dia sendo exibido, "YYYY-MM-DD" no fuso do negócio. */
  dateIso: string;
  tz: string;
  /** Profissional escolhido. Vazio/null = ninguém escolhido ainda. */
  professionalId: string | null;
  /** Duração total do atendimento, em minutos. */
  blockMin: number;
  /** Maior buffer entre os serviços escolhidos — infla a janela de conflito. */
  bufferMin: number;
  busy: BusyAppointment[];
  /** Em modo edição, o próprio agendamento não conflita consigo mesmo. */
  ignoreId?: string | null;
  /** Jornada efetiva do profissional. null = sem restrição configurada. */
  hours: NormalizedHours | null;
  /** Injetável para teste. */
  now?: Date;
};

export function computeSlotStates(params: ComputeSlotStatesParams): Map<string, SlotState> {
  const { slots, dateIso, tz, blockMin, bufferMin, busy, ignoreId, hours } = params;
  const professionalId = params.professionalId || null;
  const nowMs = (params.now ?? new Date()).getTime();
  const bufferMs = Math.max(0, bufferMin) * 60_000;
  const blockMs = Math.max(0, blockMin) * 60_000;

  // Só os agendamentos do profissional escolhido disputam o horário. Sem
  // profissional definido nada é marcado como ocupado — não dá para saber a
  // agenda de quem olhar, e o formulário já exige escolher um antes de salvar.
  const taken = !professionalId
    ? []
    : busy
        .filter((b) => b.id !== ignoreId && b.professional_id === professionalId)
        .map((b) => ({ start: toMs(b.starts_at), end: toMs(b.ends_at) }))
        .filter((b) => Number.isFinite(b.start) && Number.isFinite(b.end));

  const out = new Map<string, SlotState>();
  for (const slot of slots) {
    const start = slotToUtc(dateIso, slot, tz);
    const startMs = start.getTime();
    const endMs = startMs + blockMs;
    out.set(slot, {
      busy: taken.some((b) => startMs < b.end + bufferMs && b.start < endMs + bufferMs),
      past: startMs < nowMs,
      outside: !isWithinWorkingHours(hours, start, tz, blockMin).ok,
    });
  }
  return out;
}
