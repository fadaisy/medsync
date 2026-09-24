import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { PostRoscDomain } from "@/lib/resus/reference/post-rosc-catalog";
import { describe, expect, it } from "vitest";

import { handoverTargets } from "@/app/nurse/resus/[episodeId]/_components/v2/close-out-sbar";
import { levelInputFromRecord } from "@/lib/resus/closeout/level-of-care";
import { bundleState, postRoscPins } from "@/lib/resus/closeout/post-rosc";
import { POST_ROSC_BUNDLE, POST_ROSC_REF } from "@/lib/resus/reference/post-rosc-catalog";
import { PENDING_CSO, refValue } from "@/lib/resus/reference/ref";
import { arrest, decision, rosc } from "./fixtures";

/**
 * Post-ROSC bundle rules (docs/clinical/resus-post-rosc-clinical-catalog.md),
 * one test per rule ID: the signed row, its section and source, the number it
 * shows through refValue (and only when signed), and the state the engine
 * records for it.
 */

const item = (minsAgo: number, itemId: string, state: string) =>
  decision(minsAgo, { decision: "post_rosc_item", itemId, state });
const row = (id: string) => POST_ROSC_BUNDLE.find((i) => i.id === id)!;
const ref = (id: string) => POST_ROSC_REF[id]!;
/** The same entry, unsigned: refValue must withhold its number. */
const unsigned = (id: string) => refValue({ ...ref(id), status: "pending_cso" });
const PRC25 = "post-resuscitation-care-guidelines";
const SC25 = "special-circumstances-guidelines";

const ROSC = [arrest(30), rosc(20)];
const ADULT_TARGETS = handoverTargets(ROSC, 40);
const CHILD_TARGETS = handoverTargets(ROSC, 15);

/** The row sits in its catalog section, cites its source and is a checklist item. */
function expectRow(id: string, domain: PostRoscDomain, source: string, urlPart: string) {
  const r = row(id);
  expect(r.domain, id).toBe(domain);
  expect(r.checklist, id).toBe(true);
  expect(ref(id).source, id).toBe(source);
  expect(ref(id).url, id).toContain(urlPart);
  expect(ref(id).status, id).toBe("signed");
}

/** The state recorded for `id` after ROSC (and every other item left open). */
function recorded(id: string, state: string) {
  const s = bundleState([...ROSC, item(10, id, state)]);
  const others = Object.entries(s).filter(([k]) => k !== id);
  expect(
    others.every(([, v]) => v === "open"),
    `${id} leaked into another item`,
  ).toBe(true);
  return s[id];
}

