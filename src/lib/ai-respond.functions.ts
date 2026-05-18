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
        wa_message_id: z.string().max(200).nullish(),
        contact_name: z.string().max(200).nullish(),
        contact_phone: z.string().max(50).nullish(),
        audio: z
          .object({
            data: z.string().min(1),
            mimeType: z.string().min(1).max(100),
          })
          .nullish(),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    return runAiResponse(data);
  });
