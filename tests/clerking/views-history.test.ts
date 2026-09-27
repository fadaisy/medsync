import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import type { El } from "./press";
import type { History } from "@/lib/clerking/answers";
import type { PatientSex } from "@/lib/clerking/catalogue";
import type { ReactNode } from "react";
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { v2CommittedWords } from "@/components/clerking/model";
import { emptyHistory } from "@/lib/clerking/answers";
import { rosSystemsFor } from "@/lib/clerking/catalogue";
import { cat, header, patientThree3, v2Payload } from "./fixtures";
import { isButton, text, walk, words } from "./press";

/**
 * Clerking desk v2, Phases 5–6 (PROMPT-CLERKING-DESK-V2 §5.5–5.8): the review of systems and its
 * Details pop-up, past, family and social history. Hook-free views are pressed through their own
 * handlers (walk); the rest is read as static markup. Patient Three-3 (male, 76) by default.
 */

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh() {}, push() {} }) }));
const { SystemsView, RosDetails, rosSummary } = await import("@/components/clerking/systems-body");
const { PastHistoryBody, allergyStatus, medicineSummary, highRisk } =
  await import("@/components/clerking/past-history-body");
const { FamilyBody, SocialBody } = await import("@/components/clerking/family-social");

const PATIENT = { name: "Patient Three-3", mrn: "MS-2026-00004" };

/** The tone of the StatusWord that holds these words, or null when they are not in one. */
function toneOf(m: string, w: string): string | null {
  const at = m.indexOf(w);
  if (at < 0) return null;
  const open = m.lastIndexOf("<span", at);
  const tone = /data-tone="([a-z]+)"/.exec(m.slice(open, at));
  return tone?.[1] ?? null;
}

/** A little store: the view's onHistory updates it and counts the taps. */
function store(start: History) {
  const s = { h: start, taps: 0 };
  const onHistory = (fn: (x: History) => History) => {
    s.taps += 1;
    s.h = fn(s.h);
  };
  return { s, onHistory };
}

const base = (history: History, onHistory: (fn: (x: History) => History) => void) => ({
  cat,
  header,
  history,
  onHeader: () => {},
  onHistory,
  editable: true,
  cautionFrom: 7,
  patient: PATIENT,
});

function systems(
  history: History,
  opts: { sex?: PatientSex; open?: string | null; onOpenComplaint?: (k: string) => void } = {},
) {
  const st = store(history);
  const details: string[] = [];
  const render = () =>
    walk(
      h(SystemsView, {
        ...base(st.s.h, st.onHistory),
        sex: opts.sex === undefined ? "male" : opts.sex,
        open: opts.open ?? null,
        onOpen: () => {},
        onDetails: (id: string) => details.push(id),
        onOpenComplaint: opts.onOpenComplaint,
      }),
    );
  return { st: st.s, render, details };
}

const press = (b: El | undefined) => {
  expect(b, "button not found").toBeDefined();
  (b!.props.onClick as () => void)();
};
const byText = (els: El[], t: string) =>
  els.filter((e) => isButton(e) && words(e as unknown as ReactNode).trim() === t);
const inGroup = (els: El[], label: string) => {
  const g = els.find((e) => e.props.role === "group" && e.props["aria-label"] === label);
  expect(g, `group ${label}`).toBeDefined();
  return walk(g!.props.children as ReactNode);
};

/* ─── [03] Review of systems ────────────────────────────────────── */

