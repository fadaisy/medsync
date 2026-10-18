import { useEffect, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";

import { createStore, useStore } from "@/data/store";
import { fetchPatientProfile } from "@/lib/booking";

/**
 * Me: who the patient is, their health card, and the phone's own settings.
 *
 * All REAL: the session's metadata and `fetchPatientProfile()` under RLS
 * (patient code, home facility, sex, date of birth, and the conditions the
 * patient wrote on their own profile). Cached on the phone per account so the
 * health card and Help's medic card draw with no network.
 *
 * The patient's own conditions, allergies and family history live in
 * `@/data/history` (ADR 0355). Not shown, because the phone cannot read it
 * truthfully: the clinical record's allergies (not the patient's to read yet,
 * ADR 0342), a primary doctor (no such record), the emergency contact's
 * number (encrypted server-side; only *that* one is on file), blood group
 * (not recorded).
 */

/* ── Phone settings (stored on this phone only) ─────────────────────── */

export interface MePrefs {
  lang: "en" | "lg";
  /** Text size A+ (larger). */
  big: boolean;
  /** PRD Q6, owner decision: conditions on the card's back are hidden until the patient shows them. */
  showConditionsOnCard: boolean;
}

const PREFS_KEY = "medsync:me-prefs";
const DEFAULT_PREFS: MePrefs = {
  lang: "en",
  big: false,
  showConditionsOnCard: false,
};

const prefsStore = createStore<MePrefs>(DEFAULT_PREFS);
let hydrated = false;
function hydrate() {
  if (hydrated) return;
  hydrated = true;
  AsyncStorage.getItem(PREFS_KEY)
    .then((raw) => {
      if (raw) prefsStore.set({ ...DEFAULT_PREFS, ...(JSON.parse(raw) as Partial<MePrefs>) });
    })
    // An unreadable store means the defaults, not a broken screen.
    .catch(() => {});
}

export function useMePrefs(): [MePrefs, (patch: Partial<MePrefs>) => void] {
  useEffect(hydrate, []);
  const prefs = useStore(prefsStore);
  const update = (patch: Partial<MePrefs>) => {
    prefsStore.set((p) => ({ ...p, ...patch }));
    void AsyncStorage.setItem(PREFS_KEY, JSON.stringify(prefsStore.get())).catch(() => {});
  };
  return [prefs, update];
}

/* ── Identity, cached for offline ───────────────────────────────────── */

export interface CardIdentity {
  name: string | null;
  /** `patient_profiles.patient_code`, the DB-issued code reception matches at the desk. */
  code: string | null;
  facility: string | null;
  /** The home facility's activated emergency number, or null (never guessed). */
  emergencyPhone: string | null;
  sex: string | null;
  /** `patient_profiles.date_of_birth`, "YYYY-MM-DD". */
  dob: string | null;
  /** The patient's older free-text `known_conditions` (from the web profile), before ADR 0355. */
  conditions: string[];
}

const EMPTY: CardIdentity = {
  name: null,
  code: null,
  facility: null,
  emergencyPhone: null,
  sex: null,
  dob: null,
  conditions: [],
};
const cardKey = (userId: string) => `medsync:health-card:${userId}`;

/**
 * The card's identity for one account: the phone's cached copy first (so it
 * renders offline), then the profile, which replaces and re-caches it. Keyed
 * by user so the next account on this phone never sees the last one's card.
 * `userId` null (signed out) gives nothing.
 */
export function useCardIdentity(userId: string | null, name: string | null): CardIdentity {
  const [read, setRead] = useState<{ userId: string; value: CardIdentity } | null>(null);
  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    AsyncStorage.getItem(cardKey(userId))
      .then((raw) => {
        // An older cached copy lacks the newer fields: the defaults fill them.
        if (!cancelled && raw)
          setRead({ userId, value: { ...EMPTY, ...(JSON.parse(raw) as Partial<CardIdentity>) } });
      })
      .catch(() => {})
      .then(() => fetchPatientProfile())
      .then((p) => {
        if (cancelled || !p) return;
        const value: CardIdentity = {
          name: null,
          code: p.patientCode,
          facility: p.hospitalName,
          emergencyPhone: p.emergencyPhone,
          sex: p.sex,
          dob: p.dateOfBirth,
          conditions: p.knownConditions,
        };
        setRead({ userId, value });
        void AsyncStorage.setItem(cardKey(userId), JSON.stringify(value)).catch(() => {});
      })
      // Offline or refused: keep what the cache gave.
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [userId]);
  const value = read && read.userId === userId ? read.value : EMPTY;
  return { ...value, name: name ?? value.name };
}

/* ── Formatting ─────────────────────────────────────────────────────── */

/** "MS-2026-00042" → "MS 2026 00042": spaced for the card's mono line. */
export function cardNumber(code: string | null): string {
  return code ? code.replace(/-/g, " ") : "Given at your first visit";
}

/**
 * Whole years from a "YYYY-MM-DD" date of birth to `now`, or null when there
 * is no usable date. A birthday later this year has not happened yet.
 */
export function ageFrom(dob: string | null, now: Date): number | null {
  const m = dob ? /^(\d{4})-(\d{2})-(\d{2})/.exec(dob) : null;
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const thisYear = now.getFullYear();
  const before =
    now.getMonth() + 1 < mo || (now.getMonth() + 1 === mo && now.getDate() < d) ? 1 : 0;
  const age = thisYear - y - before;
  return age >= 0 && age < 130 ? age : null;
}

/** "34 years", or null. */
export function ageWords(dob: string | null, now: Date): string | null {
  const age = ageFrom(dob, now);
  return age === null ? null : `${age} ${age === 1 ? "year" : "years"}`;
}

/** `patient_profiles.sex` → the card's one letter; anything else says nothing. */
export function sexLetter(sex: string | null): string | null {
  const s = sex?.toLowerCase();
  return s === "female" ? "F" : s === "male" ? "M" : null;
}

/** The account holder's name from auth metadata (`full_name`, written at sign-up). */
export function metaName(meta: Record<string, unknown> | undefined): string | null {
  const n = meta?.full_name;
  return typeof n === "string" && n.trim() ? n.trim() : null;
}

/** "First Last" → "FL". */
export function initials(name: string | null): string {
  if (!name) return "Me";
  const parts = name.split(/\s+/).filter(Boolean);
  return (parts[0][0] + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase();
}
