import type { Citation, Feature, NcdCatalog, SiteProfile } from "@/lib/ncd/catalog/schema";
import { describe, expect, it } from "vitest";

import {
  buildBlocks,
  isVisible,
  sectionProgress,
  summarise,
  wellFold,
} from "@/app/doctor/encounters/[encounterId]/_components/ncd-capture";
import { DIABETES_CATALOG, REFERRAL_SITE } from "@/lib/ncd/catalog/diabetes";
import { displayPredicates, recorded, unavailable } from "@/lib/ncd/catalog/schema";
import { errorsOf, validateCatalog } from "@/lib/ncd/catalog/validate";
import { contextOf, evaluatePredicate } from "@/lib/ncd/engine/evaluate";

/**
 * The capture surface had NO test file, and that is precisely how its worst
 * defect shipped: the rows builder emitted a finding and then only its DIRECT
 * children, so a property of a property was dropped from the form entirely —
 * not mis-indented, absent — while the progress denominator went on counting it.
 * Nothing failed, because nothing looked.
 */

const cite: Citation = {
  standard: "ADA",
  version: "2026",
  title: "t",
  url: "https://example.org",
  csoSigned: true,
};

const site: SiteProfile = { id: "s", display: "s", standardPreference: [], available: [] };
const equipped: SiteProfile = {
  id: "e",
  display: "e",
  standardPreference: [],
  available: ["lab.x"],
};

const f = (over: Partial<Feature> & { code: string }): Feature => ({
  display: over.code,
  kind: "symptom",
  valueType: "boolean",
  section: "sx",
  ...over,
});

const chain = (): Feature[] => [
  f({ code: "a" }),
  f({ code: "b", parent: "a" }),
  f({ code: "c", parent: "b" }),
];

const shape = (fs: Feature[]) =>
  buildBlocks(fs).map((b) => ({
    finding: b.finding.code,
    props: b.properties.map((p) => `${p.feature.code}@${p.depth}`),
  }));

describe("buildBlocks — the rows a clinician actually sees", () => {
  it("emits a property of a property, which the flat builder dropped entirely", () => {
    expect(shape(chain())).toEqual([{ finding: "a", props: ["b@1", "c@2"] }]);
  });

  it("keeps a deeper chain visible, clamping only the depth it renders at", () => {
    const deep = [...chain(), f({ code: "d", parent: "c" })];
    const [block] = shape(deep);
    // Every question still appears. The clamp is a display decision — there are
    // two visual registers and no third — and the validator rejects the catalog
    // that gets here, so this is a backstop, not a licence.
    expect(block!.props).toEqual(["b@1", "c@2", "d@2"]);
  });

  it("is insensitive to declaration order", () => {
    const [x, y, z] = chain();
    expect(shape([z!, y!, x!])).toEqual([{ finding: "a", props: ["b@1", "c@2"] }]);
  });

  it("renders an orphan as a root rather than losing it", () => {
    // The parent is filtered out (another section, or not yet visible). The
    // question must still be askable rather than vanishing a second way.
    expect(shape([f({ code: "b", parent: "a" })])).toEqual([{ finding: "b", props: [] }]);
  });

  it("keeps siblings under one finding, not as peers of it", () => {
    const fs = [f({ code: "a" }), f({ code: "b", parent: "a" }), f({ code: "c", parent: "a" })];
    expect(shape(fs)).toEqual([{ finding: "a", props: ["b@1", "c@1"] }]);
  });
});

