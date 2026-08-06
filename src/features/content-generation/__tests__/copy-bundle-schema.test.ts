// Requirement 6.2: schema estruturado do Copy_Bundle.

import { describe, it, expect } from "vitest";
import { CopyBundleSchema } from "@/features/content-generation/types";

describe("CopyBundleSchema", () => {
  const valid = {
    hook: "Descubra o segredo dos cabelos perfeitos",
    body: "Nossa nova técnica exclusiva combina três produtos importados.",
    cliffhanger: "E o mais impressionante ainda está por vir...",
    cta: "Agende agora",
    hashtags: ["#cabelo", "#beleza", "#salao"],
    shortCaption: "Cabelos incríveis em 90 minutos",
    perNetwork: {
      instagram: { fullText: "Post completo pro Instagram" },
      facebook: { fullText: "Post completo pro Facebook" },
    },
  };

  it("aceita bundle válido", () => {
    const parsed = CopyBundleSchema.safeParse(valid);
    expect(parsed.success).toBe(true);
  });

  it("aceita bundle sem cliffhanger (é opcional)", () => {
    const { cliffhanger, ...withoutCliff } = valid;
    void cliffhanger;
    const parsed = CopyBundleSchema.safeParse(withoutCliff);
    expect(parsed.success).toBe(true);
  });

  it("rejeita bundle sem hook", () => {
    const parsed = CopyBundleSchema.safeParse({ ...valid, hook: "" });
    expect(parsed.success).toBe(false);
  });

  it("rejeita bundle sem CTA", () => {
    const parsed = CopyBundleSchema.safeParse({ ...valid, cta: "" });
    expect(parsed.success).toBe(false);
  });

  it("rejeita mais de 15 hashtags", () => {
    const parsed = CopyBundleSchema.safeParse({
      ...valid,
      hashtags: Array(16).fill("#tag"),
    });
    expect(parsed.success).toBe(false);
  });

  it("rejeita bundle sem perNetwork", () => {
    const { perNetwork, ...noPer } = valid;
    void perNetwork;
    const parsed = CopyBundleSchema.safeParse(noPer);
    expect(parsed.success).toBe(false);
  });
});
