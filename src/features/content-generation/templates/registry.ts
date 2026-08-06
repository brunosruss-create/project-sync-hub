// Catálogo de Design_Templates.
// Cada template é um componente React server-side que produz JSX consumível
// pelo Satori. O registry é a fonte única de verdade sobre categorias e
// proporções disponíveis.
//
// IMPORTANTE: templates NÃO importam react-dom nem hooks — são funções puras
// que retornam JSX estático. Satori renderiza sem client React.

import type { ReactElement } from "react";
import type { BrandKit, TemplateCategory } from "../types";

// ─── Contrato de template ───────────────────────────────────────

export type TemplateRatio = "1:1" | "9:16";

export interface TemplateSlots {
  headline?: string;
  subheadline?: string;
  imageUrl?: string;
  price?: string;
  duration?: string;
  description?: string;
  ctaLabel?: string;
  authorName?: string;
  eventDate?: string;
}

export interface TemplateProps {
  brandKit: BrandKit;
  slots: TemplateSlots;
  slideIndex?: number;
  slideTotal?: number;
}

export type TemplateComponent = (props: TemplateProps) => ReactElement;

export interface TemplateEntry {
  id: string;
  category: TemplateCategory;
  ratio: TemplateRatio;
  width: number;
  height: number;
  slots: (keyof TemplateSlots)[];
  retired: boolean;
  component: TemplateComponent;
}

// ─── Registro ───────────────────────────────────────────────────

const registry = new Map<string, TemplateEntry>();

export function registerTemplate(entry: TemplateEntry): void {
  if (registry.has(entry.id)) {
    throw new Error(`Template já registrado: ${entry.id}`);
  }
  registry.set(entry.id, entry);
}

export function getTemplate(id: string): TemplateEntry | null {
  return registry.get(id) ?? null;
}

export function listTemplatesByCategory(
  category: TemplateCategory,
  opts?: { includeRetired?: boolean },
): TemplateEntry[] {
  const all = Array.from(registry.values()).filter((t) => t.category === category);
  return opts?.includeRetired ? all : all.filter((t) => !t.retired);
}

export function listAllTemplates(opts?: { includeRetired?: boolean }): TemplateEntry[] {
  const all = Array.from(registry.values());
  return opts?.includeRetired ? all : all.filter((t) => !t.retired);
}

/** Retorna o template mais adequado para uma combinação categoria + ratio. */
export function pickTemplate(
  category: TemplateCategory,
  ratio: TemplateRatio,
): TemplateEntry | null {
  const candidates = listTemplatesByCategory(category).filter((t) => t.ratio === ratio);
  return candidates[0] ?? null;
}
