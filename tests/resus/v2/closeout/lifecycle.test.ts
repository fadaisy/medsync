import type { EpisodePhase } from "@/lib/resus/model";
import { describe, expect, it } from "vitest";

import {
  allowedActions,
  LIFECYCLE_RULE_IDS,
  phaseAfter,
  projectPhase,
} from "@/lib/resus/closeout/lifecycle";
import { arrest, decision, ev, NOW, rosc } from "./fixtures";

const H = 3_600_000;
const FRESH = NOW - 10 * 60_000;
const IDLE_24H = NOW - 24 * H;
const nurse = { canAdminClose: false };
const inCharge = { canAdminClose: true };

const actions = (phase: EpisodePhase, last = FRESH, actor = nurse, state = "active" as const) =>
  allowedActions({ state, phase, lastActivityAtMs: last }, NOW, actor)
    .map((a) => a.action)
    .sort();

describe("LC — allowed actions", () => {
  it("LC-01: a concluded episode is read-only", () => {
    expect(
      allowedActions(
        { state: "concluded", phase: "survey", lastActivityAtMs: IDLE_24H },
        NOW,
        inCharge,
      ),
    ).toEqual([]);
  });

  it("LC-01: a cancelled episode is read-only", () => {
    expect(
      allowedActions(
        { state: "cancelled", phase: "arrest", lastActivityAtMs: FRESH },
        NOW,
        inCharge,
      ),
    ).toEqual([]);
  });

  it("LC-02: End resus is allowed in every active phase", () => {
    for (const p of ["survey", "arrest", "post_rosc", "boarding"] as const)
      expect(actions(p)).toContain("end");
  });

  it("LC-02: End mid-arrest never blocks and needs no reason", () => {
    const end = allowedActions(
      { state: "active", phase: "arrest", lastActivityAtMs: FRESH },
      NOW,
      nurse,
    ).find((a) => a.action === "end");
    expect(end).toEqual({ action: "end", ruleId: "LC-02", requiresReason: false });
  });

  it("LC-03: cancel is allowed from every active phase", () => {
    for (const p of ["survey", "arrest", "post_rosc", "boarding"] as const)
      expect(actions(p)).toContain("cancel");
  });

  it("LC-03: cancel requires a reason", () => {
    const c = allowedActions(
      { state: "active", phase: "post_rosc", lastActivityAtMs: FRESH },
      NOW,
      nurse,
    ).find((a) => a.action === "cancel");
    expect(c?.requiresReason).toBe(true);
    expect(c?.ruleId).toBe("LC-03");
  });

  it("LC-04: admin close is not offered to an in-charge when fresh", () => {
    expect(actions("survey", FRESH, inCharge)).not.toContain("admin_close");
  });

  it("LC-04: admin close is not offered at 23 h idle", () => {
    expect(actions("survey", NOW - 23 * H, inCharge)).not.toContain("admin_close");
  });

  it("LC-04: admin close is offered at 24 h idle to an in-charge, with a reason", () => {
    const a = allowedActions(
      { state: "active", phase: "boarding", lastActivityAtMs: IDLE_24H },
      NOW,
      inCharge,
    ).find((x) => x.action === "admin_close");
    expect(a).toEqual({ action: "admin_close", ruleId: "LC-04", requiresReason: true });
  });

  it("LC-04: admin close is never offered to someone without the authority", () => {
    expect(actions("survey", NOW - 48 * H, nurse)).not.toContain("admin_close");
  });

  it("LC-04: admin close applies in an idle arrest phase too", () => {
    expect(actions("arrest", IDLE_24H, inCharge)).toContain("admin_close");
  });

  it("LC-05: survey allows declare arrest", () => {
    expect(actions("survey")).toContain("declare_arrest");
  });

  it("LC-05: post-ROSC allows re-arrest", () => {
    expect(actions("post_rosc")).toContain("declare_arrest");
  });

  it("LC-05: boarding allows declare arrest (deterioration)", () => {
    expect(actions("boarding")).toContain("declare_arrest");
  });

  it("LC-05: arrest does not re-declare an arrest", () => {
    expect(actions("arrest")).not.toContain("declare_arrest");
  });

  it("LC-06: arrest offers exactly rosc, stop, end, cancel", () => {
    expect(actions("arrest")).toEqual(["cancel", "end", "rosc", "stop"]);
  });

  it("LC-06: rosc and stop are not offered outside an arrest", () => {
    for (const p of ["survey", "post_rosc", "boarding"] as const) {
      expect(actions(p)).not.toContain("rosc");
      expect(actions(p)).not.toContain("stop");
    }
  });

  it("LC-07: board is offered from survey and post-ROSC only", () => {
    expect(actions("survey")).toContain("board");
    expect(actions("post_rosc")).toContain("board");
    expect(actions("arrest")).not.toContain("board");
    expect(actions("boarding")).not.toContain("board");
  });

  it("LC-08: reactivate only from boarding", () => {
    expect(actions("boarding")).toContain("reactivate");
    for (const p of ["survey", "arrest", "post_rosc"] as const)
      expect(actions(p)).not.toContain("reactivate");
  });

  it("LC-08: survey offers exactly board, cancel, declare_arrest, end", () => {
    expect(actions("survey")).toEqual(["board", "cancel", "declare_arrest", "end"]);
  });

  it("LC-01: every allowed action carries a defined LC rule ID", () => {
    const ids = new Set<string>(Object.values(LIFECYCLE_RULE_IDS));
    for (const p of ["survey", "arrest", "post_rosc", "boarding"] as const)
      for (const a of allowedActions(
        { state: "active", phase: p, lastActivityAtMs: IDLE_24H },
        NOW,
        inCharge,
      ))
        expect(ids.has(a.ruleId)).toBe(true);
  });
});

