import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { runAiResponse } from "@/lib/ai-respond.server";

export const aiRespond = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        workspace_owner_id: z.string().uuid(),
        contact_id: z.string().uuid().optional(),
        message: z.string().min(1).max(8000),
        conversation_history: z
          .array(
            z.object({
              role: z.enum(["user", "assistant"]),
              content: z.string().max(8000),
            }),
          )
          .max(50)
          .default([]),
        preview: z.boolean().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    return runAiResponse(data);
  });
