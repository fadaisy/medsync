import { readFileSync } from "node:fs";
import type { DeskPayload } from "@/components/emr/desk/model";
import type { SymptomEntry } from "@/lib/clerking/answers";
import type { ReactElement, ReactNode } from "react";
import { createElement as h, isValidElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import {
  alsoAskedGroups,
  clerkingKey,
  complaintIndex,
  deriveDesk,
  entrySummary,
  searchComplaints,
  sectionText,
  vitalsView,
} from "@/components/clerking/model";
import { addComplaint, emptyEntry, removeComplaint } from "@/lib/clerking/answers";
import { compose } from "@/lib/clerking/compose";
import { evaluateFlags } from "@/lib/clerking/flags";
import { linkedAnswers } from "@/lib/clerking/linkage";
import { SECTIONS } from "@/lib/clerking/status";
import { standardVisitMidway } from "../emr/ui/desk-fixtures";
import { cat, header, patientThree3, SIGNED, THREE3_VITALS, v2Payload } from "./fixtures";

/**
 * Clerking desk v2's views (PROMPT-CLERKING-DESK-V2 §5, Phases 3–4), rendered to static markup from
 * Patient Three-3 (the prototype's patient) — no DOM, no database. The property editor is hook-free,
 * so its buttons are pressed through their own handlers (the tap-count budget counts those calls).
 */

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh() {}, push() {} }) }));
const { ClerkingDesk } = await import("@/components/clerking/clerking-desk");
const { ClerkingRail } = await import("@/components/clerking/rail");
const { ComplaintBody, HistoryBody } = await import("@/components/clerking/history-sections");
const { PropertyEditor } = await import("@/components/clerking/property-editor");
const { DeskView } = await import("@/components/emr/desk/desk-view");
const { formatters } = await import("@/components/emr/format");

const text = (m: string) =>
  m
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, " ")
    .trim();

function desk(p: DeskPayload, current = "complaint") {
  return renderToStaticMarkup(
    h(ClerkingDesk, {
      p,
      cat,
      content: p.draft!.content,
      current,
      save: { tone: "neutral", text: "Saved 08:19" },
      on: {},
      loaders: { findings: async () => [], terms: async () => [] },
    }),
  );
}

/* ─── Pressing a hook-free component's buttons ──────────────────── */

type El = ReactElement<Record<string, unknown>>;
function walk(node: ReactNode, out: El[] = []): El[] {
  if (Array.isArray(node)) {
    for (const n of node) walk(n as ReactNode, out);
    return out;
  }
  if (!isValidElement(node)) return out;
  const el = node as El;
  if (typeof el.type === "function")
    return walk((el.type as (p: unknown) => ReactNode)(el.props), out);
  if (typeof el.type === "string") out.push(el);
  walk(el.props.children as ReactNode, out);
  return out;
}
const words = (node: ReactNode): string => {
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map((n) => words(n as ReactNode)).join("");
  if (!isValidElement(node)) return "";
  const el = node as El;
  if (typeof el.type === "function") return words((el.type as (p: unknown) => ReactNode)(el.props));
  return typeof el.type === "string" ? words(el.props.children as ReactNode) : "";
};

function editor(symptom: string, start: SymptomEntry = emptyEntry()) {
  const s = cat.symptom(symptom)!;
  const state = { entry: start, taps: 0 };
  const els = () =>
    walk(
      h(PropertyEditor, {
        cat,
        symptom: s,
        entry: state.entry,
        cautionFrom: 7,
        onEntry: (fn) => {
          state.taps += 1;
          state.entry = fn(state.entry);
        },
      }),
    );
  const press = (b: El | undefined) => {
    expect(b, "button not found").toBeDefined();
    (b!.props.onClick as () => void)();
  };
  const option = (prop: string, id: string) => {
    const label = cat
      .properties(s.id)
      .find((p) => p.id === prop)!
      .options.find((o) => o.id === id)!.label;
    const group = els().find(
      (e) =>
        e.props.role === "group" &&
        e.props["aria-label"] === cat.properties(s.id).find((p) => p.id === prop)!.label,
    )!;
    return walk(group.props.children as ReactNode).find(
      (e) => e.type === "button" && words(e).trim() === label,
    );
  };
  const flag = (id: string, answer: "yes" | "no") => {
    const label = s.red_flags.find((f) => f.id === id)!.label;
    const group = els().find((e) => e.props.role === "group" && e.props["aria-label"] === label)!;
    return walk(group.props.children as ReactNode).find((e) => e.props["data-answer"] === answer);
  };
  const byLabel = (l: string) => els().find((e) => e.props["aria-label"] === l);
  const byText = (t: string) => els().find((e) => e.type === "button" && words(e).trim() === t);
  return { state, els, press, option, flag, byLabel, byText };
}

