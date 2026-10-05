/**
 * Exchange (§7 H1–H5, §10.6 interlock 6). Every export is computed from the engine or the records,
 * logged as an access event, and refused when it would carry synthetic data where it must not:
 * while demo data is on, CSV and full exports are marked synthetic in the file name and first line,
 * and the DHIS2, FHIR and research exports refuse to run.
 */
import "server-only";

import { createHmac } from "node:crypto";
import type { NcdContext } from "../context";
import type { NcdTx } from "../db";
import type { DPerson } from "../indicators/dataset";
import type { IndicatorReport } from "../indicators/engine";
import { and, eq, inArray, sql } from "drizzle-orm";

import { ncdDemoLoad, ncdExportRequest, ncdPerson } from "@/db/schema";
import { authorize, can, fromDb, NcdError } from "../context";
import { dec } from "../crypto";
import { rows, withNcd } from "../db";
import { computeIndicators } from "../indicators/engine";
import { loadDataset } from "../indicators/load";
import { enabledModules } from "../indicators/snapshot";
import { isSuppressed, SUPPRESSED_TEXT } from "../read/dashboard";
import { identities, logAccess } from "../read/views";
import { LOINC, MEDICINE_LIST, OBSERVATION_CODES, STANDARD_VERSION } from "../standard/code-lists";
import { DICTIONARY } from "../standard/dictionary";
import mapping from "./dhis2-mapping.json";

const run = <T>(ctx: NcdContext, fn: (tx: NcdTx) => Promise<T>) =>
  withNcd(ctx, "app", fn, ctx.db).catch((e: unknown) => {
    throw fromDb(e);
  });

export type ExportFile = { fileName: string; contentType: string; body: string };

/** Interlock 6: demo data is on, or any synthetic person exists (hand-entered ones too). */
export async function demoOn(ctx: NcdContext): Promise<boolean> {
  return run(ctx, async (tx) => {
    const active = await tx
      .select({ id: ncdDemoLoad.id })
      .from(ncdDemoLoad)
      .where(
        and(
          eq(ncdDemoLoad.facilityId, ctx.facilityId),
          inArray(ncdDemoLoad.status, ["loading", "on", "removing"]),
        ),
      );
    if (active.length) return true;
    const [c] = await rows<{ synthetic: number }>(
      tx,
      sql`SELECT synthetic FROM private.ncd_person_counts()`,
    );
    return (c?.synthetic ?? 0) > 0;
  });
}

