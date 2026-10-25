/**
 * Health trends (Care hub tiles and Health trends), computed from the
 * patient's own readings (`data/readings.ts`). The rules live in
 * `@patient-core/care-trends` (ADR 0420), shared with the web; this path
 * re-exports them so no phone import changes.
 */
export type {
  DiaryClass,
  Judgement,
  Metric,
  MetricInfo,
  TrendTile,
  WeekSeries,
} from "@patient-core/care-trends";
export {
  chartRange,
  DIARY_SLOTS,
  DIARY_WORDS,
  diaryClass,
  diaryColumn,
  insight,
  judge,
  METRICS,
  readingsIn,
  SUGAR_CHIPS,
  sugarDiary,
  targetBand,
  trendTiles,
  weekSeries,
} from "@patient-core/care-trends";