describe("isVisible — the gates, ANDed and ORed", () => {
  const ctxOf = (fs: Feature[], values: Parameters<typeof contextOf>[1]) =>
    contextOf(fs, values, site);

  it("conjoins showWhenAll with the parent gate", () => {
    const fs = [
      f({ code: "eye" }),
      f({ code: "side", valueType: "single_select" }),
      f({
        code: "which",
        parent: "eye",
        showWhenAll: [{ feature: "side", op: "==", value: "one" }],
      }),
    ];
    const which = fs[2]!;
    expect(isVisible(which, ctxOf(fs, { eye: recorded(true) }))).toBe(false);
    expect(isVisible(which, ctxOf(fs, { side: recorded("one") }))).toBe(false);
    expect(isVisible(which, ctxOf(fs, { eye: recorded(true), side: recorded("one") }))).toBe(true);
  });

  it("shows a showWhenAny feature when any one branch holds", () => {
    const fs = [
      f({ code: "ulcer" }),
      f({ code: "charcot" }),
      f({
        code: "foot_side",
        showWhenAny: [
          { feature: "ulcer", op: "present" },
          { feature: "charcot", op: "present" },
        ],
      }),
    ];
    const side = fs[2]!;
    expect(isVisible(side, ctxOf(fs, {}))).toBe(false);
    expect(isVisible(side, ctxOf(fs, { ulcer: recorded(false) }))).toBe(false);
    expect(isVisible(side, ctxOf(fs, { charcot: recorded(true) }))).toBe(true);
    expect(isVisible(side, ctxOf(fs, { ulcer: recorded(true) }))).toBe(true);
  });
});

/* ── progress: the two ways a green tick lied ────────────────────────────── */

const progressCatalog = (features: Feature[]): NcdCatalog => ({
  id: "p",
  display: "P",
  version: "0",
  capabilities: [{ code: "lab.x", display: "x", tier: "basic_lab" }],
  sections: [{ id: "sx", display: "Sx", order: 1 }],
  features,
  diagnosis: [],
  complications: [],
});

describe("sectionProgress", () => {
  const of = (c: NcdCatalog, s: SiteProfile, v: Parameters<typeof sectionProgress>[2]) =>
    sectionProgress(c, s, v)[0]!;

  /**
   * `answered` counted every visible feature while `total` subtracted the
   * site-blocked ones — two different populations in one fraction. At a site
   * without the equipment, a section could report answered 7 of 3 and show a
   * completed tick over questions nobody had touched.
   */
  it("counts the numerator and the denominator over the same population", () => {
    const c = progressCatalog([
      f({ code: "bedside" }),
      f({ code: "lab1", requires: "lab.x" }),
      f({ code: "lab2", requires: "lab.x" }),
    ]);
    const p = of(c, site, { lab1: recorded(true), lab2: recorded(true) });
    expect(p.total).toBe(1);
    expect(p.answered).toBeLessThanOrEqual(p.total);
    expect(p.answered).toBe(0);
    expect(p.unavailable).toBe(2);
  });

  it("treats an explicit 'could not do it today' as an answered question", () => {
    const c = progressCatalog([f({ code: "a" }), f({ code: "b" })]);
    expect(of(c, site, { a: recorded(true) }).answered).toBe(1);
    expect(of(c, site, { a: recorded(true), b: unavailable("site") }).answered).toBe(2);
  });

  it("does not count a question that is not yet askable", () => {
    const c = progressCatalog([f({ code: "a" }), f({ code: "b", parent: "a" })]);
    expect(of(c, site, {}).total).toBe(1);
    expect(of(c, site, { a: recorded(true) }).total).toBe(2);
  });

  /**
   * A free-text note is not a question. Counted in the denominator, no clerking
   * could ever reach 100% for a patient with nothing extra to say; counted in
   * the numerator, a note would mark the section done.
   */
  it("excludes off-protocol capture from both halves of the fraction", () => {
    const c = progressCatalog([
      f({ code: "a" }),
      f({ code: "other", valueType: "text_list", offProtocol: true }),
    ]);
    expect(of(c, site, {}).total).toBe(1);
    expect(of(c, site, { other: recorded(["itchy skin"]) }).answered).toBe(0);
    expect(of(c, equipped, { a: recorded(true), other: recorded(["itchy skin"]) })).toMatchObject({
      answered: 1,
      total: 1,
    });
  });
});

/* ── off-protocol: recorded, never reasoned over ─────────────────────────── */