/* ─── The shell ─────────────────────────────────────────────────── */

describe("clerking desk v2 shell — Patient Three-3", () => {
  const p = v2Payload();
  const m = desk(p);
  const t = text(m);

  it("shows the ten steps in two groups, the current one marked, and N of 10 done", () => {
    for (const s of SECTIONS) expect(t).toContain(s.short);
    expect(t).toContain("History");
    expect(t).toContain("Examination and plan");
    expect(m).toMatch(/aria-current="step"[^>]*aria-label="Complaint, Done, step 1 of 10"/);
    const d = deriveDesk(cat, p, p.draft!.content);
    expect(t).toContain(`${d.done} of 10 done`);
    expect(m).toContain(`aria-label="Systems, ${d.statuses.systems.text}, step 3 of 10"`);
    expect(m).toContain("Past history, Confirm allergies, step 4 of 10");
  });

  it("the centre card: [01], the title, the blurb, Step 1 of 10 and Next", () => {
    expect(t).toContain("[01] Presenting complaint");
    expect(t).toContain("What brought the patient");
    expect(t).toContain("Step 1 of 10");
    expect(t).toContain("Next: History");
  });

  it("the safety bar: two identifiers, Draft and the saved time, the second row, no flag badges", () => {
    expect(t).toContain("Patient Three-3");
    expect(t).toContain(p.safetyBar.mrn);
    expect(t).toContain("Draft");
    expect(t).toContain("Saved 08:19");
    expect(t).toContain("Uncoded, not checked by prescribing");
    expect(t).toMatch(/Vital signs NEWS2 5, incomplete/);
    const bar = m.slice(
      m.indexOf('data-slot="safety-bar"'),
      m.indexOf('data-slot="clerking-steps"'),
    );
    expect(bar).not.toMatch(/data-level=/);
  });

  it("the Flags panel: badges from the engines, urgent first, words + urgent / needs attention", () => {
    const d = deriveDesk(cat, p, p.draft!.content);
    expect(d.badges.map((b) => b.label)).toEqual([
      "Temperature 32.5 °C",
      "NEWS2 5",
      "Pain at night or at rest",
      "Weight loss",
      "Change in bowel habit",
      "Bone pain 7/10",
      "Misses amlodipine",
    ]);
    expect(m).toContain('aria-label="Temperature 32.5 °C, urgent"');
    expect(m).toContain('aria-label="NEWS2 5, urgent"');
    expect(m).toContain('aria-label="Weight loss, needs attention"');
    expect(m).toContain('aria-label="Misses amlodipine, needs attention"');
    // Shape as well as colour: the urgent badge carries the octagon, the caution one the triangle.
    const urgent = m.slice(m.indexOf('aria-label="NEWS2 5, urgent"'));
    expect(urgent.slice(0, urgent.indexOf("</button>"))).toMatch(/lucide-octagon-alert/);
    const caution = m.slice(m.indexOf('aria-label="Weight loss, needs attention"'));
    expect(caution.slice(0, caution.indexOf("</button>"))).toMatch(/lucide-triangle-alert/);
    // Every reason with where it came from.
    expect(m).toMatch(/title="Back pain: [^"]*pain at night or at rest/);
  });

  it("the note: composed blocks, the current section's block marked in the place colour", () => {
    expect(m).toMatch(/data-block="history" data-current="true"/);
    expect(m).not.toMatch(/data-block="systems" data-current/);
    expect(t).toContain(
      "Patient Three-3, a 76-year-old man. History from the patient, in Luganda.",
    );
    expect(t).toContain("Back pain for 2 months, gradual onset.");
    const sys = text(desk(p, "systems"));
    expect(sys).toContain("[03] Review of systems");
    expect(desk(p, "systems")).toMatch(/data-block="systems" data-current="true"/);
    expect(t).toContain("Written from your entries as you go, by fixed rules.");
    expect(t).toContain("Required 3 of 3");
  });

  it("an empty desk says so: no flags, a required complaint", () => {
    const empty = v2Payload({ ...patientThree3(), complaints: [], ros: {}, rosDetail: {} });
    empty.clerking = {
      ...empty.clerking!,
      vitalsAt: null,
      medicines: [],
    };
    const e = text(desk(empty));
    expect(e).toContain("Nothing flagged so far.");
    expect(e).toContain("No complaint recorded yet.");
    expect(desk(empty)).toContain("Complaint, Required, step 1 of 10");
  });

  it("Examination, Impression and Plan keep the v1 bodies and their note text", () => {
    expect(text(desk(p, "impression"))).toContain("Malaria, uncomplicated");
    const st = sectionText(p, p.draft!.content);
    expect(st.impression).toContain("Malaria, uncomplicated");
    expect(st.plan).toContain("Malaria rapid diagnostic test (mRDT)");
    expect(st.exam).toContain("Pallor, absent");
  });

  it("Systems, Past history, Family and Social are the Phase 5–6 seam", () => {
    for (const s of ["systems", "pmh", "fh", "social"])
      expect(desk(p, s)).toContain(`data-pending="${s}"`);
  });
});

