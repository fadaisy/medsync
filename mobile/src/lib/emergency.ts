import type { EdgeResult } from "@/lib/edge";
import type { FacilityForOrdering } from "@/lib/nearest";
import type { EtaBand, PreArrivalStatus, TransportMode } from "@shared/pre-arrival";
import type { CatalogItem, SubmissionAudience, Tier } from "@shared/symptom-catalog/types";
import { useEffect, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { CATALOG } from "@shared/symptom-catalog/catalog.v0.1";
import { dangerSigns } from "@shared/symptom-catalog/classify";
import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

import { callEdge } from "@/lib/edge";

/**
 * The Emergency Pathway's data layer on the phone (PRD MS-PRD-SYM-001 §8;
 * ADR 0098 rulings 7–9, 12). Every call here works SIGNED OUT — `callEdge`
 * sends the anon key as the Bearer when there is no session, and the four
 * functions treat the caller as optional — because a bystander must be able
 * to act (§8.7). Nothing here is PHI except what the reporter types into the
 * pre-alert, and that goes to the function and nowhere else.
 */

/* ── Flags (ADR 0098 ruling 12; Gate CG: unset = off in production) ── */

/** "Tell a hospital I'm coming". Off: the sheet is call-only. Calling is never flagged. */
export const preAlertLive = (): boolean => process.env.EXPO_PUBLIC_FEATURE_PRE_ALERT === "1";
/** Unverified emergency numbers show only in a development build (`__DEV__`), watermarked. */
export const draftContactsVisible = (): boolean => __DEV__;
/** The two draft first-aid cards (PRD §5.6; Gate A item 5). */
export const firstAidCardsLive = (): boolean =>
  process.env.EXPO_PUBLIC_FEATURE_FIRST_AID_CARDS === "1";

/* ── The sheet (E1) ─────────────────────────────────────────────────── */

export type ContactKind = "general" | "ambulance" | "crisis" | "sv";

/** `pt-emergency-sheet`'s contact: `emergency_contacts` row or the synthetic `hospital:<id>`. */
export interface SheetContact {
  id: string;
  label: string;
  number: string;
  kind: ContactKind;
  scope: "national" | "district" | "facility";
  priority: number;
  verificationStatus: "verified" | "unverified" | "to_source";
  /** Present (non-production only) on a row that is not yet verified — shown under the watermark. */
  draft?: true;
}

export interface SheetFacility extends FacilityForOrdering {
  level: string;
  district: string | null;
  emergencyCapability: "none" | "daytime" | "24h";
  /** False → "Call only" (PRD §8.3). */
  preAlertEnabled: boolean;
  emergencyPhone: string | null;
  emergencySmsNumber: string | null;
  ambulanceNumber: string | null;
  emergencyEntranceDirections: string | null;
}

export interface EmergencySheet {
  contacts: SheetContact[];
  facilities: SheetFacility[];
  own: SheetFacility | null;
}

/**
 * The last good answer, so E1 renders OFFLINE (PRD §7.6): read before the
 * network, replaced after it. One entry per hospital scope, because the
 * signed-out sheet must not show a previous account's hospital line.
 */
const SHEET_CACHE_KEY = "medsync:emergency-sheet";
const cacheKey = (hospitalId: string | null) =>
  hospitalId ? `${SHEET_CACHE_KEY}:${hospitalId}` : SHEET_CACHE_KEY;

export async function readCachedSheet(hospitalId: string | null): Promise<EmergencySheet | null> {
  try {
    const raw = await AsyncStorage.getItem(cacheKey(hospitalId));
    return raw ? (JSON.parse(raw) as EmergencySheet) : null;
  } catch {
    return null;
  }
}

/** Network read; caches on success. Null on any failure — the caller keeps what it has. */
export async function fetchEmergencySheet(
  hospitalId: string | null,
): Promise<EmergencySheet | null> {
  const res = await callEdge<EmergencySheet>("pt-emergency-sheet", {
    ...(hospitalId ? { hospital_id: hospitalId } : {}),
    // Unverified numbers only in a development build (Expo Go / dev client):
    // a production build never asks, whatever the env says.
    ...(draftContactsVisible() ? { include_drafts: true } : {}),
  });
  if (!res.ok || !res.data) return null;
  void AsyncStorage.setItem(cacheKey(hospitalId), JSON.stringify(res.data)).catch(() => {});
  return res.data;
}

/** Cache first, then the network; `offline` is true only when both came back empty. */
export function useEmergencySheet(hospitalId: string | null): {
  sheet: EmergencySheet | null;
  offline: boolean;
} {
  const [sheet, setSheet] = useState<EmergencySheet | null>(null);
  const [offline, setOffline] = useState(false);
  useEffect(() => {
    let cancelled = false;
    let haveAny = false;
    readCachedSheet(hospitalId)
      .then((cached) => {
        if (cancelled || !cached) return;
        haveAny = true;
        setSheet(cached);
      })
      .then(() => fetchEmergencySheet(hospitalId))
      .then((fresh) => {
        if (cancelled) return;
        if (fresh) setSheet(fresh);
        else if (!haveAny) setOffline(true);
      });
    return () => {
      cancelled = true;
    };
  }, [hospitalId]);
  return { sheet, offline };
}

/**
 * "What's happening?" — the eight tiles E1 offers when opened from the pill
 * (PRD §8.2 item 4). Drawn from the catalog's own danger-sign strips
 * (Appendix A.0), never typed here: the adult four, then the first two for a
 * child of 2 months to 5 years, then the first two in pregnancy. Their keys
 * are what the pre-alert sends as `red_flags`.
 *
 * ponytail: a fixed audience order, so a content change flows but the mix
 * is an engineer's pick. Ceiling: the CSO wanting a different eight; upgrade
 * path is a `tileFor` list in the catalog package under Gate CS.
 */
export function e1Tiles(): CatalogItem[] {
  const seen = new Set<string>();
  const out: CatalogItem[] = [];
  const take = (audience: SubmissionAudience, n: number) => {
    for (const item of dangerSigns(CATALOG, audience).slice(0, n)) {
      if (!seen.has(item.key)) {
        seen.add(item.key);
        out.push(item);
      }
    }
  };
  take("adult", 4);
  take("child_2m_5y", 2);
  take("pregnant", 2);
  return out.slice(0, 8);
}

/* ── Events (audit: contact id only, never a number) ────────────────── */

export function emergencyEvent(
  event: "interrupt_shown" | "declined" | "call_tapped",
  extra: { item_key?: string; contact_id?: string; submission_id?: string } = {},
): void {
  // Best effort, fire and forget: a call must never wait on an audit row.
  void callEdge("pt-emergency-event", { event, ...extra }).catch(() => {});
}

/* ── The pre-alert (E2) and its status (E3) ─────────────────────────── */

/**
 * A stable, meaningless id for this install — the pre-alert rate limit's
 * key (3/hour/device, §8.7). Kept in the keychain so a reinstall, not a
 * relaunch, is what resets it; the server stores only its blind index.
 *
 * ponytail: `Math.random` hex, not a UUID — Hermes has no `crypto.randomUUID`
 * and this is a bucket key, not a secret. Ceiling: two installs drawing the
 * same 128 bits. Upgrade path: `expo-crypto` if it ever arrives for
 * something else.
 */
// SecureStore keys admit only [A-Za-z0-9._-]: a colon throws and would mint a
// fresh id every launch, defeating the per-device rate limit.
const DEVICE_KEY = "medsync.device-hash";
let deviceHashMemo: string | null = null;
export async function deviceHash(): Promise<string> {
  if (deviceHashMemo) return deviceHashMemo;
  const fresh = () =>
    Array.from({ length: 32 }, () => Math.floor(Math.random() * 16).toString(16)).join("");
  try {
    const stored = await SecureStore.getItemAsync(DEVICE_KEY);
    if (stored) return (deviceHashMemo = stored);
    const made = fresh();
    await SecureStore.setItemAsync(DEVICE_KEY, made);
    return (deviceHashMemo = made);
  } catch {
    // A device without a keychain (a simulator without one, a locked store):
    // the alert still goes, keyed for this launch only.
    return (deviceHashMemo = fresh());
  }
}

export interface PreArrivalInput {
  facility_id: string;
  submission_id?: string;
  subject: { audience: SubmissionAudience; age_band?: string; pregnant?: boolean };
  red_flags: string[];
  tier?: Tier;
  isolation_flag?: boolean;
  onset_at?: string;
  last_known_well_at?: string;
  transport_mode: TransportMode;
  eta_band: EtaBand;
  callback_phone?: string;
  share_location?: { lat: number; lng: number };
}

export interface PreArrivalReceipt {
  pre_arrival_id: string;
  token: string;
  status: PreArrivalStatus;
  expires_at: string;
  facility: {
    name: string;
    emergency_phone: string | null;
    emergency_sms_number: string | null;
    directions: string | null;
  };
  /** Composed server-side (`composeFacilitySms`); null when the facility has no SMS number. */
  sms_fallback_body: string | null;
}

export async function createPreArrival(
  input: PreArrivalInput,
): Promise<EdgeResult<PreArrivalReceipt>> {
  return callEdge<PreArrivalReceipt>("pt-create-pre-arrival", {
    ...input,
    device_hash: await deviceHash(),
  });
}

export interface PreArrivalView {
  status: PreArrivalStatus;
  acknowledged_at: string | null;
  ready_at: string | null;
  arrived_at: string | null;
  expires_at: string;
  facility: PreArrivalReceipt["facility"];
}

export function preArrivalStatus(args: {
  pre_arrival_id: string;
  token?: string;
  action?: "cancel" | "arrived";
}): Promise<EdgeResult<PreArrivalView>> {
  return callEdge<PreArrivalView>("pt-pre-arrival-status", args);
}

/** The live pre-alert's capability, so E3 can be reopened after the app is closed. */
const PENDING_KEY = "medsync:pre-arrival";
export interface PendingPreArrival {
  id: string;
  token: string;
  sentAt: string;
  /** The receipt's `sms_fallback_body`, for E3's timeout state. */
  smsBody?: string | null;
}
export async function readPendingPreArrival(): Promise<PendingPreArrival | null> {
  try {
    const raw = await AsyncStorage.getItem(PENDING_KEY);
    return raw ? (JSON.parse(raw) as PendingPreArrival) : null;
  } catch {
    return null;
  }
}
export function writePendingPreArrival(next: PendingPreArrival | null): void {
  void (
    next
      ? AsyncStorage.setItem(PENDING_KEY, JSON.stringify(next))
      : AsyncStorage.removeItem(PENDING_KEY)
  ).catch(() => {});
}

/* ── tel: and sms: ──────────────────────────────────────────────────── */

/** Only the `tel:` target is normalised; the number is shown as the hospital verified it. */
export const telUrl = (number: string): string => `tel:${number.replace(/[^\d+]/g, "")}`;

/** iOS separates the body with `&`, Android with `?` (PRD §8.6's offline fallback). */
export function smsUrl(number: string, body: string): string {
  const sep = Platform.OS === "ios" ? "&" : "?";
  return `sms:${number.replace(/[^\d+]/g, "")}${sep}body=${encodeURIComponent(body)}`;
}