describe("review of systems (§5.5)", () => {
  it("shows only sex-appropriate systems: no gynaecology for a man, breast lump under Skin", () => {
    const male = rosSystemsFor(cat, "male");
    expect(male.map((s) => s.id)).not.toContain("gyn");
    expect(male.find((s) => s.id === "skin")!.items.map((i) => i.id)).toContain("sym.breast_lump");
    const female = rosSystemsFor(cat, "female");
    expect(female.map((s) => s.id)).toContain("gyn");
    expect(female.find((s) => s.id === "skin")!.items.map((i) => i.id)).not.toContain(
      "sym.breast_lump",
    );
    const m = text(
      renderToStaticMarkup(
        h(SystemsView, {
          ...base(patientThree3(), () => {}),
          sex: "male",
          open: null,
          onOpen() {},
          onDetails() {},
        }),
      ),
    );
    expect(m).not.toContain("Gynaecological");
    const f = text(
      renderToStaticMarkup(
        h(SystemsView, {
          ...base(patientThree3(), () => {}),
          sex: "female",
          open: null,
          onOpen() {},
          onDetails() {},
        }),
      ),
    );
    expect(f).toContain("Gynaecological");
  });

  it("each row: name, status in words, positives joined by ·, and Nothing else only while something is unasked", () => {
    const { render } = systems(patientThree3());
    const els = render();
    const row = (id: string) => {
      const li = els.find((e) => e.props["data-system"] === id)!;
      return words(li as unknown as ReactNode);
    };
    // General: weight loss (linked from the complaint) and loss of appetite.
    expect(row("gen")).toMatch(/General2 positiveWeight loss · Loss of appetite/);
    expect(row("gen")).toContain("Nothing else");
    // Cardiovascular: every item answered no except claudication and PND (unasked): partly.
    expect(row("cvs")).toContain("Partly reviewed");
    expect(row("haem")).toContain("Not reviewed");
    const done = patientThree3();
    for (const s of rosSystemsFor(cat, "male").find((x) => x.id === "rs")!.items)
      done.ros[s.id] = "no";
    const rs = systems(done)
      .render()
      .find((e) => e.props["data-system"] === "rs")!;
    expect(words(rs as unknown as ReactNode)).toContain("Nothing to report");
    expect(words(rs as unknown as ReactNode)).not.toContain("Nothing else");
    const t = text(
      renderToStaticMarkup(
        h(SystemsView, {
          ...base(patientThree3(), () => {}),
          sex: "male",
          open: null,
          onOpen() {},
          onDetails() {},
        }),
      ),
    );
    expect(t).toMatch(/\d+ positive · \d+ with nothing to report · \d+ not reviewed/);
    expect(t).toContain("Linked answers follow the complaint");
  });

  it("linked items are read-only, say where they come from, and open the complaint", () => {
    const opened: string[] = [];
    const { st, render } = systems(patientThree3(), {
      open: "gu",
      onOpenComplaint: (k) => opened.push(k),
    });
    const els = render();
    const linked = els.find((e) => e.props["data-linked"] === "sym.polyuria");
    expect(linked).toBeDefined();
    expect(words(linked as unknown as ReactNode)).toContain("Yes, in complaint");
    // No yes/no control for it: it cannot be answered here.
    expect(
      els.some(
        (e) => e.props.role === "group" && e.props["aria-label"] === "Passing a lot of urine",
      ),
    ).toBe(false);
    press(walk(linked!.props.children as ReactNode).find(isButton));
    expect(opened).toEqual(["pp"]);
    expect(st.taps).toBe(0);
  });

  it("Nothing else answers only the unasked, non-linked items, as no (Law 4)", () => {
    const { st, render } = systems(patientThree3());
    press(render().find((e) => e.props["aria-label"] === "Nothing else in Genitourinary"));
    expect(st.h.ros["sym.polyuria"]).toBeUndefined(); // linked from the complaint
    expect(st.h.ros["sym.dysuria"]).toBe("no");
    expect(st.h.ros["sym.frequency"]).toBe("no");
    expect(st.h.ros["sym.scrotal"]).toBe("no");
  });

  it("a yes offers Details (Add details before anything is recorded); answering yes never opens it", () => {
    const { st, render, details } = systems(patientThree3(), { open: "gen" });
    const els = render();
    expect(byText(els, "Add details")).toHaveLength(1); // loss of appetite: yes, nothing recorded
    const msk = systems(patientThree3(), { open: "msk" }).render();
    expect(byText(msk, "Details")).toHaveLength(1); // bone pain: recorded
    expect(msk.find((e) => e.props["data-details"] !== undefined)!.props["aria-label"]).toBe(
      "Details: Bone pain",
    );
    // Its one-line summary sits under the row, duration first.
    expect(msk.some((e) => words(e as unknown as ReactNode).startsWith("2 months · ribs"))).toBe(
      true,
    );
    // Answering yes to fatigue records it; no pop-up.
    press(inGroup(els, "Tiredness").find((e) => e.props["data-answer"] === "yes"));
    expect(st.h.ros["sym.fatigue"]).toBe("yes");
    expect(details).toEqual([]);
    // Only the Details button opens it.
    press(byText(els, "Add details")[0]);
    expect(details).toEqual(["sym.loss_of_appetite"]);
  });

  it("restricted items carry the lock", () => {
    const els = systems(patientThree3(), { open: "mood" }).render();
    const row = (label: string) =>
      els.find(
        (e) =>
          e.props["data-yesno"] !== undefined && words(e as unknown as ReactNode).startsWith(label),
      );
    expect(words(row("Thoughts of self-harm") as unknown as ReactNode)).toContain("Restricted");
    expect(words(row("Poor sleep") as unknown as ReactNode)).not.toContain("Restricted");
  });

  it("budget: a full negative review for a man with no complaints is one Nothing else per system (≤ 13 taps)", () => {
    const { st, render } = systems(emptyHistory());
    const buttons = render().filter((e) =>
      String(e.props["aria-label"] ?? "").startsWith("Nothing else in "),
    );
    for (const b of buttons) press(b);
    const shown = rosSystemsFor(cat, "male").length;
    expect(buttons).toHaveLength(shown);
    expect(st.taps).toBe(shown);
    expect(st.taps).toBeLessThanOrEqual(13);
    const t = text(
      renderToStaticMarkup(
        h(SystemsView, {
          ...base(st.h, () => {}),
          sex: "male",
          open: null,
          onOpen() {},
          onDetails() {},
        }),
      ),
    );
    expect(t).toContain(`0 positive · ${shown} with nothing to report · 0 not reviewed`);
    expect(t).not.toContain("Nothing else");
  });
});

