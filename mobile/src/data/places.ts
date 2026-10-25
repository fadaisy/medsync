import type { LocationGeocodedAddress } from "expo-location";
import { useEffect } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";

import { onAccountChange } from "@/data/health-log";
import { createStore, useStore } from "@/data/store";
import { currentUserId, db } from "@/offline/outbox";

/**
 * My places (ADR 0402, migration 0185): the places a patient pins on a real
 * map and labels Home, Work or their own word. At most one is the home, which
 * clinic suggestions use. `patient_places` is patient-only under RLS: nobody
 * else reads it. The list is cached on the phone per account so it reads
 * offline; writes need a connection. Coordinates and labels are never logged.
 *
 * Before 0185 is applied the table does not exist: the list says "Saving
 * places is not switched on yet" (`off`) and nothing throws.
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

/* ─── Mapping ────────────────────────────────────────────────────────── */

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

/** "0.3476° N, 32.5825° E" and its spoken form, for the pin. */
export function coordWords(lat: number, lng: number): { text: string; spoken: string } {
  const ns = lat >= 0 ? "north" : "south";
  const ew = lng >= 0 ? "east" : "west";
  const a = Math.abs(lat).toFixed(4);
  const b = Math.abs(lng).toFixed(4);
  return {
    text: `${a}° ${ns[0].toUpperCase()}, ${b}° ${ew[0].toUpperCase()}`,
    spoken: `${a} degrees ${ns}, ${b} degrees ${ew}`,
  };
}

/* ─── Reverse geocode → words ────────────────────────────────────────── */

export interface GeoWords {
  /** One line for the place's address. */
  address: string | null;
  /** Pre-fills sign-up's "Village or address". */
  village: string | null;
  /** Pre-fills the district search; the patient still picks the official entry. */
  query: string | null;
}

const clean = (s: string | null | undefined) => (s ?? "").trim();

/**
 * The phone geocoder's best guess, in words the forms can use. The search
 * word is the most local area name it gave (in Kampala, "Kawempe"), with
 * "District" and "City" dropped so it matches the UBOS list's names.
 */
export function geoWords(g: Partial<LocationGeocodedAddress>): GeoWords {
  const street = clean([g.streetNumber, g.street].filter(Boolean).join(" ")) || clean(g.name);
  const parts: string[] = [];
  for (const p of [street, clean(g.district), clean(g.city), clean(g.subregion)])
    if (p && !parts.some((x) => x.toLowerCase() === p.toLowerCase())) parts.push(p);
  const area = [g.district, g.subregion, g.city, g.region]
    .map((s) => clean(s).replace(/\s+(district|city)$/i, ""))
    .find((s) => s.length >= 2);
  const village = parts.slice(0, 2).join(", ");
  return {
    address: parts.length ? parts.join(", ").slice(0, ADDRESS_MAX) : null,
    village: village ? village.slice(0, ADDRESS_MAX) : null,
    query: area ?? null,
  };
}

/* ─── The store ──────────────────────────────────────────────────────── */

type Status = "idle" | "loading" | "ready" | "error" | "off";
interface PlacesState {
  userId: string | null;
  status: Status;
  places: Place[];
}
const EMPTY: PlacesState = { userId: null, status: "idle", places: [] };
const store = createStore<PlacesState>(EMPTY);
const cacheKey = (userId: string) => `medsync:places:${userId}`;
const COLUMNS = "id, kind, custom_label, lat, lng, address, is_home";

/** 0185 not applied: Postgres "no such table", or PostgREST's schema-cache miss. */
export function isMissingTable(error: { code?: string | null } | null): boolean {
  return error?.code === "42P01" || error?.code === "PGRST205";
}

/** Home first, then oldest first (the order they were saved). */
const sortPlaces = (list: Place[]) => [...list].sort((a, b) => Number(b.isHome) - Number(a.isHome));

