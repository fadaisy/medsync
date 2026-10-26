import type { Place, PlaceInput } from "@patient-core/me-places";
import type { LocationGeocodedAddress } from "expo-location";
import { useEffect } from "react";
import {
  ADDRESS_MAX,
  fromDb,
  isMissingTable,
  PLACE_CONSENT,
  sortPlaces,
  toDb,
} from "@patient-core/me-places";
import AsyncStorage from "@react-native-async-storage/async-storage";

import { onAccountChange } from "@/data/health-log";
import { createStore, useStore } from "@/data/store";
import { currentUserId, db } from "@/offline/outbox";

export type { Place, PlaceInput, PlaceKind } from "@patient-core/me-places";
export {
  ADDRESS_MAX,
  LABEL_MAX,
  OFF_WORDS,
  PLACE_CONSENT,
  PLACE_KINDS,
  fromDb,
  isMissingTable,
  kindWords,
  labelProblem,
  placeLabel,
  placesSummary,
  toDb,
} from "@patient-core/me-places";

/* ─── Mapping ────────────────────────────────────────────────────────── */

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
