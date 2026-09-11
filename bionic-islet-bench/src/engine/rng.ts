/**
 * Deterministic pseudo-random number source.
 *
 * The whole engine must be reproducible: the same seed and the same event
 * sequence must produce byte-identical scoreboards. So there is no use of
 * Math.random anywhere in `src/engine`.
 *
 * Each noise source draws from its own named stream. That matters for
 * reproducibility across code changes: adding a new noise source (say, a new
 * fault) does not shift the numbers drawn by the existing ones, because the
 * streams are independent rather than sharing one global sequence.
 */

/** Mulberry32. Small, fast, adequate statistical quality for instrument noise. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** FNV-1a over a stream name, so a name maps to a stable 32-bit offset. */
function hashName(name: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < name.length; i += 1) {
    h ^= name.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

export type Stream = {
  /** Uniform on [0, 1). */
  next(): number;
  /** Standard normal, Box-Muller with a cached second value. */
  normal(): number;
  /** Normal with the given mean and standard deviation. */
  gauss(mean: number, sd: number): number;
};

class StreamImpl implements Stream {
  private readonly rand: () => number;
  private spare: number | null = null;

  constructor(seed: number) {
    this.rand = mulberry32(seed);
  }

  next(): number {
    return this.rand();
  }

  normal(): number {
    if (this.spare !== null) {
      const value = this.spare;
      this.spare = null;
      return value;
    }
    // Guard against log(0): mulberry32 can return exactly 0.
    let u = this.rand();
    if (u < 1e-12) u = 1e-12;
    const v = this.rand();
    const radius = Math.sqrt(-2 * Math.log(u));
    const angle = 2 * Math.PI * v;
    this.spare = radius * Math.sin(angle);
    return radius * Math.cos(angle);
  }

  gauss(mean: number, sd: number): number {
    return mean + sd * this.normal();
  }
}

export class Rng {
  readonly seed: number;
  private readonly streams = new Map<string, StreamImpl>();

  constructor(seed: number) {
    this.seed = seed >>> 0;
  }

  /** Get (or lazily create) the named stream. */
  stream(name: string): Stream {
    const existing = this.streams.get(name);
    if (existing) return existing;
    const created = new StreamImpl((this.seed ^ hashName(name)) >>> 0);
    this.streams.set(name, created);
    return created;
  }
}
