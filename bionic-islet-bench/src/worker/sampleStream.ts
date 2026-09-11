/**
 * Turns the engine's one-per-minute samples into the two resolutions the
 * traces need, without ever holding a year of minute samples in memory.
 *
 * Pure and free of worker plumbing so the same code can be checked against
 * the headless runner in a test.
 */

import type { Sample } from "../engine/types.ts";
import type { HourAggregate } from "./protocol.ts";

/** Minute samples retained: 24 hours. */
export const MINUTE_CAPACITY = 24 * 60;
/** Hour aggregates retained: 90 days. */
export const HOUR_CAPACITY = 90 * 24;

export class SampleStream {
  readonly minutes: Sample[] = [];
  readonly hours: HourAggregate[] = [];

  private pending: Sample[] = [];
  private pendingHourIndex: number | null = null;

  /** Newly completed items since the last drain, for sending to the bench. */
  private freshMinutes: Sample[] = [];
  private freshHours: HourAggregate[] = [];

  add(sample: Sample): void {
    this.minutes.push(sample);
    if (this.minutes.length > MINUTE_CAPACITY) this.minutes.shift();
    this.freshMinutes.push(sample);

    const hourIndex = Math.floor(sample.t / 3600);
    if (this.pendingHourIndex === null) this.pendingHourIndex = hourIndex;
    if (hourIndex !== this.pendingHourIndex) {
      this.closeHour();
      this.pendingHourIndex = hourIndex;
    }
    this.pending.push(sample);
  }

  /** Fold whatever is buffered into an hour aggregate, even if incomplete. */
  flush(): void {
    if (this.pending.length > 0) this.closeHour();
  }

  private closeHour(): void {
    const items = this.pending;
    this.pending = [];
    if (items.length === 0) return;

    let plasmaMin = Infinity;
    let plasmaMax = -Infinity;
    let plasmaSum = 0;
    let peritonealSum = 0;
    let subcutaneousSum = 0;
    let fusedSum = 0;
    let fusedCount = 0;
    let uncertaintySum = 0;
    let insulinSum = 0;
    let autonomyMin = 3;

    for (const item of items) {
      plasmaMin = Math.min(plasmaMin, item.plasma);
      plasmaMax = Math.max(plasmaMax, item.plasma);
      plasmaSum += item.plasma;
      peritonealSum += item.peritoneal;
      subcutaneousSum += item.subcutaneous;
      if (item.fused !== null) {
        fusedSum += item.fused;
        fusedCount += 1;
      }
      uncertaintySum += item.fusedUncertainty;
      insulinSum += item.insulinUph;
      autonomyMin = Math.min(autonomyMin, item.autonomy);
    }

    const n = items.length;
    const first = items[0];
    const aggregate: HourAggregate = {
      t: first ? Math.floor(first.t / 3600) * 3600 : 0,
      plasmaMin,
      plasmaMax,
      plasmaMean: plasmaSum / n,
      peritonealMean: peritonealSum / n,
      subcutaneousMean: subcutaneousSum / n,
      fusedMean: fusedCount === 0 ? null : fusedSum / fusedCount,
      fusedUncertaintyMean: uncertaintySum / n,
      insulinMean: insulinSum / n,
      autonomyMin,
    };

    this.hours.push(aggregate);
    if (this.hours.length > HOUR_CAPACITY) this.hours.shift();
    this.freshHours.push(aggregate);
  }

  /** Take everything completed since the last call. */
  drain(): { minutes: Sample[]; hours: HourAggregate[] } {
    const minutes = this.freshMinutes;
    const hours = this.freshHours;
    this.freshMinutes = [];
    this.freshHours = [];
    return { minutes, hours };
  }

  clear(): void {
    this.minutes.length = 0;
    this.hours.length = 0;
    this.pending = [];
    this.pendingHourIndex = null;
    this.freshMinutes = [];
    this.freshHours = [];
  }
}
