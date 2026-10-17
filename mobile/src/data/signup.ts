import AsyncStorage from "@react-native-async-storage/async-storage";
import * as LocalAuthentication from "expo-local-authentication";

import { track } from "@/lib/analytics";
import { supabase } from "@/lib/supabase";

/**
 * Getting in (Tide v1 F-01–F-03): sign-in, the phone code and sign-up.
 *
 * Real, not fixtures: auth is Supabase's own, and sign-up goes through the
 * web's one patient onboarding path (`/api/mobile/patient-signup`, which
 * calls `submitPatientSignup` unchanged). Screens call these and never
 * import Supabase. Nothing here logs a value a patient typed.
 */

const ORIGIN = process.env.EXPO_PUBLIC_WEB_ORIGIN;
const SIGNUP_URL = ORIGIN ? `${ORIGIN.replace(/\/$/, "")}/api/mobile/patient-signup` : null;

/** False until the build names the web origin; sign-up then says so instead of failing. */
export const signupFromAppOn = SIGNUP_URL !== null;

export type AuthOutcome = { ok: true } | { ok: false; message: string };

const OFFLINE = "Couldn't reach MedSync. Check your connection and try again.";

/* ─── Sign in ────────────────────────────────────────────────────────── */

export async function signInWithPassword(email: string, password: string): Promise<AuthOutcome> {
  try {
    const { error } = await supabase.auth.signInWithPassword({
      // Trimmed and lowercased: a phone keyboard capitalises the first letter
      // and a trailing space is invisible. Neither should cost an attempt.
      email: email.trim().toLowerCase(),
      password,
    });
    // Deliberately generic, matching the web: telling "no such account" from
    // "wrong password" reveals who is a patient at a hospital.
    if (error)
      return {
        ok: false,
        message: "That email and password don't match. Check them and try again.",
      };
    return { ok: true };
  } catch {
    // Network, DNS, captive portal: a different remedy from a wrong password.
    return { ok: false, message: OFFLINE };
  }
}

/** Sends the SMS code. Never creates an account: phone codes are for people who have one. */
export async function sendPhoneCode(phoneE164: string): Promise<AuthOutcome> {
  try {
    const { error } = await supabase.auth.signInWithOtp({
      phone: phoneE164,
      options: { shouldCreateUser: false },
    });
    if (error)
      return {
        ok: false,
        message: "We couldn't send a code to that number. Check it, or sign in with your password.",
      };
    return { ok: true };
  } catch {
    return { ok: false, message: OFFLINE };
  }
}

export async function verifyPhoneCode(phoneE164: string, code: string): Promise<AuthOutcome> {
  try {
    const { error } = await supabase.auth.verifyOtp({ phone: phoneE164, token: code, type: "sms" });
    if (error) return { ok: false, message: "That code didn't work. Check it, or send a new one." };
    return { ok: true };
  } catch {
    return { ok: false, message: OFFLINE };
  }
}

/* ─── "Use fingerprint next time" ────────────────────────────────────── */

const BIO_KEY = "medsync-bio-next-time-v1";

/** Whether this phone can offer a fingerprint at all: hardware and one enrolled. */
export async function fingerprintAvailable(): Promise<boolean> {
  try {
    return (
      (await LocalAuthentication.hasHardwareAsync()) &&
      (await LocalAuthentication.isEnrolledAsync())
    );
  } catch {
    return false;
  }
}

/** The saved choice. Off unless the patient turned it on (default off). */
export async function readFingerprintChoice(): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(BIO_KEY)) === "1";
  } catch {
    return false;
  }
}

export async function saveFingerprintChoice(on: boolean): Promise<void> {
  try {
    await AsyncStorage.setItem(BIO_KEY, on ? "1" : "0");
  } catch {
    // A locked store forgets a preference, not the sign-in.
  }
}

/* ─── Sign-up ────────────────────────────────────────────────────────── */

