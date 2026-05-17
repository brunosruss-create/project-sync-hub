import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  sendBookingConfirmation,
  normalizePhone,
} from "@/lib/booking-confirmation.server";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Max-Age": "86400",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...CORS },
  });
}

// Mapeia índice 0..6 (domingo=0) para as várias chaves aceitas no JSON.
const DAY_KEYS: string[][] = [
  ["sunday", "sun", "dom", "domingo"],
  ["monday", "mon", "seg", "segunda", "segunda-feira"],
  ["tuesday", "tue", "ter", "terca", "terça", "terca-feira", "terça-feira"],
  ["wednesday", "wed", "qua", "quarta", "quarta-feira"],
  ["thursday", "thu", "qui", "quinta", "quinta-feira"],
  ["friday", "fri", "sex", "sexta", "sexta-feira"],
  ["saturday", "sat", "sab", "sábado", "sabado"],
];

function dayCfgFor(hours: any, dayIdx: number): { start: string; end: string } | null {
  if (!hours || typeof hours !== "object") return null;
  for (const k of DAY_KEYS[dayIdx] ?? []) {
    const cfg = hours[k];
    if (!cfg) continue;
    const enabled = cfg.enabled ?? cfg.active ?? false;
    if (!enabled) return null;
    const start = typeof cfg.start === "string" ? cfg.start : "08:00";
    const end = typeof cfg.end === "string" ? cfg.end : "18:00";
    return { start, end };
  }
  return null;
}

function parseHM(v: string): number {
  const [h, m] = v.split(":").map((x) => parseInt(x, 10));
  return (h || 0) * 60 + (m || 0);
}

