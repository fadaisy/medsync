/** §10.4 calibration: each catalogue target beside the engine's measured value for the last complete month. */
import type { IndicatorReport } from "@/lib/ncdreg/indicators/engine";

type Targets = {
  counts: { indicator: string; target: number; tolerance: number }[];
  percentages: { indicator: string; target: number; tolerance: number }[];
  distributions: { indicator: string; target: Record<string, number> | number[]; tolerance: number }[];
  events_per_1000_under_care_past_12_months: Record<string, number>;
};
export type CalRow = { indicator: string; target: number; measured: number; tolerance: string; ok: boolean };

export function calibrate(r: IndicatorReport, t: Targets, cohortModule: string): CalRow[] {
  const res = r.results;
  const out: CalRow[] = [];
  const pct = (n = 0, d = 0) => (d ? Math.round((1000 * n) / d) / 10 : 0);
  for (const c of t.counts) {
    const m = res[c.indicator]!.num ?? 0;
    out.push({ indicator: c.indicator, target: c.target, measured: m, tolerance: `±${c.tolerance}`, ok: Math.abs(m - c.target) <= c.tolerance });
  }
  for (const c of t.percentages) {
    const x = res[c.indicator]!;
    const m = pct(x.num, x.den);
    out.push({ indicator: c.indicator, target: c.target, measured: m, tolerance: `±${c.tolerance}`, ok: Math.abs(m - c.target) <= c.tolerance });
  }
  for (const d of t.distributions) {
    if (d.indicator === "C16") {
      const x = res[`C16.${cohortModule}`]!;
      const qs = [...new Set(Object.keys(x.parts!).map((k) => k.split(":")[0]!))].sort();
      (d.target as number[]).forEach((target, i) => {
        const q = qs[i]!;
        const m = pct(x.parts![`${q}:in_range`], x.parts![`${q}:cohort`]);
        out.push({ indicator: `C16 ${q}`, target, measured: m, tolerance: `±${d.tolerance}`, ok: Math.abs(m - target) <= d.tolerance });
      });
      continue;
    }
    const x = res[d.indicator]!;
    const keys = Object.keys(d.target as Record<string, number>);
    const den = keys.reduce((a, k) => a + (x.parts![k] ?? 0), 0);
    for (const k of keys) {
      const target = (d.target as Record<string, number>)[k]!;
      const m = pct(x.parts![k], den);
      out.push({ indicator: `${d.indicator} ${k}`, target, measured: m, tolerance: `±${d.tolerance}`, ok: Math.abs(m - target) <= d.tolerance });
    }
  }
  const ev = t.events_per_1000_under_care_past_12_months;
  const h08 = res.H08!;
  const rate = (k: string) => (h08.den ? Math.round((1000 * (h08.parts?.[k] ?? 0)) / h08.den) : 0);
  for (const [k, target] of Object.entries(ev)) {
    if (k === "tolerance_percent") continue;
    const m = k === "amputation_minor_plus_major" ? rate("amputation_minor") + rate("amputation_major") : rate(k);
    out.push({ indicator: `H08 ${k}`, target, measured: m, tolerance: `±${ev.tolerance_percent}%`, ok: Math.abs(m - target) <= (target * ev.tolerance_percent!) / 100 });
  }
  return out;
}
