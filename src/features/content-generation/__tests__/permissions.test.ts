// Requirement 13.2: defaults por role.

import { describe, it, expect, vi, beforeEach } from "vitest";

// Precisa mockar supabaseAdmin ANTES do import.
vi.mock("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: {
    from: vi.fn(() => ({
      select: () => ({
        eq: () => ({
          eq: () => ({
            eq: () => ({ maybeSingle: async () => ({ data: null }) }),
            maybeSingle: async () => ({ data: null }),
          }),
          maybeSingle: async () => ({ data: null }),
        }),
      }),
    })),
  },
}));

import {
  resolveContentPermissions,
  assertContentCan,
} from "@/lib/content-permissions.server";

describe("Content permissions defaults", () => {
  beforeEach(() => vi.clearAllMocks());

  it("dono do workspace tem TODAS as ações liberadas (manager default)", async () => {
    const perms = await resolveContentPermissions("owner-1", "owner-1");
    expect(perms.brand_edit).toBe(true);
    expect(perms.brief_create).toBe(true);
    expect(perms.asset_approve).toBe(true);
    expect(perms.publish_immediate).toBe(true);
    expect(perms.ai_image_optin).toBe(true);
  });

  it("agent NÃO pode editar brand nem publicar imediato por default", async () => {
    // Sem membro registrado, role fica 'agent' por default.
    const perms = await resolveContentPermissions("owner-1", "agent-1");
    expect(perms.brand_edit).toBe(false);
    expect(perms.brief_create).toBe(true);
    expect(perms.asset_approve).toBe(true);
    expect(perms.publish_immediate).toBe(false);
    expect(perms.ai_image_optin).toBe(false);
  });

  it("assertContentCan lança pra agent tentando brand_edit", async () => {
    await expect(assertContentCan("owner-1", "agent-1", "brand_edit")).rejects.toThrow();
  });

  it("assertContentCan permite manager em publish_immediate", async () => {
    await expect(
      assertContentCan("owner-1", "owner-1", "publish_immediate"),
    ).resolves.toBeUndefined();
  });
});
