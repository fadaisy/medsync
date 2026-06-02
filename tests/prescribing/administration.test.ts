import type { TimelineEvent } from "@/lib/resus/types";
import { describe, expect, it } from "vitest";

import {
  buildAdministeredDrugs,
  priorAdministrationsFromTimeline,
  recordedAllergiesFromTimeline,
} from "@/lib/prescribing/administration";

/**
 * Emergency-administration projections (GATE C) — PURE reads over the
 * immutable resus timeline. The administration IS the record (grab-and-give):
 * a `drug` event carries a `prescribing` payload; allergy capture is a `note`
 * event carrying `allergyCapture`. Cumulative dosing + the live allergy list
 * are projected from these, exactly like the resus engine's other projections.
 */

function drugEvent(id: string, at: string, prescribing: Record<string, unknown>): TimelineEvent {
  return {
    id,
    episodeId: "epi-1",
    kind: "drug",
    step: "B",
    recordedByUserId: "u-1",
    recordedAt: at,
    createdAt: at,
    payload: { prescribing, label: "drug" },
    supersedesEventId: null,
  };
}
function allergyEvent(id: string, at: string, capture: Record<string, unknown>): TimelineEvent {
  return {
    id,
    episodeId: "epi-1",
    kind: "note",
    step: null,
    recordedByUserId: "u-1",
    recordedAt: at,
    createdAt: at,
    payload: { allergyCapture: capture, label: "allergies" },
    supersedesEventId: null,
  };
}

describe("priorAdministrationsFromTimeline", () => {
  it("collects drug events that carry a drugKey + amountMg", () => {
    const out = priorAdministrationsFromTimeline([
      drugEvent("1", "2026-06-03T10:00:00Z", { drugKey: "atropine", amountMg: 0.5 }),
      drugEvent("2", "2026-06-03T10:04:00Z", { drugKey: "atropine", amountMg: 0.5 }),
      drugEvent("3", "2026-06-03T10:05:00Z", { drugKey: "salbutamol" }), // no amountMg → skipped
    ]);
    expect(out).toEqual([
      { drugKey: "atropine", amountMg: 0.5 },
      { drugKey: "atropine", amountMg: 0.5 },
    ]);
  });
  it("ignores non-drug / non-prescribing events", () => {
    const ev: TimelineEvent = {
      id: "x",
      episodeId: "epi-1",
      kind: "assessment",
      step: "B",
      recordedByUserId: "u",
      recordedAt: "2026-06-03T10:00:00Z",
      createdAt: "2026-06-03T10:00:00Z",
      payload: { breathing: {} },
      supersedesEventId: null,
    };
    expect(priorAdministrationsFromTimeline([ev])).toEqual([]);
  });
});

describe("recordedAllergiesFromTimeline", () => {
  it("returns the substances from the latest allergy capture", () => {
    const out = recordedAllergiesFromTimeline([
      allergyEvent("1", "2026-06-03T10:00:00Z", { substances: ["penicillin"] }),
      allergyEvent("2", "2026-06-03T10:05:00Z", { substances: ["penicillin", "adrenaline"] }),
    ]);
    expect(out).toEqual(["penicillin", "adrenaline"]);
  });
  it("a later 'no known allergies' capture clears the list", () => {
    const out = recordedAllergiesFromTimeline([
      allergyEvent("1", "2026-06-03T10:00:00Z", { substances: ["penicillin"] }),
      allergyEvent("2", "2026-06-03T10:05:00Z", { nkda: true }),
    ]);
    expect(out).toEqual([]);
  });
  it("no allergy capture → empty list", () => {
    expect(recordedAllergiesFromTimeline([])).toEqual([]);
  });
});

describe("buildAdministeredDrugs", () => {
  it("lists administered drugs newest-first with their key fields", () => {
    const out = buildAdministeredDrugs([
      drugEvent("1", "2026-06-03T10:00:00Z", {
        drugId: "adrenaline_anaphylaxis_im",
        drugName: "Adrenaline",
        dose: "500 micrograms",
        amountMg: 0.5,
      }),
      drugEvent("2", "2026-06-03T10:06:00Z", {
        drugId: "salbutamol_neb",
        drugName: "Salbutamol",
        dose: "5 mg",
      }),
    ]);
    expect(out).toHaveLength(2);
    expect(out[0]!.drugId).toBe("salbutamol_neb"); // newest first
    expect(out[1]!.drugName).toBe("Adrenaline");
  });
});
