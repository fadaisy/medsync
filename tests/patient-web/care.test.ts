import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import type { SavedReading } from "@patient-core/log";
import type { MedRow, TakeRec } from "@patient-core/medicines";
import { dayHeadline, timelineFill } from "@patient-core/care-day";
import { amountsFor, itemById, mealsOn, searchItems } from "@patient-core/care-meals";
import { tapGlass } from "@patient-core/care-move";
import { hasDose, instructionsWithoutDose, nameWithoutDose } from "@patient-core/care-no-dose";
import { judge, targetBand, trendTiles, weekSeries } from "@patient-core/care-trends";
import { lastDays } from "@patient-core/log";
import { describe, expect, it } from "vitest";

import { CARE_COPY } from "@/content/patient/care";
import { chartFinding, flipState, myMedicines, withoutDose } from "@/lib/patient-web/care-view";
import { today } from "@/lib/patient-web/today";
import { selfMedicationFromPrescription } from "@/lib/patient/visit-medicine";
import rules from "@/packages/clinical-rules/patient-thresholds.v0.json";

/** Care (Step 5): S15 no dose anywhere on Care, S16 trends from the threshold data, S17 Stop / Pause / Resume. */
const NOW = new Date(2026, 9, 25, 8, 10);
const med = (over: Partial<MedRow>): MedRow => ({
  id: "m1",
  name: "Medicine",
  dose: null,
  instructions: null,
  schedulePattern: "twice_daily",
  scheduleTimes: ["08:00", "20:00"],
  state: "active",
  createdAt: new Date(2026, 0, 1).toISOString(),
  ...over,
});