function hm(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function dayIdxInTz(date: string, tz: string): number {
  // date "YYYY-MM-DD" — interpretamos como meio-dia no tz para evitar ambiguidade.
  const d = new Date(`${date}T12:00:00`);
  const fmt = new Intl.DateTimeFormat("en-US", { timeZone: tz, weekday: "short" });
  const wd = fmt.format(d).toLowerCase();
  const map: Record<string, number> = {
    sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6,
  };
  return map[wd] ?? d.getDay();
}

async function loadProfileBySlug(slug: string) {
  const { data } = await supabaseAdmin
    .from("profiles")
    .select(
      "id,business_name,business_description,business_logo_url,business_timezone,booking_title,booking_description,booking_service_ids,ai_working_hours,business_hours,ai_has_multiple_professionals",
    )
    .eq("booking_slug", slug)
    .eq("booking_enabled", true)
    .maybeSingle();
  return data;
}

function pickHours(profile: any) {
  const a = profile.ai_working_hours;
  const b = profile.business_hours;
  if (a && typeof a === "object" && Object.keys(a).length > 0) return a;
  if (b && typeof b === "object" && Object.keys(b).length > 0) return b;
  return null;
}

const CreateSchema = z.object({
  service_id: z.string().min(1).max(120),
  professional_id: z.string().uuid().nullable().optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  time: z.string().regex(/^\d{2}:\d{2}$/),
  client_name: z.string().trim().min(1).max(120),
  client_phone: z
    .string()
    .trim()
    .transform((v) => v.replace(/\D/g, ""))
    .pipe(z.string().regex(/^\d{10,13}$/)),
  notes: z.string().max(500).optional(),
});

export const Route = createFileRoute("/api/public/book/$slug")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: CORS }),

      GET: async ({ params, request }) => {
        const url = new URL(request.url);
        const action = url.searchParams.get("action") ?? "info";
        const profile = await loadProfileBySlug(params.slug);
        if (!profile) return json({ error: "not_found" }, 404);

        if (action === "info") {
          const serviceIds = Array.isArray(profile.booking_service_ids)
            ? profile.booking_service_ids
            : [];
          // Sem subconjunto definido = todos os serviços ativos ficam disponíveis.
          let svcQ = supabaseAdmin
            .from("services")
            .select("id,name,description,price_cents,duration_minutes,emoji,color")
            .eq("owner_user_id", profile.id)
            .eq("status", "active");
          if (serviceIds.length > 0) svcQ = svcQ.in("id", serviceIds);
          const { data: svcData } = await svcQ;
          const services = svcData ?? [];
          const { data: professionals } = await supabaseAdmin
            .from("professionals")
            .select("id,name,role,avatar_url,avatar_color")
            .eq("owner_user_id", profile.id)
            .eq("is_active", true);

          return json({
            profile: {
              business_name: profile.business_name,
              business_description: profile.business_description,
              business_logo_url: profile.business_logo_url,
              booking_title: profile.booking_title,
              booking_description: profile.booking_description,
              has_multiple_professionals:
                profile.ai_has_multiple_professionals ?? false,
              business_timezone: profile.business_timezone ?? "America/Sao_Paulo",
              working_hours: pickHours(profile),
            },
            services,
            professionals: professionals ?? [],
          });
        }

        if (action === "slots") {
          const date = url.searchParams.get("date") ?? "";
          const serviceId = url.searchParams.get("service_id") ?? "";
          const professionalId = url.searchParams.get("professional_id");
          if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !serviceId) {
            return json({ error: "bad_request" }, 400);
          }
          const tz = profile.business_timezone || "America/Sao_Paulo";
          const dayIdx = dayIdxInTz(date, tz);
          const hours = pickHours(profile);
          const cfg = dayCfgFor(hours, dayIdx);
          if (!cfg) return json({ slots: [] });

          const { data: svc } = await supabaseAdmin
            .from("services")
            .select("id,duration_minutes")
            .eq("id", serviceId)
            .eq("owner_user_id", profile.id)
            .eq("status", "active")
            .maybeSingle();
          if (!svc) return json({ slots: [] });

          const step = Math.max(15, svc.duration_minutes);
          const startMin = parseHM(cfg.start);
          const endMin = parseHM(cfg.end);
          const allSlots: string[] = [];
          for (let m = startMin; m + svc.duration_minutes <= endMin; m += step) {
            allSlots.push(hm(m));
          }

          // appointments existentes do dia
          let existing: { starts_at: string; ends_at: string }[] = [];
          const dayStart = `${date}T00:00:00`;
          const dayEnd = `${date}T23:59:59`;
          let q = supabaseAdmin
            .from("appointments")
            .select("starts_at,ends_at,professional_id")
            .eq("owner_user_id", profile.id)
            .gte("starts_at", dayStart)
            .lte("starts_at", dayEnd)
            .neq("status", "cancelled");
          if (professionalId) q = q.eq("professional_id", professionalId);
          const { data: appts } = await q;
          existing = appts ?? [];

          const nowMs = Date.now();
          const slots = allSlots.map((time) => {
            const slotStart = new Date(`${date}T${time}:00`);
            const slotEnd = new Date(slotStart.getTime() + svc.duration_minutes * 60_000);
            const conflict = existing.some((a) => {
              const aS = new Date(a.starts_at).getTime();
              const aE = new Date(a.ends_at).getTime();
              return aS < slotEnd.getTime() && aE > slotStart.getTime();
            });
            const past = slotStart.getTime() <= nowMs;
            return { time, available: !conflict && !past };
          });
          return json({ slots });
        }

        return json({ error: "unknown_action" }, 400);
      },

      POST: async ({ params, request }) => {
        const profile = await loadProfileBySlug(params.slug);
        if (!profile) return json({ error: "not_found" }, 404);

        let body: unknown;
        try {
          body = await request.json();
        } catch {
          return json({ error: "bad_json" }, 400);
        }
        const parsed = CreateSchema.safeParse(body);
        if (!parsed.success) {
          return json({ error: "invalid_input", details: parsed.error.format() }, 400);
        }
        const input = parsed.data;

        // Se o admin restringiu, valida; senão aceita qualquer serviço ativo dele.
        const serviceIds = Array.isArray(profile.booking_service_ids)
          ? profile.booking_service_ids
          : [];
        if (serviceIds.length > 0 && !serviceIds.includes(input.service_id)) {
          return json({ error: "service_not_allowed" }, 400);
        }

        const { data: service } = await supabaseAdmin
          .from("services")
          .select("id,name,duration_minutes,price_cents")
          .eq("id", input.service_id)
          .eq("owner_user_id", profile.id)
          .eq("status", "active")
          .maybeSingle();
        if (!service) return json({ error: "service_not_found" }, 404);

        let professional: { id: string; name: string } | null = null;
        if (input.professional_id) {
          const { data: pr } = await supabaseAdmin
            .from("professionals")
            .select("id,name")
            .eq("id", input.professional_id)
            .eq("owner_user_id", profile.id)
            .eq("is_active", true)
            .maybeSingle();
          if (!pr) return json({ error: "professional_not_found" }, 404);
          professional = pr;
        }

        const startsAt = new Date(`${input.date}T${input.time}:00`);
        if (Number.isNaN(startsAt.getTime())) return json({ error: "bad_date" }, 400);
        if (startsAt.getTime() <= Date.now()) {
          return json({ error: "past_slot" }, 400);
        }
        const endsAt = new Date(startsAt.getTime() + service.duration_minutes * 60_000);

        // Recheck conflito
        if (professional) {
          const { data: conflict } = await supabaseAdmin
            .from("appointments")
            .select("id")
            .eq("owner_user_id", profile.id)
            .eq("professional_id", professional.id)
            .lt("starts_at", endsAt.toISOString())
            .gt("ends_at", startsAt.toISOString())
            .neq("status", "cancelled")
            .maybeSingle();
          if (conflict) return json({ error: "slot_taken" }, 409);
        }

        // Upsert contact por telefone
        const phone = normalizePhone(input.client_phone);
        const { data: existingContact } = await supabaseAdmin
          .from("contacts")
          .select("id")
          .eq("owner_user_id", profile.id)
          .eq("phone", phone)
          .maybeSingle();
        let contactId = existingContact?.id ?? null;
        if (!contactId) {
          const { data: newC, error: ce } = await supabaseAdmin
            .from("contacts")
            .insert({ owner_user_id: profile.id, name: input.client_name, phone })
            .select("id")
            .single();
          if (ce || !newC) return json({ error: "contact_create_failed" }, 500);
          contactId = newC.id;
        }

        const { data: appt, error: aerr } = await supabaseAdmin
          .from("appointments")
          .insert({
            owner_user_id: profile.id,
            contact_id: contactId,
            professional_id: professional?.id ?? null,
            service_id: service.id,
            starts_at: startsAt.toISOString(),
            ends_at: endsAt.toISOString(),
            status: "scheduled",
            notes: input.notes ?? "",
            notify_whatsapp: true,
          })
          .select("id,starts_at")
          .single();
        if (aerr || !appt) return json({ error: "create_failed" }, 500);

        await supabaseAdmin.from("appointment_services").insert({
          appointment_id: appt.id,
          owner_user_id: profile.id,
          service_id: service.id,
          price_cents: service.price_cents,
          duration_minutes: service.duration_minutes,
        });

        // Confirmação WhatsApp (best-effort)
        await sendBookingConfirmation({
          profile: {
            id: profile.id,
            business_name: profile.business_name,
            business_timezone: profile.business_timezone,
          },
          appointment: appt,
          service,
          professional,
          client: { client_name: input.client_name, client_phone: input.client_phone },
        });

        return json({ success: true, appointment_id: appt.id });
      },
    },
  },
});
