/**
 * I1 capabilities and their default holders (§7 I1, ADR 0209). Mapped onto the repository's roles:
 * cadres and `hospital_admin` derive the NCD roles in SQL (`private.ncd_user_roles`); only the roles
 * the repository lacks (registry lead, head of department, auditor, clinical safety officer) are
 * assigned per facility in `ncd_staff_role`. Superadmin holds none of these.
 *
 * Two pseudo-roles are principals, not people: `system` (cron: snapshots, reminders) and
 * `demo_loader` (the demo data loader, valid only while its switching user holds demo_data_manage,
 * and only for synthetic persons).
 *
 * This map is seeded into `ncd_capability_grant` by migration 0093; a test asserts they are equal.
 */
export const CAPABILITIES = [
  "person_search",
  "enrol",
  "nurse_visit_write",
  "clinician_visit_write",
  "review_write",
  "event_write",
  "recall_work",
  "aggregate_view",
  "drill_down",
  "data_quality",
  "merge_request",
  "merge_approve",
  "code_list_manage",
  "report_sign",
  "report_view",
  "export_request",
  "export_approve",
  "aggregate_export",
  "audit_view",
  "condition_catalogue_manage",
  "demo_data_manage",
  "legacy_entry",
  "late_lab_results",
  "own_panel",
  "sms_template_approve",
  "identifier_reveal",
  "go_live_request",
  "clinical_safety_approve",
  "snapshot_compute",
  "reminder_dispatch",
  "demo_write",
  "ncd_role_assign",
] as const;
export type Capability = (typeof CAPABILITIES)[number];

export const NCD_ROLES = [
  "triage_nurse",
  "clinician",
  "registry_officer",
  "registry_lead",
  "head_of_department",
  "administrator",
  "auditor",
  "clinical_safety_officer",
] as const;
export type NcdRole = (typeof NCD_ROLES)[number];
export type Principal = "user" | "system" | "demo_loader";
export type GrantRole = NcdRole | "system" | "demo_loader";

/** Roles that are assigned explicitly (no repository equivalent). */
export const ASSIGNED_ROLES: readonly NcdRole[] = [
  "registry_lead",
  "head_of_department",
  "auditor",
  "clinical_safety_officer",
];

const CLINICIAN: Capability[] = [
  "person_search",
  "enrol",
  "nurse_visit_write",
  "clinician_visit_write",
  "review_write",
  "event_write",
  "drill_down",
  "own_panel",
  "identifier_reveal",
];

export const ROLE_CAPABILITIES: Readonly<Record<GrantRole, readonly Capability[]>> = {
  triage_nurse: ["person_search", "nurse_visit_write", "event_write", "identifier_reveal"],
  clinician: CLINICIAN,
  registry_officer: [
    "person_search",
    "enrol",
    "recall_work",
    "event_write",
    "legacy_entry",
    "late_lab_results",
    "merge_request",
    "export_request",
    "identifier_reveal",
  ],
  // D-15: the lead also gets aggregate_view and report_view, without which a report cannot be read to be signed.
  registry_lead: [
    ...CLINICIAN,
    "data_quality",
    "merge_approve",
    "code_list_manage",
    "report_sign",
    "report_view",
    "aggregate_view",
    "export_approve",
    "aggregate_export",
    "condition_catalogue_manage",
    "demo_data_manage",
    "legacy_entry",
    "late_lab_results",
    "sms_template_approve",
    "go_live_request",
  ],
  head_of_department: ["aggregate_view", "drill_down", "report_view", "export_request"],
  // D-16: the hospital administrator assigns the roles the repository lacks (never the CSO role).
  administrator: [
    "aggregate_view",
    "aggregate_export",
    "demo_data_manage",
    "report_view",
    "ncd_role_assign",
  ],
  auditor: ["audit_view"],
  clinical_safety_officer: ["clinical_safety_approve"],
  system: ["snapshot_compute", "reminder_dispatch"],
  demo_loader: ["demo_write", "snapshot_compute"],
};

export function capabilitiesOf(roles: readonly GrantRole[]): Set<Capability> {
  return new Set(roles.flatMap((r) => ROLE_CAPABILITIES[r] ?? []));
}

/** Rows for `ncd_capability_grant`, sorted, for the migration seed and its parity test. */
export function grantRows(): [GrantRole, Capability][] {
  return (Object.entries(ROLE_CAPABILITIES) as [GrantRole, readonly Capability[]][])
    .flatMap(([r, caps]) => [...new Set(caps)].map((c) => [r, c] as [GrantRole, Capability]))
    .sort((a, b) => (a[0] + a[1]).localeCompare(b[0] + b[1]));
}
