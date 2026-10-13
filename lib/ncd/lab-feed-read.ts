import "server-only";

import type { FeedResult, FieldValue } from "./lab-feed";
import type { Payload, SignedConfig } from "@/lib/lab/signed-config";
import { and, desc, eq, inArray, sql } from "drizzle-orm";

import V16 from "@/data/emr/clinical-fact-concepts.v1.6.json";
import { db } from "@/db";
import {
  clinicalObservations,
  diagnosticReports,
  labResultSnapshots,
  labSignedConfigs,
  ncdPerson,
  ncdVisit,
} from "@/db/schema";
import { conceptDef } from "@/lib/facts/project/shared";
import { loadConfigs, OTHER_UNITS } from "@/lib/lab/catalogue-v2";
import { inForce } from "@/lib/lab/signed-config";
import { latestForField } from "./lab-feed";

/**
 * The NCD visit's lab fields as a read model (Lab Phase 2 §6.14, NF-1..NF-5; E-LAB2-06). One read of the
 * person's released lab results at this facility, then each signed field mapping picks its value with
 * `latestForField`. Nothing is copied: the visit keeps a reference (`lab_refs`), and an amended result simply
 * becomes the newest current one (NF-3). Restricted results and lab-only rows never reach it.
 */

/** The registry fields the feed can fill. Labels only; every mapping value is the registry lead's, signed. */
export const FEED_FIELDS = {
  hba1c: { label: "HbA1c", suggestedConcept: "obs.hba1c" },
  glucose_fasting: { label: "Fasting glucose", suggestedConcept: "obs.glucose_fasting" },
  egfr: { label: "eGFR", suggestedConcept: "obs.egfr" },
  uacr: { label: "Urine albumin-to-creatinine ratio", suggestedConcept: "obs.uacr" },
  chol_total: { label: "Total cholesterol", suggestedConcept: "obs.chol_total" },
  chol_ldl: { label: "LDL cholesterol", suggestedConcept: "obs.chol_ldl" },
} as const;
export type FeedField = keyof typeof FEED_FIELDS;

export interface FeedView {
  mappings: Partial<
    Record<FeedField, { config: SignedConfig<"ncd_mapping">; payload: Payload<"ncd_mapping"> }>
  >;
  fields: Partial<Record<FeedField, FieldValue>>;
  linked: boolean;
}

export async function labFeedFor(
  facilityId: string,
  personId: string,
  at: Date,
  database: Pick<typeof db, "transaction"> = db,
): Promise<FeedView> {
  return database.transaction(async (tx) => {
    const configs = await loadConfigs(tx as never, facilityId);
    const mappings: FeedView["mappings"] = {};
    for (const f of Object.keys(FEED_FIELDS) as FeedField[]) {
      const c = inForce(configs, "ncd_mapping", f, at);
      if (c) mappings[f] = { config: c, payload: c.payload };
    }
    const [person] = await tx
      .select({ patientUserId: ncdPerson.patientUserId })
      .from(ncdPerson)
      .where(and(eq(ncdPerson.id, personId), eq(ncdPerson.facilityId, facilityId)));
    const patientUserId = person?.patientUserId ?? null;
    const concepts = [...new Set(Object.values(mappings).map((m) => m!.payload.concept))];
    const rows =
      patientUserId && concepts.length
        ? await tx
            .select({
              observationId: clinicalObservations.id,
              conceptId: clinicalObservations.conceptId,
              valueNum: clinicalObservations.valueNum,
              valueUnit: clinicalObservations.valueUnit,
              reportId: diagnosticReports.id,
              version: diagnosticReports.version,
              status: diagnosticReports.status,
              sensitivity: diagnosticReports.sensitivity,
              deviceId: diagnosticReports.deviceId,
              issuedAt: diagnosticReports.issuedAt,
              superseded: sql<boolean>`EXISTS (SELECT 1 FROM diagnostic_reports n WHERE n.supersedes_id = ${diagnosticReports.id})`,
              labOnly: labResultSnapshots.labOnly,
            })
            .from(clinicalObservations)
            .innerJoin(diagnosticReports, eq(diagnosticReports.id, clinicalObservations.reportId))
            .leftJoin(
              labResultSnapshots,
              eq(labResultSnapshots.observationId, clinicalObservations.id),
            )
            .where(
              and(
                eq(clinicalObservations.patientUserId, patientUserId),
                eq(diagnosticReports.hospitalId, facilityId),
                inArray(clinicalObservations.conceptId, concepts),
              ),
            )
        : [];
    const results: FeedResult[] = rows
      .filter((r) => r.valueNum !== null && r.conceptId)
      .map((r) => ({
        reportId: r.reportId,
        version: r.version,
        observationId: r.observationId,
        conceptId: r.conceptId!,
        value: String(r.valueNum),
        unit: r.valueUnit ?? "",
        method: r.deviceId ? "bedside" : "lab",
        released: ["final", "amended", "corrected"].includes(r.status),
        superseded: !!r.superseded,
        restricted: r.sensitivity === "restricted",
        labOnly: !!r.labOnly,
        releasedAt: r.issuedAt,
        amended: r.status === "amended" || r.status === "corrected",
      }));
    const fields: FeedView["fields"] = {};
    for (const [f, m] of Object.entries(mappings) as [
      FeedField,
      NonNullable<FeedView["mappings"][FeedField]>,
    ][])
      fields[f] = latestForField(m.payload, results, at);
    return { mappings, fields, linked: !!patientUserId };
  });
}