async function load(): Promise<void> {
  const userId = await currentUserId().catch(() => null);
  if (!userId) {
    store.set(EMPTY);
    return;
  }
  store.set((s) => ({ ...s, userId, status: s.places.length ? "ready" : "loading" }));
  // The phone's copy first, so the list shows offline.
  if (!store.get().places.length) {
    const raw = await AsyncStorage.getItem(cacheKey(userId)).catch(() => null);
    if (raw) {
      try {
        store.set({ userId, status: "loading", places: JSON.parse(raw) as Place[] });
      } catch {
        // A broken copy is no copy.
      }
    }
  }
  try {
    const { data, error } = await (await db())
      .from("patient_places")
      .select(COLUMNS)
      .eq("patient_user_id", userId)
      .order("created_at", { ascending: true });
    if (isMissingTable(error)) {
      store.set({ userId, status: "off", places: [] });
      return;
    }
    if (error) throw error;
    const places = sortPlaces((data ?? []).map(fromDb));
    store.set({ userId, status: "ready", places });
    void AsyncStorage.setItem(cacheKey(userId), JSON.stringify(places)).catch(() => {});
  } catch {
    store.set((s) => ({ ...s, status: s.places.length ? "ready" : "error" }));
  }
}

let watching = false;
let inflight: Promise<void> | null = null;

export function ensurePlacesLoaded(force = false): void {
  if (!watching) {
    watching = true;
    // Another account on this phone never sees the last one's places.
    void onAccountChange((id) => {
      const current = store.get().userId;
      if (current && id !== current) {
        store.set(EMPTY);
        if (id) ensurePlacesLoaded(true);
      }
    }).catch(() => {
      watching = false;
    });
  }
  const s = store.get();
  if (!inflight && (force || s.status === "idle" || s.status === "error"))
    inflight = load().finally(() => {
      inflight = null;
    });
}

export function usePlaces(): {
  places: Place[];
  loading: boolean;
  error: boolean;
  off: boolean;
  retry: () => void;
} {
  const s = useStore(store);
  useEffect(() => ensurePlacesLoaded(), []);
  return {
    places: s.places,
    loading: (s.status === "idle" || s.status === "loading") && !s.places.length,
    error: s.status === "error",
    off: s.status === "off",
    retry: () => ensurePlacesLoaded(true),
  };
}

/* ─── Writes ─────────────────────────────────────────────────────────── */

/** What a write did, for the words on the screen. */
export type PlaceSave = "saved" | "off" | "failed";

type Client = Awaited<ReturnType<typeof db>>;

/**
 * The one-home rule: the unique index allows one `is_home` per patient, so
 * the old home is cleared before another is set.
 */
async function clearHome(client: Client, userId: string): Promise<{ code?: string } | null> {
  const { error } = await client
    .from("patient_places")
    .update({ is_home: false })
    .eq("patient_user_id", userId)
    .eq("is_home", true);
  return error;
}

async function write(
  run: (client: Client, userId: string) => Promise<{ code?: string } | null>,
): Promise<PlaceSave> {
  try {
    const userId = await currentUserId();
    if (!userId) return "failed";
    const error = await run(await db(), userId);
    if (isMissingTable(error)) return "off";
    if (error) return "failed";
    ensurePlacesLoaded(true);
    return "saved";
  } catch {
    return "failed";
  }
}

/** Save a new place under PLACE_CONSENT. `makeHome` clears the old home first. */
export function addPlace(input: PlaceInput, makeHome: boolean, now: Date): Promise<PlaceSave> {
  return write(async (client, userId) => {
    if (makeHome) {
      const e = await clearHome(client, userId);
      if (e) return e;
    }
    const { error } = await client.from("patient_places").insert({
      ...toDb(input),
      patient_user_id: userId,
      is_home: makeHome,
      consent_version: PLACE_CONSENT.version,
      consented_at: now.toISOString(),
    });
    return error;
  });
}

/** Move the pin, rename, or change the label. Home stays as it was. */
export function updatePlace(id: string, input: PlaceInput): Promise<PlaceSave> {
  return write(async (client) => {
    const { error } = await client.from("patient_places").update(toDb(input)).eq("id", id);
    return error;
  });
}

export function deletePlace(id: string): Promise<PlaceSave> {
  return write(async (client) => {
    const { error } = await client.from("patient_places").delete().eq("id", id);
    return error;
  });
}

/** Make one place the home: clear the old home, then set this one. */
export function setHome(id: string): Promise<PlaceSave> {
  return write(async (client, userId) => {
    const e = await clearHome(client, userId);
    if (e) return e;
    const { error } = await client.from("patient_places").update({ is_home: true }).eq("id", id);
    return error;
  });
}

/** "Home · Work · 1 more", or nothing saved. */
export function placesSummary(places: Place[]): string {
  if (!places.length) return "None saved yet";
  const names = places.slice(0, 2).map(placeLabel);
  const more = places.length - names.length;
  return more > 0 ? `${names.join(" · ")} · ${more} more` : names.join(" · ");
}