describe("the Details pop-up (§5.5, D-CV-07, ADR 0161)", () => {
  const dialog = (
    history: History,
    onHistory = (_: (x: History) => History) => {},
    onClose = () => {},
  ) =>
    RosDetails({
      ...base(history, onHistory),
      open: { symptom: "sym.bone_pain", system: "msk" },
      onClose,
    }) as El;

  it("named by the symptom, with the system above it and two identifiers and the summary in its description", () => {
    const d = dialog(patientThree3());
    expect(d.props.open).toBe(true);
    expect(d.props.title).toBe("Bone pain");
    expect(d.props.kicker).toBe("Review of systems · Bones and joints");
    expect(d.props.width).toBeUndefined(); // EmrDialog's "medium", centred (ADR 0161)
    const desc = words(d.props.description as ReactNode);
    expect(desc).toContain("Patient Three-3");
    expect(desc).toContain("MS-2026-00004");
    expect(desc).toContain("2 months · ribs");
    // The property editor inside, duration first.
    const body = walk(d.props.children as ReactNode);
    expect(body.find((e) => e.props["aria-label"] === "For")).toBeDefined();
  });

  it("Change the answer to no sets no, drops the details and closes; Done closes", () => {
    const st = store(patientThree3());
    let closed = 0;
    const d = dialog(st.s.h, st.onHistory, () => (closed += 1));
    const footer = walk(d.props.footer as ReactNode);
    press(
      footer.find((e) => words(e as unknown as ReactNode).trim() === "Change the answer to no"),
    );
    expect(st.s.h.ros["sym.bone_pain"]).toBe("no");
    expect(st.s.h.rosDetail["sym.bone_pain"]).toBeUndefined();
    expect(closed).toBe(1);
    press(footer.find((e) => words(e as unknown as ReactNode).trim() === "Done"));
    expect(closed).toBe(2);
  });

  it("closed when nothing is open", () => {
    const d = RosDetails({ ...base(patientThree3(), () => {}), open: null, onClose() {} }) as El;
    expect(d.props.open).toBe(false);
  });

  it("the summary line counts systems, not items", () => {
    expect(
      rosSummary([
        { id: "a", yes: ["x", "y"], no: 1, open: 0, text: "", tone: "done" },
        { id: "b", yes: [], no: 3, open: 0, text: "", tone: "done" },
        { id: "c", yes: [], no: 0, open: 4, text: "", tone: "open" },
        { id: "d", yes: [], no: 1, open: 2, text: "", tone: "partial" },
      ]),
    ).toBe("2 positive · 1 with nothing to report · 1 not reviewed");
  });
});

/* ─── [04] Past medical history ─────────────────────────────────── */

