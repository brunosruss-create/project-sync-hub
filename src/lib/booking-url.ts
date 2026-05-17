const BASE_URL = "https://github-vercel-bridge.lovable.app";

export function getBookingUrl(bookingSlug: string): string {
  return `${BASE_URL}/book/${bookingSlug}`;
}
