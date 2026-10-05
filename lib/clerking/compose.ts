import type { Complaint, History, HistoryHeader, PropValue, SymptomEntry } from "./answers";
import type { Catalogue, Option, PatientSex, Symptom } from "./catalogue";
import type { Linked } from "./linkage";

import CAGE from "@/data/clerking/cage.v1.json";
import { cageScore, durationText, packYears } from "./answers";
import { isRestricted, rosSystemsFor } from "./catalogue";
import { operationById } from "./pick-lists";

/**
 * The note writes itself (catalogue `composer.rules`, D-CV-16): deterministic sentences from the
 * answers by fixed rules, no AI. Only answered items appear; "not asked" never becomes a negative
 * (Law 4). Restricted items appear in the clinical note only (D-EMR-13).
 */

export type BlockKey =
  | "patient"
  | "history"
  | "systems"
  | "pmh"
  | "fh"
  | "social"
  | "exam"
  | "summary"
  | "impression"
  | "plan";

export interface Block {
  key: BlockKey;
  head: string;
  text: string;
  /** The clinician edited this block: it no longer regenerates. */
  edited: boolean;
}

export interface ComposeInput {
  cat: Catalogue;
  header: HistoryHeader;
  history: History;
  linked: ReadonlyMap<string, Linked>;
  patient: { name: string; ageYears: number | null; sex: PatientSex };
  /** Medicines as recorded, with catalogue ids for frequency, adherence and source. */
  medicines: readonly {
    name: string;
    dose?: string | null;
    frequency?: string | null;
    adherence?: string | null;
    source?: string | null;
    restricted?: boolean;
  }[];
  allergies: {
    status: "listed" | "no_known_drug_allergies" | "unable_to_assess" | "not_recorded";
    confirmedThisVisit: boolean;
    items: readonly {
      name: string;
      coded: boolean;
      reactions: readonly string[];
      severity?: string | null;
      restricted?: boolean;
    }[];
  };
  /** Examination, impression and plan, as the v1 section bodies write them. */
  sectionText: Partial<Record<"exam" | "summary" | "impression" | "plan", string>>;
  edited: Readonly<Record<string, string>>;
  audience: "clinical" | "patient";
}

/* ─── Words ─────────────────────────────────────────────────────── */

/** Lower-case mid-sentence, except abbreviations and proper nouns ("HIV", "NSAIDs", "SpO₂"). */
export function lc(s: string): string {
  const first = s.split(" ")[0] ?? "";
  if (first.length > 1 && first.slice(1) !== first.slice(1).toLowerCase()) return s;
  return s.charAt(0).toLowerCase() + s.slice(1);
}
export const cap = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

export function list(a: readonly string[], joiner = "and"): string {
  if (a.length <= 1) return a[0] ?? "";
  return `${a.slice(0, -1).join(", ")} ${joiner} ${a[a.length - 1]}`;
}

const labelOf = (opts: readonly Option[], id: string | null | undefined) =>
  opts.find((o) => o.id === id)?.label;

/* ─── One symptom as a sentence ─────────────────────────────────── */

/** Option labels lose their "(for example …)" hints in running text. */
const words = (label: string) => lc(label.replace(/\s*\(for example[^)]*\)/i, ""));

interface Parts {
  lead: string;
  clauses: string[];
  yes: string[];
  no: string[];
}

/** The pieces of one symptom: the lead ("Back pain for 2 months, gradual onset"), one clause per
 *  answered property in the catalogue's order, and the red flags answered. */
