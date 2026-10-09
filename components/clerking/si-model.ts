import type { DxData } from "./use-catalogue";
import type {
  DeskBackground,
  DeskCauseRemoved,
  DeskPayload,
  DeskRelation,
  DeskRuledOut,
} from "@/components/emr/desk/model";
import type { History } from "@/lib/clerking/answers";
import type { Catalogue } from "@/lib/clerking/catalogue";
import type { ExamCatalogue } from "@/lib/clerking/exam/catalogue";
import type { ExamContext } from "@/lib/clerking/exam/context";
import type { AskRow } from "@/lib/clerking/impression/ask";
import type { Board, ImpressionDraft, RecordedDx } from "@/lib/clerking/impression/board";
import type { DxLive, DxSignoff } from "@/lib/clerking/impression/catalogue";
import type { Column } from "@/lib/clerking/impression/evidence";
import type { FindingRef, Viewer } from "@/lib/clerking/impression/facts";
import type { Known } from "@/lib/clerking/impression/relations";
import type { Stage } from "@/lib/clerking/impression/stages";
import type { Linked } from "@/lib/clerking/linkage";
import type { SummaryView } from "@/lib/clerking/summary/compose";
import type {
  Change,
  ReviewStatus,
  SummaryDraft,
  SummarySnapshot,
} from "@/lib/clerking/summary/review";
import type { NoteContent } from "@/lib/emr/note-rules";
import type { News2Result } from "@/lib/triage/types";

import { NO_VITALS } from "@/lib/clerking/exam/context";
import { emptyExam } from "@/lib/clerking/exam/payload";
import { asks } from "@/lib/clerking/impression/ask";
import { buildBoard, EMPTY_IMPRESSION } from "@/lib/clerking/impression/board";
import { dxLive } from "@/lib/clerking/impression/catalogue";
import { columns } from "@/lib/clerking/impression/evidence";
import { atomRef, canSee, CLINICAL_VIEWER, NO_CLASSES } from "@/lib/clerking/impression/facts";
import { toRecorded } from "@/lib/clerking/impression/recorded";
import { riskLinesOf } from "@/lib/clerking/impression/refine";
import { places } from "@/lib/clerking/impression/relations";
import { exposuresFrom } from "@/lib/clerking/impression/risk-line";
import { stageInputsFrom } from "@/lib/clerking/impression/stage-inputs";
import { stagesOf } from "@/lib/clerking/impression/stages";
import { composeSummary } from "@/lib/clerking/summary/compose";
import {
  diff,
  hashString,
  reviewStatus,
  snapshotOf,
  summaryText,
} from "@/lib/clerking/summary/review";

/**
 * Steps 08 and 09's pure view model (PROMPT-CLERKING-SUMMARY-IMPRESSION §5, §8): the drafts'
 * `summary` and `impression` sections, the visit's diagnoses as the board reads them, and the
 * composed summary with its review state. No React, no I/O.
 */

/* ─── Drafts ────────────────────────────────────────────────────── */

/** The summary section of the draft. An old draft's s12 narrative opens in "In my words" with the
 *  text (§8 "Old drafts"); nothing is migrated until the clinician edits. */
export function summaryDraftOf(c: NoteContent): SummaryDraft & { legacy?: boolean } {
  if (c.summary) return c.summary as unknown as SummaryDraft;
  const words = c.sections.s12?.narrative?.trim();
  if (words) return { mode: "words", words, legacy: true };
  return { mode: "composed" };
}

export function withSummary(
  c: NoteContent,
  s: SummaryDraft,
  catalogueVersion: string,
): NoteContent {
  const { legacy: _legacy, ...clean } = s as SummaryDraft & { legacy?: boolean };
  return {
    ...c,
    schema: 2,
    catalogueVersion,
    summary: clean as unknown as NoteContent["summary"],
  };
}

export function impressionDraftOf(c: NoteContent, catalogueVersion = ""): ImpressionDraft {
  const d = c.impression as Partial<ImpressionDraft> | undefined;
  return { ...EMPTY_IMPRESSION, catalogueVersion, ...d };
}

export function withImpression(
  c: NoteContent,
  d: ImpressionDraft,
  catalogueVersion: string,
): NoteContent {
  return {
    ...c,
    schema: 2,
    catalogueVersion,
    impression: d as unknown as NoteContent["impression"],
  };
}

