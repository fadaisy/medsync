/**
 * Finding the hospital on a map (ADR 0520 phase 2). Client-safe and pure apart from `findPlaces`, which asks
 * OpenStreetMap's place search (Nominatim) from the admin's browser, only when they press Find, and only inside
 * Uganda: the query is a place or road name the admin typed, never anything about a patient.
 */

export interface PlaceHit {
  label: string;
  lat: number;
  lng: number;
}

/** Google Maps at this point, opened in a new tab to check the pin against Google's satellite view. No API key. */
export function googleMapsUrl(lat: number, lng: number): string {
  const c = `${lat.toFixed(6)},${lng.toFixed(6)}`;
  return `https://www.google.com/maps/@?api=1&map_action=map&center=${c}&zoom=19&basemap=satellite`;
}

/** Nominatim's answer, kept to the rows that have a usable point. */
export function parseHits(raw: unknown): PlaceHit[] {
  if (!Array.isArray(raw)) return [];
  const out: PlaceHit[] = [];
  for (const r of raw) {
    const o = r as { display_name?: unknown; lat?: unknown; lon?: unknown };
    const lat = Number(o.lat);
    const lng = Number(o.lon);
    if (typeof o.display_name !== "string" || !Number.isFinite(lat) || !Number.isFinite(lng))
      continue;
    out.push({ label: o.display_name, lat, lng });
  }
  return out;
}

export const SEARCH_LIMIT = 5;

/** Places in Uganda matching what the admin typed (at most five), or null when the search did not answer. */
export async function findPlaces(q: string, signal?: AbortSignal): Promise<PlaceHit[] | null> {
  const u = new URL("https://nominatim.openstreetmap.org/search");
  u.searchParams.set("format", "jsonv2");
  u.searchParams.set("countrycodes", "ug");
  u.searchParams.set("limit", String(SEARCH_LIMIT));
  u.searchParams.set("q", q.trim());
  try {
    const res = await fetch(u, { signal, headers: { Accept: "application/json" } });
    if (!res.ok) return null;
    return parseHits(await res.json());
  } catch {
    return null;
  }
}
