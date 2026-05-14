import { MOCK_CONTACTS, type ContactCard } from "@/features/inbox/data";
import {
  SEED_SERVICES,
  SEED_CATEGORIES,
  type Service,
  type Category,
} from "@/features/services/data";

export type AppointmentStatus =
  | "scheduled"
  | "confirmed"
  | "in_progress"
  | "completed"
  | "cancelled";

export interface Agent {
  id: string;
  name: string;
  color: string;
}

export interface Appointment {
  id: string;
  contact_id: string;
  service_id: string;
  agent_id: string;
  starts_at: Date;
  ends_at: Date;
  status: AppointmentStatus;
  notes: string;
  notify_whatsapp: boolean;
}

export const STATUS_LABEL: Record<AppointmentStatus, string> = {
  scheduled: "Agendado",
  confirmed: "Confirmado",
  in_progress: "Em andamento",
  completed: "Concluído",
  cancelled: "Cancelado",
};

export const STATUS_COLOR: Record<AppointmentStatus, string> = {
  scheduled: "#3B82F6",
  confirmed: "#25C880",
  in_progress: "#F59E0B",
  completed: "#64748B",
  cancelled: "#EF4444",
};

export const MOCK_AGENTS: Agent[] = [
  { id: "a1", name: "Ana Silva", color: "#25C880" },
  { id: "a2", name: "Bruno Lima", color: "#3B82F6" },
  { id: "a3", name: "Carla Souza", color: "#F59E0B" },
  { id: "a4", name: "Diego Mendes", color: "#8B5CF6" },
];

export { MOCK_CONTACTS, SEED_SERVICES, SEED_CATEGORIES };
export type { ContactCard, Service, Category };

/* ---------------- helpers ---------------- */

export const HOUR_START = 8;
export const HOUR_END = 20;
export const SLOT_MIN = 30; // grid slot resolution
export const PX_PER_MIN = 1.4; // ~ 42px per 30min

export function startOfDay(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}
export function startOfWeek(d: Date) {
  const x = startOfDay(d);
  const day = x.getDay(); // 0=Sun
  const offset = (day + 6) % 7; // Monday-first
  x.setDate(x.getDate() - offset);
  return x;
}
export function addDays(d: Date, n: number) {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}
export function addMinutes(d: Date, n: number) {
  return new Date(d.getTime() + n * 60_000);
}
export function sameDay(a: Date, b: Date) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}
export function formatHM(d: Date) {
  return d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}
