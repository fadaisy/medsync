/**
 * The patient's visit summary composer (ADR 0203): restricted items never appear, removals only take away,
 * differentials never show, and no copy for a death, an administrative closure or an encounter in error.
 * Pure; the property runs 300 seeded worlds (no fast-check, as the repo's other property tests).
 */
import type { SummaryInput } from "@/lib/patient/visit-summary";
import { describe, expect, it } from "vitest";

import {
  composeVisitSummary,
  parseVisitSummary,
  removableIds,
  takeHomePrescriptionIds,
  withRemovals,
} from "@/lib/patient/visit-summary";

const base = (over: Partial<SummaryInput> = {}): SummaryInput => ({
  encounter: { state: "completed", closureKind: "clinical", disposition: "home" },
  visit: {
    startedAt: "2026-10-03T07:30:00Z",
    hospitalName: "Lane Hospital",
    clinicianName: "Dr A",
    clinicianCadre: "Medical officer",
  },
  outcome: { kind: "home" },
  diagnoses: [
    { id: "d1", display: "Malaria", verification: "confirmed", rank: "primary", restricted: false },
    {
      id: "d2",
      display: "Typhoid",
      verification: "differential",
      rank: "secondary",
      restricted: false,
    },
    {
      id: "d3",
      display: "Pneumonia",
      verification: "provisional",
      rank: "secondary",
      restricted: false,
    },
  ],
  medicines: [
    {
      id: "r1",
      name: "Artemether/lumefantrine",
      dose: "4 tablets",
      route: "By mouth",
      frequency: "12-hourly",
      duration: "3 days",
      instructions: null,
      restricted: false,
    },
  ],
  stopped: [{ id: "r2", name: "Ibuprofen", restricted: false }],
  tests: [{ id: "o1", display: "Full blood count", restricted: false }],
  next: "Booked: Tue 14 Oct, 09:20, Medical OPD",
  comeBackIf: "  fever returns  ",
  ...over,
});

describe("composeVisitSummary", () => {
  it("composes what we found, medicines, stopped, tests and next, in the clinician's words", () => {
    const r = composeVisitSummary(base());
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const c = r.content;
    expect(c.outcome).toBe("You went home.");
    expect(c.visit.clinician).toBe("Dr A, Medical officer");
    expect(c.sections.found.map((i) => [i.text, i.detail])).toEqual([
      ["Malaria", null],
      ["Pneumonia", "Not yet confirmed"],
    ]);
    expect(c.sections.medicines[0]).toEqual({
      id: "rx:r1",
      text: "Artemether/lumefantrine",
      detail: "4 tablets, By mouth, 12-hourly, for 3 days",
    });
    expect(c.sections.stopped.map((i) => i.id)).toEqual(["stop:r2"]);
    expect(c.sections.tests.map((i) => i.id)).toEqual(["test:o1"]);
    expect(c.comeBackIf).toBe("fever returns");
    expect(takeHomePrescriptionIds(c)).toEqual(["r1"]);
  });

  it("never shows a differential, a refuted or an unconfirmed diagnosis", () => {
    const r = composeVisitSummary(
      base({
        diagnoses: ["differential", "refuted", "unconfirmed"].map((v, i) => ({
          id: `x${i}`,
          display: v,
          verification: v,
          rank: "secondary" as const,
          restricted: false,
        })),
      }),
    );
    expect(r.ok && r.content.sections.found).toEqual([]);
  });

  it("an admission gets the ward, the bed or the wait, and no take-home list", () => {
    const bed = composeVisitSummary(
      base({ outcome: { kind: "admitted", ward: "Ward 4B", bed: "12" } }),
    );
    expect(bed.ok && bed.content.outcome).toBe("You were admitted to Ward 4B, bed 12.");
    expect(bed.ok && bed.content.outcomeNote).toMatch(/care team on the ward/);
    expect(bed.ok && bed.content.sections.medicines).toEqual([]);
    const wait = composeVisitSummary(
      base({ outcome: { kind: "admitted", ward: "Ward 4B", bed: null } }),
    );
    expect(wait.ok && wait.content.outcome).toBe(
      "You were admitted to Ward 4B. You are waiting for a bed.",
    );
    const untracked = composeVisitSummary(base({ outcome: { kind: "admitted", ward: "Ward 4B" } }));
    expect(untracked.ok && untracked.content.outcome).toBe("You were admitted to Ward 4B.");
  });

  it("makes no copy for a death, an administrative closure, an open visit or an entry in error", () => {
    const enc = (e: Partial<SummaryInput["encounter"]>) =>
      composeVisitSummary(base({ encounter: { ...base().encounter, ...e } }));
    expect(enc({ disposition: "deceased" })).toEqual({ ok: false, reason: "died" });
    expect(enc({ closureKind: "administrative", disposition: null })).toEqual({
      ok: false,
      reason: "administrative",
    });
    expect(enc({ state: "in_progress" })).toEqual({ ok: false, reason: "not_closed" });
    expect(enc({ state: "entered_in_error" })).toEqual({ ok: false, reason: "entered_in_error" });
  });

  it("removals only take away, by id; unknown ids change nothing", () => {
    const r = composeVisitSummary(base());
    if (!r.ok) throw new Error("expected a copy");
    const out = withRemovals(r.content, new Set(["dx:d1", "rx:r1", "nonsense"]));
    expect(removableIds(out)).toEqual(
      removableIds(r.content).filter((id) => id !== "dx:d1" && id !== "rx:r1"),
    );
    expect(out.outcome).toBe(r.content.outcome);
  });

  it("round-trips through storage", () => {
    const r = composeVisitSummary(base());
    if (!r.ok) throw new Error("expected a copy");
    expect(parseVisitSummary(JSON.stringify(r.content))).toEqual(r.content);
    expect(parseVisitSummary("{}")).toBeNull();
    expect(parseVisitSummary("not json")).toBeNull();
  });
});

