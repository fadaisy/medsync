import { describe, expect, it } from "vitest";

import { computeArrestState } from "@/lib/resus/als/engine";
import {
  artefact,
  check,
  ctxOf,
  min,
  proc,
  rosc,
  sec,
  started,
  surveyAction,
  T0,
  vital,
} from "./fixtures";

/** ALS engine — airway, access, capnography and the compressor (catalog §2, §4, ALS-RC-09). */

const run = (extra: Parameters<typeof computeArrestState>[0], nowMs = sec(60), ctx = ctxOf()) =>
  computeArrestState([...started(), ...extra], nowMs, ctx);
const ett = (trace: "yes" | "no" | "unavailable") =>
  proc(sec(20), "airway_ett", { ettTrace: trace });

describe("airway", () => {
  it("ALS-AIR-01: no airway recorded → level none, 30:2 (no continuous compressions)", () => {
    const s = run([]);
    expect(s.airway).toEqual({ level: "none", ettTrace: null, continuousCompressions: false });
  });

  it("ALS-AIR-01: the highest airway wins (BVM < SGA < ETT) whatever the order", () => {
    const s = run([proc(sec(5), "airway_bvm"), ett("yes"), proc(sec(40), "airway_sga")]);
    expect(s.airway.level).toBe("ett");
    expect(s.airway.ettTrace).toBe("yes");
  });

  it("ALS-AIR-04: after an SGA — continuous compressions, ventilate 10 /min", () => {
    const s = run([proc(sec(10), "airway_sga")]);
    expect(s.airway.continuousCompressions).toBe(true);
    expect(s.prompts.find((p) => p.ruleId === "ALS-AIR-04")?.text).toMatch(/10 \/min/);
  });

  it("ALS-AIR-04: for a child the prompt carries no adult ventilation rate", () => {
    const s = run([proc(sec(10), "airway_sga")], sec(60), ctxOf({ ageYears: 6 }));
    expect(s.prompts.find((p) => p.ruleId === "ALS-AIR-04")?.text).not.toMatch(/\d/);
  });

  it("ALS-AIR-01/04: a tube placed during the survey counts — ETT, continuous compressions", () => {
    const s = computeArrestState(
      [surveyAction(T0 - min(10), "A", "a_plan_a_intubation"), ...started()],
      sec(60),
      ctxOf(),
    );
    expect(s.airway).toEqual({ level: "ett", ettTrace: null, continuousCompressions: true });
    expect(s.prompts.some((p) => p.ruleId === "ALS-AIR-03")).toBe(true); // trace still asked
    expect(s.prompts.some((p) => p.ruleId === "ALS-AIR-04")).toBe(true);
  });

  it("ALS-AIR-01: a survey SGA counts; a survey tube not performed (or later failed) does not", () => {
    expect(run([surveyAction(sec(5), "A", "a_plan_b_supraglottic")]).airway.level).toBe("sga");
    expect(run([surveyAction(sec(5), "B", "b_rsi_intubation", "indicated")]).airway.level).toBe(
      "none",
    );
    const failed = [
      surveyAction(sec(5), "A", "a_plan_a_intubation"),
      surveyAction(sec(9), "A", "a_plan_a_intubation", "failed"),
    ];
    expect(run(failed).airway.level).toBe("none");
  });

  it("ALS-AIR-03: ETT without a confirmed ETCO₂ trace → a warning prompt", () => {
    expect(run([ett("no")]).prompts.find((p) => p.ruleId === "ALS-AIR-03")?.severity).toBe("due");
    expect(run([ett("unavailable")]).prompts.some((p) => p.ruleId === "ALS-AIR-03")).toBe(true);
  });

  it("ALS-AIR-03: ETT with a confirmed trace → no warning", () => {
    expect(run([ett("yes")]).prompts.some((p) => p.ruleId === "ALS-AIR-03")).toBe(false);
  });

  it("ALS-AIR-03: the warning never blocks — the adrenaline prompt is still there", () => {
    const s = run([ett("no"), check(sec(30), "pea")], sec(35));
    expect(s.prompts.some((p) => p.id === "adrenaline")).toBe(true);
    expect(s.adrenaline.status).toBe("due_now");
  });
});

describe("access", () => {
  it("ALS-ACC-01: one failed IV attempt → no IO prompt yet", () => {
    const s = run([proc(sec(10), "iv_attempt_failed")]);
    expect(s.access.ivFailedAttempts).toBe(1);
    expect(s.access.promptIo).toBe(false);
  });

  it("ALS-ACC-01: after 2 failed IV attempts prompt IO", () => {
    const s = run([proc(sec(10), "iv_attempt_failed"), proc(sec(20), "iv_attempt_failed")]);
    expect(s.access.promptIo).toBe(true);
    expect(s.prompts.find((p) => p.ruleId === "ALS-ACC-01")?.text).toMatch(/IO/);
  });

  it("ALS-ACC-01: no IO prompt once IV or IO access is in", () => {
    const failed = [proc(sec(10), "iv_attempt_failed"), proc(sec(20), "iv_attempt_failed")];
    expect(run([...failed, proc(sec(30), "io_access")]).access).toMatchObject({
      io: true,
      promptIo: false,
    });
    expect(run([...failed, proc(sec(30), "iv_access")]).access).toMatchObject({
      iv: true,
      promptIo: false,
    });
  });
});