/* ─── The rail (C6) ─────────────────────────────────────────────── */

describe("the rail marks NEWS2 where the reading is shown (C6)", () => {
  const p = v2Payload();
  const v = vitalsView(THREE3_VITALS, p.context.vitals);
  const m = renderToStaticMarkup(
    h(ClerkingRail, { p, fmt: formatters(p.timeZone), vitals: v, alarm: true }),
  );
  const t = text(m);

  it("says the single parameter scoring 3, with the chip and what is missing", () => {
    expect(t).toContain("Temperature 32.5 °C scores 3 on its own. Re-measure now.");
    expect(t).toContain("NEWS2 5, incomplete");
    expect(t).toContain("Missing: consciousness and air or oxygen.");
    expect(t).toContain("Air or oxygen?");
  });

  it("per-row scores: 3 in the critical tint with an arrow, 1–2 amber; Not recorded on one line", () => {
    expect(v.rows.find((r) => r.key === "temperature")).toMatchObject({ points: 3, arrow: "low" });
    expect(v.rows.find((r) => r.key === "spo2")).toMatchObject({ points: 1, arrow: null });
    expect(m).toMatch(/title="NEWS2 score 3" class="[^"]*status-critical/);
    expect(m).toMatch(/title="NEWS2 score 1" class="[^"]*status-caution/);
    expect(m).toMatch(/whitespace-nowrap[^"]*">Not recorded/);
    expect(t).toContain("NEWS2 score 3");
  });
});

/* ─── [01] Complaint and the property editor ────────────────────── */

