/**
 * The voice note's waveform: the recorder's loudness readings (dBFS, about
 * -160 silent to 0 loud), kept while recording and drawn as bars on the
 * card. Pure, so the shape is tested without a microphone.
 */

/** How loud as 0–1, with a floor so a quiet stretch still shows a bar. */
export function levelOf(db: number): number {
  return Math.min(1, Math.max(0.08, (db + 50) / 50));
}

/** Exactly `n` bars: readings averaged into even buckets, or flat bars when there are none. */
export function bars(levels: readonly number[], n: number): number[] {
  if (!levels.length) return Array.from({ length: n }, () => 0.08);
  return Array.from({ length: n }, (_, i) => {
    const from = Math.floor((i * levels.length) / n);
    const to = Math.max(from + 1, Math.floor(((i + 1) * levels.length) / n));
    const slice = levels.slice(from, to);
    return slice.reduce((a, b) => a + b, 0) / slice.length;
  });
}
