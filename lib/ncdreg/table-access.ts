/**
 * Row-level access for every NCD table (§8.1 layer 2), as data. Migration 0093's policy block is
 * generated from this (`npm run ncdreg:policies`); tests/ncdreg-db/access-probes.test.ts derives each
 * probe's expected allow/deny from the same map and the I1 role → capability map.
 *
 * `delete: "synthetic"` lets the demo loader principal (turning demo data off, or removing every
 * synthetic record) delete rows whose person is synthetic; no human role deletes anything. Every
 * policy also confines the demo loader to synthetic persons' rows, for reads as well as writes.
 */
import type { Capability } from "./capabilities";

export type TableAccess = {
  select: readonly Capability[] | "any";
  insert: readonly Capability[] | "any" | "none";
  update: readonly Capability[] | "none";
  delete: "synthetic" | "none";
  /** How a row reaches its person: `person_id`, the row itself (`self`) or none. */
  person: "person_id" | "self" | "none";
};

const PERSON_READ: Capability[] = [
  "person_search",
  "recall_work",
  "data_quality",
  "merge_request",
  "merge_approve",
  "legacy_entry",
  "late_lab_results",
  "own_panel",
  "export_approve",
  "reminder_dispatch",
  "demo_write",
];
const VISIT_WRITE: Capability[] = [
  "nurse_visit_write",
  "clinician_visit_write",
  "legacy_entry",
  "demo_write",
];
const ANY_WRITE: Capability[] = [
  "enrol",
  "nurse_visit_write",
  "clinician_visit_write",
  "review_write",
  "event_write",
  "recall_work",
  "legacy_entry",
  "late_lab_results",
  "data_quality",
  "merge_request",
  "merge_approve",
  "reminder_dispatch",
  "demo_write",
];

