import { useEffect } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Location from "expo-location";

import { createStore, useStore } from "@/data/store";
import { currentUserId, db } from "@/offline/outbox";

/**
 * "Share my live location" (ADR 0402, migration 0185): one row in
 * `public.location_shares`, patient-only under RLS. The database makes the
 * link's token; the phone only keeps the latest position on the row (never a
 * trail), at most one write every 20 seconds, and only while MedSync is open
 * (Expo Go has no background location on iOS). Family read it through
 * `location_share_view(token)` on the web page `/share/location/<token>`.
 *
 * The active share's id is remembered on the phone, so it resumes after a
 * restart while still live, and is closed cleanly once it has ended.
 */

export type SharePurpose = "emergency" | "visit" | "other";
export type ShareLength = 15 | 60 | "until stopped";

/** The table's cap (`location_shares_window`): "until I stop" means at most 8 hours. */
export const SHARE_MAX_MINUTES = 8 * 60;

/** What the patient agrees to before the first position leaves the phone. */
export const SHARE_CONSENT = {
  version: "location-share-v1",
  words:
    "Anyone with the link can see where this phone is, until the share ends. They see your position only, not your name. It ends when you stop it or when the time you chose runs out, at most 8 hours.",
} as const;

export const SHARE_OFF = "Location sharing is not switched on yet.";
export const SHARE_OPEN_ONLY =
  "It only updates while MedSync is open on this phone. Keep the app open while you travel.";
export const SHARE_NO_LINK =
  "This build cannot make the link yet, but your position is still being recorded for the share.";

const KEY = "medsync:location-share";
const WRITE_EVERY_MS = 20_000;

export function shareMinutes(length: ShareLength): number {
  return length === "until stopped" ? SHARE_MAX_MINUTES : length;
}

/** The family link, or null when this build has no web origin to point at. */
export function shareLink(token: string, origin = process.env.EXPO_PUBLIC_WEB_ORIGIN) {
  return origin ? `${origin.replace(/\/+$/, "")}/share/location/${token}` : null;
}