describe("off-protocol capture is inert", () => {
  it("fails closed in the evaluator, in both directions", () => {
    const fs = [f({ code: "other", valueType: "text_list", offProtocol: true })];
    const ctx = contextOf(fs, { other: recorded(["chest tightness"]) }, site);
    for (const op of ["present", "absent"] as const) {
      expect(evaluatePredicate({ feature: "other", op }, ctx).state, op).toBe("insufficient");
    }
  });

  it("is rejected by the validator if any clinical rule names it", () => {
    const c = progressCatalog([f({ code: "other", valueType: "text_list", offProtocol: true })]);
    c.complications.push({
      code: "x",
      display: "X",
      timing: "chronic",
      citation: cite,
      screenedBy: ["other"],
      establishedBy: [
        { id: "e", label: "e", all: [{ feature: "other", op: "present" }], citation: cite },
      ],
    });
    expect(
      errorsOf(validateCatalog(c)).some((e) =>
        e.message.includes("off-protocol feature is referenced by a clinical rule"),
      ),
    ).toBe(true);
  });

  it("refuses the free-text list shape on anything that is not off-protocol", () => {
    const c = progressCatalog([f({ code: "other", valueType: "text_list" })]);
    expect(
      errorsOf(validateCatalog(c)).some((e) => e.message.includes("text_list is only valid")),
    ).toBe(true);
  });
});

describe("validateCatalog — property depth", () => {
  it("accepts a chain two deep and rejects one three deep", () => {
    expect(errorsOf(validateCatalog(progressCatalog(chain())))).toEqual([]);
    const tooDeep = progressCatalog([...chain(), f({ code: "d", parent: "c" })]);
    expect(errorsOf(validateCatalog(tooDeep)).some((e) => e.message.includes("deep"))).toBe(true);
  });
});

/* ── against the real catalog ────────────────────────────────────────────── */