export const TABLE_ACCESS: Readonly<Record<string, TableAccess>> = {
  ncd_facility_settings: {
    select: "any",
    insert: ["code_list_manage", "condition_catalogue_manage", "demo_write"],
    update: ["code_list_manage", "condition_catalogue_manage", "demo_write"],
    delete: "none",
    person: "none",
  },
  ncd_condition_setting: {
    select: "any",
    insert: ["condition_catalogue_manage", "demo_data_manage", "demo_write"],
    update: "none",
    delete: "none",
    person: "none",
  },
  ncd_staff_role: {
    select: "any",
    insert: ["ncd_role_assign"],
    update: ["ncd_role_assign"],
    delete: "none",
    person: "none",
  },
  ncd_person: {
    select: PERSON_READ,
    insert: ["enrol", "legacy_entry", "demo_write"],
    update: ["enrol", "recall_work", "data_quality", "merge_approve", "event_write", "demo_write"],
    delete: "synthetic",
    person: "self",
  },
  ncd_name_index: {
    select: PERSON_READ,
    insert: ["enrol", "legacy_entry", "data_quality", "demo_write"],
    update: ["merge_approve"],
    delete: "synthetic",
    person: "person_id",
  },
  ncd_registration: {
    select: PERSON_READ,
    insert: ["enrol", "legacy_entry", "demo_write"],
    update: ["enrol", "data_quality", "merge_approve", "demo_write"],
    delete: "synthetic",
    person: "person_id",
  },
  ncd_visit: {
    select: PERSON_READ,
    insert: VISIT_WRITE,
    update: [...VISIT_WRITE, "late_lab_results", "data_quality", "merge_approve"],
    delete: "synthetic",
    person: "person_id",
  },
  ncd_observation: {
    select: PERSON_READ,
    insert: VISIT_WRITE,
    update: [...VISIT_WRITE, "merge_approve"],
    delete: "synthetic",
    person: "person_id",
  },
  ncd_review: {
    select: PERSON_READ,
    insert: ["review_write", "legacy_entry", "demo_write"],
    update: ["review_write", "data_quality", "merge_approve", "demo_write"],
    delete: "synthetic",
    person: "person_id",
  },
  ncd_event: {
    select: PERSON_READ,
    insert: ["event_write", "demo_write"],
    update: ["event_write", "data_quality", "merge_approve", "demo_write"],
    delete: "synthetic",
    person: "person_id",
  },
  ncd_appointment: {
    select: PERSON_READ,
    insert: [...VISIT_WRITE, "recall_work"],
    update: [...VISIT_WRITE, "recall_work", "event_write", "merge_approve", "reminder_dispatch"],
    delete: "synthetic",
    person: "person_id",
  },
  ncd_reminder: {
    select: [...PERSON_READ, "audit_view"],
    insert: [...VISIT_WRITE, "recall_work"],
    update: [...VISIT_WRITE, "recall_work", "event_write", "merge_approve", "reminder_dispatch"],
    delete: "synthetic",
    person: "person_id",
  },
  ncd_call: {
    select: PERSON_READ,
    insert: ["recall_work", "demo_write"],
    update: ["merge_approve", "demo_write"],
    delete: "synthetic",
    person: "person_id",
  },
  ncd_sms_log: {
    select: ["recall_work", "data_quality", "audit_view", "reminder_dispatch", "demo_write"],
    insert: ["reminder_dispatch"],
    update: ["merge_approve"],
    delete: "synthetic",
    person: "person_id",
  },
  ncd_sms_template: {
    select: "any",
    insert: ["code_list_manage", "demo_write"],
    update: ["code_list_manage", "sms_template_approve"],
    delete: "none",
    person: "none",
  },
  ncd_query: {
    select: ["data_quality", "audit_view", "demo_write"],
    insert: ANY_WRITE,
    update: ["data_quality", "merge_approve", "demo_write"],
    delete: "synthetic",
    person: "person_id",
  },
  ncd_audit_sample: {
    select: ["data_quality", "audit_view", "demo_write"],
    insert: ["data_quality"],
    update: ["data_quality", "merge_approve"],
    delete: "synthetic",
    person: "person_id",
  },
  ncd_merge_request: {
    select: ["data_quality", "merge_request", "merge_approve", "audit_view", "demo_write"],
    insert: ["merge_request", "merge_approve"],
    update: ["merge_approve"],
    delete: "synthetic",
    person: "person_id",
  },
  ncd_record_version: {
    select: ["data_quality", "audit_view", "drill_down", "demo_write"],
    insert: ANY_WRITE,
    update: "none",
    delete: "synthetic",
    person: "person_id",
  },
  ncd_command_log: {
    select: [...ANY_WRITE, "audit_view"],
    insert: ANY_WRITE,
    update: "none",
    delete: "synthetic",
    person: "person_id",
  },
  ncd_indicator_snapshot: {
    select: [
      "aggregate_view",
      "report_view",
      "report_sign",
      "drill_down",
      "snapshot_compute",
      "demo_write",
    ],
    insert: ["snapshot_compute"],
    update: ["report_sign", "snapshot_compute"],
    delete: "synthetic",
    person: "self",
  },
  ncd_demo_load: {
    select: "any",
    insert: ["demo_data_manage"],
    update: ["demo_data_manage", "demo_write"],
    delete: "none",
    person: "none",
  },
  ncd_go_live_request: {
    select: "any",
    insert: ["go_live_request"],
    update: ["clinical_safety_approve"],
    delete: "none",
    person: "none",
  },
  ncd_export_request: {
    select: ["export_request", "export_approve", "aggregate_export", "audit_view"],
    insert: ["export_request", "aggregate_export", "export_approve"],
    update: ["export_approve"],
    delete: "none",
    person: "none",
  },
  ncd_definition_version: {
    select: "any",
    insert: ["code_list_manage"],
    update: ["code_list_manage"],
    delete: "none",
    person: "none",
  },
  ncd_access_event: {
    select: ["audit_view"],
    insert: "any",
    update: "none",
    delete: "none",
    person: "none",
  },
};

