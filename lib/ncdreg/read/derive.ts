/**
 * Per-person derivations the screens share (B2, B6, C3, E1, F4), over the same person record the
 * indicator engine reads. Pure: no condition code appears; module records drive everything.
 * Categories are shown as "category from latest result", never as a diagnosis.
 */
import type { DPerson, DVisit } from "../indicators/dataset";
import { personCareBand } from "../indicators/engine";
import { htnGrade, kdigoG, patientStatus, type CareBand, type PatientStatus } from "../standard/calculations";
import { CLASSIFICATIONS, CLASS_LABELS, RULE_CLASS_PHRASES } from "../standard/classifications";
import type { ConditionModule, ReviewComponent } from "../standard/types";

const addDays = (iso: string, n: number) => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const addMonths = (iso: string, n: number) => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + n);
  return d.toISOString().slice(0, 10);
};
export const daysBetween = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / 86_400_000);

const counted = (v: DVisit) => v.closed && !v.invalid;
export const closedVisits = (p: DPerson) => p.visits.filter(counted).sort((a, b) => a.date.localeCompare(b.date));

export function modulesOf(p: DPerson, catalogue: readonly ConditionModule[]) {
  return p.registrations
    .map((r) => ({ reg: r, module: catalogue.find((m) => m.code === r.condition) }))
    .filter((x): x is { reg: DPerson["registrations"][number]; module: ConditionModule } => !!x.module);
}

/** The pending appointment in force today, if any. */
export function currentAppointment(p: DPerson) {
  return [...p.appointments].filter((a) => a.status === "pending").sort((a, b) => a.createdDate.localeCompare(b.createdDate)).at(-1) ?? null;
}

export function statusOf(p: DPerson, today: string): PatientStatus {
  const first = p.registrations.map((r) => r.date).sort()[0] ?? today;
  const cur = currentAppointment(p);
  return patientStatus({
    asOf: today,
    firstRegistered: first,
    events: p.events,
    visitDates: closedVisits(p).map((v) => v.date),
    appointmentDates: cur ? [cur.date] : [],
  });
}

export const careBandOf = (p: DPerson, today: string): CareBand | null => personCareBand(p, today);

export function overdueDays(p: DPerson, today: string): number | null {
  const cur = currentAppointment(p);
  if (!cur || cur.date >= today) return null;
  if (closedVisits(p).some((v) => v.date >= cur.date)) return null;
  return daysBetween(cur.date, today);
}

export type ReviewDue = { component: ReviewComponent; last: string | null; dueOn: string; due: boolean; dueSoon: boolean };

/** B6 / C3: each component the person's modules list, due when never done or last done ≥ interval ago. */
export function reviewsDue(p: DPerson, catalogue: readonly ConditionModule[], today: string): ReviewDue[] {
  const intervals = new Map<ReviewComponent, number>();
  for (const { module: m } of modulesOf(p, catalogue))
    for (const c of m.review_components) intervals.set(c.component, Math.min(intervals.get(c.component) ?? 999, c.interval_months));
  const out: ReviewDue[] = [];
  for (const [component, months] of [...intervals].sort((a, b) => a[0].localeCompare(b[0]))) {
    const last =
      component === "hba1c"
        ? (p.visits.filter((v) => counted(v) && v.hba1c).map((v) => v.hba1c!.resultDate).sort().at(-1) ?? null)
        : (p.reviews.filter((r) => r.component === component).map((r) => r.date).sort().at(-1) ?? null);
    const dueOn = last ? addMonths(last, months) : today;
    out.push({ component, last, dueOn, due: !last || dueOn <= today, dueSoon: !!last && dueOn > today && dueOn <= addDays(today, 30) });
  }
  return out;
}

export const REVIEW_LABELS: Record<ReviewComponent, string> = {
  hba1c: "HbA1c",
  kidney: "Kidney",
  eyes: "Eyes",
  feet: "Feet",
  lipids: "Lipids",
};

/** B2: the last six visits, oldest first, with numbers always present in text. */
export function trajectory(p: DPerson, n = 6) {
  return closedVisits(p).slice(-n);
}

export function latestKidney(p: DPerson) {
  const k = p.reviews.filter((r) => r.component === "kidney" && r.derived.egfr != null).sort((a, b) => a.date.localeCompare(b.date)).at(-1);
  return k ? { date: k.date, egfr: Number(k.derived.egfr), g: (k.derived.kdigoG as string) ?? kdigoG(Number(k.derived.egfr)), a: (k.derived.kdigoA as string | undefined) ?? null } : null;
}

/** The class at one visit, for each rule module the person holds (E1 "At last visit", F4). */
export function classesAtVisit(p: DPerson, v: DVisit, catalogue: readonly ConditionModule[]) {
  const from = addDays(v.date, -90);
  const h = p.visits
    .filter((x) => counted(x) && x.hba1c && x.hba1c.resultDate >= from && x.hba1c.resultDate <= v.date)
    .map((x) => x.hba1c!)
    .sort((a, b) => a.resultDate.localeCompare(b.resultDate))
    .at(-1);
  return modulesOf(p, catalogue).map(({ reg, module: m }) => {
    if (m.outcome_classification.kind === "clinician_recorded") {
      const cls = v.recordedControl[reg.id] ?? "not_recorded";
      return { module: m, cls, leading: cls === "controlled", label: CLASS_LABELS[cls] ?? cls, clinicianRecorded: true };
    }
    const c = CLASSIFICATIONS[m.outcome_classification.classification]!;
    const cls = c.classify({ bp: v.bp, glucose: v.glucose, hba1cInWindow: h?.percent ?? null });
    const label = RULE_CLASS_PHRASES[c.id]?.[cls] ?? CLASS_LABELS[cls] ?? cls;
    return { module: m, cls, leading: cls === m.outcome_classification.in_range, label, clinicianRecorded: false };
  });
}

export function lastClasses(p: DPerson, catalogue: readonly ConditionModule[]) {
  const v = closedVisits(p).at(-1);
  return v ? classesAtVisit(p, v, catalogue) : [];
}

export const gradeFromLatest = (p: DPerson) => {
  const v = closedVisits(p).filter((x) => x.bp).at(-1);
  return v?.bp ? { grade: htnGrade(v.bp), bp: v.bp, date: v.date } : null;
};
