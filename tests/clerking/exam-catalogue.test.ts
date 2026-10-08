import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import signoff from "@/data/clerking/exam-signoff.v1.json";
import * as A from "@/lib/clerking/exam/answers";
import { parseExamCatalogue } from "@/lib/clerking/exam/catalogue";
import { bmiClass, classifyAll } from "@/lib/clerking/exam/classifiers";
import { composeExam, examText } from "@/lib/clerking/exam/compose";
import { applyGateAEdits } from "../../scripts/clerking/exam-gate-a-edits";
import { ALL_SIGNED, ecat, scenario, toCtx } from "./exam-fixtures";

/** The examination catalogue as data (PROMPT-CLERKING-EXAM-V2 §6, §7 catalogue.ts). */

const runtime = readFileSync("data/clerking/clerking-exam-catalogue.v1.json");
const handoff = JSON.parse(
  readFileSync("docs/emr/clerking-v2/exam/clerking-exam-catalogue.v1.json", "utf8"),
);

describe("the examination catalogue", () => {
  // The handed-over catalogue plus the GATE A edits, and the diabetes pack's merge: that it only
  // added is tested in ncd-dm-pack.test.ts.
  it("is pinned by hash, at 1.1.2-draft", () => {
    expect(createHash("sha256").update(runtime).digest("hex")).toBe(signoff.catalogueSha256);
    expect(ecat.version).toBe("1.1.2-draft");
    expect(signoff.catalogueVersion).toBe(ecat.version);
  });

  it("has the §6 contents (after GATE A)", () => {
    const answerable = ecat.items.filter((i) => i.response.type !== "link");
    expect(ecat.systems).toHaveLength(10);
    expect(ecat.systems.reduce((n, s) => n + s.parts.length, 0)).toBe(41);
    // + the diabetes pack (Phase 5): 2 items, 3 classifiers, 6 flags, 6 suggestions; Core 12: 1 item.
    expect(answerable).toHaveLength(143);
    expect(ecat.items.length - answerable.length).toBe(9);
    expect(Object.keys(ecat.data.scales)).toHaveLength(17);
    expect(Object.keys(ecat.data.classifiers)).toHaveLength(27);
    expect(ecat.data.flag_rules).toHaveLength(93); // 84 + SC1 split + SC2's two caution rules + 6
    expect(ecat.data.suggestion_rules.rules).toHaveLength(53);
    expect(ecat.data.shared_facts).toHaveLength(13);
    expect(ecat.data.not_examined.reasons).toHaveLength(8);
    expect(ecat.mirrors).toHaveLength(22); // 10 handed over + 12 from TM1
  });

  it("rejects a malformed catalogue: an unknown mirror owner, a bad shown_when, an unplaced item", () => {
    const bad = (f: (c: typeof handoff) => void) => {
      const c = structuredClone(handoff);
      f(c);
      return () => parseExamCatalogue(c);
    };
    expect(
      bad(
        (c) =>
          (c.items["ex.general.hiv_associated_signs"].attributes[0].options[0].mirror_of.option =
            "nope"),
      ),
    ).toThrow(/mirror/);
    expect(
      bad((c) => (c.items["ex.general.nutrition"].attributes[3].shown_when.any_of = ["nope"])),
    ).toThrow(/shown_when/);
    expect(
      bad((c) => (c.systems[0].parts[0].items = c.systems[0].parts[0].items.slice(1))),
    ).toThrow(/in no part/);
    expect(bad((c) => (c.items["ex.general.pallor"].response.type = "maybe"))).toThrow();
  });

  it("adding an item of each response type and a classifier band needs no code", () => {
    const c = structuredClone(applyGateAEdits(handoff));
    const pair = { negative_label: "No", positive_label: "Yes" };
    const add = (id: string, response: object, extra: object = {}) => {
      c.items[id] = {
        id,
        label: `Test ${id}`,
        response,
        phrase: { negative: `no ${id}`, positive: `${id} seen` },
        sensitivity: "standard",
        applies_to_sex: null,
        ...extra,
      };
      c.systems[0].parts[0].items.push(id);
    };
    const one = {
      id: "size",
      label: "Size",
      kind: "one",
      options: [
        { id: "small", label: "Small" },
        { id: "large", label: "Large" },
      ],
    };
    add("ex.general.test_presence", { type: "presence", ...pair }, { attributes: [one] });
    add("ex.general.test_test", { type: "test", ...pair });
    add("ex.general.test_state", { type: "state", ...pair });
    add("ex.general.test_device", {
      type: "device",
      negative_label: "None",
      positive_label: "In place",
    });
    add("ex.general.test_choice", {
      type: "choice",
      options: [
        { id: "fine", label: "Fine", expected: true },
        { id: "odd", label: "Odd", expected: false },
      ],
    });
    add("ex.general.test_link", { type: "link", owner: "ex.general.pallor" });
    c.reference_entries["REF-EX-BMI-BANDS"].value.splice(-1, 0, [45, "obese_3"]);
    const cat = parseExamCatalogue(c);
    let d = A.setAttr(cat, scenario().exam, "ex.general.test_presence", "size", "large");
    d = A.setState(cat, d, "ex.general.test_test", "positive");
    d = A.setChoice(cat, d, "ex.general.test_choice", "odd");
    d = A.setState(cat, d, "ex.general.test_device", "positive");
    const s = scenario({ exam: d });
    const x = { ...toCtx(s), cat };
    const text = examText(
      composeExam({ x, results: new Map(), saved: null, audience: "clinician" }),
    ).toLowerCase();
    expect(text).toContain("ex.general.test_presence seen, large");
    expect(text).toContain("ex.general.test_test seen");
    expect(text).toContain("odd");
    expect(text).toContain("test ex.general.test_device");
    expect(A.everythingElseNormal(cat, d, "general", { sex: "male" }).set).toContain(
      "ex.general.test_state",
    );
    const b = scenario();
    b.vitals.weight = 44;
    b.vitals.height = 100;
    expect(bmiClass({ ...toCtx(b), cat }).result).toBe("obese_3");
  });

  it("every answerable item writes something when positive (142 of 142 compose by type)", () => {
    for (const it of ecat.items) {
      if (it.response.type === "link") continue;
      const s = scenario({
        patient: { ageYears: 40, sex: it.applies_to_sex ?? "male", pregnant: null },
      });
      if (it.response.type === "choice")
        s.exam = A.setChoice(ecat, s.exam, it.id, it.response.options.find((o) => !o.expected)!.id);
      else if (it.response.type === "classified")
        s.exam = A.setAttr(ecat, s.exam, it.id, "signs_present", "sunken_eyes");
      else if (it.response.type === "measured" && ecat.attribute(it.id, "signs"))
        s.exam = A.setAttr(ecat, s.exam, it.id, "signs", "muscle_wasting");
      else if (it.response.type === "measured") {
        const a = it.attributes![0]!;
        s.exam = A.setAttr(ecat, s.exam, it.id, a.id, a.options![0]!.id);
      } else s.exam = A.setState(ecat, s.exam, it.id, "positive");
      const x = toCtx(s);
      const results = classifyAll(x, { ...ALL_SIGNED, withheld: [] });
      const text = examText(composeExam({ x, results, saved: null, audience: "clinician" }));
      expect(text.length, it.id).toBeGreaterThan(0);
    }
  });
});
