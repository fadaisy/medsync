/**
 * The patient's visit summary (ADR 0203): one pure composer from a closed visit's record to the copy the patient
 * reads, in the app and on paper. The server loader (lib/emr/read/visit-summary.ts) gathers the record; this file
 * decides what of it a patient sees and in which words. No DB, no clock, no PHI decryption.
 *
 * Order of safety:
 *   1. Restricted items are dropped first, before anything else looks at them (property-tested).
 *   2. The clinician's removals are applied by item id; they can only take away.
 *   3. Differentials, refuted and unconfirmed diagnoses never appear.
 *   4. No copy at all for a death, an administrative closure, an encounter entered in error, or an open visit.
 *
 * Words: every heading and outcome sentence below is a DRAFT for the CSO (Appendix A). Diagnoses keep their
 * clinical term (no lay names are signed); "come back if" is the clinician's own words only.
 */

export const VISIT_SUMMARY_VERSION = 1 as const;

/** DRAFT wording, not CSO-signed (rule 4). */
export const SUMMARY_HEADINGS = {
  found: "What we found",
  medicines: "Medicines to take",
  stopped: "Medicines to stop",
  tests: "Tests",
  next: "What happens next",
} as const;
export type SummarySection = keyof typeof SUMMARY_HEADINGS;

/** DRAFT: shown under the tests. */
export const TESTS_NOTE = "Results will be shared after your clinician reviews them.";
/** DRAFT: shown for an admission. */
export const WARD_NOTE = "Your care team on the ward will update you.";

export type SummaryOutcome =
  | { kind: "home" }
  /** `bed`: the label; null while waiting for one; undefined where beds aren't tracked on MedSync. */
  | { kind: "admitted"; ward: string; bed?: string | null }
  | { kind: "referred_out"; to: string | null }
  | { kind: "transferred"; to: string | null }
  | { kind: "left_before_completion" }
  | { kind: "left_against_advice" };

export interface SummaryInput {
  encounter: {
    state: string;
    closureKind: string | null;
    /** The stored disposition (`deceased` for a death). */
    disposition: string | null;
  };
  visit: {
    /** ISO instant the visit started. */
    startedAt: string;
    hospitalName: string;
    clinicianName: string | null;
    clinicianCadre: string | null;
  };
  outcome: SummaryOutcome | null;
  diagnoses: readonly {
    id: string;
    display: string;
    verification: string;
    rank: "primary" | "secondary";
    restricted: boolean;
  }[];
  /** This visit's prescriptions still to be taken (take home), as written. */
  medicines: readonly {
    id: string;
    name: string;
    dose: string;
    route: string;
    frequency: string | null;
    duration: string | null;
    instructions: string | null;
    restricted: boolean;
  }[];
  /** Prescriptions the clinician stopped at the close. */
  stopped: readonly { id: string; name: string; restricted: boolean }[];
  tests: readonly { id: string; display: string; restricted: boolean }[];
  /** The next visit in words ("Booked: Tue 14 Oct, 09:20, Medical OPD"), or null. */
  next: string | null;
  /** The clinician's own words. */
  comeBackIf: string | null;
}

export interface SummaryItem {
  /** `dx:<id>`, `rx:<id>`, `stop:<id>`, `test:<id>`: what a removal names. */
  id: string;
  text: string;
  detail: string | null;
}

export interface VisitSummaryContent {
  v: typeof VISIT_SUMMARY_VERSION;
  visit: {
    startedAt: string;
    hospitalName: string;
    clinician: string | null;
  };
  outcome: string;
  outcomeNote: string | null;
  sections: Record<Exclude<SummarySection, "next">, SummaryItem[]>;
  next: string | null;
  comeBackIf: string | null;
}

export type ComposeResult =
  | { ok: true; content: VisitSummaryContent; restrictedCount: number }
  | { ok: false; reason: "not_closed" | "died" | "administrative" | "entered_in_error" };

/** Why no copy can be made, in words for the clinician. */
export const NO_COPY_WORDS: Record<Exclude<ComposeResult, { ok: true }>["reason"], string> = {
  not_closed: "The visit is still open. Close it first.",
  died: "No patient copy is made after a death.",
  administrative: "No patient copy is made for a visit closed without completing.",
  entered_in_error: "No patient copy is made for an encounter entered in error.",
};