describe("LC — phase projection (E4)", () => {
  it("LC-09: an empty timeline is the survey", () => {
    expect(projectPhase([])).toBe("survey");
  });

  it("LC-09: arrest_detected → arrest", () => {
    expect(projectPhase([arrest(10)])).toBe("arrest");
  });

  it("LC-09: arrest then ROSC → post_rosc", () => {
    expect(projectPhase([arrest(10), rosc(5)])).toBe("post_rosc");
  });

  it("LC-09: re-arrest after ROSC → arrest", () => {
    expect(projectPhase([arrest(20), rosc(15), arrest(5, 2)])).toBe("arrest");
  });

  it("LC-09: a phase decision → boarding, then re-activate → survey", () => {
    const tl = [decision(10, { decision: "phase", phase: "boarding" })];
    expect(projectPhase(tl)).toBe("boarding");
    expect(projectPhase([...tl, decision(2, { decision: "phase", phase: "survey" })])).toBe(
      "survey",
    );
  });

  it("LC-09: scans chronologically regardless of input order", () => {
    expect(projectPhase([rosc(5), arrest(10)])).toBe("post_rosc");
  });

  it("LC-09: a superseded arrest is hidden from the projection", () => {
    const a = arrest(10);
    const correction = ev(
      "note",
      null,
      9,
      { label: "entered in error" },
      { supersedesEventId: a.id },
    );
    expect(projectPhase([a, correction])).toBe("survey");
  });

  it("LC-10: other events leave the phase unchanged", () => {
    expect(phaseAfter("vital", {}, "post_rosc")).toBe("post_rosc");
    expect(phaseAfter("decision", { decision: "obeys_commands", value: true }, "arrest")).toBe(
      "arrest",
    );
  });

  it("LC-10: a phase decision with an unknown phase is ignored", () => {
    expect(phaseAfter("decision", { decision: "phase", phase: "concluded" }, "survey")).toBe(
      "survey",
    );
  });
});
