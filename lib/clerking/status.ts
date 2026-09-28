import type { History } from "./answers";
import type { Catalogue, PatientSex } from "./catalogue";
import type { Linked } from "./linkage";

import { rosSystemsFor } from "./catalogue";
import { rosAnswer } from "./linkage";

/**
 * Section and system statuses for the section bar (§5.1) and the review of systems (§5.5).
 * Pure; monotonic as answers are added.
 */

export const SECTIONS = [
  {
    id: "complaint",
    num: "01",
    short: "Complaint",
    title: "Presenting complaint",
    group: "history",
  },
  {
    id: "history",
    num: "02",
    short: "History",
    title: "History of presenting complaint",
    group: "history",
  },
  { id: "systems", num: "03", short: "Systems", title: "Review of systems", group: "history" },
  { id: "pmh", num: "04", short: "Past history", title: "Past medical history", group: "history" },
  { id: "fh", num: "05", short: "Family", title: "Family history", group: "history" },
  { id: "social", num: "06", short: "Social", title: "Social history", group: "history" },
  { id: "exam", num: "07", short: "Examination", title: "Examination", group: "plan" },
  { id: "summary", num: "08", short: "Summary", title: "Summary", group: "plan" },
  { id: "impression", num: "09", short: "Impression", title: "Impression", group: "plan" },
  { id: "plan", num: "10", short: "Plan", title: "Plan", group: "plan" },
] as const;
export type SectionId = (typeof SECTIONS)[number]["id"];

export type Tone = "done" | "required" | "partial" | "open";
export interface SectionStatus {
  text: string;
  tone: Tone;
}

export interface SystemStatus {
  id: string;
  yes: string[];
  no: number;
  open: number;
  text: string;
  tone: Tone;
}

export function systemStatuses(
  cat: Catalogue,
  h: History,
  linked: ReadonlyMap<string, Linked>,
  sex: PatientSex,
): SystemStatus[] {
  return rosSystemsFor(cat, sex).map((sys) => {
    const yes: string[] = [];
    let no = 0;
    let open = 0;
    for (const s of sys.items) {
      const a = rosAnswer(h, linked, s.id);
      if (a === "yes") yes.push(s.id);
      else if (a === "no") no += 1;
      else open += 1;
    }
    const text = yes.length
      ? `${yes.length} positive`
      : open === 0
        ? "Nothing to report"
        : no
          ? "Partly reviewed"
          : "Not reviewed";
    const tone: Tone = yes.length || open === 0 ? "done" : no ? "partial" : "open";
    return { id: sys.id, yes, no, open, text, tone };
  });
}

export interface StatusInput {
  cat: Catalogue;
  history: History;
  linked: ReadonlyMap<string, Linked>;
  sex: PatientSex;
  allergyConfirmedThisVisit: boolean;
  /** From the v1 section bodies inside the new shell. */
  exam: Tone;
  /** Required sign rules still unmet (validateForSigning). */
  missing: readonly string[];
}

export function sectionStatuses(i: StatusInput): Record<SectionId, SectionStatus> {
  const h = i.history;
  const sys = systemStatuses(i.cat, h, i.linked, i.sex);
  const pos = sys.reduce((n, s) => n + s.yes.length, 0);
  const todo = sys.filter((s) => s.tone === "open" || s.tone === "partial").length;
  const answered = sys.some((s) => s.yes.length || s.no);
  const rule = (id: string, done: string): SectionStatus =>
    i.missing.includes(id) ? { text: "Required", tone: "required" } : { text: done, tone: "done" };
  return {
    complaint: h.complaints.length
      ? { text: "Done", tone: "done" }
      : { text: "Required", tone: "required" },
    history:
      h.story?.trim() || Object.keys(h.alsoAsked).length
        ? { text: "Done", tone: "done" }
        : { text: "Open", tone: "open" },
    systems: !answered
      ? { text: "Not started", tone: "open" }
      : todo
        ? { text: `${pos} positive, ${todo} to do`, tone: "partial" }
        : { text: `${pos} positive`, tone: "done" },
    pmh: i.allergyConfirmedThisVisit
      ? { text: "Done", tone: "done" }
      : { text: "Confirm allergies", tone: "required" },
    fh: Object.keys(h.family).length
      ? { text: "Done", tone: "done" }
      : { text: "Open", tone: "open" },
    social:
      h.social.tobacco && h.social.alcohol
        ? { text: "Done", tone: "done" }
        : { text: "Open", tone: "open" },
    exam: {
      text: i.exam === "done" ? "Done" : i.exam === "partial" ? "Partly" : "Open",
      tone: i.exam,
    },
    summary: { text: "Auto", tone: "open" },
    impression: rule("req.impression", "Done"),
    plan: rule("req.plan", "Done"),
  };
}

export const doneCount = (s: Record<SectionId, SectionStatus>) =>
  Object.values(s).filter((x) => x.tone === "done").length;
