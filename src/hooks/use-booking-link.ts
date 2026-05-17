import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getWorkspaceProfile } from "@/lib/onboarding.functions";
import { getBookingUrl } from "@/lib/booking-url";

export function useBookingLink() {
  const getProfileFn = useServerFn(getWorkspaceProfile);
  const q = useQuery({
    queryKey: ["workspace-profile"],
    queryFn: () => getProfileFn(),
  });
  const p = q.data as any;
  const enabled = !!p?.booking_enabled;
  const slug = (p?.booking_slug as string | null) ?? null;
  const url = enabled && slug ? getBookingUrl(slug) : null;
  return { enabled, slug, url };
}
