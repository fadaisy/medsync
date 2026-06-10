import "server-only";

/**
 * Feature registry for the doctor workspace shell.
 *
 * Same architecture as the hospital-admin FEATURE_AREAS: a single
 * registry that the sidebar + command palette read. Adding a feature
 * surface is a one-line entry here + a page under `app/doctor/<slug>`.
 *
 * `placeholder: true` while the surface is a routed empty-state.
 */

export type DoctorIconKey =
  | "overview"
  | "patients"
  | "alerts"
  | "care_team"
  | "schedule"
  | "encounters"
  | "tasks"
  | "supervisees"
  | "cosign_queue"
  | "triage"
  | "resus";

export type DoctorFeatureSlug =
  | ""
  | "patients"
  | "assigned"
  | "alerts"
  | "care-team"
  | "schedule"
  | "encounters"
  | "triage"
  | "resus"
  | "tasks"
  | "supervisees"
  | "cosign-queue";

export interface DoctorFeatureArea {
  slug: DoctorFeatureSlug;
  label: string;
  hint: string;
  iconKey: DoctorIconKey;
  placeholder: boolean;
  /** If set, the feature is only shown when the doctor matches.
   * 'senior' = MO+; 'consultant' = MOSG/Consultant/Senior Consultant. */
  visibleTo?: "all" | "senior" | "consultant";
}

export const DOCTOR_FEATURE_AREAS: ReadonlyArray<DoctorFeatureArea> = [
  {
    slug: "",
    label: "Overview",
    hint: "Today's panel, alerts, schedule at a glance",
    iconKey: "overview",
    placeholder: true,
    visibleTo: "all",
  },
  {
    slug: "patients",
    label: "Patients",
    hint: "Your patient panel — care-team, encounters, department",
    iconKey: "patients",
    placeholder: false,
    visibleTo: "all",
  },
  {
    slug: "assigned",
    label: "Assigned",
    hint: "Triaged patients assigned to you — start the encounter or reassign",
    iconKey: "encounters",
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
    hint: "Your day, availability, urgent items",
    iconKey: "schedule",
    placeholder: true,
    visibleTo: "all",
  },
  {
    slug: "encounters",
    label: "Encounters",
    hint: "Open + recent encounters; notes & orders entry",
    iconKey: "encounters",
    placeholder: false,
    visibleTo: "all",
  },
  {
    slug: "triage",
    label: "Triage",
    hint: "Assess + assign acuity for waiting patients (you may down-triage)",
    iconKey: "triage",
    placeholder: false,
    visibleTo: "all",
  },
  {
    slug: "resus",
    label: "Resus",
    hint: "The ABCDE resuscitation board — lead or join an active resus",
    iconKey: "resus",
    placeholder: false,
    visibleTo: "all",
  },
  {
    slug: "tasks",
    label: "Tasks",
    hint: "Notes to finish, co-signs to review, mentions",
    iconKey: "tasks",
    placeholder: true,
    visibleTo: "all",
  },
  {
    slug: "supervisees",
    label: "Supervisees",
    hint: "Interns / juniors under your supervision",
    iconKey: "supervisees",
    placeholder: true,
    visibleTo: "consultant",
  },
  {
    slug: "cosign-queue",
    label: "Review queue",
    hint: "Junior actions waiting for your co-sign",
    iconKey: "cosign_queue",
    placeholder: true,
    visibleTo: "senior",
  },
];

export function doctorFeaturePath(slug: DoctorFeatureSlug): string {
  return slug === "" ? "/doctor" : `/doctor/${slug}`;
}
