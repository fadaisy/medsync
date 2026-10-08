/** Which of this visit's diagnoses the viewer added here (ADR 0217): version 1, this encounter, them. */
import { describe, expect, it } from "vitest";

import { encounterDiagnoses } from "@/lib/emr/diagnoses";

const ENC = "enc-1";
const row = (logicalId: string, version: number, recordedByUserId: string, encounterId = ENC) => ({
  id: `${logicalId}-v${version}`,
  logicalId,
  version,
  category: "encounter_diagnosis",
  subjectRelation: "self",
  clinicalStatus: "active",
  verification: "provisional",
  status: "active",
  encounterId,
  rank: "secondary",
  termId: null,
  icd11Code: null,
  sensitivity: "normal",
  recordedByUserId,
});
const view = (rows: ReturnType<typeof row>[], viewerId?: string) =>
  encounterDiagnoses({
    rows: rows as never,
    encounterId: ENC,
    terms: new Map(),
    textOf: () => null,
    displayOf: (r) => r.logicalId,
    cosignPending: new Set(),
    viewerId,
  });

describe("addedHere", () => {
  it("is true when the viewer recorded version 1 at this visit, even after a later edit by someone else", () => {
    const v = view([row("a", 1, "me"), row("a", 2, "senior")], "me");
    expect(v.map((d) => [d.logicalId, d.addedHere])).toEqual([["a", true]]);
  });
  it("is false for another clinician's diagnosis, and without a viewer", () => {
    expect(view([row("b", 1, "other")], "me")[0]!.addedHere).toBe(false);
    expect(view([row("c", 1, "me")])[0]!.addedHere).toBe(false);
  });
});