export interface SignupNotice {
  open: boolean;
  notice: { version: string; sha: string; body: string; effective: string } | null;
  summary: string[];
  agree: string;
  sms: {
    version: string;
    sha: string;
    body: string;
    label: string;
    declined: string;
    receipt: string;
  } | null;
}

export interface PlaceOption {
  code: string;
  name: string;
  label: string;
  path: string;
  level: "district" | "subcounty";
  region: string;
}

/** The web action's `SignupResult`. */
export type SignupResult =
  | { ok: true; next: string; uploads: string[] }
  | { ok: false; fieldErrors?: Record<string, string>; formError?: string };

/** The live notice and SMS text, read when step 4 opens so consent binds to what is shown. */
export async function fetchSignupNotice(): Promise<SignupNotice | null> {
  if (!SIGNUP_URL) return null;
  try {
    const res = await fetch(SIGNUP_URL);
    return res.ok ? ((await res.json()) as SignupNotice) : null;
  } catch {
    return null;
  }
}

/** The web's UBOS place search (district or subcounty; parish is not in the data yet). */
export async function searchPlaces(query: string): Promise<PlaceOption[]> {
  if (!SIGNUP_URL || query.trim().length < 2) return [];
  try {
    const res = await fetch(`${SIGNUP_URL}?q=${encodeURIComponent(query.trim())}`);
    if (!res.ok) return [];
    return ((await res.json()) as { places: PlaceOption[] }).places;
  } catch {
    return [];
  }
}

export async function submitSignup(
  input: Record<string, unknown>,
  key: string,
): Promise<SignupResult> {
  if (!SIGNUP_URL) return { ok: false, formError: "Sign-up from the app is not switched on yet." };
  try {
    const res = await fetch(SIGNUP_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ input, key }),
    });
    const result = (await res.json()) as SignupResult;
    if (result.ok) track("signup_completed");
    return result;
  } catch {
    return { ok: false, formError: OFFLINE };
  }
}

/* ─── The home pin (migration 0170) ──────────────────────────────────── */

/**
 * After sign-up AND sign-in: the patient's own `patient_profiles` row takes
 * the pin, the consent version and when (policy `patient_profiles_update_own`,
 * migration 0011). All four go together, as the 0170 check demands; saying no
 * calls nothing. False on any failure, including 0170 not applied yet: the
 * account is made either way, and the screen says the pin was not saved.
 * The coordinates are never logged.
 */
export async function saveHomePin(
  at: { lat: number; lng: number },
  consentVersion: string,
  now: Date,
): Promise<boolean> {
  try {
    const { data } = await supabase.auth.getSession();
    const userId = data.session?.user.id;
    if (!userId) return false;
    const { error } = await supabase
      .from("patient_profiles")
      .update({
        // numeric(9,6): six places is about 10 cm, finer than any pin.
        home_pin_lat: Number(at.lat.toFixed(6)),
        home_pin_lng: Number(at.lng.toFixed(6)),
        home_pin_consent_version: consentVersion,
        home_pin_consented_at: now.toISOString(),
      })
      .eq("id", userId);
    return !error;
  } catch {
    return false;
  }
}

/* ─── The drawn map (art, not UI) ────────────────────────────────────── */

/**
 * The colours of the "Pin your home" drawing. Illustration, so they live
 * with the data: paper, water, parks, blocks, roads and labels. The pin
 * itself uses the theme (navy with a teal centre, never red).
 */
export const MAP_ART = {
  paper: "#f2efe9",
  water: "#aadaff",
  park: "#c8e6c9",
  block: "#e8e3da",
  road: "#ffffff",
  roadEdge: "#dadce0",
  main: "#fde293",
  mainEdge: "#f9c74f",
  label: "#5f6368",
  waterLabel: "#4a7dbf",
  mainLabel: "#9a7b1c",
  clinic: "#296a89",
  shadow: "rgba(0, 0, 0, 0.25)",
} as const;
