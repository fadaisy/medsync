/**
 * Quality mini charts (Lab Workspace v2, prompt 6.4): the last runs of one QC item as distance from target in
 * SD units, read from the z each run stored against the plan's target in force at that run (QS-1). Pure.
 *
 * QS-2: a target change (another control lot, mean or SD for the level) starts a new segment, so the chart
 * shows a gap, never a line joining two targets.
 */

export interface SparkRunValue {
  level: number;
  lotId: string;
  z: number;
  mean: number;
  sd: number;
}

export interface SparkRun {
  id: string;
  at: Date;
  values: readonly SparkRunValue[];
}

export interface SparkPoint {
  /** Index of the run along the x axis (0 = oldest shown). */
  i: number;
  runId: string;
  at: Date;
  z: number;
  /** Beyond ±2 SD: drawn amber and with a different shape. */
  beyond: boolean;
}

export interface SparkSeries {
  level: number;
  /** Each segment is one target; a new segment means the target changed. */
  segments: SparkPoint[][];
}

export interface Spark {
  runs: number;
  series: SparkSeries[];
}

export const SPARK_RUNS = 10;
export const SPARK_LIMIT = 2;

const targetKey = (v: SparkRunValue) => `${v.lotId}|${v.mean}|${v.sd}`;

/** The last `take` runs (any order in), oldest first, one series per level, split at each target change. */
export function sparkSeries(runs: readonly SparkRun[], take = SPARK_RUNS): Spark {
  const shown = [...runs].sort((a, b) => a.at.getTime() - b.at.getTime()).slice(-take);
  const levels = [...new Set(shown.flatMap((r) => r.values.map((v) => v.level)))].sort(
    (a, b) => a - b,
  );
  const series = levels.map((level) => {
    const segments: SparkPoint[][] = [];
    let last: string | null = null;
    shown.forEach((r, i) => {
      const v = r.values.find((x) => x.level === level);
      if (!v || !Number.isFinite(v.z)) return;
      const key = targetKey(v);
      if (key !== last || segments.length === 0) segments.push([]);
      last = key;
      segments
        .at(-1)!
        .push({ i, runId: r.id, at: r.at, z: v.z, beyond: Math.abs(v.z) > SPARK_LIMIT });
    });
    return { level, segments };
  });
  return { runs: shown.length, series };
}

/** Counts for the text alternative: points beyond 2 SD and target changes, per level. */
export function sparkCounts(s: Spark) {
  return s.series.map((x) => ({
    level: x.level,
    points: x.segments.reduce((n, seg) => n + seg.length, 0),
    beyond: x.segments.flat().filter((p) => p.beyond),
    targetChanges: Math.max(0, x.segments.length - 1),
  }));
}
