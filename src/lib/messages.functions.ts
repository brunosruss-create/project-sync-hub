import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { MESSAGE_DEFAULTS, type MessageKey } from "@/lib/message-defaults";

const TEMPLATE_COLUMNS = [
  "welcome_message",
  "welcome_message_enabled",
  "ai_out_of_hours_message",
  "ai_out_of_hours_enabled",
  "msg_transfer_text",
  "msg_transfer_enabled",
  "msg_booking_confirmed_text",
  "msg_booking_confirmed_enabled",
  "msg_booking_rescheduled_text",
  "msg_booking_rescheduled_enabled",
  "msg_booking_cancelled_text",
  "msg_booking_cancelled_enabled",
].join(",");

type Row = Record<string, unknown>;

export type MessageTemplate = {
  key: MessageKey;
  enabled: boolean;
  text: string; // valor atual (vazio = usa default)
};

function rowToTemplates(row: Row | null): Record<MessageKey, MessageTemplate> {
  const r = row ?? {};
  const get = (k: string) => (typeof r[k] === "string" ? (r[k] as string) : "");
  const getBool = (k: string, fallback: boolean) =>
    typeof r[k] === "boolean" ? (r[k] as boolean) : fallback;
  return {
    welcome: {
      key: "welcome",
      enabled: getBool("welcome_message_enabled", false),
      text: get("welcome_message"),
    },
    out_of_hours: {
      key: "out_of_hours",
      enabled: getBool("ai_out_of_hours_enabled", false),
      text: get("ai_out_of_hours_message"),
    },
    transfer: {
      key: "transfer",
      enabled: getBool("msg_transfer_enabled", true),
      text: get("msg_transfer_text"),
    },
    booking_confirmed: {
      key: "booking_confirmed",
      enabled: getBool("msg_booking_confirmed_enabled", true),
      text: get("msg_booking_confirmed_text"),
    },
    booking_rescheduled: {
      key: "booking_rescheduled",
      enabled: getBool("msg_booking_rescheduled_enabled", true),
      text: get("msg_booking_rescheduled_text"),
    },
    booking_cancelled: {
      key: "booking_cancelled",
      enabled: getBool("msg_booking_cancelled_enabled", true),
      text: get("msg_booking_cancelled_text"),
    },
  };
}

export const getMessageTemplates = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data } = await supabaseAdmin
      .from("profiles")
      .select(TEMPLATE_COLUMNS)
      .eq("id", context.userId)
      .maybeSingle();
    return {
      templates: rowToTemplates(data as Row | null),
      defaults: MESSAGE_DEFAULTS,
    };
  });

const UpdateSchema = z.object({
  welcome: z
    .object({ enabled: z.boolean(), text: z.string().max(2000) })
    .optional(),
  out_of_hours: z
    .object({ enabled: z.boolean(), text: z.string().max(2000) })
    .optional(),
  transfer: z
    .object({ enabled: z.boolean(), text: z.string().max(2000) })
    .optional(),
  booking_confirmed: z
    .object({ enabled: z.boolean(), text: z.string().max(2000) })
    .optional(),
  booking_rescheduled: z
    .object({ enabled: z.boolean(), text: z.string().max(2000) })
    .optional(),
  booking_cancelled: z
    .object({ enabled: z.boolean(), text: z.string().max(2000) })
    .optional(),
});

const COLUMN_MAP: Record<MessageKey, { text: string; enabled: string }> = {
  welcome: { text: "welcome_message", enabled: "welcome_message_enabled" },
  out_of_hours: {
    text: "ai_out_of_hours_message",
    enabled: "ai_out_of_hours_enabled",
  },
  transfer: { text: "msg_transfer_text", enabled: "msg_transfer_enabled" },
  booking_confirmed: {
    text: "msg_booking_confirmed_text",
    enabled: "msg_booking_confirmed_enabled",
  },
  booking_rescheduled: {
    text: "msg_booking_rescheduled_text",
    enabled: "msg_booking_rescheduled_enabled",
  },
  booking_cancelled: {
    text: "msg_booking_cancelled_text",
    enabled: "msg_booking_cancelled_enabled",
  },
};

export const updateMessageTemplates = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => UpdateSchema.parse(input))
  .handler(async ({ data, context }) => {
    const update: Record<string, unknown> = {};
    for (const k of Object.keys(data) as MessageKey[]) {
      const entry = data[k];
      if (!entry) continue;
      const cols = COLUMN_MAP[k];
      update[cols.text] = entry.text;
      update[cols.enabled] = entry.enabled;
    }
    if (Object.keys(update).length === 0) return { ok: true };
    const { error } = await supabaseAdmin
      .from("profiles")
      .update(update)
      .eq("id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
