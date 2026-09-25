import { RANGES } from "./params.ts";
import { AUTONOMY, type Sample, type Scoreboard } from "./types.ts";

/**
 * Summarise a window of samples.
 *
 * Samples are one per acquisition, so each carries the acquisition period in
 * minutes. Percentages are of the covered time, not of the sample count, so a
 * low-battery run at one sample every 5 min still totals correctly.
 */
export function scoreboard(samples: readonly Sample[], acquisitionMinutes = 1): Scoreboard {
  const empty: Scoreboard = {
    minutes: 0,
    timeInRangePct: 0,
    timeBelow39Pct: 0,
    timeBelow30Pct: 0,
    timeAbove10Pct: 0,
    mardPct: 0,
    meanGlucose: 0,
    alerts: 0,
    minutesReducedAutonomy: 0,
    minutesSuspended: 0,
    totalInsulinU: 0,
  };
  if (samples.length === 0) return empty;

  let inRange = 0;
  let below39 = 0;
  let below30 = 0;
  let above10 = 0;
  let sumGlucose = 0;
  let sumArd = 0;
  let ardCount = 0;
  let reduced = 0;
  let suspended = 0;
  let insulin = 0;

  for (const sample of samples) {
    const g = sample.plasma;
    sumGlucose += g;
    if (g >= RANGES.inRangeLow && g <= RANGES.inRangeHigh) inRange += 1;
    if (g < RANGES.hypoLevel1) below39 += 1;
    if (g < RANGES.hypoLevel2) below30 += 1;
    if (g > RANGES.inRangeHigh) above10 += 1;
    if (sample.fused !== null && g > 0) {
      sumArd += Math.abs(sample.fused - g) / g;
      ardCount += 1;
    }
    if (sample.autonomy < AUTONOMY.full) reduced += 1;
    if (sample.autonomy === AUTONOMY.suspend) suspended += 1;
    insulin += (sample.insulinUph / 60) * acquisitionMinutes;
  }

  const n = samples.length;
  const minutes = n * acquisitionMinutes;
  return {
    minutes,
    timeInRangePct: (inRange / n) * 100,
    timeBelow39Pct: (below39 / n) * 100,
    timeBelow30Pct: (below30 / n) * 100,
    timeAbove10Pct: (above10 / n) * 100,
    mardPct: ardCount === 0 ? 0 : (sumArd / ardCount) * 100,
    meanGlucose: sumGlucose / n,
    alerts: 0,
    minutesReducedAutonomy: reduced * acquisitionMinutes,
    minutesSuspended: suspended * acquisitionMinutes,
    totalInsulinU: insulin,
  };
}

/** The scoreboard over the last `hours` of simulated time. */
export function rollingScoreboard(
  samples: readonly Sample[],
  nowSeconds: number,
  hours: number,
  acquisitionMinutes = 1,
): Scoreboard {
  const cutoff = nowSeconds - hours * 3600;
  const window: Sample[] = [];
  for (let i = samples.length - 1; i >= 0; i -= 1) {
    const sample = samples[i];
    if (!sample || sample.t < cutoff) break;
    window.push(sample);
  }
  window.reverse();
  return scoreboard(window, acquisitionMinutes);
}

export function formatScoreboard(name: string, board: Scoreboard): string {
  const hours = board.minutes / 60;
  const lines = [
    `${name}`,
    `  window                 ${hours.toFixed(1)} h (${board.minutes} min of samples)`,
    `  time in range 3.9-10   ${board.timeInRangePct.toFixed(1)} %`,
    `  time below 3.9         ${board.timeBelow39Pct.toFixed(2)} %`,
    `  time below 3.0         ${board.timeBelow30Pct.toFixed(2)} %`,
    `  time above 10          ${board.timeAbove10Pct.toFixed(1)} %`,
    `  mean plasma glucose    ${board.meanGlucose.toFixed(2)} mmol/L`,
    `  fused MARD vs plasma   ${board.mardPct.toFixed(2)} %`,
    `  alerts                 ${board.alerts}`,
    `  min at reduced autonomy ${board.minutesReducedAutonomy}`,
    `  min suspended          ${board.minutesSuspended}`,
    `  total insulin          ${board.totalInsulinU.toFixed(2)} U`,
  ];
  return lines.join("\n");
}

/**
 * Streaming scoreboard.
 *
 * Long runs produce more samples than any trace buffer should hold, and
 * quietly scoring only the samples that survived the buffer would report a
 * 365 day run as if it were the last few weeks. This accumulates over every
 * sample the run produced, whatever the buffer keeps.
 */
export class ScoreboardAccumulator {
  private n = 0;
  private inRange = 0;
  private below39 = 0;
  private below30 = 0;
  private above10 = 0;
  private sumGlucose = 0;
  private sumArd = 0;
  private ardCount = 0;
  private reduced = 0;
  private suspended = 0;
  private insulin = 0;

  private readonly acquisitionMinutes: number;

  constructor(acquisitionMinutes = 1) {
    this.acquisitionMinutes = acquisitionMinutes;
  }

  add(sample: Sample): void {
    const g = sample.plasma;
    this.n += 1;
    this.sumGlucose += g;
    if (g >= RANGES.inRangeLow && g <= RANGES.inRangeHigh) this.inRange += 1;
    if (g < RANGES.hypoLevel1) this.below39 += 1;
    if (g < RANGES.hypoLevel2) this.below30 += 1;
    if (g > RANGES.inRangeHigh) this.above10 += 1;
    if (sample.fused !== null && g > 0) {
      this.sumArd += Math.abs(sample.fused - g) / g;
      this.ardCount += 1;
    }
    if (sample.autonomy < AUTONOMY.full) this.reduced += 1;
    if (sample.autonomy === AUTONOMY.suspend) this.suspended += 1;
    this.insulin += (sample.insulinUph / 60) * this.acquisitionMinutes;
  }

  result(alerts = 0): Scoreboard {
    if (this.n === 0) return scoreboard([], this.acquisitionMinutes);
    return {
      minutes: this.n * this.acquisitionMinutes,
      timeInRangePct: (this.inRange / this.n) * 100,
      timeBelow39Pct: (this.below39 / this.n) * 100,
      timeBelow30Pct: (this.below30 / this.n) * 100,
      timeAbove10Pct: (this.above10 / this.n) * 100,
      mardPct: this.ardCount === 0 ? 0 : (this.sumArd / this.ardCount) * 100,
      meanGlucose: this.sumGlucose / this.n,
      alerts,
      minutesReducedAutonomy: this.reduced * this.acquisitionMinutes,
      minutesSuspended: this.suspended * this.acquisitionMinutes,
      totalInsulinU: this.insulin,
    };
  }
}