function symptomParts(cat: Catalogue, s: Symptom, e: SymptomEntry): Parts {
  const props = cat.properties(s.id);
  const base = new Set((cat.data.property_families[s.family]?.properties ?? []).map((p) => p.id));
  const one = (id: string) => {
    const p = props.find((x) => x.id === id);
    const v = e.props[id];
    return p && typeof v === "string" ? labelOf(p.options, v) : undefined;
  };
  const d = durationText(e.duration);
  const lead: string[] = [];
  const onset = one("onset");
  const course = one("course");
  if (onset) lead.push(`${lc(onset)} onset`);
  if (course) lead.push(lc(course));

  const clauses: string[] = [];
  for (const p of props) {
    if (p.id === "onset" || p.id === "course") continue;
    const v = e.props[p.id];
    if (v === undefined) continue;
    // Properties added by the symptom (extra families and properties) carry their own label.
    const pre =
      p.phrase?.pre ??
      (p.id === "radiation"
        ? "radiates to the "
        : base.has(p.id) || p.id === "associated"
          ? ""
          : `${lc(p.label)} `);
    const post = p.phrase?.post ?? "";
    if (p.kind === "one" && typeof v === "string") {
      const l = labelOf(p.options, v);
      if (l) clauses.push(`${pre}${words(l)}${post}`);
    } else if (p.kind === "many" && Array.isArray(v)) {
      const only = v.length === 1 ? v[0] : null;
      // Composer rules: "does not radiate" for Nowhere, "nothing eases it" for Nothing.
      if (p.id === "radiation" && only === "nowhere") clauses.push("does not radiate");
      else if (p.id === "relief" && only === "nothing") clauses.push("nothing eases it");
      else {
        const labels = v
          .map((x) => labelOf(p.options, x))
          .filter((x): x is string => !!x)
          .map(words);
        if (labels.length) clauses.push(`${pre}${list(labels)}${post}`);
      }
    } else if (p.kind === "count" && typeof v === "number") {
      clauses.push(`${pre}${v}${p.unit ? ` ${p.unit}` : ""}${post}`);
    } else if (p.kind === "scale" && typeof v === "number") {
      clauses.push(`severity ${v} out of 10`);
    } else if (typeof v === "string" && v.trim()) {
      clauses.push(`${pre}${v.trim()}${post}`);
    }
  }
  return {
    lead: `${s.label}${d ? ` for ${d}` : ""}${lead.length ? `, ${list(lead)}` : ""}`,
    clauses,
    yes: s.red_flags.filter((f) => e.flags[f.id] === "yes").map((f) => lc(f.label)),
    no: s.red_flags.filter((f) => e.flags[f.id] === "no").map((f) => lc(f.label)),
  };
}

/** "Back pain for 2 months, gradual onset. Lower back; dull, aching; … Red flags present: …" */
export function symptomSentence(cat: Catalogue, s: Symptom, e: SymptomEntry): string {
  const p = symptomParts(cat, s, e);
  const out = [`${p.lead}.`];
  if (p.clauses.length) out.push(`${cap(p.clauses.join("; "))}.`);
  if (p.yes.length) out.push(`Red flags present: ${p.yes.join("; ")}.`);
  if (p.no.length) out.push(`${p.yes.length ? "Absent" : "Red flags absent"}: ${p.no.join("; ")}.`);
  return out.join(" ");
}

/** The same, as one run-on clause for the review of systems. */
function symptomClause(cat: Catalogue, s: Symptom, e: SymptomEntry): string {
  const p = symptomParts(cat, s, e);
  return [
    lc(p.lead),
    ...p.clauses,
    ...(p.yes.length ? [`red flags present: ${p.yes.join(", ")}`] : []),
    ...(p.no.length ? [`${p.yes.length ? "absent" : "red flags absent"}: ${p.no.join(", ")}`] : []),
  ].join("; ");
}

function complaintSentence(cat: Catalogue, c: Complaint): string {
  const s = c.symptom ? cat.symptom(c.symptom) : undefined;
  if (s) return symptomSentence(cat, s, c);
  const d = durationText(c.duration);
  return c.text ? `${cap(c.text)}${d ? ` for ${d}` : ""}.` : "";
}

/* ─── The blocks ────────────────────────────────────────────────── */