describe("the diabetes catalog's laterality follow-ups", () => {
  const blocksFor = (values: Parameters<typeof contextOf>[1], section: string) => {
    const ctx = contextOf(DIABETES_CATALOG.features, values, REFERRAL_SITE);
    return buildBlocks(
      DIABETES_CATALOG.features.filter(
        (x) => x.section === section && !x.offProtocol && isVisible(x, ctx),
      ),
    );
  };
  const propsOf = (values: Parameters<typeof contextOf>[1], section: string, finding: string) =>
    blocksFor(values, section)
      .find((b) => b.finding.code === finding)!
      .properties.map((p) => `${p.feature.code}@${p.depth}`);

  it("asks which eye only once the answer is one eye", () => {
    const base = { visual_symptoms: recorded(true) };
    expect(propsOf(base, "symptoms", "visual_symptoms")).not.toContain("visual_eye@2");
    expect(
      propsOf({ ...base, visual_laterality: recorded("both_eyes") }, "symptoms", "visual_symptoms"),
    ).not.toContain("visual_eye@2");
    expect(
      propsOf({ ...base, visual_laterality: recorded("one_eye") }, "symptoms", "visual_symptoms"),
    ).toContain("visual_eye@2");
  });

  it("asks which limb only once the distribution is one limb", () => {
    // The foot band opens behind its screening question, so that comes first.
    const base = {
      foot_symptom_screen: recorded(true),
      peripheral_neuropathic_symptoms: recorded(true),
    };
    const at = (d?: string) =>
      propsOf(
        d ? { ...base, neuropathy_distribution: recorded(d) } : base,
        "symptoms",
        "peripheral_neuropathic_symptoms",
      );
    expect(at()).not.toContain("neuropathy_limb@2");
    expect(at("feet_only")).not.toContain("neuropathy_limb@2");
    expect(at("one_limb")).toContain("neuropathy_limb@2");
  });

  it("asks which foot only once the wound is on a foot", () => {
    const base = { slow_healing_wound: recorded(true) };
    const at = (site?: string) =>
      propsOf(
        site ? { ...base, slow_healing_wound_site: recorded(site) } : base,
        "symptoms",
        "slow_healing_wound",
      );
    expect(at()).not.toContain("slow_healing_wound_foot_side@2");
    expect(at("hand_or_arm")).not.toContain("slow_healing_wound_foot_side@2");
    expect(at("foot_or_toes")).toContain("slow_healing_wound_foot_side@2");
  });

  /**
   * A side per LESION, not one for the patient. An ulcer on the left with a
   * Charcot foot on the right is an ordinary presentation, and the single shared
   * "which foot" this replaced could not express it.
   */
  it("gives each foot lesion its own side, inside that finding's own well", () => {
    const propsFor = (code: string) => {
      const values = { foot_symptom_screen: recorded(true), [code]: recorded(true) };
      const ctx = contextOf(DIABETES_CATALOG.features, values, REFERRAL_SITE);
      return buildBlocks(
        DIABETES_CATALOG.features.filter(
          (x) => x.section === "symptoms" && !x.offProtocol && isVisible(x, ctx),
        ),
      )
        .find((b) => b.finding.code === code)!
        .properties.map((p) => p.feature.code);
    };
    for (const [finding, side] of [
      ["foot_ulcer_or_inflammation", "foot_ulcer_side"],
      ["foot_infection_or_gangrene", "foot_infection_side"],
      ["charcot_presentation", "charcot_side"],
    ] as const) {
      expect(propsFor(finding), finding).toContain(side);
    }
    // The shared field is gone, not merely hidden.
    expect(DIABETES_CATALOG.features.map((f) => f.code)).not.toContain("foot_side");
  });

  /**
   * Every foot finding asks how long, because every foot decision is a tempo
   * decision — an ulcer open four weeks has spent the window IWGDF gives it, a
   * spreading infection is measured in days, and neuropathy that arrived over
   * weeks is atypical where the same symptoms over years are not.
   */
  it("asks the duration of every foot finding except the screen itself", () => {
    const findings = DIABETES_CATALOG.features.filter(
      (f) => f.group === "feet_and_legs" && !f.parent && f.code !== "foot_symptom_screen",
    );
    expect(findings.length).toBeGreaterThan(5);
    for (const f of findings) {
      const durations = DIABETES_CATALOG.features.filter(
        (x) => x.parent === f.code && x.valueType === "duration",
      );
      expect(durations, f.code).toHaveLength(1);
      // A default unit that matches the tempo, so nobody types 0.5 weeks.
      expect(durations[0]!.unit, f.code).toBeTruthy();
    }
  });
});

/* ── folding a well away, without hiding anything ────────────────────────── */

describe("wellFold — a finding's properties may be folded once they are settled", () => {
  const rows = (fs: Feature[]) => fs.map((feature) => ({ feature, depth: 1 }));
  const props = rows([f({ code: "p1" }), f({ code: "p2" })]);

  it("refuses to fold while any question is unanswered", () => {
    expect(wellFold(props, {})).toMatchObject({ settled: 0, foldable: false });
    expect(wellFold(props, { p1: recorded(true) })).toMatchObject({ settled: 1, foldable: false });
  });

  it("folds once every question is settled", () => {
    expect(wellFold(props, { p1: recorded(true), p2: recorded(false) }).foldable).toBe(true);
  });

  it("counts an explicit 'could not do it today' as settled", () => {
    expect(wellFold(props, { p1: recorded(true), p2: unavailable("site") }).foldable).toBe(true);
  });

  /**
   * The property that makes folding safe, and the reason it needs no effect and
   * nothing to synchronise: a question conjured by an answer arrives unsettled,
   * so the well that was foldable a moment ago is not any more.
   */
  it("becomes unfoldable again when an answer opens a further question", () => {
    const ctxFor = (values: Parameters<typeof contextOf>[1]) =>
      contextOf(DIABETES_CATALOG.features, values, REFERRAL_SITE);
    const visible = (values: Parameters<typeof contextOf>[1]) =>
      buildBlocks(
        DIABETES_CATALOG.features.filter(
          (x) => x.section === "symptoms" && !x.offProtocol && isVisible(x, ctxFor(values)),
        ),
      ).find((b) => b.finding.code === "visual_symptoms")!.properties;

    // Every visible property answered — the well folds.
    const answered = {
      visual_symptoms: recorded(true),
      visual_pattern: recorded(["fluctuating"]),
      visual_laterality: recorded("both_eyes"),
      last_retinal_exam: recorded("never"),
    };
    expect(wellFold(visible(answered), answered).foldable).toBe(true);

    // Change the side to one eye: "Which eye" appears, unanswered.
    const opened = { ...answered, visual_laterality: recorded("one_eye") };
    const after = visible(opened);
    expect(after.map((p) => p.feature.code)).toContain("visual_eye");
    expect(wellFold(after, opened).foldable).toBe(false);
  });
});