describe("PR — airway and breathing", () => {
  it("PR-A-02: no skilled intubator → supraglottic / basic airway, recordable as not available here", () => {
    expectRow("PR-A-02", "A", "RCUK-PRC25", PRC25);
    expect(ref("PR-A-02").text).toBe(
      "No skilled intubator available → keep / insert a supraglottic or basic airway until one is",
    );
    expect(row("PR-A-02").showsNumber).toBe(false);
    expect(ref("PR-A-02").value).toBeUndefined();
    expect(recorded("PR-A-02", "not_available")).toBe("not_available");
  });

  it("PR-B-01: maximum O₂ until SpO₂ is reliable or PaO₂ measured, before the titration target, no number", () => {
    expectRow("PR-B-01", "B", "RCUK-PRC25", PRC25);
    expect(refValue(ref("PR-B-01"))).toBe(
      "Maximum available O₂ until SpO₂ is reliable or PaO₂ measured, then titrate",
    );
    expect(row("PR-B-01").showsNumber).toBe(false);
    expect(/\d/.test(refValue(ref("PR-B-01")))).toBe(false);
    const order = POST_ROSC_BUNDLE.map((i) => i.id);
    expect(order.indexOf("PR-B-01")).toBeLessThan(order.indexOf("PR-B-02"));
    expect(recorded("PR-B-01", "done")).toBe("done");
  });

  it("PR-B-03: PaO₂ 10–13 kPa (75–100 mmHg) and the < 8 kPa floor show exactly as signed, only while signed", () => {
    expectRow("PR-B-03", "B", "RCUK-PRC25", PRC25);
    expect(row("PR-B-03").showsNumber).toBe(true);
    expect(refValue(ref("PR-B-03"))).toBe("10–13 kPa; < 8 kPa");
    expect(ref("PR-B-03").text).toContain("PaO₂ 10–13 kPa (75–100 mmHg)");
    expect(ref("PR-B-03").text).toContain(
      "avoid hypoxaemia PaO₂ < 8 kPa (60 mmHg) and hyperoxaemia",
    );
    expect(unsigned("PR-B-03")).toBe(PENDING_CSO);
    expect(unsigned("PR-B-03")).not.toMatch(/kPa|\d/);
  });

  it("PR-B-04: the oximetry caveat is signed B text — darker skin tones and low-flow states — with no number", () => {
    // Not expectRow: the caveat is not a task row of its own (see the bundle check below).
    expect(row("PR-B-04").domain).toBe("B");
    expect(ref("PR-B-04")).toMatchObject({ source: "RCUK-PRC25", status: "signed" });
    expect(ref("PR-B-04").url).toContain(PRC25);
    const text = refValue(ref("PR-B-04"));
    expect(text).toContain("Pulse oximetry can overestimate saturation in darker skin tones");
    expect(text).toContain("low-flow states give poor signal");
    expect(row("PR-B-04").showsNumber).toBe(false);
    expect(ref("PR-B-04").value).toBeUndefined();
  });

  it("PR-B-04: the caveat is not a checklist item — nothing to tick, never counted as open", () => {
    expect(row("PR-B-04").checklist).toBe(false);
    expect(bundleState(ROSC)).not.toHaveProperty("PR-B-04");
  });

  it("PR-B-04: the bundle prints the caveat under the SpO₂ target row (PR-B-02), never as its own row", () => {
    expect(ref("PR-B-02").text).toContain("SpO₂");
    // post-rosc-bundle.tsx is a React file — read, not rendered (as after-death.tsx in closeout-rules-2).
    const src = readFileSync(
      join(process.cwd(), "app/nurse/resus/[episodeId]/_components/v2/post-rosc-bundle.tsx"),
      "utf8",
    );
    expect(src).toContain('const CAVEAT_ID = "PR-B-04";');
    expect(src).toContain('const SPO2_ID = "PR-B-02";');
    expect(src).toMatch(/item\.id === SPO2_ID[\s\S]{0,300}signedText\(CAVEAT_ID\)/);
    expect(src).toMatch(/i\.id !== CAVEAT_ID/);
  });

  it("PR-B-04: wherever the SpO₂ target is pinned (survey pins, adult handover) the caveat goes with it", () => {
    const pinned = (["A", "B", "C", "D", "E"] as const).flatMap((s) =>
      postRoscPins(s).map(refValue),
    );
    const spo2Pins = pinned.filter((t) => t.includes("SpO₂"));
    expect(spo2Pins).toHaveLength(1);
    expect(spo2Pins[0]).toContain("94–98 %");
    expect(spo2Pins[0]).toContain("(with the oximetry caveat)");
    // The caveat text itself, right after the SpO₂ pin — at B only, once.
    const caveat = refValue(ref("PR-B-04"));
    expect(postRoscPins("B").map((p) => p.id)).toEqual(["PR-PIN-B", "PR-B-04"]);
    expect(pinned.indexOf(caveat)).toBe(pinned.indexOf(spo2Pins[0]!) + 1);
    expect(pinned.filter((t) => t === caveat)).toHaveLength(1);
    const spo2Handover = ADULT_TARGETS.filter((t) => t.includes("SpO₂"));
    expect(spo2Handover).toEqual(spo2Pins);
    expect(ADULT_TARGETS.indexOf(caveat)).toBe(ADULT_TARGETS.indexOf(spo2Pins[0]!) + 1);
    expect(CHILD_TARGETS.some((t) => t.includes("SpO₂"))).toBe(false);
    expect(CHILD_TARGETS).not.toContain(caveat);
  });

  it("PR-B-06: Vt 6–8 mL/kg ideal body weight shows exactly as signed, only while signed", () => {
    expectRow("PR-B-06", "B", "RCUK-PRC25", PRC25);
    expect(row("PR-B-06").showsNumber).toBe(true);
    expect(refValue(ref("PR-B-06"))).toBe("6–8 mL/kg IBW");
    expect(ref("PR-B-06").text).toBe("Lung-protective ventilation Vt 6–8 mL/kg ideal body weight");
    expect(unsigned("PR-B-06")).toBe(PENDING_CSO);
    expect(unsigned("PR-B-06")).not.toMatch(/mL|\d/);
    expect(recorded("PR-B-06", "not_available")).toBe("not_available");
  });
});

