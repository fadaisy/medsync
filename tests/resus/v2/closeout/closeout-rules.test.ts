import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { TimelineEvent } from "@/lib/resus/types";
import { describe, expect, it } from "vitest";

import {
  boardingSince,
  latestDisposition,
  news2Response,
  refText,
} from "@/app/nurse/resus/[episodeId]/_components/v2/close-out-model";
import { news2FromVitals, news2VitalSet } from "@/lib/resus/closeout/level-of-care";
import {
  allowedActions,
  LIFECYCLE_RULE_IDS,
  phaseAfter,
  projectPhase,
} from "@/lib/resus/closeout/lifecycle";
import {
  ADULT_MIN_AGE_YEARS,
  CLOSEOUT_REF,
  NEWS2_EMERGENCY_MIN,
  NEWS2_URGENT_MIN,
} from "@/lib/resus/reference/levels-of-care";
import { arrest, decision, NORMAL_VITALS, NOW, rosc, vitals } from "./fixtures";

/**
 * Close-out catalog §3 (NEWS2 response, CO-NEWS-02..05) and §5 (boarding,
 * CO-BRD-02..04): the rows match the signed catalog, and the pure helpers that
 * read them behave at the boundaries.
 */

const CATALOG = readFileSync(
  join(process.cwd(), "docs/clinical/resus-closeout-clinical-catalog.md"),
  "utf8",
);
/** A catalog row's cells after the ID, bold markers removed. */
function catalogRow(id: string): string[] {
  const line = CATALOG.split("\n").find((l) => l.startsWith(`| ${id} `));
  if (!line) throw new Error(`no catalog row ${id}`);
  return line
    .split("|")
    .slice(2, -1)
    .map((c) => c.trim().replaceAll("**", ""));
}

const n2 = (total: number, hasSingleParameterThree = false) =>
  news2Response({ total, hasSingleParameterThree })?.id;

/** A NEWS2 row: value = the Score cell, text carries the Response cell, source = RCP-NEWS2. */
function expectNewsRow(id: string) {
  const [score, response, source] = catalogRow(id);
  const e = CLOSEOUT_REF[id]!;
  expect(score!.startsWith(e.value!), id).toBe(true);
  expect(e.text.toLowerCase(), id).toContain(response!.toLowerCase());
  expect(e.source).toBe(source);
  expect(e.url).toContain("nationalearlywarningscore");
  expect(refText(e)).toBe(e.text);
}

describe("CO-NEWS — the NEWS2 monitoring response (catalog §3)", () => {
  it("CO-NEWS-02: aggregate 5 and 6 → urgent, at least hourly; 7 is CO-NEWS-01, 4 is not urgent", () => {
    expectNewsRow("CO-NEWS-02");
    expect(NEWS2_URGENT_MIN).toBe(5);
    expect(NEWS2_EMERGENCY_MIN).toBe(7);
    expect(n2(5)).toBe("CO-NEWS-02");
    expect(n2(6)).toBe("CO-NEWS-02");
    expect(n2(7)).toBe("CO-NEWS-01");
    expect(n2(4)).not.toBe("CO-NEWS-02");
    // The aggregate outranks a single-parameter 3.
    expect(n2(5, true)).toBe("CO-NEWS-02");
    expect(n2(7, true)).toBe("CO-NEWS-01");
    expect(CLOSEOUT_REF["CO-NEWS-02"]!.text).toContain("at least hourly observations");
  });

  it("CO-NEWS-03: a single parameter scoring 3 with a low aggregate → hourly, nurse informs the team", () => {
    expectNewsRow("CO-NEWS-03");
    expect(n2(3, true)).toBe("CO-NEWS-03");
    expect(n2(4, true)).toBe("CO-NEWS-03");
    // Without the single 3 the same aggregates fall to the 1–4 band.
    expect(n2(3)).toBe("CO-NEWS-04");
    expect(n2(4)).toBe("CO-NEWS-04");
    expect(CLOSEOUT_REF["CO-NEWS-03"]!.text).toContain(
      "the nurse informs the medical team, who decide whether to escalate",
    );
  });

  it("CO-NEWS-04: aggregate 1–4 (no single 3) → at least 4–6-hourly", () => {
    expectNewsRow("CO-NEWS-04");
    for (const t of [1, 2, 3, 4]) expect(n2(t), String(t)).toBe("CO-NEWS-04");
    expect(n2(0)).not.toBe("CO-NEWS-04");
    expect(CLOSEOUT_REF["CO-NEWS-04"]!.text).toContain("at least 4–6-hourly");
  });

  it("CO-NEWS-05: aggregate 0 → at least 12-hourly; no NEWS2 → no response, never a guess", () => {
    expectNewsRow("CO-NEWS-05");
    expect(n2(0)).toBe("CO-NEWS-05");
    expect(n2(1)).not.toBe("CO-NEWS-05");
    expect(news2Response(null)).toBeNull();
    expect(CLOSEOUT_REF["CO-NEWS-05"]!.text).toContain("at least 12-hourly");
  });
});
/** A §5 boarding row: the ref's text and source are the catalog's cells. */
function expectBoardingRow(id: string) {
  const [rule, source] = catalogRow(id);
  expect(CLOSEOUT_REF[id]).toMatchObject({ text: rule, source, status: "signed" });
}

