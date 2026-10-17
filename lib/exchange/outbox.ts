/**
 * The exchange's message store, pure parts (Lab Phase 4 §6.4, EX-1..EX-8; gate-a-proposal §5.3–5.4; D-LAB4-13).
 *
 * Store before acknowledge happens in the database (`private.exchange_store_inbound`, 0153); here are the rules
 * around it: the content hash (EX-3), the outbox's back-off and dead letters (EX-4), the inbound states (EX-5)
 * and sender times (EX-8). Back-off, attempt limit and the clock-skew threshold are OPERATIONAL settings, set by
 * the laboratory lead, never clinical.
 */
import { createHash } from "node:crypto";

/** EX-3: the SHA-256 of the message as received, hex. */
export const contentHash = (raw: string) => createHash("sha256").update(raw, "utf8").digest("hex");

/** EX-4: operational settings. Proposed defaults (gate-a §5.4, from the OpenELIS bridge's own). */
export interface RetrySettings {
  baseMs: number;
  multiplier: number;
  capMs: number;
  /** ± fraction, 0–1. */
  jitter: number;
  limit: number;
}
export const PROPOSED_RETRY: RetrySettings = {
  baseMs: 5_000,
  multiplier: 2,
  capMs: 600_000,
  jitter: 0.2,
  limit: 150,
};

/**
 * EX-4: after a failed delivery, retry at now + min(cap, base × multiplier^(attempts − 1)) × (1 ± jitter), or
 * dead once the attempt limit is reached. `random` is injected (0–1) so the schedule is testable.
 */
export function nextAttempt(o: {
  attempts: number;
  now: Date;
  settings?: RetrySettings;
  random?: () => number;
}): { state: "retrying"; nextAt: Date } | { state: "dead" } {
  const s = o.settings ?? PROPOSED_RETRY;
  if (o.attempts >= s.limit) return { state: "dead" };
  const raw = Math.min(s.capMs, s.baseMs * s.multiplier ** Math.max(0, o.attempts - 1));
  const r = (o.random ?? Math.random)();
  const delay = Math.max(0, raw * (1 + s.jitter * (2 * r - 1)));
  return { state: "retrying", nextAt: new Date(o.now.getTime() + delay) };
}

/** EX-5: inbound processing, each step an appended event. */
export const INBOUND_NEXT: Readonly<Record<string, readonly string[]>> = {
  received: ["parsed", "unreadable"],
  parsed: ["matched", "waiting_match"],
  matched: ["filed"],
  waiting_match: ["filed", "set_aside"],
  filed: [],
  unreadable: ["retried_by_person", "set_aside"],
  set_aside: [],
};
export const canAdvance = (from: string, to: string) => INBOUND_NEXT[from]?.includes(to) ?? false;

/** EX-4: the outbox's own moves. */
export const OUTBOX_NEXT: Readonly<Record<string, readonly string[]>> = {
  pending: ["sending"],
  sending: ["delivered", "retrying", "dead"],
  retrying: ["sending"],
  dead: ["pending", "set_aside"], // a person retries or sets aside, with a reason
  delivered: [],
  set_aside: [],
};

/* ─── EX-8: sender times ─────────────────────────────────────────────── */

/** Minutes east of UTC for the zones a sender is configured with. Africa/Kampala has no daylight saving. */
const ZONES: Readonly<Record<string, number>> = { "Africa/Kampala": 180, UTC: 0 };

/**
 * EX-8: a sender's time as given, read in its configured zone when it carries no offset. Forms: ASTM
 * `YYYYMMDDHHMMSS`, HL7 `YYYYMMDDHHMM[SS][±ZZZZ]`, ISO 8601 with or without an offset. Unreadable → null (the
 * caller keeps the text and uses the receipt time, marked "time from receipt").
 */
export function parseSenderTime(
  given: string | null | undefined,
  zone: string,
): { utc: Date; zoneAssumed: string | null } | null {
  const s = given?.trim();
  if (!s) return null;
  const offsetMin = ZONES[zone];
  let m = /^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})?(?:\.\d+)?([+-]\d{4})?$/.exec(s);
  if (m) {
    const [y, mo, d, h, mi, se] = [m[1], m[2], m[3], m[4], m[5], m[6] ?? "00"].map(
      Number,
    ) as number[];
    const local = Date.UTC(y!, mo! - 1, d!, h!, mi!, se!);
    if (m[7]) {
      const sign = m[7][0] === "-" ? -1 : 1;
      const off = sign * (Number(m[7].slice(1, 3)) * 60 + Number(m[7].slice(3)));
      return { utc: new Date(local - off * 60_000), zoneAssumed: null };
    }
    if (offsetMin === undefined) return null;
    return { utc: new Date(local - offsetMin * 60_000), zoneAssumed: zone };
  }
  m = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(Z|[+-]\d{2}:\d{2})?$/.exec(s);
  if (m) {
    if (m[1]) {
      const t = Date.parse(s);
      return Number.isNaN(t) ? null : { utc: new Date(t), zoneAssumed: null };
    }
    if (offsetMin === undefined) return null;
    const t = Date.parse(`${s}Z`);
    return Number.isNaN(t) ? null : { utc: new Date(t - offsetMin * 60_000), zoneAssumed: zone };
  }
  return null;
}

/** EX-8: a sender's clock against the server's, beyond the operational threshold. */
export function skew(
  senderNow: Date,
  serverNow: Date,
  thresholdMinutes: number,
): { minutes: number; direction: "behind" | "ahead" } | null {
  const diff = Math.round((senderNow.getTime() - serverNow.getTime()) / 60_000);
  if (Math.abs(diff) <= thresholdMinutes) return null;
  return { minutes: Math.abs(diff), direction: diff < 0 ? "behind" : "ahead" };
}