/** NF-4: the visit keeps which result it showed (report, version, observation), never the number. */
export async function saveLabRefs(facilityId: string, visitId: string, view: FeedView) {
  const refs = Object.fromEntries(
    Object.entries(view.fields).flatMap(([f, v]) =>
      v?.kind === "filled"
        ? [
            [
              f,
              {
                reportId: v.result.reportId,
                version: v.result.version,
                observationId: v.result.observationId,
              },
            ],
          ]
        : [],
    ),
  );
  await db
    .update(ncdVisit)
    .set({ labRefs: refs })
    .where(and(eq(ncdVisit.id, visitId), eq(ncdVisit.facilityId, facilityId)));
  return refs;
}

/** NF-7: an outside result as the clinician typed it, with its plain-factor conversion. */
export interface OutsideResult {
  field: FeedField;
  value: number;
  unit: string;
  date: string;
  laboratory: string;
  canonical: number;
  canonicalUnit: string;
  enteredBy: string;
  at: string;
}

export async function visitOutsideResults(
  facilityId: string,
  visitId: string,
): Promise<OutsideResult[]> {
  const [v] = await db
    .select({ outside: ncdVisit.outsideResults })
    .from(ncdVisit)
    .where(and(eq(ncdVisit.id, visitId), eq(ncdVisit.facilityId, facilityId)));
  return Array.isArray(v?.outside) ? (v.outside as OutsideResult[]) : [];
}

/** The units an outside result may be printed in: the mapping's unit and the concept's plain factors. */
export const outsideUnits = (concept: string, unit: string) => [
  unit,
  ...(OTHER_UNITS[concept] ?? []).map((u) => u.unit).filter((u) => u !== unit),
];

/** A concept's canonical unit: the generated catalogue, then the v1.6 addendum's new concepts. */
export const canonicalUnitOf = (concept: string): string =>
  conceptDef(concept)?.canonicalUnit ??
  (V16.concepts as { id: string; canonicalUnit: string | null }[]).find((c) => c.id === concept)
    ?.canonicalUnit ??
  "";

/** Every version of the field mappings at this facility (the registry lead's set-up page). */
export async function fieldMappingVersions(facilityId: string) {
  return db
    .select()
    .from(labSignedConfigs)
    .where(
      and(eq(labSignedConfigs.hospitalId, facilityId), eq(labSignedConfigs.kind, "ncd_mapping")),
    )
    .orderBy(desc(labSignedConfigs.version));
}