/** DRAFT outcome sentences. */
export function outcomeWords(o: SummaryOutcome | null): { text: string; note: string | null } {
  if (!o) return { text: "Your visit is complete.", note: null };
  switch (o.kind) {
    case "home":
      return { text: "You went home.", note: null };
    case "admitted":
      return {
        text: o.bed
          ? `You were admitted to ${o.ward}, bed ${o.bed}.`
          : o.bed === null
            ? `You were admitted to ${o.ward}. You are waiting for a bed.`
            : `You were admitted to ${o.ward}.`,
        note: WARD_NOTE,
      };
    case "referred_out":
      return { text: o.to ? `You were referred to ${o.to}.` : "You were referred on.", note: null };
    case "transferred":
      return {
        text: o.to ? `You were transferred to ${o.to}.` : "You were transferred.",
        note: null,
      };
    case "left_before_completion":
      return { text: "You left before the visit was finished.", note: null };
    case "left_against_advice":
      return { text: "You chose to leave before your care team advised it.", note: null };
  }
}

const SHOWN_VERIFICATION = new Set(["confirmed", "provisional"]);

function medicineDetail(m: SummaryInput["medicines"][number]): string {
  return [m.dose, m.route, m.frequency, m.duration ? `for ${m.duration}` : null, m.instructions]
    .filter((x): x is string => !!x && x.trim() !== "")
    .join(", ");
}

/** Compose the copy. Restricted items are counted and dropped before anything else. */
export function composeVisitSummary(input: SummaryInput): ComposeResult {
  const e = input.encounter;
  if (e.state === "entered_in_error") return { ok: false, reason: "entered_in_error" };
  if (e.state !== "completed") return { ok: false, reason: "not_closed" };
  if (e.closureKind === "administrative") return { ok: false, reason: "administrative" };
  if (e.disposition === "deceased") return { ok: false, reason: "died" };

  const restrictedCount =
    input.diagnoses.filter((d) => d.restricted).length +
    input.medicines.filter((m) => m.restricted).length +
    input.stopped.filter((m) => m.restricted).length +
    input.tests.filter((t) => t.restricted).length;
  const diagnoses = input.diagnoses.filter((d) => !d.restricted);
  const medicines = input.medicines.filter((m) => !m.restricted);
  const stopped = input.stopped.filter((m) => !m.restricted);
  const tests = input.tests.filter((t) => !t.restricted);

  const admitted = input.outcome?.kind === "admitted";
  const { text, note } = outcomeWords(input.outcome);
  const clinician = [input.visit.clinicianName, input.visit.clinicianCadre]
    .filter(Boolean)
    .join(", ");

  return {
    ok: true,
    restrictedCount,
    content: {
      v: VISIT_SUMMARY_VERSION,
      visit: {
        startedAt: input.visit.startedAt,
        hospitalName: input.visit.hospitalName,
        clinician: clinician || null,
      },
      outcome: text,
      outcomeNote: note,
      sections: {
        found: diagnoses
          .filter((d) => SHOWN_VERIFICATION.has(d.verification))
          .sort((a, b) => (a.rank === b.rank ? 0 : a.rank === "primary" ? -1 : 1))
          .map((d) => ({
            id: `dx:${d.id}`,
            text: d.display,
            // DRAFT: the clinician's working diagnosis, said as such.
            detail: d.verification === "provisional" ? "Not yet confirmed" : null,
          })),
        // An admitted patient's medicines are the ward's to give: no take-home list.
        medicines: admitted
          ? []
          : medicines.map((m) => ({
              id: `rx:${m.id}`,
              text: m.name,
              detail: medicineDetail(m) || null,
            })),
        stopped: stopped.map((m) => ({ id: `stop:${m.id}`, text: m.name, detail: null })),
        tests: tests.map((t) => ({ id: `test:${t.id}`, text: t.display, detail: null })),
      },
      next: input.next,
      comeBackIf: input.comeBackIf?.trim() || null,
    },
  };
}

/** Every item id a clinician may remove (the four lists; the visit and outcome stay). */
export function removableIds(c: VisitSummaryContent): string[] {
  return Object.values(c.sections).flatMap((items) => items.map((i) => i.id));
}

/** Apply the clinician's removals: it only takes items away; unknown ids are ignored. */
export function withRemovals(
  c: VisitSummaryContent,
  removed: ReadonlySet<string>,
): VisitSummaryContent {
  const keep = (items: SummaryItem[]) => items.filter((i) => !removed.has(i.id));
  return {
    ...c,
    sections: {
      found: keep(c.sections.found),
      medicines: keep(c.sections.medicines),
      stopped: keep(c.sections.stopped),
      tests: keep(c.sections.tests),
    },
  };
}

/** The prescription ids a patient may add to their tracker from a shared copy. */
export function takeHomePrescriptionIds(c: VisitSummaryContent): string[] {
  return c.sections.medicines.map((m) => m.id.slice("rx:".length));
}

/** Parse a stored (decrypted) copy; null when it isn't one this code can read. */
export function parseVisitSummary(json: string): VisitSummaryContent | null {
  try {
    const c = JSON.parse(json) as VisitSummaryContent;
    return c && c.v === VISIT_SUMMARY_VERSION && c.sections ? c : null;
  } catch {
    return null;
  }
}