describe("capnography", () => {
  it("ALS-ETC-01: ETCO₂ comes from vital snapshots in this arrest (last three)", () => {
    const before = vital(T0 - 60_000, { etco2: 5 });
    const s = computeArrestState(
      [
        before,
        ...started(),
        ...[1.5, 1.8, 2.0, 2.2].map((v, i) => vital(sec(10 * (i + 1)), { etco2: v })),
      ],
      sec(60),
      ctxOf(),
    );
    expect(s.etco2.last3).toEqual([1.8, 2.0, 2.2]);
  });

  it("ALS-ETC-02: a rising ETCO₂ (last > previous) prompts a ROSC check at the next rhythm check", () => {
    const s = run([vital(sec(10), { etco2: 1.8 }), vital(sec(20), { etco2: 3.9 })]);
    expect(s.etco2.rising).toBe(true);
    expect(s.prompts.find((p) => p.ruleId === "ALS-ETC-02")?.text).toMatch(
      /don't stop compressions/,
    );
  });

  it("ALS-ETC-02: a falling or single value is not rising (direction only, no threshold)", () => {
    expect(run([vital(sec(10), { etco2: 3 }), vital(sec(20), { etco2: 2 })]).etco2.rising).toBe(
      false,
    );
    expect(run([vital(sec(10), { etco2: 3 })]).etco2.rising).toBe(false);
  });

  it("ALS-ETC-03: a low ETCO₂ never produces a prompt to stop", () => {
    const s = run([ett("yes"), vital(sec(30), { etco2: 0.8 })]);
    expect(s.prompts.map((p) => p.text).join(" ")).not.toMatch(/stop (the|resus|CPR)/i);
  });

  it("ALS-RC-09: ETCO₂ < 1.7 kPa with a confirmed tube → a PE hint on the Thrombosis tile", () => {
    const s = run([ett("yes"), vital(sec(30), { etco2: 1.2 })]);
    expect(s.etco2.lowPeHint).toBe(true);
    const tile = s.causes.find((c) => c.key === "thrombosis");
    const hint = tile?.evidence.find((e) => /PE hint/.test(e.label));
    expect(hint?.label).toMatch(/adequate minute volume and good compressions; not a diagnosis/);
    // Minute volume and compressions have no field, so the hint never pre-fills "suspected".
    expect(tile?.state).toBe("not_assessed");
  });

  it("ALS-RC-09: the hint cites the vital that holds the ETCO₂, not a later vital", () => {
    const withEtco2 = vital(sec(30), { etco2: 1.0 });
    const s = run([ett("yes"), withEtco2, vital(sec(40), { hr: 50 })]);
    const tile = s.causes.find((c) => c.key === "thrombosis");
    expect(tile?.evidence.find((e) => /PE hint/.test(e.label))?.eventId).toBe(withEtco2.id);
  });

  it("SV-VIT-16 / ALS-RC-09: an ETCO₂ marked artefact leaves derivation (hint, trend, last 3)", () => {
    const good = vital(sec(30), { etco2: 3.0 });
    const kinked = vital(sec(40), { etco2: 0.4 });
    const s = run([ett("yes"), good, kinked, artefact(sec(45), kinked.id, ["etco2"])]);
    expect(s.etco2).toEqual({ last3: [3], rising: false, lowPeHint: false });
    const rise = vital(sec(50), { etco2: 5 });
    const r = run([good, rise, artefact(sec(55), rise.id, ["etco2"])]);
    expect(r.etco2.rising).toBe(false);
    const restored = [ett("yes"), kinked, artefact(sec(45), kinked.id, ["etco2"])];
    expect(run([...restored, artefact(sec(50), kinked.id, ["etco2"], false)]).etco2.last3).toEqual([
      0.4,
    ]);
  });

  it("ALS-RC-09: no PE hint without a confirmed trace, with an SGA, or at 1.7 kPa", () => {
    expect(run([ett("no"), vital(sec(30), { etco2: 1.2 })]).etco2.lowPeHint).toBe(false);
    expect(run([proc(sec(20), "airway_sga"), vital(sec(30), { etco2: 1.2 })]).etco2.lowPeHint).toBe(
      false,
    );
    expect(run([ett("yes"), vital(sec(30), { etco2: 1.7 })]).etco2.lowPeHint).toBe(false);
  });
});

describe("compressor", () => {
  const provider = { userId: "u-1", name: "Nurse Achan" };

  it("ALS-CPR-11: the CPR provider is on the chest from CPR start", () => {
    const s = run([], sec(90), ctxOf({ cprProvider: provider }));
    expect(s.compressor).toEqual({ name: "Nurse Achan", onChestMs: 90_000, swapDue: false });
  });

  it("ALS-CPR-11: a swap records who is now on the chest and restarts time on chest", () => {
    const swap = proc(sec(125), "compressor_swap", { toUserId: "u-2", toName: "Dr Okello" });
    const s = run([check(sec(120), "pea"), swap], sec(185), ctxOf({ cprProvider: provider }));
    expect(s.compressor.name).toBe("Dr Okello");
    expect(s.compressor.onChestMs).toBe(60_000);
  });

  it("ALS-CPR-11: the swap is due at the rhythm-check pause", () => {
    const s = run([], sec(122), ctxOf({ cprProvider: provider }));
    expect(s.compressor.swapDue).toBe(true);
    expect(s.prompts.some((p) => p.ruleId === "ALS-CPR-11")).toBe(true);
  });

  it("ALS-CPR-11: after ROSC nobody is timed on the chest", () => {
    const s = run([rosc(min(3))], min(4), ctxOf({ cprProvider: provider }));
    expect(s.compressor.onChestMs).toBeNull();
    expect(s.compressor.swapDue).toBe(false);
  });
});
