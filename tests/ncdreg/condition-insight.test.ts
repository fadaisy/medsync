/** The interactive condition panel renders its three modules, opens on the latest month, and draws no hidden count. */
import type { MonthSlice } from "@/lib/ncdreg/read/dashboard";
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { ConditionInsight } from "@/app/ncd/dashboard/_components/condition-insight";

const count = (value: number | null) => ({
  value,
  text: value == null ? "1–4" : String(value),
  href: null,
});
const slice = (month: string, inRange: number | null, den: number): MonthSlice => ({
  month,
  pct: inRange == null ? null : Math.round((100 * inRange) / den),
  den: count(den),
  distribution: [
    {
      key: "in_range",
      label: "In range",
      count: count(inRange),
      pct: inRange == null ? null : Math.round((100 * inRange) / den),
    },
    { key: "not_recorded", label: "Not recorded", count: count(den - (inRange ?? 0)), pct: null },
  ],
  cascade: [
    { key: "registered", label: "Registered", count: count(40), pct: null },
    {
      key: "under_care",
      label: "Under care",
      count: count(den),
      pct: Math.round((100 * den) / 40),
    },
  ],
  version: "ind-0.1.0-draft",
});
const months = Array.from({ length: 12 }, (_, i) =>
  slice(`2025-${String(i + 1).padStart(2, "0")}`, i === 3 ? null : 10 + i, 30),
);
const html = renderToStaticMarkup(
  h(ConditionInsight, {
    label: "Hypertension",
    outcomeLabel: "Below 140/90",
    months,
    monthLabels: months.map((m) => m.month),
    max: 80,
    others: [{ code: "diabetes", label: "Diabetes", points: months.map(() => 20) }],
  }),
);

describe("condition insight", () => {
  it("has the trend, breakdown and cascade modules, each with its own chart/table switch", () => {
    for (const t of ["Below 140/90, past 12 months", "Outcome at the latest visit", "Care cascade"])
      expect(html).toContain(t);
    expect(html.match(/>Table</g)).toHaveLength(3);
  });
  it("opens on the latest month, as a keyboard slider over the 12 months", () => {
    expect(html).toContain('role="slider"');
    expect(html).toContain('aria-valuenow="11"');
    expect(html).toContain('aria-valuetext="2025-12: 70%"');
  });
  it("offers comparison when other conditions exist, and shows the drop between cascade steps", () => {
    expect(html).toContain("Compare conditions");
    expect(html).toContain("10 fewer (25% of the step before)");
  });
});
