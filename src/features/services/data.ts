export type ServiceStatus = "active" | "inactive" | "draft";

export interface Category {
  id: string;
  name: string;
  color: string;
}

export interface Service {
  id: string;
  category_id: string;
  name: string;
  description: string;
  price_cents: number;
  duration_minutes: number;
  color: string;
  status: ServiceStatus;
  created_at: Date;
}

export const PRESET_COLORS = [
  "#25C880",
  "#3B82F6",
  "#F59E0B",
  "#EF4444",
  "#8B5CF6",
  "#EC4899",
  "#14B8A6",
  "#64748B",
];

export const SEED_CATEGORIES: Category[] = [
  { id: "cat-1", name: "Revisão", color: "#25C880" },
  { id: "cat-2", name: "Elétrica", color: "#F59E0B" },
  { id: "cat-3", name: "Suspensão", color: "#3B82F6" },
  { id: "cat-4", name: "Freios", color: "#EF4444" },
  { id: "cat-5", name: "Estética", color: "#8B5CF6" },
];

export const SEED_SERVICES: Service[] = [
  {
    id: "srv-1",
    category_id: "cat-1",
    name: "Revisão de Óleo",
    description: "Troca de óleo + filtro de óleo. Verificação de níveis.",
    price_cents: 8990,
    duration_minutes: 30,
    emoji: "🛢️",
    color: "#25C880",
    status: "active",
    created_at: new Date(),
  },
  {
    id: "srv-2",
    category_id: "cat-2",
    name: "Diagnóstico Elétrico",
    description: "Análise completa do sistema elétrico com scanner.",
    price_cents: 15000,
    duration_minutes: 60,
    emoji: "⚡",
    color: "#F59E0B",
    status: "active",
    created_at: new Date(),
  },
  {
    id: "srv-3",
    category_id: "cat-3",
    name: "Alinhamento e Balanceamento",
    description: "Alinhamento computadorizado das 4 rodas + balanceamento.",
    price_cents: 12990,
    duration_minutes: 45,
    emoji: "🛞",
    color: "#3B82F6",
    status: "active",
    created_at: new Date(),
  },
  {
    id: "srv-4",
    category_id: "cat-4",
    name: "Troca de Pastilhas",
    description: "Substituição de pastilhas dianteiras com revisão dos discos.",
    price_cents: 24500,
    duration_minutes: 90,
    emoji: "🛑",
    color: "#EF4444",
    status: "active",
    created_at: new Date(),
  },
  {
    id: "srv-5",
    category_id: "cat-5",
    name: "Polimento Completo",
    description: "Polimento de pintura + cristalização. Cera de proteção.",
    price_cents: 35000,
    duration_minutes: 240,
    emoji: "✨",
    color: "#8B5CF6",
    status: "draft",
    created_at: new Date(),
  },
];

export function formatCurrencyBRL(cents: number) {
  return (cents / 100).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

export function parseCurrencyToCents(input: string): number {
  const digits = input.replace(/\D/g, "");
  if (!digits) return 0;
  return parseInt(digits, 10);
}

export function formatCurrencyInput(cents: number): string {
  const reais = cents / 100;
  return reais.toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function formatDuration(minutes: number) {
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `${h}h` : `${h}h ${m}min`;
}

export const STATUS_LABEL: Record<ServiceStatus, string> = {
  active: "Ativo",
  inactive: "Inativo",
  draft: "Rascunho",
};

export const STATUS_COLOR: Record<ServiceStatus, string> = {
  active: "#25C880",
  inactive: "#64748B",
  draft: "#F59E0B",
};