export function compose(i: ComposeInput): Block[] {
  const { cat, history: h, linked, patient } = i;
  const hide = (sensitivity?: string) => i.audience === "patient" && isRestricted(sensitivity);
  const blocks: Omit<Block, "edited">[] = [];

  // Patient
  const who = patient.sex === "male" ? "man" : patient.sex === "female" ? "woman" : "person";
  const age =
    patient.ageYears !== null
      ? `a ${patient.ageYears}-year-old ${who}`
      : `a ${who} of unrecorded age`;
  const historian = labelOf(cat.data.option_sets.historian ?? [], i.header.historian);
  const from = [
    historian ? `History from the ${lc(historian)}` : "",
    i.header.language ? `in ${i.header.language}` : "",
    i.header.interpreter ? `through ${i.header.interpreter}` : "",
  ].filter(Boolean);
  blocks.push({
    key: "patient",
    head: "Patient",
    text: `${patient.name}, ${age}.${from.length ? ` ${from.join(", ")}.` : ""}`,
  });

  // History
  const hx: string[] = [];
  for (const c of h.complaints) {
    const s = c.symptom ? cat.symptom(c.symptom) : undefined;
    if (s && hide(s.sensitivity)) continue;
    hx.push(complaintSentence(cat, c));
  }
  const asked = (answer: "yes" | "no") =>
    h.complaints.flatMap((c) => {
      const s = c.symptom ? cat.symptom(c.symptom) : undefined;
      return (s?.also_ask ?? [])
        .filter((a) => h.alsoAsked[`${s!.id}:${a.id}`] === answer)
        .map((a) => lc(a.label));
    });
  const ay = [...new Set(asked("yes"))];
  const an = [...new Set(asked("no"))];
  if (ay.length) hx.push(`Also reports ${list(ay)}.`);
  if (an.length) hx.push(`No ${list(an, "or")}.`);
  if (h.story?.trim()) hx.push(h.story.trim());
  blocks.push({ key: "history", head: "History", text: hx.filter(Boolean).join(" ") });

  // Systems review: linked answers are not repeated here.
  const pos: string[] = [];
  const allNo: string[] = [];
  const partial: string[] = [];
  const notReviewed: string[] = [];
  const written = new Set<string>(); // a symptom in two systems is written once
  for (const sys of rosSystemsFor(cat, patient.sex)) {
    const own = sys.items.filter(
      (s) => !linked.has(s.id) && !hide(s.sensitivity) && !written.has(s.id),
    );
    for (const s of own) written.add(s.id);
    const yes = own.filter((s) => h.ros[s.id] === "yes");
    const no = own.filter((s) => h.ros[s.id] === "no");
    const open = own.length - yes.length - no.length;
    if (yes.length) {
      const parts = yes.map((s) => {
        const d = h.rosDetail[s.id];
        const detailed =
          d && (d.duration || Object.keys(d.props).length || Object.keys(d.flags).length);
        return detailed ? symptomClause(cat, s, d) : lc(s.label);
      });
      pos.push(`${sys.label}: ${parts.join("; ")}.`);
    } else if (own.length && open === 0) allNo.push(lc(sys.label));
    else if (no.length)
      partial.push(
        `${sys.label}: no ${list(
          no.map((s) => lc(s.label)),
          "or",
        )}.`,
      );
    else if (own.length && !sys.items.some((s) => linked.has(s.id)))
      notReviewed.push(lc(sys.label));
  }
  // Answers outside this patient's systems list: only a converted v1 answer (D9).
  const otherYes: string[] = [];
  const otherNo: string[] = [];
  for (const [id, a] of Object.entries(h.ros)) {
    const s = cat.symptom(id);
    if (!s || written.has(id) || linked.has(id) || hide(s.sensitivity)) continue;
    if (s.applies_to_sex && patient.sex && s.applies_to_sex !== patient.sex) continue;
    const d = h.rosDetail[id];
    if (a === "yes")
      otherYes.push(d && Object.keys(d.props).length ? symptomClause(cat, s, d) : lc(s.label));
    else otherNo.push(lc(s.label));
  }
  const conv = h.converted;
  const carried = (conv?.text ?? [])
    .filter((t) => !(i.audience === "patient" && t.restricted))
    .map((t) => `${t.label}${t.answer === "yes" ? "" : " (absent)"}`);
  const open = (conv?.pending ?? [])
    .filter((p) => p.from === "ros" && p.answer === "yes")
    .filter((p) => p.kind === "symptom" || p.kind === "property" || p.kind === "activity")
    .filter((p) => !(i.audience === "patient" && p.restricted))
    .map((p) => p.label);
  const rt = [...pos];
  if (otherYes.length) rt.push(`Also: ${otherYes.join("; ")}.`);
  if (allNo.length) rt.push(`No ${list(allNo, "or")} symptoms.`);
  rt.push(...partial);
  if (otherNo.length) rt.push(`No ${list(otherNo, "or")}.`);
  if (notReviewed.length) rt.push(`Not reviewed: ${notReviewed.join("; ")}.`);
  if (carried.length) rt.push(`From the previous format: ${carried.join("; ")}.`);
  if (open.length) rt.push(`From the previous format, not yet specified: ${open.join("; ")}.`);
  blocks.push({ key: "systems", head: "Systems review", text: rt.join(" ") });

  // Past history, medicines, allergies
  const past: string[] = [];
  const conds = cat.data.past_history.conditions.filter((c) => !hide(c.sensitivity));
  const since = cat.data.option_sets[cat.data.past_history.since_options_ref] ?? [];
  const py = conds
    .filter((c) => h.past.conditions[c.id]?.answer === "yes")
    .map((c) => {
      const s = labelOf(since, h.past.conditions[c.id]?.since);
      const d = conditionDetails(cat, c.id, h.past.conditions[c.id]?.details);
      if (d) return `${lc(d)}${s ? `, known for ${lc(s)}` : ""}`;
      return `${lc(c.label)}${s ? ` (${lc(s)})` : ""}`;
    });
  const pn = conds.filter((c) => h.past.conditions[c.id]?.answer === "no").map((c) => lc(c.label));
  if (py.length) past.push(`${cap(list(py))}.`);
  if (pn.length) past.push(`No ${list(pn, "or")}.`);
  const ops =
    h.past.operations === "none"
      ? "none"
      : h.past.operations?.filter(
          (o) => o.text.trim() && !hide(operationById(o.code)?.sensitivity),
        );
  if (ops === "none") past.push("No operations.");
  else if (ops?.length)
    past.push(
      `Operations: ${ops.map((o) => `${o.text.trim()}${o.year ? ` (${o.year})` : ""}`).join("; ")}.`,
    );
  const tf = h.past.transfusions;
  if (tf === "none") past.push("No transfusions.");
  else if (tf?.length) {
    const when =
      cat.data.past_history.transfusions.fields.find((f) => f.id === "when")?.options ?? [];
    past.push(
      `Transfusion: ${tf.map((t) => lc(labelOf(when, t.when) ?? "date not recorded")).join("; ")}.`,
    );
  }
  const m = cat.data.medicines;
  const meds = i.medicines.filter((x) => !(i.audience === "patient" && x.restricted));
  if (meds.length)
    past.push(
      `Medicines: ${meds
        .map((x) => {
          const bits = [
            x.dose,
            lc(labelOf(m.frequency, x.frequency) ?? ""),
            lc(labelOf(m.adherence, x.adherence) ?? ""),
          ].filter(Boolean);
          const src = labelOf(m.source, x.source);
          return `${lc(x.name)}${bits.length ? ` ${bits.join(", ")}` : ""}${src ? ` (${lc(src)})` : ""}`;
        })
        .join("; ")}.`,
    );
  else if (h.past.medicinesNone) past.push("No regular medicines, including herbal.");
  const a = cat.data.allergies;
  const al = i.allergies.items.filter((x) => !(i.audience === "patient" && x.restricted));
  if (i.allergies.status === "listed" && al.length) {
    past.push(
      `Allergies: ${al
        .map((x) => {
          const r = x.reactions
            .map((id) => labelOf(a.reactions, id))
            .filter((y): y is string => !!y)
            .map(lc);
          const sev = labelOf(a.severity, x.severity);
          return `${lc(x.name)}${x.coded ? "" : ", uncoded"}, ${r.length ? list(r) : "reaction not recorded"}${sev ? `, ${lc(sev)}` : ""}`;
        })
        .join("; ")}.${i.allergies.confirmedThisVisit ? " Allergy list confirmed today." : ""}`,
    );
  } else if (i.allergies.status === "no_known_drug_allergies")
    past.push(
      `No known drug allergies${i.allergies.confirmedThisVisit ? ", confirmed today" : ""}.`,
    );
  else if (i.allergies.status === "unable_to_assess")
    past.push("Allergy status: unable to assess.");
  else past.push("Allergy status not recorded.");
  blocks.push({ key: "pmh", head: "Past history, medicines, allergies", text: past.join(" ") });

  // Family history
  const rel = cat.data.option_sets[cat.data.family_history.relations_ref] ?? [];
  const fconds = cat.data.family_history.conditions.filter((c) => !hide(c.sensitivity));
  const fy = fconds
    .filter((c) => h.family[c.id]?.answer === "yes")
    .map((c) => {
      const who = (h.family[c.id]?.relations ?? [])
        .map((r) => labelOf(rel, r))
        .filter((x): x is string => !!x)
        .map(lc);
      return `${lc(c.label)}${who.length ? ` (${list(who)})` : ""}`;
    });
  const fn = fconds.filter((c) => h.family[c.id]?.answer === "no").map((c) => lc(c.label));
  const fs: string[] = [];
  if (fy.length) fs.push(`Family history of ${list(fy)}.`);
  if (fn.length) fs.push(`No family history of ${list(fn, "or")}.`);
  blocks.push({ key: "fh", head: "Family history", text: fs.join(" ") });

  // Social history
  const sh = cat.data.social_history;
  const so = h.social;
  const s: string[] = [];
  const tob = labelOf(sh.tobacco.status, so.tobacco);
  if (so.tobacco === "never") s.push("never smoked");
  else if (tob) {
    const py = packYears(so.perDay, so.years);
    const quit = so.tobacco === "former" ? labelOf(sh.tobacco.quit_when, so.quitWhen) : undefined;
    s.push(
      `${lc(tob)} smoker${py !== null ? `, ${py} pack-years` : ""}${quit ? `, stopped ${lc(quit)}` : ""}`,
    );
  }
  const forms = (so.otherForms ?? [])
    .map((x) => labelOf(sh.tobacco.other_forms, x))
    .filter((x): x is string => !!x)
    .map(lc);
  if (forms.length) s.push(`uses ${list(forms)}`);
  if (so.alcohol === "none") s.push("no alcohol");
  else if (so.alcohol) {
    const drinks = (so.drinks ?? [])
      .map((x) => labelOf(sh.alcohol.types, x))
      .filter((x): x is string => !!x)
      .map(words);
    const cage = cageScore(so.cage, CAGE.items);
    const missing = cage.of - cage.asked;
    s.push(
      `drinks alcohol ${lc(labelOf(sh.alcohol.pattern, so.alcohol) ?? "")}${drinks.length ? ` (${list(drinks)})` : ""}${cage.asked ? `, CAGE ${cage.yes}/${cage.of}${missing ? ` (${missing} not asked)` : ""}` : ""}`,
    );
  }
  if (i.audience === "clinical" && so.substances?.length) {
    const subs = so.substances
      .map((x) => labelOf(sh.other_substances.options, x))
      .filter((x): x is string => !!x)
      .map(lc);
    if (subs.length)
      s.push(so.substances.includes("none") ? "no other substances" : `uses ${list(subs)}`);
  }
  const living = labelOf(sh.living, so.living);
  if (living) s.push(`lives ${lc(living)}`);
  const act = labelOf(sh.activity, so.activity);
  if (act) s.push(`activity: ${lc(act)}`);
  if (so.occupation?.trim()) s.push(`occupation: ${so.occupation.trim()}`);
  const travel = labelOf(sh.travel.options, so.travel);
  if (travel)
    s.push(`${lc(travel)}${so.travelDetail?.trim() ? ` (${so.travelDetail.trim()})` : ""}`);
  const diet = labelOf(sh.diet, so.diet);
  if (diet) s.push(`diet: ${lc(diet)}`);
  blocks.push({
    key: "social",
    head: "Social history",
    text: s.length ? `${cap(s.join("; "))}.` : "",
  });

  blocks.push({ key: "exam", head: "Examination", text: i.sectionText.exam ?? "" });
  blocks.push({ key: "summary", head: "Summary", text: i.sectionText.summary ?? "" });
  blocks.push({ key: "impression", head: "Impression", text: i.sectionText.impression ?? "" });
  blocks.push({ key: "plan", head: "Plan", text: i.sectionText.plan ?? "" });

  return blocks
    .map((b) =>
      i.edited[b.key] !== undefined
        ? { ...b, text: i.edited[b.key]!, edited: true }
        : { ...b, edited: false },
    )
    .filter((b) => b.text.trim());
}

