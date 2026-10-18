/**
 * The family link's pure rules (ADR 0343): which tokens are worth asking the
 * database about, and the words and map links the page shows. No I/O here,
 * so the tests need no backend.
 */

/** The database makes the token: 64 lowercase hex characters (migration 0171). */
export function isShareToken(token: string): boolean {
  return /^[0-9a-f]{64}$/.test(token);
}

/** "just now", "1 min ago", "12 min ago", "2 h ago". */
export function agoWords(at: Date, now: Date): string {
  const min = Math.floor((now.getTime() - at.getTime()) / 60_000);
  if (min < 1) return "just now";
  if (min < 60) return `${min} min ago`;
  return `${Math.floor(min / 60)} h ago`;
}

/** "14:30" in Uganda time, whatever the server's clock zone. */
export function ugandaClock(at: Date): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Africa/Kampala",
    hour: "2-digit",
    minute: "2-digit",
  }).format(at);
}

/**
 * Google Maps' free embed (no key) in satellite with road names (`t=h`), close
 * enough to see the buildings around the pin (owner, 18 Oct 2026). The page
 * sends no Referer, so the token never reaches Google.
 */
export function satelliteEmbedUrl(lat: number, lng: number): string {
  return `https://maps.google.com/maps?q=${lat}%2C${lng}&t=h&z=18&output=embed`;
}

/** Google Maps' free search link (no key): opens the app on a phone. */
export function googleMapsUrl(lat: number, lng: number): string {
  return `https://www.google.com/maps/search/?api=1&query=${lat}%2C${lng}`;
}