describe("summarise — a folded answer is compressed, never concealed", () => {
  it("states each value type in the fewest words that stay true", () => {
    const sel = f({
      code: "s",
      valueType: "single_select",
      options: [
        { value: "a", display: "Alpha" },
        { value: "b", display: "Beta" },
      ],
    });
    expect(summarise(f({ code: "b" }), recorded(true))).toBe("Yes");
    expect(summarise(f({ code: "b" }), recorded(false))).toBe("No");
    expect(summarise(sel, recorded("a"))).toBe("Alpha");
    expect(summarise(sel, recorded({ option: "b", detail: "note" }))).toBe("Beta");
    expect(summarise(f({ code: "n", valueType: "number", unit: "kg" }), recorded(4))).toBe("4 kg");
    expect(
      summarise(f({ code: "d", valueType: "duration" }), recorded({ value: 6, unit: "weeks" })),
    ).toBe("6 weeks");
  });

  // A trailing "…" would make folding a way to lose an answer. The count keeps
  // the summary honest about how much it is not showing.
  it("names the first two of a long selection and counts the rest", () => {
    const multi = f({
      code: "m",
      valueType: "multi_select",
      options: [
        { value: "a", display: "Alpha" },
        { value: "b", display: "Beta" },
        { value: "c", display: "Gamma" },
        { value: "d", display: "Delta" },
      ],
    });
    expect(summarise(multi, recorded(["a", "b"]))).toBe("Alpha, Beta");
    expect(summarise(multi, recorded(["a", "b", "c", "d"]))).toBe("Alpha, Beta +2");
  });

  it("says so when the answer was that it could not be obtained", () => {
    expect(summarise(f({ code: "x" }), unavailable("lab.x"))).toBe("not obtainable");
    expect(summarise(f({ code: "x" }), undefined)).toBe("—");
  });
});

/* ── the systems screen: how the complication symptoms fit in one tab ────── */