/** Which note block the current section writes (highlighted in the note pane). */
export const SECTION_BLOCK: Record<string, BlockKey> = {
  complaint: "history",
  history: "history",
  systems: "systems",
  pmh: "pmh",
  fh: "fh",
  social: "social",
  exam: "exam",
  summary: "summary",
  impression: "impression",
  plan: "plan",
};

/** One condition's details (EC-2) by the catalogue's composer template: a clause whose property is
 *  unanswered is left out with its punctuation; nothing answered, nothing written. */
export function conditionDetails(
  cat: Catalogue,
  conditionId: string,
  details: Record<string, PropValue> | undefined,
): string | null {
  const def = cat.details(conditionId);
  if (!def || !details || !Object.keys(details).length) return null;
  const GAP = "\u0000";
  const text = def.composer.replace(/\{([a-z0-9_]+)\}/g, (_, id: string) => {
    const p = def.properties.find((q) => q.id === id);
    const v = details[id];
    if (!p || v === undefined) return GAP;
    const word = (x: string | number) => lc(labelOf(p.options, String(x)) ?? String(x));
    const words = Array.isArray(v) ? list(v.map(word)) : word(v);
    return `${p.phrase?.pre ?? ""}${words}${p.phrase?.post ?? ""}`;
  });
  const out = text
    .replace(/\s*\(\u0000\)/g, "")
    .replace(/[,;]\s*\u0000/g, "")
    .replace(/\u0000\s*[,;]\s*/g, "")
    .replace(/\s*\u0000/g, "")
    .replace(/\s+([,;.])/g, "$1")
    .replace(/\.$/, "")
    .trim();
  return out;
}