/** A small seeded PRNG (mulberry32), as the repo's other property tests. */
function rng(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function world(seed: number): SummaryInput {
  const r = rng(seed);
  const n = (max: number) => Math.floor(r() * (max + 1));
  const restricted = () => r() < 0.35;
  const verifications = ["confirmed", "provisional", "differential", "unconfirmed", "refuted"];
  const id = (p: string, i: number) => `ID-${p}-${seed}-${i}`;
  return base({
    outcome:
      r() < 0.5
        ? { kind: "home" }
        : { kind: "admitted", ward: "Ward", bed: r() < 0.5 ? "3" : null },
    diagnoses: Array.from({ length: n(6) }, (_, i) => ({
      id: id("dia", i),
      display: `SECRET-dx-${seed}-${i}`,
      verification: verifications[n(4)]!,
      rank: i === 0 ? ("primary" as const) : ("secondary" as const),
      restricted: restricted(),
    })),
    medicines: Array.from({ length: n(5) }, (_, i) => ({
      id: id("med", i),
      name: `SECRET-rx-${seed}-${i}`,
      dose: "1",
      route: "By mouth",
      frequency: null,
      duration: null,
      instructions: null,
      restricted: restricted(),
    })),
    stopped: Array.from({ length: n(3) }, (_, i) => ({
      id: id("sto", i),
      name: `SECRET-st-${seed}-${i}`,
      restricted: restricted(),
    })),
    tests: Array.from({ length: n(5) }, (_, i) => ({
      id: id("tes", i),
      display: `SECRET-t-${seed}-${i}`,
      restricted: restricted(),
    })),
  });
}

describe("property (300 seeds)", () => {
  it("no restricted item, and no removed item, ever reaches the copy", () => {
    let restrictedSeen = 0;
    let removedSeen = 0;
    for (let seed = 1; seed <= 300; seed++) {
      const w = world(seed);
      const r = composeVisitSummary(w);
      if (!r.ok) throw new Error(`seed ${seed}: expected a copy`);
      const all = [...w.diagnoses, ...w.medicines, ...w.stopped, ...w.tests];
      const secret = (x: (typeof all)[number]) => ("display" in x ? x.display : x.name);
      const hidden = all.filter((x) => x.restricted);
      restrictedSeen += hidden.length;
      expect(r.restrictedCount, `seed ${seed}`).toBe(hidden.length);
      const json = JSON.stringify(r.content);
      for (const x of hidden) {
        expect(json, `seed ${seed}`).not.toContain(secret(x));
        expect(json, `seed ${seed}`).not.toContain(x.id);
      }
      // Remove a random half of what is left: none of it survives, the rest does.
      const ids = removableIds(r.content);
      const removed = new Set(ids.filter((_, i) => (seed + i) % 2 === 0));
      removedSeen += removed.size;
      const out = removableIds(withRemovals(r.content, removed));
      for (const gone of removed) expect(out, `seed ${seed}`).not.toContain(gone);
      expect(out.length + removed.size, `seed ${seed}`).toBe(ids.length);
      // Differentials, refuted and unconfirmed never show.
      for (const d of w.diagnoses.filter(
        (d) => !["confirmed", "provisional"].includes(d.verification),
      ))
        expect(json, `seed ${seed}`).not.toContain(d.display);
    }
    expect(restrictedSeen).toBeGreaterThan(300);
    expect(removedSeen).toBeGreaterThan(300);
  });
});
