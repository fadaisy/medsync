/**
 * The pre-alert engine's vocabulary and status machine (PRD MS-PRD-SYM-001
 * §8.3–§8.7, §9.2; ADR 0098 ruling 5). ZERO IMPORTS on purpose: Deno
 * imports `./pre-arrival.ts`, Next `@/supabase/functions/_shared/pre-arrival`,
 * the phone `@shared/pre-arrival`. The Drizzle side keeps its own copy of
 * the transition table in `db/schema/emergency.ts`;
 * tests/emergency/pre-arrival-machine.test.ts holds the two deep-equal.
 */

export const PRE_ARRIVAL_STATUSES = [
  "sent",
  "seen",
  "ready",
  "arrived",
  "cancelled",
  "expired",
  "not_arriving",
  "hoax",
] as const;
export type PreArrivalStatus = (typeof PRE_ARRIVAL_STATUSES)[number];

export const TRANSPORT_MODES = ["boda", "car", "taxi", "ambulance", "walking"] as const;
export type TransportMode = (typeof TRANSPORT_MODES)[number];

export const ETA_BANDS = ["under_15", "15_30", "30_60", "over_60"] as const;
export type EtaBand = (typeof ETA_BANDS)[number];

/**
 * Build prompt Phase 2 §5: `sent → seen → ready → arrived`; any live state may
 * close as cancelled / not_arriving / hoax / expired. A closed row has no
 * exits. Every writer checks `canTransition` before an UPDATE.
 */
export const PRE_ARRIVAL_TRANSITIONS: Record<PreArrivalStatus, ReadonlyArray<PreArrivalStatus>> = {
  sent: ["seen", "ready", "arrived", "cancelled", "not_arriving", "hoax", "expired"],
  seen: ["ready", "arrived", "cancelled", "not_arriving", "hoax", "expired"],
  ready: ["arrived", "cancelled", "not_arriving", "hoax", "expired"],
  arrived: [],
  cancelled: [],
  expired: [],
  not_arriving: [],
  hoax: [],
};

export function canTransition(from: PreArrivalStatus, to: PreArrivalStatus): boolean {
  return PRE_ARRIVAL_TRANSITIONS[from].includes(to);
}

/** PRD §8.7 (Gate A item 3): a bystander must be able to act, so the limit is generous but real. */
export const RATE_LIMITS = { perDeviceHour: 3, perPhoneDay: 5 } as const;

/** Hoaxes from one device/phone hash at or above this → call-only for 24 h (PRD §8.7). Calling is never blocked. */
export const HOAX_DOWNGRADE_THRESHOLD = 2;
export const HOAX_DOWNGRADE_MS = 24 * 3_600_000;

/** Gate A item 4: E3 shows "We couldn't confirm the hospital saw this" after this long (§8.4). */
export const ACK_TIMEOUT_MS = 5 * 60_000;
/** Gate A item 4: an unacknowledged card escalates visually to every board viewer after this (§8.5). */
export const BOARD_ESCALATION_MS = 2 * 60_000;

/** Bands, not fake precision (§8.3). ASCII so the SMS stays GSM-7. */
export const ETA_BAND_LABEL: Record<EtaBand, string> = {
  under_15: "under 15 min",
  "15_30": "15-30 min",
  "30_60": "30-60 min",
  over_60: "over 60 min",
};

export const TIER_WORD: Record<"E" | "U" | "R", string> = {
  E: "EMERGENCY",
  U: "URGENT",
  R: "ROUTINE",
};

/** One GSM-7 segment. */
export const SMS_MAX = 160;

/**
 * Anything outside the GSM-7 basic set would silently push the message into
 * UCS-2 and halve the budget; the labels are catalog English, so replacing
 * the odd curly quote or dash is loss-free.
 */
const toGsm = (s: string) =>
  s
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, "-")
    .replace(/[^\x20-\x7e\n]/g, "")
    .replace(/[\[\]{}\\~^|`]/g, "")
    .replace(/\s+/g, " ")
    .trim();

/**
 * The offline fallback body (PRD §8.6): what the patient's own SIM sends to
 * the facility's `emergency_sms_number`, and what the outbox row holds for
 * the notifications engine. Pure, and composed ONLY from these fields —
 * there is no free-text argument, so a name or a note cannot reach it. The
 * danger sign is the one field that can be long, and it is the one trimmed.
 */
export function composeFacilitySms(args: {
  tier: "E" | "U" | "R";
  /** The top red flag's lay label; null when the reporter chose "Not sure". */
  dangerSign: string | null;
  etaBand: EtaBand;
  transport: TransportMode;
  /** The callback number as the reporter gave it. */
  callback: string;
}): string {
  const head = `MedSync pre-alert: ${TIER_WORD[args.tier]}.`;
  const tail = `Arriving ${ETA_BAND_LABEL[args.etaBand]} by ${args.transport}. Call back ${toGsm(args.callback)}`;
  // Two joining spaces and the danger sign's full stop.
  const budget = Math.max(SMS_MAX - head.length - tail.length - 3, 0);
  const sign = toGsm(args.dangerSign ?? "Not sure").slice(0, budget);
  return `${head} ${sign}. ${tail}`.slice(0, SMS_MAX);
}