/* ─── The visit's diagnoses ──────────────────────────────────────── */

/** The visit's diagnoses as the board reads them, each matched to its profile by term or by name. */
export const recordedOf = (p: DeskPayload, dx: DxData | null): RecordedDx[] =>
  toRecorded(p.diagnoses, dx);

/** The deferral in s13, if any (§5.3 "Deferral"). */
export function deferralOf(c: NoteContent): { reason: string } | null {
  const it = (c.sections.s13?.items ?? []).find((i) => i.kind === "diagnosis_deferred");
  const reason = (it as { reason?: string } | undefined)?.reason;
  return it ? { reason: reason ?? "" } : null;
}

/* ─── The encounter as the engines read it ───────────────────────── */

export interface SiInput {
  p: DeskPayload;
  content: NoteContent;
  cat: Catalogue;
  ecat: ExamCatalogue | null;
  history: History;
  linked: ReadonlyMap<string, Linked>;
  /** The examination context the exam step built (null for a previous-format draft). */
  examX: ExamContext | null;
  news2: News2Result | null;
  dx: DxData | null;
  /** The note is signed: its text is what was signed, never recomposed (D-SI-20). */
  signed: boolean;
}

export interface SiView {
  x: ExamContext;
  live: DxLive;
  viewer: Viewer;
  recorded: RecordedDx[];
  board: Board;
  /** The board's evidence columns (empty until the diagnosis catalogue has loaded). */
  cols: Column[];
  impression: ImpressionDraft;
  summaryDraft: SummaryDraft & { legacy?: boolean };
  summary: SummaryView;
  snapshot: SummarySnapshot;
  review: ReviewStatus;
  changes: Change[];
  /** "In my words" while the composed text has moved on since the words were started. */
  composedMoved: boolean;
  asks: AskRow[];
  /** The Summary block of the note. */
  noteText: string;
  /** Relations among the board and the background, the problem list, the cause links the system
   *  retired, and this visit's ruled-out diagnoses (0096, dx-relations Phase 3). */
  relations: DeskRelation[];
  background: DeskBackground[];
  causeRemoved: DeskCauseRemoved[];
  ruledOut: DeskRuledOut[];
}

const NONE_SIGNED: DxSignoff = {
  profiles: [],
  rules: [],
  referenceEntries: [],
  namedScales: [],
  withheld: [],
};

const ASK_PREFIX: Record<string, string> = {
  symptom: "sym",
  past_condition: "pmh",
  family_condition: "fh",
  medicine: "med",
  social: "soc",
  exam_item: "ex",
  vital: "vs",
  classifier: "cl",
  panel: "pn",
  past_detail: "pmh",
};

