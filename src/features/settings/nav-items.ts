import type * as React from "react";
import {
  User as UserIcon,
  Building2,
  Users,
  MessageCircle,
  MessageSquare,
  CreditCard,
  Briefcase,
  Bot,
  Zap,
} from "lucide-react";

/**
 * Itens do submenu de Configurações. Vive fora do SettingsLayout porque o
 * flyout do rail (app-sidebar) mostra a mesma lista — duas cópias divergiriam
 * no primeiro item novo.
 */
export type SettingsEntry =
  | { kind: "section"; label: string }
  | { kind: "item"; label: string; to: string; icon: React.ComponentType<{ size?: number }> };

export const SETTINGS_ITEMS: SettingsEntry[] = [
  { kind: "section", label: "Acesso ao sistema" },
  { kind: "item", label: "Perfil", to: "/settings/profile", icon: UserIcon },
  { kind: "item", label: "Negócio", to: "/settings/workspace", icon: Building2 },
  { kind: "item", label: "Agente IA", to: "/ai-agent", icon: Bot },
  { kind: "item", label: "Equipe", to: "/settings/team", icon: Users },
  { kind: "item", label: "Departamentos", to: "/settings/departments", icon: Building2 },
  { kind: "section", label: "Agenda" },
  { kind: "item", label: "Profissionais", to: "/settings/professionals", icon: Briefcase },
  { kind: "item", label: "Mensagens", to: "/settings/messages", icon: MessageSquare },
  { kind: "item", label: "Respostas rápidas", to: "/settings/quick-replies", icon: Zap },
  { kind: "item", label: "Planos & Cobrança", to: "/settings/billing", icon: CreditCard },
];

/** A engrenagem do rail acende em qualquer uma destas rotas. */
export function isSettingsPath(path: string): boolean {
  return path.startsWith("/settings") || path.startsWith("/ai-agent");
}
