import type { ComposeInput } from "../compose";
import type { ExamContext } from "../exam/context";
import type { Finding, FindingRef, StepTag, Viewer } from "../impression/facts";

import REF from "@/data/clerking/summary-reference.v1.json";
import { durationDays, durationText } from "../answers";
import { rosSystemsFor } from "../catalogue";
import { cap, lc, list } from "../compose";
import { acvpuOf, gcsTotal } from "../exam/scores";
import { canSee, recordedFindings } from "../impression/facts";

/**
 * The composed summary (`composer.summary`, gate-a-proposal §5.1, SI1): a one-liner and a
 * paragraph built by fixed rules from recorded facts only. An unrecorded item never appears; "not
 * asked" never becomes "no"; allergies always appear; the composer never names a diagnosis (the
 * syndrome is the clinician's words). Every sentence carries the steps it came from. Pure, en-GB.
 */

export type Column = "history" | "exam" | "negatives";

export interface SummaryItem extends Finding {
  column: Column;
  included: boolean;
  /** Included unless the clinician says otherwise (the default §5.1 defines). */
  byDefault: boolean;
  /** The allergy row: always in. */
  locked?: boolean;
}

export interface Sentence {
  id: "one_liner" | "history" | "negatives" | "exam" | "vitals" | "allergies";
  text: string;
  tags: StepTag[];
  refs: FindingRef[];
}

export type OnsetBand = "acute" | "subacute" | "chronic";

export interface OneLiner {
  who: string | null;
  ageMissing: boolean;
  sexMissing: boolean;
  /** duration: the adjective ("3-day"); words: as a chip says it ("3 days"). */
  onset: { band: OnsetBand; duration: string; words: string } | null;
  /** The complaint's course label ("Getting worse"), or null: "Not recorded". */
  course: string | null;
  syndrome: string;
}

export interface Gap {
  id: string;
  label: string;
  step: StepTag;
}

export interface SummaryView {
  oneLiner: OneLiner;
  sentences: Sentence[];
  items: SummaryItem[];
  text: string;
  wordCount: number;
  gaps: Gap[];
}

export interface SummaryInput {
  x: ExamContext;
  allergies: ComposeInput["allergies"];
  syndrome: string;
  /** The clinician's ticks, only where they differ from the default. */
  include: Readonly<Record<FindingRef, boolean>>;
  /** Refs a diagnosis on the board names (ask targets, evidence atoms): pertinent negatives. */
  named: ReadonlySet<FindingRef>;
  /** Refs a signed profile on the board marks for this encounter (D-SI-25: vital signs beyond a
   *  signed REF-DX threshold go in by default). */
  marked: ReadonlySet<FindingRef>;
  audience: "clinical" | "patient";
  viewer: Viewer;
}

const ONSET = REF.reference_entries["REF-SI-ONSET"].value;

export function onsetBand(days: number): OnsetBand {
  if (days < ONSET.acute_lt_days) return "acute";
  if (days > ONSET.chronic_gt_days) return "chronic";
  return "subacute";
}

const UNIT: Record<string, string> = {
  hours: "hour",
  days: "day",
  weeks: "week",
  months: "month",
  years: "year",
};

const ALLERGY_REF = "al:allergies";

function allergyText(a: SummaryInput["allergies"], audience: SummaryInput["audience"]): string {
  const items = a.items.filter((x) => !(audience === "patient" && x.restricted));
  if (a.status === "listed" && items.length)
    return `Allergies: ${items.map((x) => `${lc(x.name)}${x.coded ? "" : ", uncoded"}`).join("; ")}.`;
  if (a.status === "no_known_drug_allergies") return "No known drug allergies.";
  if (a.status === "unable_to_assess") return "Allergy status: unable to assess.";
  return "Allergy status not recorded.";
}