/** The boarding prompt's NEWS2 response, from the one vital set the record scores. */
const cadence = (tl: TimelineEvent[], ageYears: number | null = 50) => {
  const set = news2VitalSet(tl);
  return news2Response(set ? news2FromVitals(set, ageYears) : null)?.id ?? null;
};
const phase = (minsAgo: number, p: string, extra: Record<string, unknown> = {}) =>
  decision(minsAgo, { decision: "phase", phase: p, ...extra });
const dispo = (minsAgo: number, destination: string, chosenLevel: string) =>
  decision(minsAgo, { decision: "disposition", destination, unitId: null, chosenLevel });
const acts = (p: "survey" | "arrest" | "post_rosc" | "boarding") =>
  allowedActions({ state: "active", phase: p, lastActivityAtMs: NOW }, NOW, {
    canAdminClose: false,
  });

describe("CO-BRD — boarding (catalog §5)", () => {
  it("CO-BRD-02: the monitoring cadence follows the NEWS2 response of the latest resus set", () => {
    expectBoardingRow("CO-BRD-02");
    expect(CLOSEOUT_REF["CO-BRD-02"]!.url).toContain("nationalearlywarningscore");
    expect(cadence([vitals(5, NORMAL_VITALS)])).toBe("CO-NEWS-05");
    // A newer set with a single parameter scoring 3 moves the prompt to hourly.
    const worse = vitals(5, { ...NORMAL_VITALS, spo2: 72 });
    expect(cadence([vitals(60, NORMAL_VITALS), worse])).toBe("CO-NEWS-03");
    expect(CLOSEOUT_REF[cadence([worse])!]!.text).toContain("at least hourly");
  });

  it("CO-BRD-02: no scorable adult set → no cadence prompt (never a guessed band)", () => {
    expect(cadence([])).toBeNull();
    expect(cadence([vitals(5, { spo2: 97 })])).toBeNull();
    expect(cadence([vitals(5, NORMAL_VITALS)], ADULT_MIN_AGE_YEARS - 1)).toBeNull();
  });

  it("CO-BRD-03: re-activate is offered only while boarding (LC-08), with declare arrest (LC-05)", () => {
    expectBoardingRow("CO-BRD-03");
    const boarding = acts("boarding");
    expect(boarding.find((a) => a.action === "reactivate")?.ruleId).toBe(
      LIFECYCLE_RULE_IDS.reactivate,
    );
    expect(boarding.find((a) => a.action === "declare_arrest")?.ruleId).toBe(
      LIFECYCLE_RULE_IDS.declareArrest,
    );
    for (const p of ["survey", "arrest", "post_rosc"] as const)
      expect(
        acts(p).map((a) => a.action),
        p,
      ).not.toContain("reactivate");
    expect(
      allowedActions({ state: "concluded", phase: "boarding", lastActivityAtMs: NOW }, NOW, {
        canAdminClose: true,
      }),
    ).toEqual([]);
  });

  it("CO-BRD-03: re-activation returns the same episode to the survey, not to post-ROSC", () => {
    expect(phaseAfter("decision", { decision: "phase", phase: "survey" }, "boarding")).toBe(
      "survey",
    );
    const board = phase(30, "boarding");
    const back = phase(10, "survey", { reason: "Deteriorating" });
    expect(projectPhase([board])).toBe("boarding");
    expect(projectPhase([board, back])).toBe("survey");
    expect(projectPhase([arrest(90), rosc(60), phase(40, "boarding"), back])).toBe("survey");
  });

  it("CO-BRD-03: deterioration while boarding can go straight to a declared arrest", () => {
    expect(phaseAfter("arrest_detected", {}, "boarding")).toBe("arrest");
    expect(projectPhase([phase(30, "boarding"), arrest(5)])).toBe("arrest");
  });

  it("CO-BRD-04: the boarding clock starts at the disposition decision that boarded the patient", () => {
    expectBoardingRow("CO-BRD-04");
    const d = dispo(30, "icu", "l3");
    const tl = [d, phase(30, "boarding")];
    expect(boardingSince(tl)).toBe(d.recordedAt);
    expect(latestDisposition(tl)).toMatchObject({
      atIso: d.recordedAt,
      destination: "icu",
      chosenLevel: "l3",
    });
  });

  it("CO-BRD-04: no boarding decision → no boarding clock; a re-board after re-activation restarts it", () => {
    expect(boardingSince([])).toBeNull();
    expect(latestDisposition([])).toBeNull();
    expect(boardingSince([dispo(20, "ward", "ward"), phase(10, "survey")])).toBeNull();
    const again = dispo(10, "hdu", "l2");
    const tl = [
      dispo(60, "ward", "ward"),
      phase(60, "boarding"),
      phase(40, "survey"),
      again,
      phase(10, "boarding"),
    ];
    expect(boardingSince(tl)).toBe(again.recordedAt);
    expect(latestDisposition(tl)).toMatchObject({ destination: "hdu", chosenLevel: "l2" });
  });
});