describe("[01] Complaint", () => {
  const props = (history = patientThree3()) => ({
    cat,
    header,
    history,
    onHeader: () => {},
    onHistory: () => {},
    editable: true,
    cautionFrom: 7,
  });

  it("cards: name, duration in mono, a one-line summary, Properties/Done and remove", () => {
    const t = text(renderToStaticMarkup(h(ComplaintBody, props())));
    expect(t).toContain("Passing a lot of urine 3 weeks gradual · getting worse");
    expect(t).toMatch(
      /Back pain 2 months lower back · gradual · dull, aching · nowhere · constant · worse at night · rest · 6\/10 · 2 red flags/,
    );
    expect(t).toContain("Done"); // the last card opens with its editor
    expect(t).toContain("Properties");
    expect(t).toContain("History from Patient Carer Relative Referral letter Health worker");
    expect(t).toContain("Common");
  });

  it("a missing duration reads amber How long?; typed text is marked uncatalogued", () => {
    let hx = addComplaint(patientThree3(), "sym.cough", "c1");
    hx = addComplaint(hx, null, "t1", "Feels unwell in the evenings");
    const t = text(renderToStaticMarkup(h(ComplaintBody, props(hx))));
    expect(t).toContain("Cough How long?");
    expect(t).toContain("Feels unwell in the evenings How long? Uncatalogued, no properties");
    // An uncatalogued complaint never drives flags or linked answers; the note keeps its words.
    const typed = { ...patientThree3(), complaints: hx.complaints.filter((c) => c.key === "t1") };
    expect(linkedAnswers(cat, typed.complaints).size).toBe(0);
    expect(
      evaluateFlags(cat, {
        history: { ...typed, ros: {}, rosDetail: {} },
        linked: new Map(),
        patient: { ageYears: 76, sex: "male" },
        settings: { outbreakMode: false },
        medicines: [],
        allergies: { status: "no_known_drug_allergies", items: [] },
        news2: null,
        signoff: SIGNED,
      }),
    ).toEqual([]);
  });

  it("search hits labels and synonyms, and says the family and system", () => {
    const index = complaintIndex(cat);
    expect(searchComplaints(index, "waist")[0]?.symptom.id).toBe("sym.back_pain");
    expect(searchComplaints(index, "back p")[0]?.symptom.id).toBe("sym.back_pain");
    expect(searchComplaints(index, "zzqx")).toEqual([]);
    expect(index.every((x) => x.symptom.offer_as_complaint)).toBe(true);
  });

  it("the summary follows the answers, from catalogue labels", () => {
    const back = cat.symptom("sym.back_pain")!;
    expect(entrySummary(cat, back, emptyEntry())).toBe("");
    expect(entrySummary(cat, back, { props: { severity: 8 }, flags: { fever: "yes" } })).toBe(
      "8/10 · 1 red flag",
    );
  });
});