/** Tables the analytics role reads (identifier columns are not granted to it at all). */
export const ANALYTICS_TABLES = [
  "ncd_facility_settings",
  "ncd_condition_setting",
  "ncd_person",
  "ncd_registration",
  "ncd_visit",
  "ncd_observation",
  "ncd_review",
  "ncd_event",
  "ncd_appointment",
  "ncd_call",
  "ncd_demo_load",
  "ncd_go_live_request",
  "ncd_indicator_snapshot",
] as const;
export const ANALYTICS_CAPS: readonly Capability[] = [
  "aggregate_view",
  "report_view",
  "report_sign",
  "drill_down",
  "own_panel",
  "person_search",
  "recall_work",
  "data_quality",
  "snapshot_compute",
  "demo_write",
  "aggregate_export",
  "export_approve",
];

const arr = (caps: readonly string[]) => `'{${[...new Set(caps)].join(",")}}'::text[]`;

/** The policy SQL for one table (§8.1); identical output every run. */
export function policySql(table: string, a: TableAccess): string {
  const fac = "facility_id = (SELECT private.current_hospital_id())";
  const can = (caps: readonly string[] | "any") =>
    caps === "any"
      ? "(SELECT private.ncd_has_any_capability())"
      : `(SELECT private.ncd_can_any(${arr(caps)}))`;
  const synth =
    a.person === "self"
      ? " AND private.ncd_synthetic_ok(is_synthetic)"
      : a.person === "person_id"
        ? " AND private.ncd_synthetic_ok(private.ncd_person_synthetic(person_id))"
        : "";
  const out = [
    `ALTER TABLE public.${table} ENABLE ROW LEVEL SECURITY;`,
    `ALTER TABLE public.${table} FORCE ROW LEVEL SECURITY;`,
    `DROP POLICY IF EXISTS ${table}_select ON public.${table};`,
    `CREATE POLICY ${table}_select ON public.${table} FOR SELECT TO medsync_ncd_app USING (${fac} AND ${can(a.select)}${synth});`,
  ];
  const grants = ["SELECT"];
  if (a.insert !== "none") {
    grants.push("INSERT");
    out.push(
      `DROP POLICY IF EXISTS ${table}_insert ON public.${table};`,
      `CREATE POLICY ${table}_insert ON public.${table} FOR INSERT TO medsync_ncd_app WITH CHECK (${fac} AND ${can(a.insert)}${synth});`,
    );
  }
  if (a.update !== "none") {
    grants.push("UPDATE");
    out.push(
      `DROP POLICY IF EXISTS ${table}_update ON public.${table};`,
      `CREATE POLICY ${table}_update ON public.${table} FOR UPDATE TO medsync_ncd_app USING (${fac} AND ${can(a.update)}${synth}) WITH CHECK (${fac} AND ${can(a.update)}${synth});`,
    );
  }
  if (a.delete === "synthetic") {
    grants.push("DELETE");
    const self = a.person === "self" ? "is_synthetic" : "private.ncd_person_synthetic(person_id)";
    out.push(
      `DROP POLICY IF EXISTS ${table}_delete ON public.${table};`,
      `CREATE POLICY ${table}_delete ON public.${table} FOR DELETE TO medsync_ncd_app USING (${fac} AND ${self} AND (SELECT private.ncd_can_any('{demo_write}'::text[])));`,
    );
  }
  out.push(`GRANT ${grants.join(", ")} ON public.${table} TO medsync_ncd_app;`);
  if ((ANALYTICS_TABLES as readonly string[]).includes(table)) {
    out.push(
      `DROP POLICY IF EXISTS ${table}_analytics ON public.${table};`,
      `CREATE POLICY ${table}_analytics ON public.${table} FOR SELECT TO medsync_ncd_analytics USING (${fac} AND (SELECT private.ncd_can_any(${arr(ANALYTICS_CAPS)})));`,
    );
  }
  return out.join("\n");
}

export function allPolicySql(): string {
  return Object.entries(TABLE_ACCESS)
    .map(([t, a]) => `-- ${t}\n${policySql(t, a)}`)
    .join("\n\n");
}
