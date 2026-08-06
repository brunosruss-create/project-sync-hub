// Requirement 15.6: Plan_Quota_Hook sempre permite nesta fase.
// Property 4: os 3 pontos de decisão consultam o hook.

import { describe, it, expect } from "vitest";
import { checkQuota, enforceQuota } from "@/lib/plan-quota-hook.server";

describe("Plan_Quota_Hook (fase 1)", () => {
  it("sempre permite content_brief_submit", async () => {
    const r = await checkQuota("any-user", "content_brief_submit");
    expect(r.allowed).toBe(true);
  });

  it("sempre permite ai_images_generated", async () => {
    const r = await checkQuota("any-user", "ai_images_generated");
    expect(r.allowed).toBe(true);
  });

  it("sempre permite asset_approve", async () => {
    const r = await checkQuota("any-user", "asset_approve");
    expect(r.allowed).toBe(true);
  });

  it("enforceQuota não lança pra os 3 metrics-chave", async () => {
    await expect(enforceQuota("any", "content_brief_submit")).resolves.toBeUndefined();
    await expect(enforceQuota("any", "ai_images_generated")).resolves.toBeUndefined();
    await expect(enforceQuota("any", "asset_approve")).resolves.toBeUndefined();
  });
});