describe("the property editor, by kind (§5.4)", () => {
  it("For: a stepper and unit chips; a unit with no value starts at 1", () => {
    const e = editor("sym.back_pain");
    e.press(e.byText("months"));
    expect(e.state.entry.duration).toEqual({ value: 1, unit: "months" });
    e.press(e.byLabel("For: more"));
    expect(e.state.entry.duration).toEqual({ value: 2, unit: "months" });
    e.press(e.byLabel("For: less"));
    e.press(e.byLabel("For: less"));
    expect(e.state.entry.duration).toEqual({ value: 1, unit: "months" });
  });

  it("one: a single choice, tap again clears", () => {
    const e = editor("sym.back_pain");
    e.press(e.option("onset", "gradual"));
    expect(e.state.entry.props.onset).toBe("gradual");
    e.press(e.option("onset", "sudden"));
    expect(e.state.entry.props.onset).toBe("sudden");
    e.press(e.option("onset", "sudden"));
    expect(e.state.entry.props.onset).toBeUndefined();
    expect(e.option("onset", "gradual")!.props["aria-pressed"]).toBe(false);
  });

  it("many: toggles, and an exclusive option clears the others", () => {
    const e = editor("sym.back_pain");
    e.press(e.option("radiation", "left_leg"));
    e.press(e.option("radiation", "buttocks"));
    expect(e.state.entry.props.radiation).toEqual(["left_leg", "buttocks"]);
    e.press(e.option("radiation", "nowhere"));
    expect(e.state.entry.props.radiation).toEqual(["nowhere"]);
    e.press(e.option("radiation", "groin"));
    expect(e.state.entry.props.radiation).toEqual(["groin"]);
    e.press(e.option("radiation", "groin"));
    expect(e.state.entry.props.radiation).toBeUndefined();
  });

  it("count: a stepper with its unit", () => {
    const e = editor("sym.polyuria");
    e.press(e.byLabel("At night: more"));
    e.press(e.byLabel("At night: more"));
    expect(e.state.entry.props.nocturia).toBe(2);
    expect(
      text(
        renderToStaticMarkup(
          h(
            "div",
            null,
            e.els().filter((x) => x.type === "span" && words(x).trim() === "times a night"),
          ),
        ),
      ),
    ).toContain("times a night");
  });

  it("scale: a 0–10 radio group; amber at or above the signed value; tap again clears", () => {
    const e = editor("sym.back_pain");
    e.press(e.byLabel("6 out of 10"));
    expect(e.state.entry.props.severity).toBe(6);
    expect(e.byLabel("6 out of 10")!.props["aria-checked"]).toBe(true);
    expect(String(e.byLabel("6 out of 10")!.props.className)).toMatch(/bg-teal-700/);
    e.press(e.byLabel("7 out of 10"));
    expect(String(e.byLabel("7 out of 10")!.props.className)).toMatch(/status-caution/);
    e.press(e.byLabel("7 out of 10"));
    expect(e.state.entry.props.severity).toBeUndefined();
    expect(
      e.els().some((x) => x.props.role === "radiogroup" && x.props["aria-label"] === "Severity"),
    ).toBe(true);
  });

  it("red flags: yes/no rows with aria-pressed, tap again clears, a lock on restricted items", () => {
    const e = editor("sym.back_pain");
    e.press(e.flag("night_pain", "yes"));
    expect(e.state.entry.flags.night_pain).toBe("yes");
    expect(e.flag("night_pain", "yes")!.props["aria-pressed"]).toBe(true);
    e.press(e.flag("night_pain", "yes"));
    expect(e.state.entry.flags.night_pain).toBeUndefined();
    const m = renderToStaticMarkup(
      h(PropertyEditor, {
        cat,
        symptom: cat.symptom("sym.back_pain")!,
        entry: emptyEntry(),
        cautionFrom: 7,
        onEntry: () => {},
      }),
    );
    expect(m).toMatch(/TB contact or past TB<span title="Restricted"/);
    expect(m).toContain("data-yesno");
  });

  it("every catalogue symptom renders an editor (96 of 96)", () => {
    for (const s of cat.symptoms) {
      const m = renderToStaticMarkup(
        h(PropertyEditor, {
          cat,
          symptom: s,
          entry: emptyEntry(),
          cautionFrom: null,
          onEntry: () => {},
        }),
      );
      expect(m.length, s.id).toBeGreaterThan(100);
    }
    expect(cat.symptoms.length).toBe(96);
  });

  it("budget: the prototype's back-pain complaint costs ≤ 20 taps (§4)", () => {
    const e = editor("sym.back_pain");
    const addFromCommonPicks = 1; // "Back pain" is a Common chip: one tap adds and opens it
    e.press(e.byText("months"));
    e.press(e.byLabel("For: more"));
    e.press(e.option("site", "lower_back"));
    e.press(e.option("onset", "gradual"));
    e.press(e.option("character", "dull_aching"));
    e.press(e.option("radiation", "nowhere"));
    e.press(e.option("timing", "constant"));
    e.press(e.option("timing", "worse_night"));
    e.press(e.option("relief", "rest"));
    e.press(e.byLabel("6 out of 10"));
    e.press(e.flag("night_pain", "yes"));
    e.press(e.flag("weight_loss", "yes"));
    for (const f of ["fever", "urine_difficulty", "leg_weakness", "cancer_history", "tb"])
      e.press(e.flag(f, "no"));
    const want = patientThree3().complaints[1]!;
    expect(e.state.entry).toEqual({
      duration: want.duration,
      props: want.props,
      flags: want.flags,
    });
    const taps = addFromCommonPicks + e.state.taps;
    expect(taps).toBe(18);
    expect(taps).toBeLessThanOrEqual(20);
  });
});

/* ─── [02] History ──────────────────────────────────────────────── */