export function composeSummary(i: SummaryInput): SummaryView {
  const { x } = i;
  const h = x.history.answers;
  const hcat = x.history.cat;
  const sex = x.patient.sex;
  const He = sex === "male" ? "He" : sex === "female" ? "She" : "The patient";
  const he = sex === "male" ? "he" : sex === "female" ? "she" : "the patient";
  const visible = (f: Finding) => canSee(i.viewer, f.cls) && !(i.audience === "patient" && f.cls);
  const all = recordedFindings(x).filter(visible);

  // Pertinent negatives: "no" answers in a system with a positive, or named by the board.
  const positiveSystems = new Set<string>();
  const systemOf = new Map<string, string>();
  for (const s of rosSystemsFor(hcat, sex))
    for (const it of s.items) {
      systemOf.set(`sym:${it.id}`, s.id);
      const f = all.find((y) => y.ref === `sym:${it.id}`);
      if (f?.positive) positiveSystems.add(s.id);
    }

  const items: SummaryItem[] = all.map((f) => {
    const hist = f.step !== "07";
    let column: Column;
    let byDefault: boolean;
    if (f.positive) {
      column = hist ? "history" : "exam";
      byDefault =
        f.kind === "medicine" || f.kind === "social"
          ? false
          : f.kind === "vital"
            ? f.ref === "vs:news2" || !!f.out || i.marked.has(f.ref)
            : true;
    } else if (f.kind === "vital") {
      column = "exam";
      byDefault = i.marked.has(f.ref);
    } else {
      column = "negatives";
      const sys = systemOf.get(f.ref.split("#")[0]!);
      byDefault =
        i.named.has(f.ref) ||
        i.marked.has(f.ref) ||
        (f.kind === "symptom" && !!sys && positiveSystems.has(sys));
    }
    const override = i.include[f.ref];
    return { ...f, column, byDefault, included: override ?? byDefault };
  });
  items.push({
    ref: ALLERGY_REF,
    text: allergyText(i.allergies, i.audience).replace(/\.$/, ""),
    step: "04",
    kind: "past",
    positive: true,
    cls: null,
    column: "history",
    byDefault: true,
    included: true,
    locked: true,
  });
  const on = (f: SummaryItem) => f.included;
  const inc = items.filter(on);

  // One-liner
  const complaints = h.complaints.filter((c) => c.symptom && hcat.symptom(c.symptom));
  const longest = complaints
    .map((c) => ({ c, d: durationDays(c.duration) }))
    .filter((y): y is { c: (typeof complaints)[number]; d: number } => y.d !== null)
    .sort((a, b) => b.d - a.d)[0];
  const onset = longest
    ? {
        band: onsetBand(longest.d),
        duration: `${longest.c.duration!.value}-${UNIT[longest.c.duration!.unit]}`,
        words: durationText(longest.c.duration),
      }
    : null;
  const courseOf = (c: (typeof complaints)[number]) => {
    const p = hcat.properties(c.symptom!).find((q) => q.id === "course");
    const v = c.props.course;
    return p && typeof v === "string" ? (p.options.find((o) => o.id === v)?.label ?? null) : null;
  };
  const course = complaints.map(courseOf).find(Boolean) ?? null;
  const age = x.patient.ageYears;
  const noun = sex === "male" ? "man" : sex === "female" ? "woman" : "person";
  // Background is what the patient has: a "no" answer is a pertinent negative, never background.
  const background = inc
    .filter((f) => f.kind === "past" && f.positive && f.ref !== ALLERGY_REF)
    .map((f) => lc(f.text));
  const meds = inc.filter((f) => f.kind === "medicine").map((f) => lc(f.text));
  const bg = [
    ...(background.length ? [`with ${list(background)}`] : []),
    ...(meds.length ? [`taking ${list(meds)}`] : []),
  ];
  const syndrome = i.syndrome.trim().slice(0, 120);
  const lead = age !== null ? `A ${age}-year-old ${noun}` : `A ${noun} of unrecorded age`;
  const oneText = `${lead}${bg.length ? ` ${bg.join(", ")}` : ""}${
    onset
      ? `, with ${onset.band === "acute" ? "an" : "a"} ${onset.band} ${onset.duration} illness`
      : ""
  }${syndrome ? `: ${syndrome}` : ""}.`;
  const sentences: Sentence[] = [
    {
      id: "one_liner",
      text: oneText,
      tags: ["01", ...(background.length || meds.length ? (["04"] as StepTag[]) : [])],
      refs: inc
        .filter((f) => f.kind === "past" || f.kind === "medicine")
        .map((f) => f.ref)
        .filter((r) => r !== ALLERGY_REF),
    },
  ];

  // History positives
  const hx = inc.filter(
    (f) => f.column === "history" && ["complaint", "symptom", "red_flag"].includes(f.kind),
  );
  const complaintWords = hx
    .filter((f) => f.kind === "complaint")
    .map((f) => {
      const c = complaints.find((y) => `sym:${y.symptom}` === f.ref)!;
      const s = hcat.symptom(c.symptom!)!;
      const d = c.duration
        ? `${c.duration.value} ${c.duration.value === 1 ? UNIT[c.duration.unit] : c.duration.unit}`
        : "";
      const k = courseOf(c);
      return `${lc(s.label)}${d ? ` for ${d}` : ""}${k ? `, ${lc(k)}` : ""}`;
    });
  const flagsYes = hx.filter((f) => f.kind === "red_flag").map((f) => lc(f.text));
  const alsoYes = hx
    .filter((f) => f.kind === "symptom")
    .map((f) => lc(f.text.replace(/ \((\d[^)]*)\)$/, " for $1")));
  const famSoc = inc.filter(
    (f) => (f.kind === "family" || f.kind === "social") && f.column === "history",
  );
  const hxText = [
    complaintWords.length ? `${He} reports ${list(complaintWords)}.` : "",
    flagsYes.length ? `Red flags present: ${list(flagsYes)}.` : "",
    alsoYes.length ? `Also ${list(alsoYes)}.` : "",
    famSoc.length ? `${cap(famSoc.map((f) => lc(f.text)).join("; "))}.` : "",
  ]
    .filter(Boolean)
    .join(" ");
  if (hxText)
    sentences.push({
      id: "history",
      text: hxText,
      tags: [...new Set([...hx, ...famSoc].map((f) => f.step))],
      refs: [...hx, ...famSoc].map((f) => f.ref),
    });

  // Pertinent negatives (history "no" answers; examination negatives go with the examination)
  const neg = inc.filter((f) => f.column === "negatives" && f.step !== "07");
  if (neg.length)
    sentences.push({
      id: "negatives",
      text: `${He} reports no ${list(
        neg.map((f) => lc(f.text.replace(/^No /, ""))),
        "or",
      )}.`,
      tags: [...new Set(neg.map((f) => f.step))],
      refs: neg.map((f) => f.ref),
    });

  // Examination
  const ex = inc.filter((f) => f.kind === "exam" || (f.column === "negatives" && f.step === "07"));
  const c = x.exam.blocks.consciousness;
  const a = acvpuOf(c);
  const g = gcsTotal(c);
  const conscious =
    a === "A"
      ? "alert"
      : a === "C"
        ? "newly confused"
        : a === "V"
          ? "responsive to voice"
          : a === "P"
            ? "responsive to pain"
            : a === "U"
              ? "unresponsive"
              : null;
  const cw = conscious ? `${conscious}${g !== null && g < 15 ? ` (GCS ${g})` : ""}` : null;
  if (ex.length || cw)
    sentences.push({
      id: "exam",
      text: cw
        ? `On examination ${he} is ${cw}${ex.length ? `, with ${list(ex.map((f) => lc(f.text)))}` : ""}.`
        : `On examination, ${list(ex.map((f) => lc(f.text)))}.`,
      tags: ["07"],
      refs: ex.map((f) => f.ref),
    });

  // Vital signs and NEWS2
  const vs = inc.filter((f) => f.kind === "vital" && f.ref !== "vs:news2");
  const n2 = inc.find((f) => f.ref === "vs:news2");
  if (vs.length || n2)
    sentences.push({
      id: "vitals",
      text: [
        vs.length
          ? `${cap(vs.map((f) => `${lc(f.text)}${f.out === "high" ? " ↑" : f.out === "low" ? " ↓" : ""}`).join(", "))}.`
          : "",
        n2 ? `${n2.text}.` : "",
      ]
        .filter(Boolean)
        .join(" "),
      tags: ["07"],
      refs: [...vs, ...(n2 ? [n2] : [])].map((f) => f.ref),
    });

  // Allergies: always
  sentences.push({
    id: "allergies",
    text: allergyText(i.allergies, i.audience),
    tags: ["04"],
    refs: [ALLERGY_REF],
  });

  const text = sentences.map((s) => s.text).join(" ");
  return {
    oneLiner: {
      who:
        age !== null && sex
          ? `${age}, ${sex}`
          : age !== null
            ? `${age}, sex not recorded`
            : sex
              ? `Age not recorded, ${sex}`
              : null,
      ageMissing: age === null,
      sexMissing: !sex,
      onset,
      course,
      syndrome,
    },
    sentences,
    items,
    text,
    wordCount: text.split(/\s+/).filter(Boolean).length,
    gaps: gapsOf(i, all, course, complaints.length > 0),
  };
}