describe("past medical history (§5.6)", () => {
  const p = v2Payload();
  const k = p.clerking!;
  const pmh = (history = patientThree3(), record = k, act = true) =>
    renderToStaticMarkup(
      h(PastHistoryBody, {
        ...base(history, () => {}),
        record,
        problems: [],
        act,
        busy: null,
        on: {},
        loadTerms: async () => [],
      }),
    );

  it("a yes reveals known-for chips and a problem-list proposal, never an entry (D-CV-09)", () => {
    const m = pmh();
    const t = text(m);
    expect(t).toContain("Hypertension: known for");
    expect(m).toMatch(/aria-pressed="true"[^>]*>.*?Over 5 years/);
    expect(t).toContain("Confirm on the problem list");
    expect(t).toContain("A yes adds the condition to the problem list for you to confirm.");
    const h2 = patientThree3();
    h2.past.conditions.hypertension!.onProblemList = true;
    expect(text(pmh(h2))).toContain("On the problem list");
    expect(text(pmh(h2))).not.toContain("Confirm on the problem list");
  });

  it("locks the restricted conditions and medicine picks", () => {
    const m = pmh();
    const locked = (label: string) =>
      new RegExp(`${label}<span title="Restricted"`).test(m.replace(/<!-- -->/g, ""));
    expect(locked("Tuberculosis")).toBe(true);
    expect(locked("HIV")).toBe(true);
    expect(locked("Mental illness")).toBe(true);
    expect(locked("Hypertension")).toBe(false);
    expect(m).toMatch(/Antiretrovirals<span title="Restricted"/);
    expect(m).toMatch(/TB treatment<span title="Restricted"/);
    expect(m).not.toMatch(/Amlodipine<span title="Restricted"/);
  });

  it("a medicine card reads in the catalogue's words; none lets the clinician say so", () => {
    expect(medicineSummary(cat, k.medicines[0]!)).toBe(
      "5 mg · once daily · sometimes misses · from medicine card or book",
    );
    expect(
      medicineSummary(cat, {
        ...k.medicines[0]!,
        doseText: null,
        frequencyCode: null,
        adherence: null,
        informant: null,
      }),
    ).toBe("dose not known · frequency not known · adherence not asked");
    expect(text(pmh())).toContain("1 medicine");
    expect(text(pmh())).not.toContain("Takes none, including herbal");
    const none = text(pmh(patientThree3(), { ...k, medicines: [] }));
    expect(none).toContain("Takes none, including herbal");
    expect(none).toContain("0 medicines");
  });

  it("the allergy status line, amber until confirmed today; Uncoded and High risk pills in words", () => {
    expect(allergyStatus(k.allergies, false)).toEqual({
      text: "1 allergy on record, not yet confirmed today",
      caution: true,
    });
    expect(allergyStatus(k.allergies, true).text).toBe("1 allergy on record, confirmed today");
    expect(
      allergyStatus({ status: "no_known_drug_allergies", touchedThisVisit: true, items: [] }, false)
        .text,
    ).toBe("No known drug allergies, confirmed today");
    expect(
      allergyStatus({ status: "not_recorded", touchedThisVisit: false, items: [] }, false),
    ).toEqual({ text: "Allergy status not recorded", caution: true });
    const m = pmh();
    expect(toneOf(m, "1 allergy on record, not yet confirmed today")).toBe("caution");
    expect(toneOf(m, "Uncoded")).toBe("caution");
    expect(text(m)).not.toContain("High risk");
    expect(text(m)).toContain("Still true today");
    // "Code it" stays on one line.
    expect(m).toMatch(/whitespace-nowrap[^>]*>Code it</);
    const risky = { ...k.allergies.items[0]!, reactions: ["collapse_anaphylaxis"] };
    expect(highRisk(cat, risky)).toBe(true);
    expect(highRisk(cat, { ...risky, reactions: ["rash"] })).toBe(false);
    const hr = pmh(patientThree3(), { ...k, allergies: { ...k.allergies, items: [risky] } });
    expect(toneOf(hr, "High risk")).toBe("caution");
    // None listed: No known drug allergies instead of Still true today.
    const nk = text(
      pmh(patientThree3(), {
        ...k,
        allergies: { status: "not_recorded", touchedThisVisit: false, items: [] },
      }),
    );
    expect(nk).toContain("No known drug allergies");
    expect(nk).not.toContain("Still true today");
  });

  it("chart writes need an open visit: no picks, Code it or remove when actions are off", () => {
    const t = text(pmh(patientThree3(), k, false));
    expect(t).not.toContain("Code it");
    expect(t).not.toContain("Penicillins");
    expect(t).not.toContain("Confirm on the problem list");
  });

  it("the transfusion note comes from the catalogue", () => {
    expect(text(pmh())).toContain(String(cat.data.past_history.transfusions.note));
  });
});

/* ─── [05] Family, [06] Social ──────────────────────────────────── */

