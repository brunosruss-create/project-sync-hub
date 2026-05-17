import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  sendBookingConfirmation,
  sendBookingReschedule,
  sendBookingCancellation,
} from "@/lib/booking-confirmation.server";

const InputSchema = z.object({
  appointmentId: z.string().uuid(),
  kind: z.enum(["created", "rescheduled", "cancelled"]),
});

export const notifyAppointmentChange = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => InputSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { userId } = context;
    const { appointmentId, kind } = data;

    const { data: appt } = await supabaseAdmin
      .from("appointments")
      .select(
        "id,owner_user_id,contact_id,service_id,professional_id,starts_at,notify_whatsapp",
      )
      .eq("id", appointmentId)
      .maybeSingle();
    if (!appt) return { ok: false, reason: "appointment_not_found" };
    if (!appt.notify_whatsapp) return { ok: false, reason: "notify_disabled" };

    // Permissão: workspace owner == user atual ou seu workspace owner
    const { data: ownerId } = await supabaseAdmin.rpc("get_my_workspace_owner", {});
    const allowedOwner = (ownerId as string | null) ?? userId;
    if (appt.owner_user_id !== allowedOwner) {
      return { ok: false, reason: "forbidden" };
    }

    const [{ data: profile }, { data: contact }, { data: service }] = await Promise.all([
      supabaseAdmin
        .from("profiles")
        .select("id,business_name,business_timezone")
        .eq("id", appt.owner_user_id)
        .maybeSingle(),
      appt.contact_id
        ? supabaseAdmin
            .from("contacts")
            .select("name,phone")
            .eq("id", appt.contact_id)
            .maybeSingle()
        : Promise.resolve({ data: null }),
      appt.service_id
        ? supabaseAdmin
            .from("services")
            .select("id,name,duration_minutes,price_cents")
            .eq("id", appt.service_id)
            .maybeSingle()
        : Promise.resolve({ data: null }),
    ]);

    if (!profile) return { ok: false, reason: "profile_not_found" };
    if (!contact?.phone) return { ok: false, reason: "contact_missing" };
    if (!service) return { ok: false, reason: "service_missing" };

    let professional: { id: string; name: string } | null = null;
    if (appt.professional_id) {
      const { data: pr } = await supabaseAdmin
        .from("professionals")
        .select("id,name")
        .eq("id", appt.professional_id)
        .maybeSingle();
      professional = pr ?? null;
    }

    const profileLite = {
      id: profile.id,
      business_name: profile.business_name,
      business_timezone: profile.business_timezone,
    };
    const appointmentLite = { id: appt.id, starts_at: appt.starts_at };
    const clientLite = {
      client_name: contact.name ?? "cliente",
      client_phone: contact.phone,
    };

    if (kind === "created") {
      await sendBookingConfirmation({
        profile: profileLite,
        appointment: appointmentLite,
        service,
        professional,
        client: clientLite,
      });
    } else if (kind === "rescheduled") {
      await sendBookingReschedule({
        profile: profileLite,
        appointment: appointmentLite,
        service,
        professional,
        client: clientLite,
      });
    } else {
      await sendBookingCancellation({
        profile: profileLite,
        appointment: appointmentLite,
        service,
        client: clientLite,
      });
    }

    return { ok: true };
  });
