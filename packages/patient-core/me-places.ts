/**
 * My places (ADR 0402, migration 0185): the pure half of the phone's `mobile/src/data/places.ts`, moved
 * verbatim so the phone and the web write the same row and say the same words. `patient_places` is
 * patient-only under RLS; coordinates and labels are never logged.
 */

export type PlaceKind = "home" | "work" | "other";

export interface Place {
  id: string;
  kind: PlaceKind;
  /** The patient's own word; set only for `other`. */
  customLabel: string | null;
  lat: number;
  lng: number;
  address: string | null;
  isHome: boolean;
}

/** What a form fills; the database adds id, owner and consent time. */
export interface PlaceInput {
  kind: PlaceKind;
  customLabel: string | null;
  lat: number;
  lng: number;
  address: string | null;
}

/**
 * The words the patient agrees to before a place is saved. Change a word,
 * change the version: it is stored with every place (`consent_version`).
 */
export const PLACE_CONSENT = {
  version: "place-v1",
  title: "Save this place",
  words:
    "Only you can see your saved places. We use your home place to suggest clinics near you. You can change or delete a place at any time.",
} as const;

export const LABEL_MAX = 40;
export const ADDRESS_MAX = 200;
export const OFF_WORDS = "Saving places is not switched on yet.";

const KIND_WORDS: Record<PlaceKind, string> = { home: "Home", work: "Work", other: "Other" };
export const PLACE_KINDS: readonly PlaceKind[] = ["home", "work", "other"];
export const kindWords = (k: PlaceKind) => KIND_WORDS[k];

/** The name a place shows under: "Home", "Work", or the patient's word. */
export function placeLabel(p: Pick<Place, "kind" | "customLabel">): string {
  return p.kind === "other" && p.customLabel ? p.customLabel : KIND_WORDS[p.kind];
}

/** Why a label cannot be saved, or null. Mirrors 0185's checks. */
export function labelProblem(kind: PlaceKind, custom: string): string | null {
  if (kind !== "other") return null;
  const n = custom.trim().length;
  if (n === 0) return "Give this place a name, like Mum's house.";
  if (n > LABEL_MAX) return `Use ${LABEL_MAX} characters or fewer.`;
  return null;
}

/** One `patient_places` row to the shape the screens read. numeric comes back as a string. */
export function fromDb(r: Record<string, unknown>): Place {
  const kind = r.kind === "work" || r.kind === "other" ? r.kind : "home";
  return {
    id: String(r.id),
    kind,
    customLabel: kind === "other" && typeof r.custom_label === "string" ? r.custom_label : null,
    lat: Number(r.lat),
    lng: Number(r.lng),
    address: typeof r.address === "string" && r.address.trim() ? r.address : null,
    isHome: r.is_home === true,
  };
}

/** The columns a form writes. The custom word only for `other`, as 0185's check demands. */
export function toDb(p: PlaceInput): Record<string, unknown> {
  return {
    kind: p.kind,
    custom_label: p.kind === "other" ? p.customLabel?.trim() || null : null,
    // numeric(9,6): six places is about 10 cm, finer than any pin.
    lat: Number(p.lat.toFixed(6)),
    lng: Number(p.lng.toFixed(6)),
    address: p.address?.trim().slice(0, ADDRESS_MAX) || null,
  };
}

/** 0185 not applied: Postgres "no such table", or PostgREST's schema-cache miss. */
export function isMissingTable(error: { code?: string | null } | null): boolean {
  return error?.code === "42P01" || error?.code === "PGRST205";
}

/** Home first, then oldest first (the order they were saved). */
export const sortPlaces = (list: Place[]) =>
  [...list].sort((a, b) => Number(b.isHome) - Number(a.isHome));

/** "Home · Work · 1 more", or nothing saved. */
export function placesSummary(places: Place[]): string {
  if (!places.length) return "None saved yet";
  const names = places.slice(0, 2).map(placeLabel);
  const more = places.length - names.length;
  return more > 0 ? `${names.join(" · ")} · ${more} more` : names.join(" · ");
}
