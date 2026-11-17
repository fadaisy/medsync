/**
 * The new-admin guide (ADR 0522): "Set up Tether" on Today, seven steps whose done state comes from the hospital's
 * own records, read on the server. Every fact is best-effort: a fact that could not be read is `null`, and an item
 * is Done only when its fact is `true`. Nothing is ever marked Done on a guess. "Check the hospital profile" is the
 * one step with no record behind it, so it is the admin's own visit to the profile page, remembered in the browser.
 * Pure and client-safe; the loader is `app/hospital-admin/today/_lib/setup.ts`.
 */

export type SetupKey = "profile" | "depts" | "invite" | "emerg" | "clinic" | "publish" | "desk";

export const SETUP_KEYS: readonly SetupKey[] = [
  "profile",
  "depts",
  "invite",
  "emerg",
  "clinic",
  "publish",
  "desk",
];

/** What the server could read. `null` means it could not be read, which counts as not done. */
export interface SetupFacts {
  /** Any department live on Tether (`medsync_live_at` set, not archived). */
  departmentLive: boolean | null;
  /** Any staff invitation sent from this hospital. */
  invitationSent: boolean | null;
  /** The hospital's latitude and longitude are both set. */
  located: boolean | null;
  /** A routing value is set, verified, or waiting for a second admin. */
  routing: boolean | null;
  /** Any clinic taking bookings (active, not paused, not archived). */
  clinicOpen: boolean | null;
  /** Any published week (a row in `schedule_versions`). */
  weekPublished: boolean | null;
  /** Any desk or screen paired (its pairing code used, or seen). */
  devicePaired: boolean | null;
}

export const NO_FACTS: SetupFacts = {
  departmentLive: null,
  invitationSent: null,
  located: null,
  routing: null,
  clinicOpen: null,
  weekPublished: null,
  devicePaired: null,
};

/** Each step's done state. Only `true` counts. */
export function setupDone(facts: SetupFacts, profileVisited: boolean): Record<SetupKey, boolean> {
  return {
    profile: profileVisited === true,
    depts: facts.departmentLive === true,
    invite: facts.invitationSent === true,
    emerg: facts.located === true && facts.routing === true,
    clinic: facts.clinicOpen === true,
    publish: facts.weekPublished === true,
    desk: facts.devicePaired === true,
  };
}

export const doneCount = (done: Record<SetupKey, boolean>) =>
  SETUP_KEYS.filter((k) => done[k]).length;

/** One routing value as the capability loader returns it, with whether its key is a routing key. */
export interface RoutingCap {
  key: string;
  routing: boolean;
  derived: boolean;
  value: unknown;
  pending: unknown | null;
  verified: unknown | null;
}

/** A value that says something: not empty, and not the hospital's starting default ("none", pre-alerts off). */
function meaningful(key: string, v: unknown): boolean {
  if (v === null || v === undefined) return false;
  if (typeof v === "string")
    return v.trim() !== "" && !(key === "emergency_capability" && v === "none");
  if (typeof v === "boolean") return v;
  if (typeof v === "number") return true;
  if (Array.isArray(v)) return v.length > 0;
  if (typeof v === "object") {
    const o = v as Record<string, unknown>;
    if ("enabled" in o) return o.enabled === true;
    return Object.keys(o).length > 0;
  }
  return false;
}

/** Emergency routing is set up when any routing value has been verified, is waiting for a second admin, or is set. */
export function routingIsSet(caps: readonly RoutingCap[]): boolean {
  return caps.some(
    (c) =>
      c.routing &&
      !c.derived &&
      (c.pending !== null || c.verified !== null || meaningful(c.key, c.value)),
  );
}
