/**
 * Help's pure rules, from the phone: the SOS countdown (`mobile/src/features/safety/use-sos.ts`, there a hook
 * around a timer) as a step function, and the live-share arithmetic (`mobile/src/data/location-share.ts`,
 * whose file imports Expo). The web drives `sosNext` from a 1 s interval; `dial` is true on exactly one
 * step, the tick that ends the countdown, so nothing is dialled or sent before it and a cancel inside the
 * countdown leaves nothing behind (S21).
 */

export type SosPhase = "idle" | "counting" | "calling";
export interface SosState {
  phase: SosPhase;
  /** Seconds left while counting. */
  secs: number;
}
export type SosEvent = "start" | "tick" | "cancel" | "end";

export const sosIdle = (countdown: number): SosState => ({ phase: "idle", secs: countdown });

export function sosNext(
  s: SosState,
  e: SosEvent,
  countdown: number,
): { state: SosState; dial: boolean } {
  const same = { state: s, dial: false };
  switch (e) {
    case "start":
      return s.phase === "idle"
        ? { state: { phase: "counting", secs: countdown }, dial: false }
        : same;
    case "tick":
      if (s.phase !== "counting") return same;
      return s.secs - 1 > 0
        ? { state: { phase: "counting", secs: s.secs - 1 }, dial: false }
        : { state: { phase: "calling", secs: 0 }, dial: true };
    case "cancel":
      return s.phase === "counting" ? { state: sosIdle(countdown), dial: false } : same;
    case "end":
      return { state: sosIdle(countdown), dial: false };
  }
}

/** "00:07" since the call started. */
export function callClock(calledAtMs: number, nowMs: number): string {
  const t = Math.max(0, Math.floor((nowMs - calledAtMs) / 1000));
  return `${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`;
}

/** "0.34760, 32.58250": five places is about a metre, enough to read out on a call. */
export function formatLatLng(p: { latitude: number; longitude: number }): string {
  return `${p.latitude.toFixed(5)}, ${p.longitude.toFixed(5)}`;
}

/* ── Live location share ─────────────────────────────────────────────── */

/** The table's cap (`location_shares_window`): "until I stop" means at most 8 hours. */
export const SHARE_MAX_MINUTES = 8 * 60;
export const WRITE_EVERY_MS = 20_000;

/** At most one write every 20 seconds: true when this fix should be sent. */
export function shouldWrite(lastWriteMs: number | null, nowMs: number): boolean {
  return lastWriteMs === null || nowMs - lastWriteMs >= WRITE_EVERY_MS;
}

/** "14:30": the end time, read on the device's own clock. */
export function clockWords(d: Date): string {
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

/** "25 min left", "2 h 10 min left", "ending now". */
export function leftWords(end: Date, now: Date): string {
  const min = Math.ceil((end.getTime() - now.getTime()) / 60_000);
  if (min <= 0) return "ending now";
  if (min < 60) return `${min} min left`;
  return `${Math.floor(min / 60)} h${min % 60 ? ` ${min % 60} min` : ""} left`;
}
