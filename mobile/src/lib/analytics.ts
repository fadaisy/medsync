/**
 * The PRD's success-metric events (Tide v1 PRD § Success metrics).
 *
 * There is no analytics vendor in this app, so events go to a local sink
 * (the console in development, nothing in production) behind one function.
 * Choosing a vendor is the owner's call; it replaces `sink` and nothing else.
 *
 * No PHI in a payload, ever: no reading values, no medicine names, no free
 * text. Identifiers pass through `hashId` first. `analytics.test` holds the
 * payload types to numbers, booleans, short enums and hashed ids.
 */

export type AnalyticsEvent =
  | "app_open"
  | "home_rendered"
  | "signup_step_viewed"
  | "signup_completed"
  | "signup_refused_age"
  | "reading_saved"
  | "dose_confirmed"
  | "dose_snoozed"
  | "dose_undone"
  | "ticket_issued"
  | "ticket_shown_offline"
  | "help_opened"
  | "sos_started"
  | "sos_cancelled"
  | "sos_called";

export type AnalyticsPayload = Record<string, string | number | boolean>;

type Sink = (event: AnalyticsEvent, payload: AnalyticsPayload) => void;

let sink: Sink = (event, payload) => {
  if (__DEV__) console.warn(`[analytics] ${event}`, payload);
};

/** Tests and a future vendor swap the sink here. */
export function setAnalyticsSink(next: Sink): void {
  sink = next;
}

export function track(event: AnalyticsEvent, payload: AnalyticsPayload = {}): void {
  try {
    sink(event, payload);
  } catch {
    // Analytics never breaks a screen.
  }
}

/** FNV-1a, 32-bit, hex. Enough to count distinct ids without carrying them. */
export function hashId(id: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}

/** Milliseconds since the JS bundle started, for `home_rendered`. */
const bootedAt = Date.now();
export function sinceBoot(): number {
  return Date.now() - bootedAt;
}
