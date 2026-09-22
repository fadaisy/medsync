import type { Ionicons } from "@expo/vector-icons";
import type {
  ItemFlag,
  ServiceLineHint,
  SubmissionAudience,
  Tier,
} from "@shared/symptom-catalog/types";
import { useEffect, useState } from "react";
import { CATALOG, CATALOG_CHECKSUM } from "@shared/symptom-catalog/catalog.v0.1";
import * as SecureStore from "expo-secure-store";

import { callEdge, requestId } from "@/lib/edge";
import { supabase } from "@/lib/supabase";

/**
 * The phone side of the symptom catalog (PRD MS-PRD-SYM-001; ADR 0098): the
 * three functions the screens call, the device hash they send, and the one
 * question every surface asks first — may the catalog render at all.
 *
 * Classification itself never comes through here: it runs on the device
 * over the bundled package (`@shared/symptom-catalog/classify`), offline,
 * and the server recomputes it on submit. What crosses the wire is the
 * patient's choices, never a tier.
 */

export type CatalogMode = "signed" | "draft_watermarked" | "off";

/**
 * Gate CS (ADR 0098 ruling 2), on the phone: the flag must be on, and in
 * production the bundled version must have a `signed` row in
 * `patient_symptom_catalog_versions` (public RLS). Anywhere else the draft
 * renders under the "Unsigned clinical content" watermark. Cached for the
 * session: the answer cannot change under a running app.
 */
let modePromise: Promise<CatalogMode> | null = null;

export function catalogMode(): Promise<CatalogMode> {
  modePromise ??= (async () => {
    if (process.env.EXPO_PUBLIC_FEATURE_SYMPTOM_CATALOG !== "1") return "off";
    // Gate CS is the row being signed AND carrying the bundled checksum (the
    // web's test). A read that FAILED (offline first launch) is not an
    // answer: the memo is dropped so the next screen asks again.
    const { data, error } = await supabase
      .from("patient_symptom_catalog_versions")
      .select("version, checksum")
      .eq("version", CATALOG.version)
      .eq("status", "signed")
      .maybeSingle();
    if (error) {
      modePromise = null;
      throw error;
    }
    if (data && (data as { checksum: string }).checksum === CATALOG_CHECKSUM) return "signed";
    return process.env.EXPO_PUBLIC_MEDSYNC_ENV === "production" ? "off" : "draft_watermarked";
  })();
  return modePromise;
}

/** `null` until known — a screen renders neither picker until then, so nothing flips. */
export function useCatalogMode(): CatalogMode | null {
  const [mode, setMode] = useState<CatalogMode | null>(null);
  useEffect(() => {
    let live = true;
    catalogMode()
      .then((m) => {
        if (live) setMode(m);
      })
      // Unreadable now (offline): the old picker this time; the memo was
      // dropped, so the next screen asks again.
      .catch(() => {
        if (live) setMode("off");
      });
    return () => {
      live = false;
    };
  }, []);
  return mode;
}

/* ── Device hash ─────────────────────────────────────────────────── */

const DEVICE_KEY = "medsync.device-hash";
let deviceHashPromise: Promise<string> | null = null;

/**
 * A random id minted once and kept in the keychain — never the phone's
 * real identifiers. It rate-limits pre-alerts per device (PRD §8.7) and
 * nothing else; a reinstall is a new device, which is the honest reading.
 */
export function deviceHash(): Promise<string> {
  deviceHashPromise ??= (async () => {
    try {
      const stored = await SecureStore.getItemAsync(DEVICE_KEY);
      if (stored) return stored;
      const minted = `dev-${requestId().slice(4)}-${Math.random().toString(36).slice(2, 10)}`;
      await SecureStore.setItemAsync(DEVICE_KEY, minted);
      return minted;
    } catch {
      // No keychain (Expo Go on web, a locked device): a per-launch id.
      return `dev-${requestId().slice(4)}`;
    }
  })();
  return deviceHashPromise;
}

/* ── The three functions ─────────────────────────────────────────── */

export interface SubmissionResult {
  submission_id: string;
  tier: Tier;
  reasons: string[];
  flags: ItemFlag[];
  service_line_hint: ServiceLineHint | null;
  catalog_version: string;
}

/** `pt-submit-symptoms`: the choices go up, the server's own tier comes back. */
export async function submitSymptoms(input: {
  hospitalId?: string | null;
  audience: SubmissionAudience;
  pregnant: boolean;
  items: string[];
  qualifiers: Record<string, Record<string, string>>;
  freeText?: string | null;
}) {
  return callEdge<SubmissionResult>("pt-submit-symptoms", {
    ...(input.hospitalId ? { hospital_id: input.hospitalId } : {}),
    audience: input.audience,
    pregnant: input.pregnant,
    items: input.items,
    qualifiers: input.qualifiers,
    free_text: input.freeText?.trim() || null,
    channel: "app",
    device_hash: await deviceHash(),
  });
}

export interface SameDayReceipt {
  appointment_id: string;
  status: string;
  booking_code: string | null;
  position_number: number | null;
  arrival_window_start: string | null;
  arrival_window_end: string | null;
}

export type SameDayResult =
  | { ok: true; data: SameDayReceipt }
  /** `noSlot`: the 404 `no_same_day_slot` — offer today's queue, not an error. */
  | { ok: false; error: string; noSlot: boolean };

/**
 * `pt-request-same-day`: the earliest slot today at this hospital, booked
 * as urgent. The 404 `no_same_day_slot` is a cue, not an error: the screen
 * offers today's queue instead.
 */
export async function requestSameDay(input: {
  hospitalId: string;
  submissionId: string;
  departmentId?: string;
  idempotencyKey: string;
}): Promise<SameDayResult> {
  const res = await callEdge<SameDayReceipt>("pt-request-same-day", {
    hospital_id: input.hospitalId,
    submission_id: input.submissionId,
    ...(input.departmentId ? { department_id: input.departmentId } : {}),
    idempotency_key: input.idempotencyKey,
  });
  if (res.ok) return res;
  return { ok: false, error: res.error, noSlot: res.code === "no_same_day_slot" };
}

/** `pt-emergency-event`: best effort, never awaited by a screen, never fails one. */
export function emergencyEvent(input: {
  event: "interrupt_shown" | "declined" | "call_tapped";
  itemKey?: string;
  contactId?: string;
  submissionId?: string | null;
}): void {
  void callEdge("pt-emergency-event", {
    event: input.event,
    ...(input.itemKey ? { item_key: input.itemKey } : {}),
    ...(input.contactId ? { contact_id: input.contactId } : {}),
    ...(input.submissionId ? { submission_id: input.submissionId } : {}),
  }).catch(() => {});
}

/* ── Icons ───────────────────────────────────────────────────────── */

type IconName = keyof typeof Ionicons.glyphMap;

/** The package's icon keys → Ionicons. Always drawn beside words (PRD §7.1). */
const ICON: Record<string, IconName> = {
  lungs: "pulse-outline",
  brain: "bulb-outline",
  belly: "nutrition-outline",
  thermometer: "thermometer-outline",
  bandage: "bandage-outline",
  gauge: "speedometer-outline",
  eye: "eye-outline",
  ear: "ear-outline",
  nose: "body-outline",
  throat: "mic-outline",
  droplet: "water-outline",
  bone: "fitness-outline",
  hand: "hand-left-outline",
  mind: "happy-outline",
  child: "people-outline",
  heart: "heart-outline",
  calendar: "calendar-outline",
};

export const iconFor = (key: string): IconName => ICON[key] ?? "medkit-outline";