describe("PR — circulation", () => {
  it("PR-C-02: the BP target reads MAP ≥ 65 and SBP > 100 through refValue, the RCUK wording it satisfies, no AHA", () => {
    expectRow("PR-C-02", "C", "RCUK-PRC25", PRC25);
    expect(row("PR-C-02").showsNumber).toBe(true);
    expect(refValue(ref("PR-C-02"))).toBe("MAP ≥ 65 and SBP > 100");
    expect(ref("PR-C-02").text).toContain("MAP ≥ 65 mmHg and SBP > 100 mmHg");
    expect(ref("PR-C-02").text).toContain('satisfies RCUK "SBP > 100 or MAP > 60–65"');
    expect(`${ref("PR-C-02").text} ${ref("PR-C-02").source}`).not.toContain("AHA");
    expect(refValue(postRoscPins("C")[0]!)).toContain(refValue(ref("PR-C-02")));
    expect(unsigned("PR-C-02")).toBe(PENDING_CSO);
  });

  it("PR-C-02: a child (< 16) gets no MAP / SBP target in the handover; 16 and over does", () => {
    expect(ADULT_TARGETS.join(" ")).toContain("MAP ≥ 65 and SBP > 100");
    expect(handoverTargets(ROSC, 16).join(" ")).toContain("MAP ≥ 65 and SBP > 100");
    expect(CHILD_TARGETS.join(" ")).not.toMatch(/MAP|SBP/);
    expect(handoverTargets(ROSC, 0).join(" ")).not.toMatch(/MAP|SBP/);
  });

  it("PR-C-04: potassium in range, no routine steroids or antiarrhythmic prophylaxis — no number, no dose", () => {
    expectRow("PR-C-04", "C", "RCUK-PRC25", PRC25);
    const text = refValue(ref("PR-C-04"));
    expect(text).toBe(
      "Avoid hypo- and hyperkalaemia; no routine steroids; no routine antiarrhythmic prophylaxis",
    );
    expect(row("PR-C-04").showsNumber).toBe(false);
    expect(ref("PR-C-04").value).toBeUndefined();
    expect(/\d/.test(text)).toBe(false);
    expect(recorded("PR-C-04", "done")).toBe("done");
  });

  it("PR-C-07: without ST elevation angiography is conditional, cites RCUK-SC25, and does not route to the cath lab", () => {
    expectRow("PR-C-07", "C", "RCUK-SC25", SC25);
    const text = refValue(ref("PR-C-07"));
    expect(text).toContain("consider immediate angiography if unstable or ongoing ischaemia");
    expect(text).toContain("cath-lab evaluation can be delayed");
    expect(row("PR-C-07").showsNumber).toBe(false);
    expect(text).not.toContain("120");
    const stemi = (id: string) =>
      levelInputFromRecord([...ROSC, item(10, id, "done")], { ageYears: 50 }).stemi;
    expect(stemi("PR-C-07")).toBe(false);
    expect(stemi("PR-C-05")).toBe(true);
  });
});

describe("PR — disability, exposure and cause", () => {
  it("PR-D-03: levetiracetam or sodium valproate first-line, no seizure prophylaxis — named without any dose", () => {
    expectRow("PR-D-03", "D", "RCUK-PRC25", PRC25);
    const text = refValue(ref("PR-D-03"));
    expect(text).toContain("levetiracetam or sodium valproate first-line plus sedation");
    expect(text).toContain("EEG where available");
    expect(text).toContain("no seizure prophylaxis");
    expect(row("PR-D-03").showsNumber).toBe(false);
    expect(ref("PR-D-03").value).toBeUndefined();
    const pinD = refValue(postRoscPins("D")[0]!);
    expect(pinD).toContain("levetiracetam / valproate");
    for (const t of [text, pinD]) expect(t).not.toMatch(/\d|mg/);
  });

  it("PR-E-02: do not actively rewarm 32–36 °C shows through refValue and is pinned at E, adults only", () => {
    expectRow("PR-E-02", "E", "RCUK-PRC25", PRC25);
    expect(row("PR-E-02").showsNumber).toBe(true);
    expect(refValue(ref("PR-E-02"))).toBe("32–36 °C");
    expect(ref("PR-E-02").text).toBe(
      "Do not actively rewarm a comatose patient at 32–36 °C; no routine rapid large-volume cold IV fluids",
    );
    expect(refValue(postRoscPins("E")[0]!)).toContain("do not rewarm 32–36 °C");
    expect(ADULT_TARGETS.join(" ")).toContain("32–36 °C");
    expect(CHILD_TARGETS.join(" ")).not.toContain("32–36");
    expect(unsigned("PR-E-02")).toBe(PENDING_CSO);
  });

  it("PR-E-03: head-up 30° shows through refValue; no routine prophylactic antibiotics", () => {
    expectRow("PR-E-03", "E", "RCUK-PRC25", PRC25);
    expect(row("PR-E-03").showsNumber).toBe(true);
    expect(refValue(ref("PR-E-03"))).toBe("30°");
    expect(ref("PR-E-03").text).toBe(
      "Head-up 30°; no routine prophylactic antibiotics (low threshold if pneumonia suspected)",
    );
    expect(unsigned("PR-E-03")).toBe(PENDING_CSO);
    expect(recorded("PR-E-03", "not_indicated")).toBe("not_indicated");
  });

  it("PR-CAUSE-01: echo + dual-phase CT is the only cause item, recordable as not available, reset by a re-arrest", () => {
    expectRow("PR-CAUSE-01", "Cause", "RCUK-PRC25", PRC25);
    expect(POST_ROSC_BUNDLE.filter((i) => i.domain === "Cause").map((i) => i.id)).toEqual([
      "PR-CAUSE-01",
    ]);
    const text = refValue(ref("PR-CAUSE-01"));
    expect(text).toContain("Echo + dual-phase whole-body CT");
    expect(text).toContain("CT after a negative angiogram");
    expect(row("PR-CAUSE-01").showsNumber).toBe(false);
    expect(recorded("PR-CAUSE-01", "not_available")).toBe("not_available");
    const tl = [...ROSC, item(15, "PR-CAUSE-01", "not_available"), arrest(10, 2), rosc(5, 2)];
    expect(bundleState(tl)["PR-CAUSE-01"]).toBe("open");
  });
});