describe("[02] History of presenting complaint", () => {
  it("the story with its helper, and also-asked rows that follow the complaints", () => {
    const hx = patientThree3();
    const t = text(
      renderToStaticMarkup(
        h(HistoryBody, {
          cat,
          header,
          history: hx,
          onHeader: () => {},
          onHistory: () => {},
          editable: true,
          cautionFrom: 7,
        }),
      ),
    );
    expect(t).toContain("The story, in your words");
    expect(t).toContain(
      "The facts from Complaint are already in the note. Write what the chips cannot say.",
    );
    expect(t).toContain("Also asked, because of passing a lot of urine");
    expect(t).toContain("Diuretics");
    expect(t).toContain(
      "These questions follow the complaint. A different complaint brings its own.",
    );

    const groups = alsoAskedGroups(cat, hx);
    expect(groups.flatMap((g) => g.rows.map((r) => r.key))).toContain("sym.polyuria:diuretics");
    const without = removeComplaint(hx, "pp");
    expect(alsoAskedGroups(cat, without).some((g) => g.symptom.id === "sym.polyuria")).toBe(false);
    // Stored answers stay, but the note speaks only for the complaints present.
    const blocks = compose({
      cat,
      header,
      history: without,
      linked: linkedAnswers(cat, without.complaints),
      patient: { name: "Patient Three-3", ageYears: 76, sex: "male" },
      medicines: [],
      allergies: { status: "not_recorded", confirmedThisVisit: false, items: [] },
      sectionText: {},
      edited: {},
      audience: "clinical",
    });
    expect(blocks.find((b) => b.key === "history")!.text).not.toMatch(/diuretics/i);
  });
});

/* ─── Keyboard ──────────────────────────────────────────────────── */

describe("keyboard (§5.13)", () => {
  const at = { current: 2, count: 10 };
  const k = (key: string, over: Record<string, unknown> = {}) =>
    clerkingKey({ key, inField: false, ...over }, at);

  it("[ ] and j k move; 1–9 and 0 jump; the ends stop", () => {
    expect(k("]")).toEqual({ type: "section", index: 3 });
    expect(k("[")).toEqual({ type: "section", index: 1 });
    expect(k("j")).toEqual({ type: "section", index: 3 });
    expect(k("k")).toEqual({ type: "section", index: 1 });
    expect(k("1")).toEqual({ type: "section", index: 0 });
    expect(k("0")).toEqual({ type: "section", index: 9 });
    expect(k("3")).toBeNull(); // already there
    expect(clerkingKey({ key: "]", inField: false }, { current: 9, count: 10 })).toBeNull();
  });

  it("/ searches, ? helps, the sign chord works everywhere, nothing else inside a field", () => {
    expect(k("/")).toEqual({ type: "search" });
    expect(k("?")).toEqual({ type: "help" });
    expect(k("Enter", { ctrlKey: true, inField: true })).toEqual({ type: "sign" });
    expect(k("Enter", { metaKey: true })).toEqual({ type: "sign" });
    expect(k("]", { inField: true })).toBeNull();
    expect(k("/", { inField: true })).toBeNull();
    expect(k("]", { ctrlKey: true })).toBeNull();
  });

  it("y, n and d act only on a focused yes/no row", () => {
    expect(k("y")).toBeNull();
    expect(k("y", { inYesNo: true })).toEqual({ type: "answer", answer: "yes" });
    expect(k("n", { inYesNo: true })).toEqual({ type: "answer", answer: "no" });
    expect(k("d", { inYesNo: true })).toEqual({ type: "details" });
    expect(k("d")).toBeNull();
  });
});

/* ─── Flag off ──────────────────────────────────────────────────── */

describe("CLERKING_V2 off: the v1 desk is unchanged", () => {
  it("a v1 payload (no clerking block) renders DeskView, not the v2 shell", () => {
    const p = standardVisitMidway();
    expect(p.clerking).toBeUndefined();
    const m = renderToStaticMarkup(
      h(DeskView, {
        p,
        content: p.draft!.content,
        current: "s01",
        save: { tone: "neutral", text: "Saved 10:42" },
        on: {},
        loaders: { findings: async () => [], terms: async () => [] },
      }),
    );
    expect(m).toContain('aria-label="Note sections"');
    expect(m).not.toContain('data-slot="clerking-desk"');
  });

  it("the island switches only on payload.clerking; the page keeps the v1 safety bar without it", () => {
    const client = readFileSync(
      "app/doctor/encounters/[encounterId]/_desk/desk-client.tsx",
      "utf8",
    );
    expect(client).toMatch(/const v2 = !!p\.clerking;/);
    expect(client).toMatch(/\{v2 \? \(\s*<ClerkingDesk/);
    const page = readFileSync("app/doctor/encounters/[encounterId]/_desk/desk-page.tsx", "utf8");
    expect(page).toMatch(/\{p\.clerking \? null : \(\s*<SafetyBarView/);
  });
});