/** "14:30": the end time, read on the phone's own clock. */
export function clockWords(d: Date): string {
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

/** "25 min left", "2 h 10 min left", "ending now". */
export function leftWords(end: Date, now: Date): string {
  const min = Math.ceil((end.getTime() - now.getTime()) / 60_000);
  if (min <= 0) return "ending now";
  if (min < 60) return `${min} min left`;
  return `${Math.floor(min / 60)} h${min % 60 ? ` ${min % 60} min` : ""} left`;
}

/** True when the table is not there yet (0185 not applied): PostgREST's own words for it. */
export function isMissingTable(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  return (
    error.code === "PGRST205" ||
    error.code === "42P01" ||
    /does not exist|schema cache/i.test(error.message ?? "")
  );
}

/** At most one write every 20 seconds: true when this fix should be sent. */
export function shouldWrite(lastWriteMs: number | null, nowMs: number): boolean {
  return lastWriteMs === null || nowMs - lastWriteMs >= WRITE_EVERY_MS;
}

interface Share {
  id: string;
  token: string;
  endsAt: string;
  lastSentAt: string | null;
  /** The last position sent, for the sheet's satellite preview; kept on this phone only. */
  lastPos?: { lat: number; lng: number } | null;
}

const store = createStore<Share | null>(null);
let watcher: Location.LocationSubscription | null = null;
let endTimer: ReturnType<typeof setTimeout> | null = null;
let lastWriteMs: number | null = null;

function remember(share: Share | null) {
  const job = share
    ? AsyncStorage.setItem(KEY, JSON.stringify({ id: share.id }))
    : AsyncStorage.removeItem(KEY);
  void job.catch(() => {});
}

function quiet() {
  watcher?.remove();
  watcher = null;
  if (endTimer) clearTimeout(endTimer);
  endTimer = null;
  lastWriteMs = null;
}

/** Watch the phone's position and send it to the row, until the share ends. */
async function follow(share: Share) {
  const client = await db();
  quiet();
  store.set(share);
  remember(share);
  const left = new Date(share.endsAt).getTime() - Date.now();
  endTimer = setTimeout(() => void end(share.id), Math.max(0, left));
  watcher = await Location.watchPositionAsync(
    { accuracy: Location.Accuracy.Balanced, timeInterval: 30_000, distanceInterval: 25 },
    (pos) => {
      const nowMs = Date.now();
      if (store.get()?.id !== share.id || !shouldWrite(lastWriteMs, nowMs)) return;
      lastWriteMs = nowMs;
      const at = new Date(pos.timestamp || nowMs).toISOString();
      const lat = Number(pos.coords.latitude.toFixed(6));
      const lng = Number(pos.coords.longitude.toFixed(6));
      void client
        .from("location_shares")
        .update({
          lat,
          lng,
          accuracy_m:
            pos.coords.accuracy === null ? null : Math.round(pos.coords.accuracy * 10) / 10,
          position_at: at,
        })
        .eq("id", share.id)
        .then(({ error }) => {
          const now = store.get();
          if (!error && now?.id === share.id)
            store.set({ ...now, lastSentAt: at, lastPos: { lat, lng } });
        });
    },
  );
  // Stopped while permission was being read: drop the watcher we just made.
  if (store.get()?.id !== share.id) quiet();
}

/** The share's time is up: the link already shows nothing; close the row and forget it. */
async function end(id: string) {
  if (store.get()?.id === id) {
    quiet();
    store.set(null);
    remember(null);
  }
  try {
    await (await db())
      .from("location_shares")
      .update({ stopped_at: new Date().toISOString() })
      .eq("id", id)
      .is("stopped_at", null);
  } catch {
    // Offline: the row has ended anyway, and the link already shows nothing.
  }
}

export type StartResult = { ok: true; link: string | null } | { ok: false; error: string };

/** Ask for location, make the row, then follow the phone. */
export async function startShare(purpose: SharePurpose, length: ShareLength): Promise<StartResult> {
  try {
    const perm = await Location.requestForegroundPermissionsAsync();
    if (!perm.granted)
      return {
        ok: false,
        error: "Location is off for MedSync. Allow it in your phone's settings to share.",
      };
    const userId = await currentUserId();
    if (!userId) return { ok: false, error: "Sign in to share your location." };

    const stopError = await stopShare();
    if (stopError) return { ok: false, error: stopError };

    // Both ends from one clock, so the 8-hour window holds whatever the phone's time.
    const startedMs = Date.now();
    const { data, error } = await (
      await db()
    )
      .from("location_shares")
      .insert({
        patient_user_id: userId,
        purpose,
        started_at: new Date(startedMs).toISOString(),
        ends_at: new Date(startedMs + shareMinutes(length) * 60_000).toISOString(),
        consent_version: SHARE_CONSENT.version,
      })
      .select("id, token, ends_at")
      .single<{ id: string; token: string; ends_at: string }>();
    if (error || !data)
      return {
        ok: false,
        error: isMissingTable(error) ? SHARE_OFF : "Couldn't start sharing. Try again.",
      };
    await follow({ id: data.id, token: data.token, endsAt: data.ends_at, lastSentAt: null });
    return { ok: true, link: shareLink(data.token) };
  } catch {
    return { ok: false, error: "Couldn't start sharing. Try again." };
  }
}

/**
 * Stop now. Only forgotten once the database has it, so a failed stop keeps
 * the banner (the link would still show the last position) and Stop can be
 * pressed again. Null on success, else the sentence to show.
 */
export async function stopShare(): Promise<string | null> {
  const share = store.get();
  if (!share) return null;
  let error: { code?: string; message?: string } | null;
  try {
    ({ error } = await (await db())
      .from("location_shares")
      .update({ stopped_at: new Date().toISOString() })
      .eq("id", share.id));
  } catch {
    error = { message: "offline" };
  }
  if (error && !isMissingTable(error))
    return "Couldn't reach MedSync to stop sharing. Check your connection and try again.";
  quiet();
  store.set(null);
  remember(null);
  return null;
}

let hydrated = false;
/** After a restart: resume a share that is still live, close one that has ended. */
async function hydrate() {
  if (hydrated) return;
  hydrated = true;
  try {
    const raw = await AsyncStorage.getItem(KEY);
    const id = raw ? (JSON.parse(raw) as { id?: string }).id : undefined;
    if (!id || store.get()) return;
    const { data } = await (await db())
      .from("location_shares")
      .select("id, token, ends_at, stopped_at")
      .eq("id", id)
      .maybeSingle<{ id: string; token: string; ends_at: string; stopped_at: string | null }>();
    const perm = await Location.getForegroundPermissionsAsync();
    if (data && !data.stopped_at && new Date(data.ends_at).getTime() > Date.now() && perm.granted)
      await follow({ id: data.id, token: data.token, endsAt: data.ends_at, lastSentAt: null });
    else if (data && !data.stopped_at) await end(data.id);
    else remember(null);
  } catch {
    // Unreadable store or offline: nothing resumes; the share still ends on its own.
  }
}

export interface ActiveShare {
  active: boolean;
  endsAt: Date | null;
  link: string | null;
  lastSentAt: Date | null;
  /** Where the family link shows the phone now, once a position has been sent. */
  position: { lat: number; lng: number } | null;
  stop: () => Promise<string | null>;
}

export function useActiveShare(): ActiveShare {
  useEffect(() => void hydrate(), []);
  const share = useStore(store);
  return {
    active: share !== null,
    endsAt: share ? new Date(share.endsAt) : null,
    link: share ? shareLink(share.token) : null,
    lastSentAt: share?.lastSentAt ? new Date(share.lastSentAt) : null,
    position: share?.lastPos ?? null,
    stop: stopShare,
  };
}
