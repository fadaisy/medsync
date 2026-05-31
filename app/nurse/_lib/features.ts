import "server-only";

/**
 * Feature registry for the nurse workspace shell.
 *
 * Same architecture as the hospital-admin + doctor FEATURE_AREAS:
 * a single registry that the sidebar reads. Adding a feature surface
 * is a one-line entry here + a page under `app/nurse/<slug>`.
 *
 * `visibleTo` controls cadre/role gating:
 *   - 'all'           — every nurse sees this
 *   - 'registered+'   — REGISTERED grade or SPECIALIST (or SPECIALIST_NURSE cadre)
 *   - 'in_charge'     — current ward_in_charge_assignments holder
 */

export type NurseIconKey =
  | "overview"
  | "triage"
  | "patients"
  | "observations"
  | "mar"
  | "alerts"
  | "schedule"
  | "tasks"
  | "handover"
  | "assignment_board"
  | "supervisees"
  | "cosign_queue";

export type NurseFeatureSlug =
  | ""
  | "triage"
  | "patients"
  | "observations"
  | "mar"
  | "alerts"
  | "schedule"
  | "tasks"
  | "handover"
  | "assignments"
  | "supervisees"
  | "cosign-queue";

export interface NurseFeatureArea {
  slug: NurseFeatureSlug;
  label: string;
  hint: string;
  iconKey: NurseIconKey;
  placeholder: boolean;
  visibleTo?: "all" | "registered+" | "in_charge";
}

export const NURSE_FEATURE_AREAS: ReadonlyArray<NurseFeatureArea> = [
  {
    slug: "",
    label: "Overview",
    hint: "Today's panel + due meds + alerts at a glance",
    iconKey: "overview",
    placeholder: true,
    visibleTo: "all",
  },
  {
    slug: "triage",
    label: "Triage",
    hint: "Assess waiting patients + assign acuity",
    iconKey: "triage",
    placeholder: false,
    visibleTo: "all",
  },
  {
    slug: "patients",
    label: "Patients",
    hint: "Your assigned patients + ward census",
    iconKey: "patients",
    placeholder: false,
    visibleTo: "all",
  },
  {
    slug: "observations",
    label: "Record vitals",
    hint: "Log vitals/obs for an assigned patient",
    iconKey: "observations",
    placeholder: false,
    visibleTo: "all",
  },
  {
    slug: "mar",
    label: "Medications",
    hint: "Administer + document; 5-rights confirmation",
    iconKey: "mar",
    placeholder: false,
    visibleTo: "all",
  },
  {
    slug: "alerts",
    label: "Alerts",
    hint: "Monitoring breaches for your patients",
    iconKey: "alerts",
    placeholder: true,
    visibleTo: "all",
  },
  {
    slug: "schedule",
    label: "Schedule",
    hint: "Today's ward queue + appointments",
    iconKey: "schedule",
    placeholder: true,
    visibleTo: "all",
  },
  {
    slug: "tasks",
    label: "Tasks",
    hint: "Due obs, due meds, mentions, follow-ups",
    iconKey: "tasks",
    placeholder: true,
    visibleTo: "all",
  },
  {
    slug: "handover",
    label: "Handover",
    hint: "Submit + read shift handover",
    iconKey: "handover",
    placeholder: false,
    visibleTo: "all",
  },
  {
    slug: "assignments",
    label: "Assignments",
    hint: "Assign patients to nurses on shift",
    iconKey: "assignment_board",
    placeholder: false,
    visibleTo: "in_charge",
  },
  {
    slug: "supervisees",
    label: "Supervisees",
    hint: "Nurses under your supervision",
    iconKey: "supervisees",
    placeholder: true,
    visibleTo: "registered+",
  },
  {
    slug: "cosign-queue",
    label: "Review queue",
    hint: "Junior nurses' flagged actions",
    iconKey: "cosign_queue",
    placeholder: true,
    visibleTo: "registered+",
  },
];

export function nurseFeaturePath(slug: NurseFeatureSlug): string {
  return slug === "" ? "/nurse" : `/nurse/${slug}`;
}
