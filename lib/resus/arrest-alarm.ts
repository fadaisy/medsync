/**
 * The arrest alarm (pure parts): when a broadcast starts or ends an alarm, and the
 * buzzer pattern. The component (components/resus/arrest-alarm.tsx) plays it.
 */

/** Sound stops after this even if nobody acknowledges; the banner stays (owner, 2026-09-24). */
export const ALARM_MAX_MS = 120_000;

/** The PHI-free payload of the `episode` broadcast on `resus-board:<hospital>` (migration 0068). */
export interface BoardEpisodeMessage {
  episodeId: string;
  state: string;
  phase: string;
}

/**
 * The phase is broadcast only when it changes, so entering `arrest` is a new
 * arrest (or a re-arrest after ROSC); leaving it, or the episode closing, ends it.
 * `seen` remembers each episode's last phase and is updated in place.
 */
export function alarmTransition(
  seen: Map<string, string>,
  m: BoardEpisodeMessage,
): "start" | "stop" | null {
  const was = seen.get(m.episodeId);
  const now = m.state === "active" ? m.phase : "closed";
  seen.set(m.episodeId, now);
  if (now === "arrest" && was !== "arrest") return "start";
  if (was === "arrest" && now !== "arrest") return "stop";
  return null;
}

/** One burst: high-low-high, then a gap (≈ 1.7 s). Square wave — a buzzer, not a chime. */
const BURST: readonly { hz: number; lenS: number; gapS: number }[] = [
  { hz: 988, lenS: 0.3, gapS: 0.08 },
  { hz: 740, lenS: 0.3, gapS: 0.08 },
  { hz: 988, lenS: 0.3, gapS: 0.6 },
];

/** Every tone of the alarm from t = 0 for `durationS`, on the audio clock (no timers). */
export function alarmTones(durationS: number): { atS: number; hz: number; lenS: number }[] {
  const out: { atS: number; hz: number; lenS: number }[] = [];
  let t = 0;
  while (t < durationS) {
    for (const b of BURST) {
      if (t + b.lenS > durationS) return out;
      out.push({ atS: t, hz: b.hz, lenS: b.lenS });
      t += b.lenS + b.gapS;
    }
  }
  return out;
}
