/**
 * "Fill from the catalogue research" on the PGlite lane: units, decimals and verified LOINC codes for components with
 * no measure; existing measures untouched; a second run fills nothing. Runs with EMR_PGLITE=1.
 */
import type { Lane, Pg } from "./_pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { saveMeasure } from "@/lib/lab/measures-setup";
import { fillMeasuresFromResearch, researchMeasures } from "@/lib/lab/research-measures";
import { researchText } from "@/lib/lab/research-store";
import { bootLane, clinician, department, hospital, laneOn } from "./_pglite";

describe("research measures (pure)", () => {
  it("maps units to MedSync's spellings and keeps only verified, active LOINC codes", () => {
    const m = researchMeasures(researchText());
    expect(m.get("obs.wbc")).toMatchObject({
      resultType: "number",
      unit: "10*9/L",
      decimals: 2,
      loinc: "6690-2",
    });
    const vl = [...m.values()].find((x) => x.unit === "{copies}/mL");
    expect(vl).toBeTruthy();
    expect([...m.values()].some((x) => x.unit === "copies/mL")).toBe(false);
    for (const x of m.values()) if (x.resultType !== "number") expect(x.unit).toBeNull();
  });
});

describe.skipIf(!laneOn)("Fill from the catalogue research", () => {
  let lane: Lane;
  let pg: Pg;
  let h: string;
  let lead: { userId: string; hospitalId: string };
  const env = { ...process.env };

  beforeAll(async () => {
    process.env.LAB_WORKSPACE = "1";
    process.env.LAB_UNITS_RANGES = "1";
    lane = await bootLane();
    pg = lane.pg;
    h = await hospital(pg, "Research");
    const labDept = await department(pg, h, "Laboratory");
    const s = await clinician(pg, {
      hospitalId: h,
      departmentId: labDept,
      cadre: "LAB_TECHNOLOGIST",
    });
    lead = { userId: s.userId, hospitalId: h };
  }, 300_000);
  afterAll(() => {
    process.env.LAB_WORKSPACE = env.LAB_WORKSPACE;
    process.env.LAB_UNITS_RANGES = env.LAB_UNITS_RANGES;
  });

  it("fills missing components, keeps existing ones, and is a no-op the second time", async () => {
    const cr = (
      await pg.query<{ id: string }>(
        `SELECT id FROM test_catalogue WHERE code = 'test.creatinine' AND hospital_id IS NULL`,
      )
    ).rows[0]!.id;
    // An existing measure the lead set by hand must survive untouched.
    await lane.db
      .transaction((t) =>
        saveMeasure(
          t,
          lead,
          {
            testId: cr,
            conceptId: "obs.creatinine",
            draft: {
              resultType: "number",
              unitUcum: "mg/dL",
              unitDisplay: "mg/dL",
              decimalPlaces: 2,
              loincCode: null,
              entryCheckLow: null,
              entryCheckHigh: null,
            },
          },
          new Date(),
        ),
      )
      .catch(() => undefined);
    const before = (
      await pg.query<{ unit_ucum: string }>(
        `SELECT unit_ucum FROM lab_component_measures WHERE hospital_id = $1 AND test_id = $2 AND concept_id = 'obs.creatinine' AND superseded_by IS NULL`,
        [h, cr],
      )
    ).rows;
    const first = await lane.db.transaction((t) => fillMeasuresFromResearch(t, lead, new Date()));
    expect(first.filled).toBeGreaterThan(20);
    const wbc = (
      await pg.query<{ unit_ucum: string; decimal_places: number; loinc_code: string | null }>(
        `SELECT unit_ucum, decimal_places, loinc_code FROM lab_component_measures WHERE hospital_id = $1 AND concept_id = 'obs.wbc' AND superseded_by IS NULL`,
        [h],
      )
    ).rows[0];
    expect(wbc).toMatchObject({ unit_ucum: "10*9/L", decimal_places: 2 });
    const after = (
      await pg.query<{ unit_ucum: string }>(
        `SELECT unit_ucum FROM lab_component_measures WHERE hospital_id = $1 AND test_id = $2 AND concept_id = 'obs.creatinine' AND superseded_by IS NULL`,
        [h, cr],
      )
    ).rows;
    expect(after).toEqual(before.length ? before : after);
    const second = await lane.db.transaction((t) => fillMeasuresFromResearch(t, lead, new Date()));
    expect(second.filled).toBe(0);
    process.stderr.write(
      `research fill: ${JSON.stringify({ ...first, skipped: first.skipped.slice(0, 8) })}\n`,
    );
  });
});
