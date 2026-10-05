import { describe, expect, it } from "vitest";

import { computeFlow } from "@/lib/workspace/flow";
import { admittedLabel } from "@/lib/workspace/words";
import { DAY, encounter, identity, input, MIN, NOW } from "./fixtures";

/** ADR 0200 §6 and its consequences: inpatient stays are not idle; an admitted visit says where to. */

const patients = { a: identity("MS-2026-00001") };

describe("admission in the Workspace (ADR 0200)", () => {
  it("an inpatient encounter quiet for two days is not idle-flagged; a visit is", () => {
    const quiet = { state: "in_progress" as const, lastActivityAtMs: NOW - 2 * DAY };
    const flags = (encounterType: string) =>
      computeFlow(
        input({ patients, encounters: [encounter("e1", "a", { ...quiet, encounterType })] }),
      ).integrity.map((f) => f.kind);
    expect(flags("inpatient")).not.toContain("idle_encounter");
    expect(flags("opd")).toContain("idle_encounter");
  });

  it("the closed visit reads Admitted · ward · bed, on the row and in the timeline", () => {
    const { rows } = computeFlow(
      input({
        patients,
        encounters: [
          encounter("e1", "a", {
            state: "completed",
            startedAtMs: NOW - 60 * MIN,
            endedAtMs: NOW - 5 * MIN,
            admitted: admittedLabel("admitted", { ward: "Medical Ward 1", bed: "B12" }),
          }),
        ],
      }),
    );
    const row = rows[0]!;
    expect(row.stageDetail).toBe("Admitted · Medical Ward 1 · Bed B12");
    expect(row.timeline.map((t) => t.text)).toContain("Admitted · Medical Ward 1 · Bed B12");
    expect(row.timeline.map((t) => t.text)).not.toContain("Visit ended");
  });

  it("admittedLabel: a bed, waiting, no ward, and any other disposition", () => {
    expect(admittedLabel("admitted", { ward: "Medical Ward 1", bed: "waiting" })).toBe(
      "Admitted · Medical Ward 1 · waiting for a bed",
    );
    expect(admittedLabel("admitted", { ward: "HDU", bed: "Bed 3" })).toBe("Admitted · HDU · Bed 3");
    expect(admittedLabel("admitted", { ward: "HDU" })).toBe("Admitted · HDU");
    expect(admittedLabel("admitted", {})).toBe("Admitted");
    expect(admittedLabel("admitted", null)).toBeNull();
    expect(admittedLabel("home", { ward: "HDU", bed: "B1" })).toBeNull();
  });
});
