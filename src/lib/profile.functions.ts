import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

// ============= GET MY PROFILE (pessoal) =============
export const getMyProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data } = await supabaseAdmin
      .from("profiles")
      .select(
        "id,email,full_name,avatar_url,phone,user_timezone,notify_email,notify_push",
      )
      .eq("id", context.userId)
      .maybeSingle();
    return {
      profile: data ?? null,
    };
  });

// ============= UPDATE MY PROFILE (pessoal) =============
export const updateMyProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        full_name: z.string().min(1).max(120).optional(),
        phone: z.string().max(40).optional().nullable(),
        user_timezone: z.string().min(1).max(64).optional(),
        notify_email: z.boolean().optional(),
        notify_push: z.boolean().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { error } = await supabaseAdmin
      .from("profiles")
      .update(data)
      .eq("id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