function gapsOf(
  i: SummaryInput,
  all: readonly Finding[],
  course: string | null,
  anyComplaint: boolean,
): Gap[] {
  const g: Gap[] = [];
  const h = i.x.history.answers;
  if (anyComplaint && !course)
    g.push({ id: "course", label: "Course of the complaint", step: "01" });
  if (!Object.keys(h.family).length) g.push({ id: "family", label: "Family history", step: "05" });
  if (!Object.values(h.social).some((v) => v !== undefined))
    g.push({ id: "social", label: "Social history", step: "06" });
  const v = i.x.vitals;
  const missing = [
    v.temp === null && "temperature",
    v.pulse === null && "pulse",
    v.sbp === null && "blood pressure",
    v.rr === null && "respiratory rate",
    v.spo2 === null && "SpO₂",
  ].filter(Boolean) as string[];
  if (missing.length) g.push({ id: "vitals", label: `Vital signs: ${list(missing)}`, step: "07" });
  if (!i.x.exam.blocks.consciousness)
    g.push({ id: "consciousness", label: "Consciousness", step: "07" });
  if (i.allergies.status === "not_recorded")
    g.push({ id: "allergies", label: "Allergy status", step: "04" });
  if (!all.some((f) => f.step === "07" && f.kind === "exam"))
    g.push({ id: "exam", label: "Examination findings", step: "07" });
  return g;
}
