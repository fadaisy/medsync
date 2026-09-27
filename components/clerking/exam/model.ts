import type { DeskPayload } from "@/components/emr/desk/model";
import type { History } from "@/lib/clerking/answers";
import type { Catalogue } from "@/lib/clerking/catalogue";
import type { ExamCatalogue } from "@/lib/clerking/exam/catalogue";
import type { ClassifierResult, ExamSignoff } from "@/lib/clerking/exam/classifiers";
import type { ExamBlock, SavedSet } from "@/lib/clerking/exam/compose";
import type { ExamContext, VitalValues } from "@/lib/clerking/exam/context";
import type { ExamDraft } from "@/lib/clerking/exam/payload";
import type { Suggestion } from "@/lib/clerking/exam/suggest";
import type { ParsedVitals, VitalLine } from "@/lib/clerking/exam/vitals";
import type { Flag } from "@/lib/clerking/flags";
import type { Linked } from "@/lib/clerking/linkage";
import type { NoteContent } from "@/lib/emr/note-rules";
import type { News2Result } from "@/lib/triage/types";

import { appliesToSex } from "@/lib/clerking/exam/catalogue";
import { composeExam, examText } from "@/lib/clerking/exam/compose";
import { evaluateExamFlags } from "@/lib/clerking/exam/flags";
import { emptyExam } from "@/lib/clerking/exam/payload";
import { suggestions } from "@/lib/clerking/exam/suggest";
import { mergeVitals, news2Of, parseVitalsDraft } from "@/lib/clerking/exam/vitals";
import { scoreNews2 } from "@/lib/triage/scoring/news2";

/**
 * What the examination step derives from the draft, in one pure pass (PROMPT-CLERKING-EXAM-V2):
 * the context the engines read, classifier results, flags, suggestions, the note paragraph, the
 * vitals draft as numbers with its NEWS2, and each system's status. The desk and the step share it.
 */

export const VITALS = "vitals";

export interface SystemStatus {
  findings: number;
  nothing: number;
  notExamined: number;
  /** "Not examined", "2 findings", "Nothing found", "Not examined: declined", "Suggested". */
  line: string;
  tone: "open" | "partial" | "done";
  suggested: boolean;
  locked: boolean;
}

export interface ExamView {
  ecat: ExamCatalogue;
  exam: ExamDraft;
  x: ExamContext;
  results: ReadonlyMap<string, ClassifierResult>;
  flags: Flag[];
  suggestions: Suggestion[];
  blocks: ExamBlock[];
  text: string;
  parsed: ParsedVitals;
  news2Draft: News2Result;
  news2Latest: News2Result | null;
  saved: SavedSet;
  systems: Record<string, SystemStatus>;
  gateOpen: boolean;
  hasContent: boolean;
}

/** The draft's examination, or an empty one (never stored until the clinician answers). */
export function examOf(c: NoteContent, version: string): ExamDraft {
  return (c.exam as unknown as ExamDraft | undefined) ?? emptyExam(version);
}

export function withExam(c: NoteContent, exam: ExamDraft, catalogueVersion: string): NoteContent {
  return {
    ...c,
    schema: 2,
    catalogueVersion: c.catalogueVersion ?? catalogueVersion,
    exam: exam as unknown as NoteContent["exam"],
  };
}

/** A v2 draft whose Examination was written in the old format (v1's s11) and not yet continued. */
export function previousFormat(c: NoteContent): boolean {
  if (c.exam) return false;
  const s = c.sections.s11;
  return (
    !!s &&
    (!!s.narrative?.trim() ||
      !!s.items?.length ||
      Object.values(s.fields ?? {}).some((v) => !!v?.trim()))
  );
}

export const gateOpen = (d: ExamDraft) =>
  !!d.gate?.reason &&
  !!d.gate.consent &&
  !!d.gate.chaperone &&
  (d.gate.chaperone !== "present" || !!d.gate.name?.trim());

