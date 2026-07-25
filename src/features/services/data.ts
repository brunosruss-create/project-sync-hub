export type ServiceStatus = "active" | "inactive" | "draft";

export type PriceDisclosurePolicy = "always" | "on_request" | "never";

export type PhotoSendPolicy = "never" | "on_request" | "proactive";

export type ServicePhoto = { id: string; url: string; caption: string; mime: string };

export interface Service {
  id: string;
  name: string;
  description: string;
  price_cents: number;
  duration_minutes: number;
  buffer_minutes: number;
  color: string;
  status: ServiceStatus;
  created_at: Date;
  // null = herda a política de preço do workspace (Agente IA).
  price_disclosure_policy: PriceDisclosurePolicy | null;
  // null = herda a política de envio de fotos do workspace (Agente IA).
  photo_send_policy: PhotoSendPolicy | null;
  photos: ServicePhoto[];
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

export const SEED_SERVICES: Service[] = [
  {
    id: "srv-1",
    name: "Revisão de Óleo",
    description: "Troca de óleo + filtro de óleo. Verificação de níveis.",
    price_cents: 8990,
    duration_minutes: 30,
    buffer_minutes: 0,
    color: "#25C880",
    status: "active",
    created_at: new Date(),
    price_disclosure_policy: null,
    photo_send_policy: null,
    photos: [],
  },
  {
    id: "srv-2",
    name: "Diagnóstico Elétrico",
    description: "Análise completa do sistema elétrico com scanner.",
    price_cents: 15000,
    duration_minutes: 60,
    buffer_minutes: 0,
    color: "#F59E0B",
    status: "active",
    created_at: new Date(),
    price_disclosure_policy: null,
    photo_send_policy: null,
    photos: [],
  },
  {
    id: "srv-3",
    name: "Alinhamento e Balanceamento",
    description: "Alinhamento computadorizado das 4 rodas + balanceamento.",
    price_cents: 12990,
    duration_minutes: 45,
    buffer_minutes: 0,
    color: "#3B82F6",
    status: "active",
    created_at: new Date(),
    price_disclosure_policy: null,
    photo_send_policy: null,
    photos: [],
  },
  {
    id: "srv-4",
    name: "Troca de Pastilhas",
    description: "Substituição de pastilhas dianteiras com revisão dos discos.",
    price_cents: 24500,
    duration_minutes: 90,
    buffer_minutes: 0,
    color: "#EF4444",
    status: "active",
    created_at: new Date(),
    price_disclosure_policy: null,
    photo_send_policy: null,
    photos: [],
  },
  {
    id: "srv-5",
    name: "Polimento Completo",
    description: "Polimento de pintura + cristalização. Cera de proteção.",
    price_cents: 35000,
    duration_minutes: 240,
    buffer_minutes: 0,
    color: "#8B5CF6",
    status: "draft",
    created_at: new Date(),
    price_disclosure_policy: null,
    photo_send_policy: null,
    photos: [],
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
