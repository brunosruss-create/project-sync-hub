export type KanbanColumnId = "waiting" | "in_progress" | "scheduled" | "urgent";

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
  priority: "normal" | "urgent";
  kanban_column: KanbanColumnId;
}

export const COLUMNS: Array<{
  id: KanbanColumnId;
  label: string;
  emoji: string;
  color: string;
}> = [
  { id: "waiting", label: "Aguardando", emoji: "🟡", color: "#F59E0B" },
  { id: "in_progress", label: "Em Atendimento", emoji: "🔵", color: "#3B82F6" },
  { id: "scheduled", label: "Agendado", emoji: "📅", color: "#25C880" },
  { id: "urgent", label: "Urgente", emoji: "🔴", color: "#EF4444" },
];

export const COLUMN_COLOR: Record<KanbanColumnId, string> = {
  waiting: "#F59E0B",
  in_progress: "#3B82F6",
  scheduled: "#25C880",
  urgent: "#EF4444",
};

const now = Date.now();
const min = (n: number) => new Date(now - n * 60_000);
const hr = (n: number) => new Date(now - n * 3_600_000);
const day = (n: number) => new Date(now - n * 86_400_000);

export const MOCK_CONTACTS: ContactCard[] = [
  {
    id: "c1",
    name: "Marina Costa",
    phone: "+55 11 99876-1122",
    lastMessage: "Boa tarde! Tudo bem? Vi o anúncio e queria saber mais.",
    lastMessageAt: min(3),
    assignedAgent: null,
    tags: ["Site", "Estética"],
    isUnread: true,
    priority: "normal",
    kanban_column: "waiting",
  },
  {
    id: "c2",
    name: "Roberto Lima",
    phone: "+55 21 98432-7710",
    lastMessage: "Ainda dá pra agendar pra amanhã de manhã?",
    lastMessageAt: min(12),
    tags: ["Recorrente"],
    isUnread: true,
    priority: "normal",
    kanban_column: "waiting",
  },
  {
    id: "c3",
    name: "Patrícia Andrade",
    phone: "+55 31 99102-3344",
    lastMessage: "Preciso remarcar minha consulta, dá pra ajudar?",
    lastMessageAt: min(28),
    tags: ["Atendimento"],
    isUnread: false,
    priority: "normal",
    kanban_column: "waiting",
  },
  {
    id: "c4",
    name: "Diego Marques",
    phone: "+55 41 99887-2200",
    lastMessage: "Tô finalizando o pagamento, pode confirmar?",
    lastMessageAt: min(2),
    assignedAgent: "Ana",
    tags: ["Pagamento"],
    isUnread: true,
    priority: "normal",
    kanban_column: "in_progress",
  },
  {
    id: "c5",
    name: "Clara Mendes",
    phone: "+55 11 98321-5544",
    lastMessage: "Ok, te envio os documentos por aqui em seguida.",
    lastMessageAt: min(45),
    assignedAgent: "Bruno",
    tags: ["Onboarding"],
    isUnread: false,
    priority: "normal",
    kanban_column: "in_progress",
  },
  {
    id: "c6",
    name: "Felipe Tavares",
    phone: "+55 51 99765-4400",
    lastMessage: "Show, me chama no horário combinado.",
    lastMessageAt: hr(2),
    assignedAgent: "Ana",
    tags: ["Vendas"],
    isUnread: false,
    priority: "normal",
    kanban_column: "in_progress",
  },
  {
    id: "c7",
    name: "Larissa Souza",
    phone: "+55 27 98112-3399",
    lastMessage: "Recebi, obrigada! Tudo certo por aqui.",
    lastMessageAt: hr(5),
    assignedAgent: "Bruno",
    tags: ["NPS+"],
    isUnread: false,
    priority: "normal",
    kanban_column: "scheduled",
  },
  {
    id: "c8",
    name: "Gabriel Rocha",
    phone: "+55 11 99654-7711",
    lastMessage: "Fechamos! Pode emitir a NF nesse CNPJ aqui.",
    lastMessageAt: day(1),
    assignedAgent: "Ana",
    tags: ["Fechado"],
    isUnread: false,
    priority: "normal",
    kanban_column: "scheduled",
  },
  {
    id: "c9",
    name: "Helena Prado",
    phone: "+55 19 99320-0011",
    lastMessage: "Perfeito, ficou ótimo. Recomendo!",
    lastMessageAt: day(2),
    assignedAgent: "Bruno",
    tags: ["Indicação"],
    isUnread: false,
    priority: "normal",
    kanban_column: "scheduled",
  },
  {
    id: "c10",
    name: "Thiago Nogueira",
    phone: "+55 11 98765-9988",
    lastMessage: "GENTE PRECISO MUITO DE AJUDA AGORA, sistema parou!!!",
    lastMessageAt: min(1),
    tags: ["VIP", "Suporte"],
    isUnread: true,
    priority: "urgent",
    kanban_column: "urgent",
  },
  {
    id: "c11",
    name: "Sofia Albuquerque",
    phone: "+55 71 99876-3322",
    lastMessage: "Tem como ser hoje? É urgente, por favor.",
    lastMessageAt: min(7),
    assignedAgent: "Ana",
    tags: ["Urgente"],
    isUnread: true,
    priority: "urgent",
    kanban_column: "urgent",
  },
  {
    id: "c12",
    name: "Bruno Santos",
    phone: "+55 11 99001-7766",
    lastMessage: "Cancelaram meu atendimento e ninguém me avisou.",
    lastMessageAt: min(22),
    tags: ["Reclamação"],
    isUnread: true,
    priority: "urgent",
    kanban_column: "urgent",
  },
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
  return date.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
}

export function initials(name: string) {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p.charAt(0).toUpperCase())
    .join("");
}