export function toDateInput(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
export function formatDateBR(iso: string): string {
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return iso;
  return `${m[3]}/${m[2]}/${m[1]}`;
}
export function parseDateBR(str: string): string | null {
  const m = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (!m) return null;
  let [, d, mo, y] = m;
  let yr = parseInt(y, 10);
  if (yr < 100) yr += 2000;
  const dn = parseInt(d, 10);
  const mn = parseInt(mo, 10);
  if (mn < 1 || mn > 12 || dn < 1 || dn > 31) return null;
  const dt = new Date(Date.UTC(yr, mn - 1, dn));
  if (dt.getUTCDate() !== dn || dt.getUTCMonth() !== mn - 1) return null;
  return `${yr}-${String(mn).padStart(2, "0")}-${String(dn).padStart(2, "0")}`;
}
export function fromDateTimeInput(date: string, time: string): Date {
  const [y, mo, da] = date.split("-").map(Number);
  const [h, mi] = time.split(":").map(Number);
  return new Date(y, (mo ?? 1) - 1, da ?? 1, h ?? 0, mi ?? 0, 0, 0);
}
export function timeSlots(stepMin = 15): string[] {
  const out: string[] = [];
  for (let h = HOUR_START; h <= HOUR_END; h++) {
    for (let m = 0; m < 60; m += stepMin) {
      if (h === HOUR_END && m > 0) break;
      out.push(`${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`);
    }
  }
  return out;
}
export function startOfMonthGrid(d: Date) {
  const first = new Date(d.getFullYear(), d.getMonth(), 1);
  return startOfWeek(first);
}
export function isPast(d: Date) {
  return d.getTime() < Date.now();
}
export function overlap(a: Appointment, b: Appointment) {
  return a.starts_at < b.ends_at && b.starts_at < a.ends_at;
}

/* ---------------- mocks ---------------- */

const today = new Date();
const at = (offsetDays: number, h: number, m = 0) => {
  const d = new Date(today);
  d.setDate(d.getDate() + offsetDays);
  d.setHours(h, m, 0, 0);
  return d;
};

const pickContactId = (i: number) =>
  MOCK_CONTACTS[i]?.id ?? MOCK_CONTACTS[i % Math.max(MOCK_CONTACTS.length, 1)]?.id ?? "unknown";

export const MOCK_APPOINTMENTS: Appointment[] = [
  {
    id: "ap1",
    contact_id: pickContactId(0),
    service_id: SEED_SERVICES[0].id,
    agent_id: "a1",
    starts_at: at(0, 9, 0),
    ends_at: at(0, 9, 30),
    status: "confirmed",
    notes: "Cliente recorrente.",
    notify_whatsapp: true,
  },
  {
    id: "ap2",
    contact_id: pickContactId(1),
    service_id: SEED_SERVICES[1].id,
    agent_id: "a2",
    starts_at: at(0, 10, 30),
    ends_at: at(0, 11, 30),
    status: "scheduled",
    notes: "",
    notify_whatsapp: true,
  },
  {
    id: "ap3",
    contact_id: pickContactId(2),
    service_id: SEED_SERVICES[2].id,
    agent_id: "a1",
    starts_at: at(0, 14, 0),
    ends_at: at(0, 14, 45),
    status: "in_progress",
    notes: "",
    notify_whatsapp: false,
  },
  {
    id: "ap4",
    contact_id: pickContactId(3),
    service_id: SEED_SERVICES[3].id,
    agent_id: "a3",
    starts_at: at(1, 11, 0),
    ends_at: at(1, 12, 30),
    status: "scheduled",
    notes: "Revisar peças com cliente antes.",
    notify_whatsapp: true,
  },
  {
    id: "ap5",
    contact_id: pickContactId(4),
    service_id: SEED_SERVICES[4].id,
    agent_id: "a4",
    starts_at: at(2, 9, 30),
    ends_at: at(2, 13, 30),
    status: "scheduled",
    notes: "",
    notify_whatsapp: true,
  },
  {
    id: "ap6",
    contact_id: pickContactId(5),
    service_id: SEED_SERVICES[0].id,
    agent_id: "a2",
    starts_at: at(3, 16, 0),
    ends_at: at(3, 16, 30),
    status: "confirmed",
    notes: "",
    notify_whatsapp: true,
  },
  {
    id: "ap7",
    contact_id: pickContactId(6),
    service_id: SEED_SERVICES[2].id,
    agent_id: "a1",
    starts_at: at(-1, 10, 0),
    ends_at: at(-1, 10, 45),
    status: "completed",
    notes: "",
    notify_whatsapp: true,
  },
  {
    id: "ap8",
    contact_id: pickContactId(7),
    service_id: SEED_SERVICES[3].id,
    agent_id: "a3",
    starts_at: at(4, 14, 30),
    ends_at: at(4, 16, 0),
    status: "scheduled",
    notes: "",
    notify_whatsapp: true,
  },
];

export const WEEKDAYS_PT = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"];
export const WEEKDAYS_PT_FULL = [
  "Segunda",
  "Terça",
  "Quarta",
  "Quinta",
  "Sexta",
  "Sábado",
  "Domingo",
];
export const MONTHS_PT = [
  "Janeiro",
  "Fevereiro",
  "Março",
  "Abril",
  "Maio",
  "Junho",
  "Julho",
  "Agosto",
  "Setembro",
  "Outubro",
  "Novembro",
  "Dezembro",
];
