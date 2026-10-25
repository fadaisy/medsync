/**
 * Pharmacy Phase 3: suspected reactions (AR-1 to AR-8). Pure: the report's patient identifiers, its due-by and its
 * printed fields. The report carries initials, age and sex and a MedSync reference; never a name, number, phone or
 * address (Law 10, D-PH3-24). Nothing here sends anything.
 */

export const KINDS = [
  "suspected_reaction",
  "lack_of_effect",
  "poor_quality",
  "medication_error",
  "suspected_counterfeit",
] as const;
export type Kind = (typeof KINDS)[number];

export const SERIOUSNESS = [
  "not_serious",
  "death",
  "life_threatening",
  "hospitalisation",
  "disability",
  "congenital",
  "other_important",
] as const;

/** AR-5: initials by a fixed rule — the first letter of each word, letters only, upper case. */
export const initials = (name: string | null): string =>
  (name ?? "")
    .split(/\s+/)
    .map((w) =>
      w
        .replace(/[^\p{L}]/gu, "")
        .charAt(0)
        .toUpperCase(),
    )
    .filter(Boolean)
    .join("") || "Not recorded";

/** AR-5: age in years, or in months under 2. */
export function ageWords(dateOfBirth: string | null, now: Date): string {
  if (!dateOfBirth) return "Not recorded";
  const dob = new Date(`${dateOfBirth}T00:00:00Z`);
  let months =
    (now.getUTCFullYear() - dob.getUTCFullYear()) * 12 + now.getUTCMonth() - dob.getUTCMonth();
  if (now.getUTCDate() < dob.getUTCDate()) months--;
  return months < 24 ? `${Math.max(0, months)} months` : `${Math.floor(months / 12)} years`;
}

/** AR-5a: a display from the signed timelines; null while they are unsigned. */
export function dueBy(
  recordedAt: Date,
  seriousness: readonly string[],
  timelines: { seriousHours: number; otherDays: number } | null,
): { at: Date; serious: boolean } | null {
  if (!timelines) return null;
  const serious = seriousness.some((s) => s !== "not_serious");
  const ms = serious ? timelines.seriousHours * 3_600_000 : timelines.otherDays * 86_400_000;
  return { at: new Date(recordedAt.getTime() + ms), serious };
}

export type ReportState = "to_submit" | "submitted" | "closed_not_submitted";

/** AR-6: the report's state from its events; nothing closes by itself (Law 11). */
export function stateOf(events: readonly { kind: string }[]): ReportState {
  if (events.some((e) => e.kind === "submitted")) return "submitted";
  if (events.some((e) => e.kind === "closed_not_submitted")) return "closed_not_submitted";
  return "to_submit";
}

export interface ReportInput {
  reference: string;
  kind: Kind;
  patient: { fullName: string | null; dateOfBirth: string | null; sex: string | null };
  medicines: { name: string; product: string | null; batch: string | null; main: boolean }[];
  reactionText: string;
  startedOn: string | null;
  seriousness: readonly string[];
  outcome: string;
  actionTaken: string;
  rechallenge: string;
  causality: string | null;
  reporter: { role: string; cadre: string | null } | null;
}

/**
 * AR-5: the report as ordered fields, sections A to F of the national form. A medication error never names staff.
 * The full name, number, phone and address are never passed out of this function.
 */
export function reportFields(
  r: ReportInput,
  now: Date,
): { section: string; label: string; value: string }[] {
  const meds = r.medicines.map(
    (m) =>
      `${m.main ? "Main suspect: " : ""}${m.name}${m.product ? `, ${m.product}` : ""}${m.batch ? `, batch ${m.batch}` : ""}`,
  );
  return [
    { section: "A", label: "Category", value: r.kind },
    { section: "B", label: "Patient initials", value: initials(r.patient.fullName) },
    { section: "B", label: "Age", value: ageWords(r.patient.dateOfBirth, now) },
    { section: "B", label: "Sex", value: r.patient.sex ?? "Not recorded" },
    { section: "B", label: "MedSync reference", value: r.reference },
    { section: "C", label: "Suspected medicines", value: meds.join("; ") || "Not known" },
    { section: "E", label: "Reaction", value: r.reactionText },
    { section: "E", label: "Started", value: r.startedOn ?? "Not recorded" },
    { section: "E", label: "Seriousness", value: r.seriousness.join(", ") },
    { section: "E", label: "Outcome", value: r.outcome },
    { section: "E", label: "Action taken", value: r.actionTaken },
    { section: "E", label: "Came back when given again", value: r.rechallenge },
    { section: "E", label: "Causality (WHO-UMC)", value: r.causality ?? "Not yet assessed" },
    {
      section: "F",
      label: "Reporter",
      value:
        r.kind === "medication_error"
          ? "Health facility"
          : (r.reporter?.cadre ?? r.reporter?.role ?? "Not recorded"),
    },
  ];
}

/** AR-5: the copied text, one line per field. */
export const reportText = (fields: ReturnType<typeof reportFields>) =>
  fields.map((f) => `${f.section}. ${f.label}: ${f.value}`).join("\n");
