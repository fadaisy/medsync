import type { CapabilityKey } from "@/supabase/functions/_shared/services-hub";

import { EMERG } from "@/content/hospital-admin/emergency";
import { fill } from "@/content/lab-workspace-v2";

/*
 * Emergency and support's shapes and pure helpers (ADR 0520 phase 2), shared by the server page and the client.
 */

/** One setting as the page sees it. `mine` is decided on the server; the client never receives a user id. */
export interface Cap {
  key: string;
  value: unknown;
  pendingValue: unknown;
  pending: { byName: string; at: string; mine: boolean } | null;
  verified: { byName: string; at: string } | null;
  derived: boolean;
  derivedFrom?: "wards" | "dispensing_points" | null;
}

/** What the public Help screen (/emergency) shows for this hospital, read with its own query in production mode. */
export interface HelpPreview {
  name: string;
  preAlertLive: boolean;
  preAlertEnabled: boolean;
  /** `hospitals.emergency_phone`: set by a superadmin once dialled (ADR 0084 §3). */
  emergencyLine: string | null;
  /** The facility's ambulance contact when it is verified; the sheet shows nothing else. */
  ambulanceVerified: string | null;
  /** A number is registered but not yet dialled and verified. */
  ambulanceWaiting: boolean;
  directions: string | null;
  failed: boolean;
}

export interface Location {
  latitude: number | null;
  longitude: number | null;
}

/** "+256772123456" → "+256 772 123 456"; "0800123456" → "0800 123 456"; anything else as it is. */
export function fmtPhone(v: string): string {
  const m = /^\+256(\d{3})(\d{3})(\d{3})$/.exec(v);
  if (m) return `+256 ${m[1]} ${m[2]} ${m[3]}`;
  const t = /^(0\d{3})(\d{3})(\d{3})$/.exec(v);
  if (t) return `${t[1]} ${t[2]} ${t[3]}`;
  return v;
}

/** A value as a sentence a person reads. */
export function show(k: CapabilityKey, v: unknown): string {
  const V = EMERG.values;
  if (v === null || v === undefined || v === "") return V.notSet;
  switch (k.value.type) {
    case "yesno":
      return v ? V.yes : V.no;
    case "choice":
      return k.value.options.find((o) => o.code === v)?.label ?? String(v);
    case "multi": {
      const opts = k.value.options;
      return (
        (v as string[]).map((c) => opts.find((o) => o.code === c)?.label ?? c).join(", ") || V.none
      );
    }
    case "pre_alert": {
      const p = v as { enabled: boolean; owner: string | null };
      return p.enabled ? fill(V.preAlertOn, { owner: p.owner ?? "" }) : V.no;
    }
    case "phone":
      return fmtPhone(String(v));
    default:
      return String(v);
  }
}

/** "0.3476, 32.5825": latitude, longitude with 4 or more decimals, inside Uganda (the table's CHECK). */
export function parseCoords(s: string): { lat: number; lng: number } | null {
  const m = /^\s*(-?\d{1,2}\.\d{4,})\s*,\s*(-?\d{1,3}\.\d{4,})\s*$/.exec(s);
  if (!m) return null;
  const lat = Number(m[1]);
  const lng = Number(m[2]);
  return lat >= -2 && lat <= 5 && lng >= 29 && lng <= 36 ? { lat, lng } : null;
}

export const coordsText = (lat: number, lng: number) => `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