const ROOT = process.cwd();
function walk(p: string): string[] {
  const abs = join(ROOT, p);
  if (!statSync(abs).isDirectory()) return [p];
  return readdirSync(abs).flatMap((n) => walk(join(p, n)));
}
/** Every file Care owns. */
const CARE_FILES = [
  "app/pw/patient/care/page.tsx",
  "app/pw/patient/care/medicines",
  "app/pw/patient/care/trends",
  "app/pw/patient/care/labs",
  "app/pw/patient/care/move",
  "app/pw/patient/care/messages",
  "components/tide/care-ring.tsx",
  "components/tide/care-week-chart.tsx",
  "components/tide/care-sugar-diary.tsx",
  "components/tide/care-plate.tsx",
  "content/patient/care.ts",
  "lib/patient-web/care-view.ts",
  "lib/patient-web/care-medicines.ts",
  "lib/patient-web/care-labs.ts",
  "lib/patient-web/care-move.ts",
  "lib/patient-web/care-actions.ts",
].flatMap(walk);
const code = (f: string) =>
  readFileSync(join(ROOT, f), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");

describe("S15: no dose amount anywhere on Care", () => {
  it("no Care file writes a dose amount or a counted dose into a string", () => {
    expect(CARE_FILES.length).toBeGreaterThan(15);
    for (const f of CARE_FILES) {
      const src = code(f);
      const m =
        /["'`>][^"'`<]*\b\d+(\.\d+)?\s?(mg|mcg|µg|IU|units?|mL|ml)\b/.exec(src) ??
        /["'`>][^"'`<]*\b\d+\s?(tablets?|tabs?|capsules?|puffs?|drops?)\b/i.exec(src);
      expect(m, `${f}: ${m?.[0]}`).toBeNull();
    }
  });

  it("no Care file reads the dose column, a value of a lab result, or the pharmacy's amounts", () => {
    for (const f of CARE_FILES) {
      const src = code(f);
      expect(src, f).not.toMatch(/\.dose\b/);
      // Label photos on Move have nutrition "values"; nowhere else reads a value.
      if (!f.includes("/move/"))
        expect(src, f).not.toMatch(/\.values\b|\.directions\b|\bm\.given\b/);
    }
  });

  it("a medicine added from a visit record shows its name and times only", () => {
    const row = selfMedicationFromPrescription(
      {
        id: "rx1",
        drugName: "Amlodipine 5 mg tablet",
        dose: "5 mg",
        route: "oral",
        frequency: "1 tab once daily",
        duration: "30 days",
      } as Parameters<typeof selfMedicationFromPrescription>[0],
      { startedAt: "2026-10-20T08:00:00Z", hospitalName: "Test Hospital" } as Parameters<
        typeof selfMedicationFromPrescription
      >[1],
    );
    const shown = withoutDose(
      med({
        name: row.name,
        instructions: row.instructions,
        dose: row.dose,
        scheduleTimes: ["08:00"],
      }),
    );
    expect(shown.name).toBe("Amlodipine tablet");
    expect(shown.instructions).toBeNull();
    expect(shown.dose).toBeNull();
    const day = today([shown], [], NOW);
    const words = JSON.stringify({ day, mine: myMedicines([shown]) });
    expect(hasDose(words)).toBe(false);
  });

  it("the no-dose rule keeps plain words and drops amounts", () => {
    expect(nameWithoutDose("Paracetamol 500mg")).toBe("Paracetamol");
    expect(nameWithoutDose("Amoxicillin 250 mg/5 mL syrup")).toBe("Amoxicillin syrup");
    expect(nameWithoutDose("Metformin")).toBe("Metformin");
    expect(instructionsWithoutDose("Oral, twice daily, for 5 days")).toBe(
      "Oral, twice daily, for 5 days",
    );
    expect(instructionsWithoutDose("Take two tablets at night")).toBeNull();
    expect(instructionsWithoutDose("2 puffs when needed")).toBeNull();
    expect(hasDose("Morning and evening")).toBe(false);
  });
});

describe("S16: trends come from the threshold data", () => {
  const reading = (
    input: SavedReading["input"],
    daysAgo: number,
    id = `r${daysAgo}`,
  ): SavedReading => ({
    id,
    input,
    at: new Date(2026, 9, 25 - daysAgo, 7, 30).toISOString(),
    feel: [],
  });

  it("the target lines are the JSON's numbers; weight has none", () => {
    expect(targetBand("bp", "fasting")).toEqual({
      lo: rules.bp.lowTopBelow,
      hi: rules.bp.aboveTopAtLeast,
    });
    expect(targetBand("sugar", "after")).toEqual({
      lo: rules.sugar.dangerLowBelow,
      hi: rules.sugar.targetMaxByContext.after,
    });
    expect(targetBand("pulse", "fasting")).toEqual({
      lo: rules.pulse.unusualBelow,
      hi: rules.pulse.unusualAbove,
    });
    expect(targetBand("weight", "fasting")).toBeNull();
    expect(judge({ kind: "weight", value: 80 })).toEqual({ tone: "pending", word: "No target" });
  });

  it("a reading above the JSON's line is marked outside target, and the finding says so in words", () => {
    const above = rules.bp.aboveTopAtLeast;
    const readings = [
      reading({ kind: "bp", top: above + 2, bottom: 80 }, 0),
      reading({ kind: "bp", top: rules.bp.lowTopBelow + 10, bottom: 70 }, 2),
    ];
    const days = lastDays(NOW);
    const series = weekSeries(readings, "bp", "fasting", days);
    const judged = series.inputs.map((i) => (i ? judge(i) : null));
    expect(judged[6]?.tone).toBe("caution");
    expect(judged[6]?.word).toBe("Above target");
    expect(judged[4]?.tone).toBe("stable");
    const found = chartFinding(series, judged, true);
    expect(found).toEqual({ n: 2, outside: 1 });
    expect(CARE_COPY.trends.finding(found.n, found.outside)).toBe(
      "2 readings this week, 1 outside target.",
    );
  });

  it("weight's chart states its finding with no target", () => {
    const days = lastDays(NOW);
    const series = weekSeries(
      [reading({ kind: "weight", value: 80 }, 1)],
      "weight",
      "fasting",
      days,
    );
    const found = chartFinding(
      series,
      series.inputs.map((i) => (i ? judge(i) : null)),
      false,
    );
    expect(CARE_COPY.trends.finding(found.n, found.outside)).toBe(
      "1 reading this week, no target for this reading.",
    );
    expect(trendTiles([], days).every((t) => t.trend === "No readings yet")).toBe(true);
  });
});

describe("S17: Stop needs the confirmation and leaves the list; Pause and Resume round-trip", () => {
  it("a stopped medicine leaves My medicines; a paused one stays and says so", () => {
    const rows = [
      med({ id: "a" }),
      med({ id: "b", state: "paused" }),
      med({ id: "c", state: "ended" }),
    ];
    expect(myMedicines(rows).map((m) => [m.id, m.state])).toEqual([
      ["a", "active"],
      ["b", "paused"],
    ]);
  });

  it("Pause then Resume is where it started", () => {
    expect(flipState(flipState("active"))).toBe("active");
    expect(flipState("active")).toBe("paused");
  });

  it("a paused medicine has no doses today; resumed, they come back", () => {
    const takes: TakeRec[] = [];
    expect(today([med({ state: "paused" })], takes, NOW).total).toBe(0);
    expect(today([med({ state: "active" })], takes, NOW).total).toBe(2);
  });

  it("the Stop dialog asks first, in the phone's words", () => {
    expect(CARE_COPY.meds.stopTitle("Metformin")).toBe("Stop Metformin?");
    expect(CARE_COPY.meds.stopBody).toMatch(/leaves your list/);
    const view = readFileSync(
      join(ROOT, "app/pw/patient/care/medicines/_components/medicines-view.tsx"),
      "utf8",
    );
    // Stop only opens the dialog; "ended" is written from the dialog's own button.
    expect(view).toMatch(/onClick=\{\(\) => setConfirm\(true\)\}/);
    expect(view.match(/set\("ended"\)/g)?.length).toBe(1);
  });
});

describe("Care's small rules", () => {
  it("the medicines headline and the timeline fill", () => {
    expect(dayHeadline(0, 0)).toBe("Nothing due today");
    expect(dayHeadline(1, 3)).toBe("One down, two to go");
    expect(dayHeadline(3, 3)).toBe("All done for today");
    expect(timelineFill(1, 3)).toBe(0.25);
  });

  it("water glasses fill up to and empty down to the tapped glass", () => {
    expect(tapGlass(3, 5)).toBe(6);
    expect(tapGlass(3, 1)).toBe(1);
  });

  it("the Ugandan list is searched first, by local name too, and a meal row reads back", () => {
    const hits = searchItems("matooke");
    expect(hits[0]?.kind === "food" && hits[0].food.id.startsWith("matooke")).toBe(true);
    const item = itemById("matooke-mashed");
    expect(item).not.toBeNull();
    const rows = [
      {
        id: "x",
        kind: "meal" as const,
        recordedAt: NOW.toISOString(),
        v1: 100,
        v2: 81,
        unit: "matooke-mashed",
        note: "lunch",
      },
    ];
    const [entry] = mealsOn(rows, NOW);
    expect(entry?.slot).toBe("lunch");
    expect(entry?.amounts.kcal).toBe(amountsFor(item!, 100).kcal);
  });
});