export function deriveSi(i: SiInput): SiView | null {
  const k = i.p.clerking!;
  const live = dxLive(k.dx?.signoff ?? NONE_SIGNED);
  const viewer = k.canSeeRestricted ? CLINICAL_VIEWER : NO_CLASSES;
  const base: ExamContext | null =
    i.examX ??
    (i.ecat
      ? {
          cat: i.ecat,
          history: { cat: i.cat, answers: i.history, linked: i.linked },
          exam: emptyExam(i.ecat.version),
          patient: {
            ageYears: k.ageYears,
            sex: k.sex,
            pregnant: k.exam.pregnant,
            pregnancySince: k.exam.pregnancySince ?? null,
          },
          settings: { outbreakMode: k.outbreakMode, encounterType: k.encounterType ?? null },
          medicines: k.medicines.map((m) => ({ name: m.name, adherence: m.adherence })),
          vitals: { ...NO_VITALS, ...k.exam.latest },
          ...(k.facts ? { facts: k.facts, now: new Date().toISOString() } : {}),
          news2Latest: i.news2,
        }
      : null);
  if (!base) return null;
  const dx = i.dx;
  const x: ExamContext = {
    ...base,
    dxRefs: dx ? { refValue: (id) => (live.ref(id) ? dx.cat.refValue(id) : undefined) } : undefined,
  };
  const recorded = recordedOf(i.p, dx);
  const impression = impressionDraftOf(i.content, dx?.cat.version ?? "");
  const board = buildBoard({
    diagnoses: recorded,
    draft: impression,
    dx: dx?.cat ?? null,
    live,
    viewer,
    deferred: deferralOf(i.content),
  });

  // What the board names (pertinent negatives) and marks (D-SI-25), from signed profiles only.
  const named = new Set<FindingRef>();
  const marked = new Set<FindingRef>();
  // Built once per change; step 09's view model reuses them.
  const cols = dx ? columns({ x, board, draft: impression, live, viewer }) : [];
  for (const col of cols) {
    for (const r of col.suggested.keys()) marked.add(r);
    for (const e of [
      ...(col.row.profile?.suggest_for ?? []),
      ...(col.row.profile?.suggest_against ?? []),
    ]) {
      const r = atomRef(e.atom);
      if (r) named.add(r);
    }
    for (const t of col.row.profile?.ask ?? [])
      named.add(
        t.kind === "red_flag"
          ? `sym:${t.symptom}#${t.red_flag}`
          : `${ASK_PREFIX[t.kind]}:${t.kind === "past_detail" ? t.id.replace(".", "#") : t.id}`,
      );
  }

  const summaryDraft = summaryDraftOf(i.content);
  const summary = composeSummary({
    x,
    allergies: {
      status: k.allergies.status,
      confirmedThisVisit: k.allergies.touchedThisVisit,
      items: k.allergies.items,
    },
    syndrome: summaryDraft.syndrome ?? "",
    include: summaryDraft.include ?? {},
    named,
    marked,
    audience: "clinical",
    viewer,
  });
  const snapshot = snapshotOf(summary, summaryDraft);
  const review = reviewStatus(summaryDraft, snapshot);
  const changes =
    review === "changed" && summaryDraft.review ? diff(summaryDraft.review.snapshot, snapshot) : [];
  const composedMoved =
    summaryDraft.mode === "words" &&
    !!summaryDraft.wordsBase &&
    summaryDraft.wordsBase !== hashString(summary.text);
  const signedText = (i.content.summary as { text?: string } | undefined)?.text;
  const noteText = i.signed
    ? (signedText ?? (summaryDraft.legacy ? (summaryDraft.words ?? "") : ""))
    : summaryText(summary, summaryDraft);
  return {
    x,
    live,
    viewer,
    recorded,
    board,
    cols,
    impression,
    summaryDraft,
    summary,
    snapshot,
    review,
    changes,
    composedMoved,
    asks: dx ? asks({ x, dx: dx.cat, board, viewer }) : [],
    noteText,
    relations: i.p.relations ?? [],
    background: i.p.background ?? [],
    causeRemoved: i.p.causeRemoved ?? [],
    ruledOut: i.p.ruledOut ?? [],
  };
}

/**
 * Refinement's derived parts (dx-relations Phase 4, ADR 0220), as the step shows them, the note
 * writes them and signing persists the stages: each diagnosis's severity stage from the record
 * (D-REL-14) and the risk-factor line of the leading and co-existing ones (D-REL-04).
 */
export function refinementOf(si: SiView, gestationWeeks: number | null, dx: DxData | null) {
  const pl = places(si.board, si.relations, si.background);
  const knownDx = (k: Known) => (k.termId ? (dx?.termIds[k.termId] ?? null) : null);
  return {
    pl,
    knownDx,
    stages: stagesOf(
      [...pl.cardOf.values()].map((c) => c.row),
      stageInputsFrom(si.x, { gestationWeeks }),
    ),
    risk: riskLinesOf({
      pl,
      edges: si.relations,
      known: si.background,
      knownDx,
      exposures: exposuresFrom(si.x.history.answers.social),
      classOf: (id) => dx?.cat.profile(id)?.restricted_class ?? null,
      canSee: (c) => canSee(si.viewer, c as Parameters<typeof canSee>[1]),
    }),
  };
}

/** The stages signing sends (D-REL-14): computed ones only; an insufficient stage is never written. */
export const signingStages = (stages: ReadonlyMap<string, Stage>) =>
  [...stages].flatMap(([logicalId, s]) =>
    "insufficient" in s
      ? []
      : [{ logicalId, scale: s.scale, code: s.code, words: s.words, source: s.source }],
  );
