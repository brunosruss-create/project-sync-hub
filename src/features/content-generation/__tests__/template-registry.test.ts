// Requirement 3.2: cada categoria deve ter no mínimo 1 variante 1:1 e 1 variante 9:16.

import { describe, it, expect } from "vitest";
import {
  listTemplatesByCategory,
  listAllTemplates,
} from "@/features/content-generation/templates";
import { TEMPLATE_CATEGORIES } from "@/features/content-generation/types";

describe("template registry", () => {
  it("registra pelo menos 1 template ativo por categoria", () => {
    for (const category of TEMPLATE_CATEGORIES) {
      const templates = listTemplatesByCategory(category);
      expect(templates.length, `categoria ${category} sem templates`).toBeGreaterThan(0);
    }
  });

  it("tem variante 1:1 em toda categoria (Requirement 3.2)", () => {
    for (const category of TEMPLATE_CATEGORIES) {
      const templates = listTemplatesByCategory(category);
      const has1x1 = templates.some((t) => t.ratio === "1:1");
      expect(has1x1, `categoria ${category} sem variante 1:1`).toBe(true);
    }
  });

  it("tem variante 9:16 em toda categoria (Requirement 3.2)", () => {
    for (const category of TEMPLATE_CATEGORIES) {
      const templates = listTemplatesByCategory(category);
      const has9x16 = templates.some((t) => t.ratio === "9:16");
      expect(has9x16, `categoria ${category} sem variante 9:16`).toBe(true);
    }
  });

  it("nenhum template registrado como retirado por default", () => {
    const all = listAllTemplates({ includeRetired: true });
    for (const t of all) {
      expect(t.retired, `${t.id} está marcado como retirado`).toBe(false);
    }
  });

  it("cada template declara pelo menos 1 slot", () => {
    for (const t of listAllTemplates()) {
      expect(t.slots.length, `${t.id} sem slots`).toBeGreaterThan(0);
    }
  });
});