function systemStatus(
  v: Omit<ExamView, "systems">,
  systemId: string,
  sex: "female" | "male" | null,
): SystemStatus {
  const d = v.exam;
  const system = v.ecat.system(systemId)!;
  const suggested = v.suggestions.some(
    (s) =>
      !s.done &&
      (s.target === `ex.${systemId}` ||
        s.target.startsWith(`ex.${systemId}.`) ||
        s.target.startsWith(`ex.${systemId}/`)),
  );
  const locked = !!system.gate && !gateOpen(d);
  const n = d.systems?.[systemId]?.notExamined;
  const reasonLabel = (id: string) =>
    v.ecat.data.not_examined.reasons.find((r) => r.id === id)?.label.toLowerCase() ?? id;
  if (n)
    return {
      findings: 0,
      nothing: 0,
      notExamined: 1,
      line: `Not examined: ${reasonLabel(n.id)}`,
      tone: "done",
      suggested: false,
      locked,
    };
  let findings = 0;
  let nothing = 0;
  let notExamined = 0;
  let open = 0;
  for (const it of v.ecat.itemsOf(systemId)) {
    if (it.response.type === "link" || !appliesToSex(it, sex)) continue;
    const e = d.entries[it.id];
    if (!e) open++;
    else if (e.state === "positive") findings++;
    else if (e.state === "negative") nothing++;
    else notExamined++;
  }
  // Blocks count as findings when anything in them departs from normal, else as nothing found.
  const block = (abnormal: boolean) => {
    if (abnormal) findings++;
    else nothing++;
  };
  const c = d.blocks.consciousness;
  // A complete GCS or a chosen ACVPU counts; a half-entered GCS is not yet either.
  const total = v.results.get("gcs_total")?.value;
  const cons = !c
    ? null
    : c.acvpu
      ? c.acvpu !== "A"
      : typeof total === "number"
        ? total !== 15
        : null;
  if (systemId === "general" && cons !== null) block(cons);
  const grid = [...Object.values(d.blocks.power ?? {}), ...Object.values(d.blocks.reflexes ?? {})];
  if (systemId === "nervous" && grid.length)
    block(
      grid.some(
        (x) =>
          (x.R !== undefined && x.R !== "5" && x.R !== 2) ||
          (x.L !== undefined && x.L !== "5" && x.L !== 2),
      ),
    );
  const pulses = Object.values(d.blocks.pulses ?? {});
  if (systemId === "cardiovascular" && pulses.length)
    block(pulses.some((x) => (x.R && x.R !== "present") || (x.L && x.L !== "present")));
  const parts: string[] = [];
  if (findings) parts.push(`${findings} finding${findings === 1 ? "" : "s"}`);
  if (nothing) parts.push(findings ? `${nothing} nothing found` : "Nothing found");
  if (notExamined) parts.push(`${notExamined} not examined`);
  const line =
    locked && !findings && !nothing
      ? "Needs consent and chaperone"
      : parts.length
        ? parts.join(" · ")
        : suggested
          ? "Suggested"
          : "Not examined";
  const recorded = findings + nothing + notExamined;
  return {
    findings,
    nothing,
    notExamined,
    line,
    tone: !recorded ? "open" : open ? "partial" : "done",
    suggested,
    locked,
  };
}

export interface DeriveExamInput {
  ecat: ExamCatalogue;
  cat: Catalogue;
  p: DeskPayload;
  content: NoteContent;
  history: History;
  linked: ReadonlyMap<string, Linked>;
  /** "23:00" for the latest set's time in reasons. */
  timeOf?: (iso: string) => string;
}

export function deriveExam(i: DeriveExamInput): ExamView {
  const { ecat, cat, p } = i;
  const k = p.clerking!;
  const exam = examOf(i.content, ecat.version);
  const parsed = parseVitalsDraft(ecat, exam.vitalsDraft);
  const latest: VitalValues = k.exam.latest;
  const values = mergeVitals(latest, parsed.values);
  const news2Latest = k.vitalsAt ? scoreNews2(k.vitals) : null;
  const x0: ExamContext = {
    cat: ecat,
    history: { cat, answers: i.history, linked: i.linked },
    exam,
    patient: { ageYears: k.ageYears, sex: k.sex, pregnant: k.exam.pregnant },
    settings: { outbreakMode: k.outbreakMode },
    medicines: k.medicines.map((m) => ({ name: m.name })),
    vitals: values,
    news2Latest,
    latestSetTime: k.vitalsAt && i.timeOf ? i.timeOf(k.vitalsAt) : null,
  };
  const { flags, results } = evaluateExamFlags(x0, k.exam.signoff as ExamSignoff);
  const x: ExamContext = { ...x0, results };
  const set = k.exam.set;
  const saved: SavedSet = {
    values: latest,
    arm: set?.arm,
    position: set?.position,
    rhythm: set?.rhythm,
    site: set?.site,
    glucoseContext: set?.glucoseContext,
    oxygen: set?.oxygen ?? null,
    oxygenModality: set?.oxygenModality,
    news2: news2Latest,
    confirmed: set?.confirmed ?? [],
  };
  const blocks = composeExam({ x, results, saved, audience: "clinician" });
  const base = {
    ecat,
    exam,
    x,
    results,
    flags,
    suggestions: suggestions(x),
    blocks,
    text: examText(blocks),
    parsed,
    news2Draft: news2Of(values, exam),
    news2Latest,
    saved,
    gateOpen: gateOpen(exam),
    hasContent:
      Object.keys(exam.entries).length > 0 ||
      Object.keys(exam.blocks).length > 0 ||
      !!exam.systems ||
      !!exam.vitalsSavedAt,
  };
  const systems: Record<string, SystemStatus> = {};
  for (const s of ecat.systems) systems[s.id] = systemStatus(base, s.id, k.sex);
  return { ...base, systems };
}

/** The handler the desk passes for "Save as a new set" (one batch through recordObservations). */
export type SaveSet = (lines: VitalLine[], readingSetId: string) => Promise<boolean>;
