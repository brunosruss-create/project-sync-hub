// KanbanColumnId é um slug livre (string), pois colunas são dinâmicas por usuário.
export type KanbanColumnId = string;

export interface KanbanColumnDef {
  id: string;            // uuid (db) ou slug (default seed)
  slug: KanbanColumnId;
  label: string;
  emoji: string;
  color: string;
  position: number;
  is_system: boolean;
}

export interface ContactCard {
  id: string;
  name: string;
  phone: string;
  avatar?: string | null;
  lastMessage: string;
  lastMessageAt: Date;
  assignedAgent?: string | null;
  tags: string[];
  isUnread: boolean;
  unreadCount?: number;
  lastDirection?: "inbound" | "outbound" | null;
  priority: "normal" | "urgent";
  kanban_column: KanbanColumnId;
}

// Defaults aplicados quando o usuário ainda não tem colunas no banco.
// is_system = true → não podem ser deletadas pelo UI.
export const DEFAULT_COLUMNS: KanbanColumnDef[] = [
  { id: "waiting",     slug: "waiting",     label: "Aguardando",    emoji: "🟡", color: "#F59E0B", position: 0, is_system: true },
  { id: "in_progress", slug: "in_progress", label: "Em Atendimento", emoji: "🔵", color: "#3B82F6", position: 1, is_system: true },
  { id: "scheduled",   slug: "scheduled",   label: "Agendado",      emoji: "📅", color: "#25C880", position: 2, is_system: true },
  { id: "urgent",      slug: "urgent",      label: "Urgente",       emoji: "🔴", color: "#EF4444", position: 3, is_system: true },
];

// Compat: alguns lugares ainda importavam COLUMNS / COLUMN_COLOR.
// Mantidos como fallback estático — o estado real vem do Supabase.
export const COLUMNS = DEFAULT_COLUMNS;
export const COLUMN_COLOR: Record<string, string> = Object.fromEntries(
  DEFAULT_COLUMNS.map((c) => [c.slug, c.color]),
);

export const COLUMN_PALETTE = [
  "#F59E0B", "#3B82F6", "#25C880", "#EF4444",
  "#8B5CF6", "#EC4899", "#14B8A6", "#6B7280",
];

export const EMOJI_SUGGESTIONS = [
  "📌","🟡","🔵","🟢","🔴","🟣","⭐","📅","💬","🔥","🚀","✅","⏰","💼","🎯","👀",
];

const now = Date.now();
const min = (n: number) => new Date(now - n * 60_000);
const hr = (n: number) => new Date(now - n * 3_600_000);
const day = (n: number) => new Date(now - n * 86_400_000);

export const MOCK_CONTACTS: ContactCard[] = [
  { id: "c1", name: "Marina Costa", phone: "+55 11 99876-1122", lastMessage: "Boa tarde! Tudo bem? Vi o anúncio e queria saber mais.", lastMessageAt: min(3), assignedAgent: null, tags: ["Site", "Estética"], isUnread: true, priority: "normal", kanban_column: "waiting" },
  { id: "c2", name: "Roberto Lima", phone: "+55 21 98432-7710", lastMessage: "Ainda dá pra agendar pra amanhã de manhã?", lastMessageAt: min(12), tags: ["Recorrente"], isUnread: true, priority: "normal", kanban_column: "waiting" },
  { id: "c10", name: "Thiago Nogueira", phone: "+55 11 98765-9988", lastMessage: "GENTE PRECISO MUITO DE AJUDA AGORA, sistema parou!!!", lastMessageAt: min(1), tags: ["VIP", "Suporte"], isUnread: true, priority: "urgent", kanban_column: "urgent" },
];

export function formatRelative(date: Date) {
  const diff = (Date.now() - date.getTime()) / 1000;
  if (diff < 60) return "agora";
  if (diff < 3600) return `há ${Math.floor(diff / 60)}min`;
  const today = new Date();
  const sameDay =
    date.getDate() === today.getDate() &&
    date.getMonth() === today.getMonth() &&
    date.getFullYear() === today.getFullYear();
  if (sameDay)
    return date.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  const wasYesterday =
    date.getDate() === yesterday.getDate() &&
    date.getMonth() === yesterday.getMonth() &&
    date.getFullYear() === yesterday.getFullYear();
  if (wasYesterday) return "ontem";
  const days = (today.getTime() - date.getTime()) / 86_400_000;
  if (days < 7) {
    return date.toLocaleDateString("pt-BR", { weekday: "short" }).replace(".", "");
  }
  return date.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
}

export function formatPhone(phone: string): string {
  if (!phone) return "";
  const digits = phone.replace(/\D/g, "");
  const local = digits.startsWith("55") ? digits.slice(2) : digits;
  if (local.length === 11) {
    return `(${local.slice(0, 2)}) ${local.slice(2, 7)}-${local.slice(7)}`;
  }
  if (local.length === 10) {
    return `(${local.slice(0, 2)}) ${local.slice(2, 6)}-${local.slice(6)}`;
  }
  return digits ? `+${digits}` : phone;
}

export function formatMessagePreview(
  msg: string,
  direction?: "inbound" | "outbound" | null,
): string {
  const text = (msg ?? "").trim();
  if (/^\[image\]|\.(png|jpe?g|webp|gif)$/i.test(text)) return "📷 Imagem";
  if (/^\[audio\]|\.(ogg|mp3|m4a|wav)$/i.test(text)) return "🎙️ Mensagem de voz";
  if (/^\[file\]|\.(pdf|docx?|xlsx?|zip)$/i.test(text)) return "📄 Documento";
  if (direction === "outbound") return `Você: ${text}`;
  return text;
}

export function initials(name: string) {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p.charAt(0).toUpperCase())
    .join("");
}

// Slugify simples para criar slug a partir do label
export function slugify(label: string): string {
  return (label || "")
    .toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40) || `col_${Math.random().toString(36).slice(2, 7)}`;
}
