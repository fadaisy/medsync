/**
 * Counting statistics.
 *
 * A photon detector does not measure a number, it counts events, and the
 * count fluctuates because the arrivals are independent. That is Poisson
 * noise, and at the count rates these probes work at it is the dominant
 * source of measurement uncertainty. Approximating it by a Gaussian would
 * get the variance right and the tail wrong, and the tail is what produces
 * the occasional bad reading a supervisor has to survive.
 *
 * So the draw here is an exact Poisson variate, not a normal approximation.
 * Every draw comes from an explicitly passed seeded stream: there is no
 * `Math.random` in this directory, and there is no module-level generator
 * either, so two probes cannot silently share a sequence.
 *
 * ## The one exemption from constants.ts
 *
 * This is the only file in `src/engine/probes` with bare numbers in it. The
 * Lanczos coefficients and the rejection constants below are not parameters
 * of any model: they are the published definition of two standard algorithms,
 * and changing one does not change the physics, it breaks the algorithm. They
 * have no unit and no physical provenance, so writing them into a table of
 * physical constants would be filing them under a heading that is false.
 * Everything with a unit still lives in constants.ts. DECISIONS.md records
 * this exemption.
 */

import type { Stream } from "../rng.ts";

/**
 * Log gamma by the Lanczos approximation, g = 7, nine coefficients.
 *
 * Needed only by the rejection test in the large-lambda Poisson branch.
 * Accurate to about fifteen significant figures for positive arguments,
 * which is far more than a rejection test needs.
 */
export function logGamma(x: number): number {
  const g = 7;
  const c = [
    0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313,
    -176.61502916214059, 12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6,
    1.5056327351493116e-7,
  ];
  if (x < 0.5) {
    // Reflection, for completeness. The callers here never use it.
    return Math.log(Math.PI / Math.sin(Math.PI * x)) - logGamma(1 - x);
  }
  const z = x - 1;
  let a = c[0]!;
  const t = z + g + 0.5;
  for (let i = 1; i < g + 2; i += 1) a += c[i]! / (z + i);
  return 0.5 * Math.log(2 * Math.PI) + (z + 0.5) * Math.log(t) - t + Math.log(a);
}

/**
 * The mean above which the small-lambda algorithm is abandoned.
 *
 * Knuth's method costs one uniform per unit of lambda, so it becomes slow
 * exactly where the rejection method becomes valid. Ten is comfortably inside
 * the range where both are correct, so the choice is about speed alone and
 * the distribution does not change across it, which a test checks.
 */
const KNUTH_LIMIT = 10;

/**
 * A Poisson variate with mean `lambda`.
 *
 * Two algorithms, both exact:
 *
 *   lambda < 10   Knuth's product of uniforms. Multiply uniforms until the
 *                 product falls below exp(-lambda); the count of multiplies
 *                 is the variate. Costs lambda uniforms on average.
 *
 *   lambda >= 10  Transformed rejection with squeeze, after Hoermann (1993),
 *                 the method the standard scientific libraries use. Constant
 *                 cost regardless of lambda, with an acceptance rate above
 *                 ninety per cent, so it rarely draws more than two uniforms.
 */
export function poisson(stream: Stream, lambda: number): number {
  if (!(lambda > 0)) return 0;
  if (lambda < KNUTH_LIMIT) {
    const limit = Math.exp(-lambda);
    let product = 1;
    let n = -1;
    do {
      product *= stream.next();
      n += 1;
    } while (product > limit);
    return n;
  }

  const logLambda = Math.log(lambda);
  const b = 0.931 + 2.53 * Math.sqrt(lambda);
  const a = -0.059 + 0.02483 * b;
  const inverseAlpha = 1.1239 + 1.1328 / (b - 3.4);
  const vr = 0.9277 - 3.6224 / (b - 2);

  for (;;) {
    const u = stream.next() - 0.5;
    const v = stream.next();
    const us = 0.5 - Math.abs(u);
    const k = Math.floor(((2 * a) / us + b) * u + lambda + 0.43);
    if (us >= 0.07 && v <= vr) return k;
    if (k < 0) continue;
    if (us < 0.013 && v > us) continue;
    const accept =
      Math.log((v * inverseAlpha) / (a / (us * us) + b)) <=
      -lambda + k * logLambda - logGamma(k + 1);
    if (accept) return k;
  }
}
