import { useEffect, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";

import { createStore, useStore } from "@/data/store";
import { fetchPatientProfile } from "@/lib/booking";
import { flag } from "@/lib/flags";

/**
 * Me: who the patient is, their health card, and the phone's own settings.
 *
 * Two kinds of data, kept apart on purpose:
 * - Identity (name, patient code, home facility, sex) is REAL: the session's
 *   metadata and `fetchPatientProfile()` under RLS. It is cached on the phone
 *   per account so the health card and Help's medic card draw with no network.
 * - Clinical fields (conditions, allergies, medicines, last BP, primary
 *   doctor, emergency contact, record openings, payments) are DEMO until
 *   Gate CG (law L2), placeholders only (law L14).
 */

/* ── Demo fixture ───────────────────────────────────────────────────── */

export const meDemo = {
  demo: !flag("mobileClinicalData"),
  conditions: ["Diabetes", "High blood pressure"],
  conditionsShort: "Diabetes · High BP",
  allergies: "None recorded",
  medicines: ["[Medicine A]", "[Medicine B]", "[Medicine C]"],
  medicinesLine: "3 medicines · 1 refill ready",
  lastBp: "138/86 at 07:40",
  primaryDoctor: "Dr [Name A] · Diabetes clinic",
  contact: "[Name] · 0772 ··· 210",
  contactLong: "[Name] · son · 0772 ··· 210",
  lastOpened: "Last: Nurse [Name], Wed 14 Oct",
  payments: "Mobile Money · 0772 ··· 418",
  bloodGroup: "Not recorded",
} as const;

/* ── Phone settings (stored on this phone only) ─────────────────────── */

export interface MePrefs {
  lang: "en" | "lg";
  /** Text size A+ (larger). */
  big: boolean;
  /** Demo switch: nothing is shared from the phone before Gate CG. */
  shareReadings: boolean;
  /** PRD Q6, owner decision: conditions on the card's back are hidden until the patient shows them. */
  showConditionsOnCard: boolean;
}

const PREFS_KEY = "medsync:me-prefs";
const DEFAULT_PREFS: MePrefs = {
  lang: "en",
  big: false,
  shareReadings: true,
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
  sex: string | null;
}

const EMPTY: CardIdentity = { name: null, code: null, facility: null, sex: null };
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
        if (!cancelled && raw) setRead({ userId, value: JSON.parse(raw) as CardIdentity });
      })
      .catch(() => {})
      .then(() => fetchPatientProfile())
      .then((p) => {
        if (cancelled || !p) return;
        const value: CardIdentity = {
          name: null,
          code: p.patientCode,
          facility: p.hospitalName,
          sex: p.sex,
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
