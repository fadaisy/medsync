/**
 * Google Maps in the browser (ADR 0522), for the hospital's pin on Emergency and support. Loaded only when the
 * browser key `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` is set, once per page, from Google's own script; without it, or when
 * Google refuses the key, the map falls back to OpenStreetMap. Only the few Maps JavaScript API shapes this page uses
 * are typed here, so no types package is added.
 */
import type { PlaceHit } from "./geo";

export const GOOGLE_MAPS_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? "";

export interface GLatLng {
  lat(): number;
  lng(): number;
}
type LatLng = { lat: number; lng: number };

export interface GMap {
  addListener(event: "click", fn: (e: { latLng: GLatLng | null }) => void): unknown;
  setMapTypeId(id: "hybrid" | "roadmap"): void;
  setCenter(p: LatLng): void;
  setZoom(z: number): void;
  getZoom(): number | undefined;
  getBounds(): { contains(p: LatLng): boolean } | undefined;
}
export interface GMarker {
  setPosition(p: LatLng): void;
  setMap(m: GMap | null): void;
}
export interface GMaps {
  Map: new (el: HTMLElement, opts: Record<string, unknown>) => GMap;
  Marker: new (opts: Record<string, unknown>) => GMarker;
  Geocoder: new () => {
    geocode(req: Record<string, unknown>): Promise<{
      results: { formatted_address: string; geometry: { location: GLatLng } }[];
    }>;
  };
  SymbolPath: { CIRCLE: number };
  event: { clearInstanceListeners(o: unknown): void };
}

type GoogleWindow = Window & {
  google?: { maps?: GMaps };
  __medsyncGoogleMaps?: () => void;
  gm_authFailure?: () => void;
};

let loading: Promise<GMaps> | null = null;
const authFailed = new Set<() => void>();
let refused = false;

/** Google calls `gm_authFailure` when it refuses the key (wrong site, API not enabled, no billing). */
export function onGoogleRefused(fn: () => void): () => void {
  if (refused) {
    fn();
    return () => {};
  }
  authFailed.add(fn);
  return () => authFailed.delete(fn);
}

/** The Maps JavaScript API, loaded once. Rejects when the script cannot load. */
export function loadGoogleMaps(key: string = GOOGLE_MAPS_KEY): Promise<GMaps> {
  if (loading) return loading;
  loading = new Promise<GMaps>((resolve, reject) => {
    const w = window as GoogleWindow;
    if (w.google?.maps) return resolve(w.google.maps);
    w.gm_authFailure = () => {
      refused = true;
      for (const fn of authFailed) fn();
    };
    w.__medsyncGoogleMaps = () =>
      w.google?.maps ? resolve(w.google.maps) : reject(new Error("Google Maps did not load"));
    const s = document.createElement("script");
    s.src =
      "https://maps.googleapis.com/maps/api/js" +
      `?key=${encodeURIComponent(key)}&v=weekly&region=UG&language=en&callback=__medsyncGoogleMaps`;
    s.async = true;
    s.onerror = () => {
      loading = null;
      reject(new Error("Google Maps did not load"));
    };
    document.head.appendChild(s);
  });
  return loading;
}

/** Google's geocoder, inside Uganda: at most five places, or null when Google did not answer. */
export async function findPlacesGoogle(q: string): Promise<PlaceHit[] | null> {
  try {
    const g = await loadGoogleMaps();
    const { results } = await new g.Geocoder().geocode({
      address: q.trim(),
      componentRestrictions: { country: "UG" },
    });
    return results.slice(0, 5).map((r) => ({
      label: r.formatted_address,
      lat: r.geometry.location.lat(),
      lng: r.geometry.location.lng(),
    }));
  } catch {
    return null;
  }
}