const SYNTHETIC_LINE = "# SYNTHETIC DEMO DATA. Nothing in this file is a real patient.";
const refuseWhileDemo = async (ctx: NcdContext, what: string) => {
  if (await demoOn(ctx))
    throw new NcdError("interlock", `The ${what} does not run while demo data is on.`);
};
const csvCell = (v: unknown) => {
  const s = v == null ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const csv = (rows: unknown[][]) => rows.map((r) => r.map(csvCell).join(",")).join("\n") + "\n";

/** §5.3: exports that emit codes refuse unverified ones unless the development-only flag is set. */
export function assertCodesVerified() {
  const dev =
    process.env.NODE_ENV !== "production" && process.env.NCDREG_ALLOW_UNVERIFIED_CODES === "1";
  if (OBSERVATION_CODES.verified === false && !dev)
    throw new NcdError(
      "interlock",
      "The LOINC, ICD and ATC codes are not yet verified against their source catalogues (sign-off register S10).",
    );
}

async function report(ctx: NcdContext, month: string): Promise<IndicatorReport> {
  const [ds, enabled] = await Promise.all([loadDataset(ctx), enabledModules(ctx)]);
  return computeIndicators(ds, { month, catalogue: ctx.catalogue, enabled });
}

/* ─── H1 aggregates ────────────────────────────────────────────────────── */

export async function aggregateCsv(ctx: NcdContext, month: string): Promise<ExportFile> {
  authorize(ctx, "aggregate_export");
  const [ds, enabled] = await Promise.all([loadDataset(ctx), enabledModules(ctx)]);
  const r = computeIndicators(ds, { month, catalogue: ctx.catalogue, enabled });
  const synthetic = await demoOn(ctx);
  // F6: for a role without drill-down, counts from 1 to 4 leave the building as "1–4", as on screen.
  const syn = new Set(ds.persons.filter((p) => p.isSynthetic).map((p) => p.id));
  const canDrill = can(ctx, "drill_down");
  const cell = (n: number | undefined, ids: string[] | undefined) =>
    n == null
      ? ""
      : isSuppressed(n, ids ?? [], (id) => syn.has(id), canDrill)
        ? SUPPRESSED_TEXT
        : n;
  const rows: unknown[][] = [
    ["indicator", "condition", "numerator", "denominator", "parts", "definition_version"],
  ];
  for (const x of Object.values(r.results)) {
    const parts =
      x.parts &&
      Object.fromEntries(Object.entries(x.parts).map(([k, n]) => [k, cell(n, x.ids[k])]));
    rows.push([
      x.code,
      x.condition ?? "",
      cell(x.num, x.ids.num),
      cell(x.den, x.ids.den),
      parts ? JSON.stringify(parts) : "",
      x.version,
    ]);
  }
  await logAccess(ctx, "export", null, { kind: "aggregate_csv", month, synthetic });
  return {
    fileName: `${synthetic ? "SYNTHETIC-DEMO-" : ""}ncd-aggregates-${month}.csv`,
    contentType: "text/csv",
    body: (synthetic ? `${SYNTHETIC_LINE}\n` : "") + csv(rows),
  };
}

type Mapping = {
  dataSet: string;
  orgUnit: string;
  mappings: { indicator: string; part: string; dataElement: string; categoryOptionCombo: string }[];
};

/** H1: a DHIS2 data value set. Refuses while any required identifier is empty (never invented). */
export async function dhis2DataValueSet(
  ctx: NcdContext,
  month: string,
  map: Mapping = mapping as Mapping,
): Promise<ExportFile> {
  authorize(ctx, "aggregate_export");
  await refuseWhileDemo(ctx, "DHIS2 export");
  const empty = [
    map.dataSet,
    map.orgUnit,
    ...map.mappings.flatMap((m) => [m.dataElement, m.categoryOptionCombo]),
  ].some((x) => !x);
  if (empty)
    throw new NcdError(
      "interlock",
      "The DHIS2 mapping has empty identifiers. They must come from the Ministry of Health (sign-off register S14).",
    );
  const r = await report(ctx, month);
  const dataValues = map.mappings.map((m) => {
    const x = r.results[m.indicator];
    const value = m.part === "den" ? x?.den : x?.num;
    return {
      dataElement: m.dataElement,
      categoryOptionCombo: m.categoryOptionCombo,
      value: String(value ?? 0),
    };
  });
  await logAccess(ctx, "export", null, { kind: "dhis2", month });
  return {
    fileName: `ncd-dhis2-${month}.json`,
    contentType: "application/json",
    body: JSON.stringify(
      { dataSet: map.dataSet, period: month.replace("-", ""), orgUnit: map.orgUnit, dataValues },
      null,
      2,
    ),
  };
}

/* ─── H2 FHIR R4 ───────────────────────────────────────────────────────── */

export type FhirResource = Record<string, unknown> & { resourceType: string; id: string };

/** Pure mapping of one person to Patient, Condition, Encounter, Observation, MedicationStatement. */
export function toFhir(
  p: DPerson,
  idn: { name: string; registryNumber: string; sex: string; birthYear: number },
  catalogue: NcdContext["catalogue"],
): FhirResource[] {
  const subject = { reference: `Patient/${p.id}` };
  const out: FhirResource[] = [];
  const [given, ...family] = idn.name.split(" ");
  out.push({
    resourceType: "Patient",
    id: p.id,
    identifier: [{ system: "urn:medsync:ncdreg:registry-number", value: idn.registryNumber }],
    name: [{ given: [given ?? ""], family: family.join(" ") }],
    gender: idn.sex,
    birthDate: String(idn.birthYear),
  });
  for (const r of p.registrations) {
    const m = catalogue.find((x) => x.code === r.condition);
    const coding = (m?.diagnosis_codes ?? []).map((d) => ({
      system: "http://id.who.int/icd/release/11/mms",
      code: d.icd11,
      display: d.label,
    }));
    out.push({
      resourceType: "Condition",
      id: r.id,
      subject,
      clinicalStatus: {
        coding: [
          { system: "http://terminology.hl7.org/CodeSystem/condition-clinical", code: "active" },
        ],
      },
      code: { coding, text: m?.label ?? r.condition },
      recordedDate: r.date,
    });
  }
  const obs = (
    id: string,
    encounter: string,
    date: string,
    code: string,
    value: number,
    unit: string,
  ): FhirResource => ({
    resourceType: "Observation",
    id,
    status: "final",
    code: { coding: [{ system: "http://loinc.org", code }] },
    subject,
    encounter: { reference: `Encounter/${encounter}` },
    effectiveDateTime: date,
    valueQuantity: { value, unit, system: "http://unitsofmeasure.org" },
  });
  for (const v of p.visits.filter((x) => x.closed && !x.invalid)) {
    out.push({
      resourceType: "Encounter",
      id: v.id,
      status: "finished",
      class: { system: "http://terminology.hl7.org/CodeSystem/v3-ActCode", code: "AMB" },
      subject,
      period: { start: v.date, end: v.date },
    });
    if (v.bp) {
      out.push(obs(`${v.id}-sbp`, v.id, v.date, LOINC.systolic, v.bp[0], "mm[Hg]"));
      out.push(obs(`${v.id}-dbp`, v.id, v.date, LOINC.diastolic, v.bp[1], "mm[Hg]"));
    }
    if (v.weightKg != null)
      out.push(obs(`${v.id}-wt`, v.id, v.date, LOINC.weight, v.weightKg, "kg"));
    if (v.glucose)
      out.push(
        obs(
          `${v.id}-glu`,
          v.id,
          v.date,
          v.glucose.type === "fasting" ? LOINC.glucose_fasting : LOINC.glucose_lab,
          v.glucose.value,
          "mmol/L",
        ),
      );
    if (v.hba1c)
      out.push(obs(`${v.id}-a1c`, v.id, v.hba1c.resultDate, LOINC.hba1c, v.hba1c.percent, "%"));
    for (const code of v.medicines) {
      const med = MEDICINE_LIST.medicines.find((x) => x.code === code);
      out.push({
        resourceType: "MedicationStatement",
        id: `${v.id}-${code}`,
        status: "active",
        medicationCodeableConcept: {
          coding: med?.atc ? [{ system: "http://www.whocc.no/atc", code: med.atc }] : [],
          text: med?.label ?? code,
        },
        subject,
        context: { reference: `Encounter/${v.id}` },
        effectiveDateTime: v.date,
      });
    }
  }
  return out;
}

export async function fhirBundle(ctx: NcdContext): Promise<ExportFile> {
  authorize(ctx, "export_approve");
  await refuseWhileDemo(ctx, "FHIR export");
  assertCodesVerified();
  const ds = await loadDataset(ctx);
  const ids = await identities(
    ctx,
    ds.persons.map((p) => p.id),
  );
  const year = Number(ctx.today.slice(0, 4));
  const entries = ds.persons.flatMap((p) => {
    const i = ids.get(p.id)!;
    return toFhir(
      p,
      { name: i.name, registryNumber: i.registryNumber, sex: i.sex, birthYear: year - i.age },
      ctx.catalogue,
    );
  });
  await logAccess(ctx, "export", null, { kind: "fhir", resources: entries.length });
  return {
    fileName: `ncd-fhir-${ctx.today}.json`,
    contentType: "application/fhir+json",
    body: JSON.stringify(
      {
        resourceType: "Bundle",
        type: "collection",
        entry: entries.map((resource) => ({ fullUrl: `urn:uuid:${resource.id}`, resource })),
      },
      null,
      2,
    ),
  };
}

/* ─── H3 research extract (four-eyes) ──────────────────────────────────── */

export async function requestRelease(
  ctx: NcdContext,
  kind: "research_extract" | "full_export",
  note: string,
) {
  authorize(ctx, "export_request", "aggregate_export", "export_approve");
  return run(ctx, async (tx) => {
    const [row] = await tx
      .insert(ncdExportRequest)
      .values({
        facilityId: ctx.facilityId,
        kind,
        requestedBy: ctx.userId!,
        requestedAt: ctx.enteredAt,
        detail: { note },
      })
      .returning();
    return row!;
  });
}

export async function approveRelease(ctx: NcdContext, id: string, approvalReference: string) {
  authorize(ctx, "export_approve");
  if (approvalReference.trim().length < 3)
    throw new NcdError("invalid", "Give the approval reference (ethics or committee decision).");
  return run(ctx, async (tx) => {
    const [r] = await tx.select().from(ncdExportRequest).where(eq(ncdExportRequest.id, id));
    if (!r || r.status !== "requested") throw new NcdError("not_found", "No open request.");
    if (r.requestedBy === ctx.userId)
      throw new NcdError("forbidden", "A data release needs a second, different approver.");
    await tx
      .update(ncdExportRequest)
      .set({
        status: "approved",
        approvedBy: ctx.userId,
        approvedAt: ctx.enteredAt,
        approvalReference: approvalReference.trim(),
      })
      .where(eq(ncdExportRequest.id, id));
    return { ...r, status: "approved" };
  });
}

const suppress = (n: number) => (n >= 1 && n <= 4 ? "<5" : String(n));

/** Pure de-identification of one person for a release (H3). */
export function deidentify(p: DPerson, releaseKey: string) {
  const pseudo = createHmac("sha256", releaseKey).update(p.id).digest("hex").slice(0, 16);
  return {
    pseudonym: pseudo,
    sex: p.sex,
    birth_year: p.birthYear,
    district: p.district,
    registrations: p.registrations.map((r) => ({
      condition: r.condition,
      registration_year: r.date.slice(0, 4),
      registration_month: r.date.slice(0, 7),
    })),
    visits: p.visits
      .filter((v) => v.closed && !v.invalid)
      .map((v) => ({
        month: v.date.slice(0, 7),
        systolic: v.bp?.[0] ?? null,
        diastolic: v.bp?.[1] ?? null,
        glucose_mmol: v.glucose?.value ?? null,
        glucose_type: v.glucose?.type ?? null,
        hba1c_percent: v.hba1c?.percent ?? null,
        weight_kg: v.weightKg,
        medicines: v.medicines.filter((m) => m !== "other"),
        medicines_obtained: v.medicinesObtained,
      })),
    reviews: p.reviews.map((r) => ({
      component: r.component,
      month: r.date.slice(0, 7),
      derived: r.derived,
    })),
    events: p.events.map((e) => ({
      type: e.type,
      month: e.date.slice(0, 7),
      admission_reason: e.admissionReason,
    })),
  };
}

export async function researchExtract(
  ctx: NcdContext,
  requestId: string,
  secret = process.env.MEDSYNC_PHI_KEY ?? "",
): Promise<ExportFile> {
  authorize(ctx, "export_approve", "export_request");
  await refuseWhileDemo(ctx, "research extract");
  const [req] = await run(ctx, (tx) =>
    tx.select().from(ncdExportRequest).where(eq(ncdExportRequest.id, requestId)),
  );
  if (
    !req ||
    req.kind !== "research_extract" ||
    req.status === "requested" ||
    req.status === "refused"
  )
    throw new NcdError("forbidden", "The release needs an approved request.");
  const ds = await loadDataset(ctx);
  const releaseKey = createHmac("sha256", secret).update(`ncd-release:${requestId}`).digest("hex");
  const persons = ds.persons.map((p) => deidentify(p, releaseKey));
  const byCondition = new Map<string, number>();
  for (const p of ds.persons)
    for (const r of p.registrations)
      byCondition.set(r.condition, (byCondition.get(r.condition) ?? 0) + 1);
  const aggregates = [...byCondition].map(([condition, n]) => ({
    condition,
    registered: suppress(n),
  }));
  await run(ctx, (tx) =>
    tx
      .update(ncdExportRequest)
      .set({ status: "released", releasedAt: ctx.enteredAt })
      .where(eq(ncdExportRequest.id, requestId)),
  );
  await logAccess(ctx, "export", null, {
    kind: "research_extract",
    requestId,
    approvalReference: req.approvalReference,
    persons: persons.length,
  });
  return {
    fileName: `ncd-research-extract-${requestId.slice(0, 8)}.json`,
    contentType: "application/json",
    body: JSON.stringify(
      {
        release: requestId,
        approval_reference: req.approvalReference,
        standard: STANDARD_VERSION,
        persons,
        aggregates,
      },
      null,
      2,
    ),
  };
}

/* ─── H4 full export ───────────────────────────────────────────────────── */

export async function fullExport(ctx: NcdContext): Promise<ExportFile> {
  authorize(ctx, "export_approve");
  const synthetic = await demoOn(ctx);
  const ds = await loadDataset(ctx);
  const people = await run(ctx, (tx) =>
    tx.select().from(ncdPerson).where(eq(ncdPerson.facilityId, ctx.facilityId)),
  );
  const persons = people.map((p) => ({
    id: p.id,
    registry_number: p.registryNumber,
    is_synthetic: p.isSynthetic,
    hospital_number: dec(p.hospitalNumberCiphertext),
    national_id: dec(p.nationalIdCiphertext),
    given_name: dec(p.givenNameCiphertext),
    family_name: dec(p.familyNameCiphertext),
    sex: p.sex,
    date_of_birth: p.dateOfBirth,
    birth_year: p.birthYear,
    phone_1: dec(p.phone1Ciphertext),
    phone_2: dec(p.phone2Ciphertext),
    district: p.districtName,
    sub_county: p.subcountyName,
    parish: dec(p.parishCiphertext),
    village: dec(p.villageCiphertext),
    records: ds.persons.find((x) => x.id === p.id) ?? null,
  }));
  await logAccess(ctx, "export", null, { kind: "full_export", persons: persons.length, synthetic });
  return {
    fileName: `${synthetic ? "SYNTHETIC-DEMO-" : ""}ncd-full-export-${ctx.today}.json`,
    contentType: "application/json",
    body:
      (synthetic ? `${SYNTHETIC_LINE}\n` : "") +
      JSON.stringify({ standard: STANDARD_VERSION, dictionary: DICTIONARY, persons }, null, 2),
  };
}