describe("family history (§5.7)", () => {
  it("a yes reveals who; relations toggle; restricted conditions carry the lock", () => {
    const st = store(patientThree3());
    const els = () => walk(h(FamilyBody, base(st.s.h, st.onHistory)));
    const who = inGroup(els(), "Hypertension: who");
    expect(
      who.find(
        (e) =>
          e.props["aria-pressed"] === true && words(e as unknown as ReactNode).includes("Mother"),
      ),
    ).toBeDefined();
    press(who.find((e) => words(e as unknown as ReactNode).trim() === "Father"));
    expect(st.s.h.family.hypertension!.relations).toEqual(["mother", "father"]);
    const m = renderToStaticMarkup(h(FamilyBody, base(st.s.h, st.onHistory))).replace(
      /<!-- -->/g,
      "",
    );
    expect(m).toMatch(/TB in the household<span title="Restricted"/);
    expect(m).toMatch(/Mental illness<span title="Restricted"/);
    expect(m).not.toMatch(/Diabetes<span title="Restricted"/);
    // Answering no drops the relatives.
    press(inGroup(els(), "Hypertension").find((e) => e.props["data-answer"] === "no"));
    expect(st.s.h.family.hypertension).toEqual({ answer: "no" });
  });
});

describe("social history (§5.8)", () => {
  it("pack-years derived in mono; typed counts and a-day picks; never smoked clears the rest", () => {
    const st = store(patientThree3());
    const m = renderToStaticMarkup(h(SocialBody, base(st.s.h, st.onHistory)));
    expect(m).toMatch(/font-mono[^>]*>= 10 pack-years/);
    let els = walk(h(SocialBody, base(st.s.h, st.onHistory)));
    const typed = (label: string, value: string) =>
      (els.find((e) => e.props["aria-label"] === label)!.props.onChange as (e: unknown) => void)({
        target: { value },
      });
    typed("Cigarettes a day", "15");
    expect(st.s.h.social.perDay).toBe(15);
    typed("Years smoked", "");
    expect(st.s.h.social.years).toBeUndefined();
    expect(renderToStaticMarkup(h(SocialBody, base(st.s.h, st.onHistory)))).toContain(
      "= – pack-years",
    );
    els = walk(h(SocialBody, base(st.s.h, st.onHistory)));
    press(
      inGroup(els, "A day").find((e) => words(e as unknown as ReactNode).trim() === "20 (a pack)"),
    );
    expect(st.s.h.social.perDay).toBe(20);
    press(inGroup(els, "Tobacco").find((e) => words(e as unknown as ReactNode).trim() === "Never"));
    expect(st.s.h.social).toMatchObject({ tobacco: "never" });
    expect(st.s.h.social.perDay).toBeUndefined();
    expect(st.s.h.social.years).toBeUndefined();
  });

  it("other substances are restricted (lock); drink types only while they drink", () => {
    const m = renderToStaticMarkup(
      h(
        SocialBody,
        base(patientThree3(), () => {}),
      ),
    ).replace(/<!-- -->/g, "");
    expect(m).toMatch(/Other substances<span title="Restricted"/);
    expect(text(m)).toContain("Local brew (for example malwa, tonto)");
    const dry = patientThree3();
    dry.social = { ...dry.social, alcohol: "none", drinks: undefined };
    expect(
      text(
        renderToStaticMarkup(
          h(
            SocialBody,
            base(dry, () => {}),
          ),
        ),
      ),
    ).not.toContain("Beer");
  });
});

/* ─── The sign dialog's count, and prints (Law 10) ─────────────── */

describe("Committed with this note, for a v2 draft", () => {
  it("counts what signing charts (the server's own functions), the family entries and the unmapped", () => {
    const p = v2Payload();
    const w = v2CommittedWords(cat, p.clerking!, p.draft!.content, null)!;
    expect(w).toMatch(
      /^\d+ findings, tobacco status, 1 family history entry, \d+ kept in the note only \(not charted yet\)$/,
    );
    expect(v2CommittedWords(cat, p.clerking!, { sections: {} }, "2 examination signs")).toBe(
      "2 examination signs",
    );
  });
});

describe("prints never carry the clerking note's content (Law 10, D-EMR-13)", () => {
  const ROOT = resolve(__dirname, "../..");
  const files = (dir: string): string[] =>
    readdirSync(dir).flatMap((f) => {
      const p = join(dir, f);
      return statSync(p).isDirectory() ? files(p) : [p];
    });
  const PRINT = [
    ...files(resolve(ROOT, "app/doctor/encounters/[encounterId]/print")),
    resolve(ROOT, "components/emr/print-views.tsx"),
    resolve(ROOT, "components/emr/print-layout.tsx"),
  ];

  it("no printout reads a note, its history or the composer", () => {
    expect(PRINT.length).toBeGreaterThan(5);
    for (const f of PRINT) {
      const src = readFileSync(f, "utf8");
      expect(src, f).not.toMatch(
        /lib\/clerking|compose\(|rosDetail|NoteContent|\.history\b|\.narrative\b|clinicalNotes|loadDesk/,
      );
    }
  });
});
