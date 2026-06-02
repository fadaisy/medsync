import type { AirwayFindingSet } from "@/lib/resus/airway";
import type { TimelineEvent } from "@/lib/resus/types";
import { describe, expect, it } from "vitest";

import { classifyAirway, latestAirwayAssessment } from "@/lib/resus/airway";

/**
 * Airway step — finding capture + state classification (GATE B). Pure +
 * deterministic: worst-finding-wins classification, and reconstruction of
 * the latest finding-set from the immutable timeline. Reassessment is a
 * new event; the latest is current.
 */

function fs(over: Partial<AirwayFindingSet> = {}): AirwayFindingSet {
  return { patency: null, present: [], difficulty: [], context: {}, ...over };
}

describe("classifyAirway — worst finding wins", () => {
  it("returns null when nothing has been assessed", () => {
    expect(classifyAirway(fs())).toBeNull();
  });

  it("apnoeic patency → apnoeic_arrest", () => {
    expect(classifyAirway(fs({ patency: "apnoeic" }))).toBe("apnoeic_arrest");
  });

  it("silence + no effort → apnoeic_arrest", () => {
    expect(classifyAirway(fs({ present: ["silence_no_effort"] }))).toBe("apnoeic_arrest");
  });

  it("no signs of life (context) → apnoeic_arrest (overrides everything)", () => {
    expect(
      classifyAirway(fs({ patency: "patent_talking", context: { noSignsOfLife: true } })),
    ).toBe("apnoeic_arrest");
  });

  it("silence + effort → completely_obstructed", () => {
    expect(classifyAirway(fs({ present: ["silence_with_effort"] }))).toBe("completely_obstructed");
  });

  it("no airflow → completely_obstructed", () => {
    expect(classifyAirway(fs({ present: ["airflow_absent"] }))).toBe("completely_obstructed");
  });

  it("stridor → partially_obstructed", () => {
    expect(classifyAirway(fs({ present: ["stridor_inspiratory"] }))).toBe("partially_obstructed");
  });

  it("gurgling → partially_obstructed", () => {
    expect(classifyAirway(fs({ present: ["gurgling"] }))).toBe("partially_obstructed");
  });

  it("hoarse/muffled voice → threatened", () => {
    expect(classifyAirway(fs({ present: ["hoarse_muffled_voice"] }))).toBe("threatened");
  });

  it("burns/soot → threatened", () => {
    expect(classifyAirway(fs({ present: ["burns_soot"] }))).toBe("threatened");
  });

  it("GCS ≤ 8 → threatened", () => {
    expect(classifyAirway(fs({ present: ["gcs_le8"] }))).toBe("threatened");
  });

  it("patent_at_risk patency → threatened", () => {
    expect(classifyAirway(fs({ patency: "patent_at_risk" }))).toBe("threatened");
  });

  it("patent + talking, no threats → secure", () => {
    expect(classifyAirway(fs({ patency: "patent_talking", present: ["normal_speech"] }))).toBe(
      "secure",
    );
  });

  it("a worse FINDING overrides an optimistic patency (talking but stridor → partial)", () => {
    expect(
      classifyAirway(fs({ patency: "patent_talking", present: ["stridor_inspiratory"] })),
    ).toBe("partially_obstructed");
  });

  it("a difficulty flag alone does NOT downgrade a secure airway (anticipation, not threat)", () => {
    expect(
      classifyAirway(
        fs({ patency: "patent_talking", present: ["normal_speech"], difficulty: ["lemon"] }),
      ),
    ).toBe("secure");
  });
});

describe("latestAirwayAssessment — reconstruct from the timeline", () => {
  function aEvent(id: string, recordedAt: string, airway: AirwayFindingSet): TimelineEvent {
    return {
      id,
      episodeId: "epi-1",
      kind: "assessment",
      step: "A",
      recordedByUserId: "u-1",
      recordedAt,
      createdAt: recordedAt,
      payload: { airway, label: "Airway findings" },
      supersedesEventId: null,
    };
  }

  it("returns null when there is no airway assessment", () => {
    expect(latestAirwayAssessment([])).toBeNull();
  });

  it("returns the most recent airway finding-set (reassessment wins)", () => {
    const first = aEvent("a", "2026-06-02T10:00:00.000Z", fs({ patency: "partially_obstructed" }));
    const second = aEvent("b", "2026-06-02T10:05:00.000Z", fs({ patency: "secure" as never }));
    const latest = latestAirwayAssessment([first, second]);
    expect(latest?.patency).toBe("secure");
  });

  it("ignores non-airway assessments and other steps", () => {
    const other: TimelineEvent = {
      id: "x",
      episodeId: "epi-1",
      kind: "assessment",
      step: "B",
      recordedByUserId: "u-1",
      recordedAt: "2026-06-02T10:10:00.000Z",
      createdAt: "2026-06-02T10:10:00.000Z",
      payload: { label: "breathing" },
      supersedesEventId: null,
    };
    const airway = aEvent("a", "2026-06-02T10:00:00.000Z", fs({ patency: "patent_talking" }));
    expect(latestAirwayAssessment([other, airway])?.patency).toBe("patent_talking");
  });
});