describe("screening questions keep every symptom in one section", () => {
  const roots = (values: Parameters<typeof contextOf>[1]) => {
    const ctx = contextOf(DIABETES_CATALOG.features, values, REFERRAL_SITE);
    return buildBlocks(
      DIABETES_CATALOG.features.filter(
        (x) => x.section === "symptoms" && !x.offProtocol && isVisible(x, ctx),
      ),
    ).map((b) => b.finding.code);
  };

  it("puts the complication symptoms in the symptoms section, not a second one", () => {
    expect(DIABETES_CATALOG.sections.map((s) => s.id)).not.toContain("complication_symptoms");
    for (const code of ["visual_symptoms", "chest_pain", "foot_ulcer_or_inflammation"]) {
      expect(DIABETES_CATALOG.features.find((f) => f.code === code)!.section, code).toBe(
        "symptoms",
      );
    }
  });

  it("holds nine foot questions behind one, until there is something to ask about", () => {
    const closed = roots({});
    expect(closed).toContain("foot_symptom_screen");
    expect(closed).not.toContain("foot_ulcer_or_inflammation");

    // An explicit NO is a recorded clinical answer, and it keeps the band shut.
    expect(roots({ foot_symptom_screen: recorded(false) })).not.toContain(
      "foot_ulcer_or_inflammation",
    );

    const open = roots({ foot_symptom_screen: recorded(true) });
    for (const code of [
      "peripheral_neuropathic_symptoms",
      "foot_ulcer_or_inflammation",
      "foot_infection_or_gangrene",
      "charcot_presentation",
      "leg_ischaemic_symptoms",
    ]) {
      expect(open, code).toContain(code);
    }
    expect(open.length - closed.length).toBe(8);
  });

  /**
   * The trap this design has to survive: neuropathy makes an ulcer painless, so
   * a patient can honestly report no foot trouble while having one. That is
   * exactly why IWGDF requires the foot to be EXAMINED regardless of symptoms —
   * so the examination section must not be gated on anything.
   */
  it("never gates the foot examination on what the patient reports", () => {
    const exam = DIABETES_CATALOG.features.filter((f) => f.section === "foot");
    expect(exam.length).toBeGreaterThan(0);
    for (const f of exam) {
      expect(f.showWhen?.feature, f.code).not.toBe("foot_symptom_screen");
      expect(
        displayPredicates(f).map((p) => p.feature),
        f.code,
      ).not.toContain("foot_symptom_screen");
    }
  });

  /**
   * Impaired hypoglycaemia awareness is deliberately NOT behind a "any lows?"
   * screen. Losing the warning symptoms is WHY a patient reports no lows, so
   * gating it there would hide the question precisely when it matters most.
   */
  it("leaves the lows band open, because unawareness explains a negative answer", () => {
    for (const code of [
      "hypoglycaemia_episode",
      "hypoglycaemia_requiring_assistance",
      "impaired_hypo_awareness",
    ]) {
      expect(roots({}), code).toContain(code);
    }
  });

  it("keeps the emergency band always visible", () => {
    const open = roots({});
    for (const code of ["vomiting", "altered_mental_state", "deep_rapid_breathing"]) {
      expect(open, code).toContain(code);
    }
  });
});

describe("abdominal pain takes a full SOCRATES history", () => {
  const propsOf = (values: Parameters<typeof contextOf>[1]) => {
    const ctx = contextOf(DIABETES_CATALOG.features, values, REFERRAL_SITE);
    return buildBlocks(
      DIABETES_CATALOG.features.filter(
        (x) => x.section === "symptoms" && !x.offProtocol && isVisible(x, ctx),
      ),
    ).find((b) => b.finding.code === "abdominal_pain")!.properties;
  };

  /**
   * The consensus warns this pain may belong to the ketoacidosis OR to whatever
   * precipitated it, and only the history separates them — which is why this one
   * symptom earns a full pain history where the others take one or two
   * properties.
   */
  it("asks all eight letters, and nothing until the pain is present", () => {
    expect(propsOf({})).toHaveLength(0);
    expect(propsOf({ abdominal_pain: recorded(true) }).map((p) => p.feature.code)).toEqual([
      "abdominal_pain_site",
      "abdominal_pain_onset",
      "abdominal_pain_character",
      "abdominal_pain_radiation",
      "abdominal_pain_associations",
      "abdominal_pain_duration",
      "abdominal_pain_time_course",
      "abdominal_pain_modifiers",
      "abdominal_pain_severity",
    ]);
  });

  /**
   * Associations deliberately omits vomiting, dehydration and altered
   * consciousness. Each is already its own finding in the same band, and asking
   * again under a second heading is how one history ends up split across two
   * answers that can disagree.
   */
  it("does not re-ask what the crisis band already captures", () => {
    const assoc = DIABETES_CATALOG.features.find((f) => f.code === "abdominal_pain_associations")!;
    const offered = (assoc.options ?? []).map((o) => o.value).join(" ");
    for (const dup of ["vomit", "dehydration", "conscious", "breathing"]) {
      expect(offered, dup).not.toContain(dup);
    }
  });

  // Nine unanswered questions must not be foldable away.
  it("cannot be folded until the history is taken", () => {
    const values = { abdominal_pain: recorded(true) };
    expect(wellFold(propsOf(values), values)).toMatchObject({ settled: 0, foldable: false });
  });
});
