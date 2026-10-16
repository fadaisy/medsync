import "server-only";

import type { PatientIdentity } from "@/components/emr/orders/model";
import type {
  ConclusionCode,
  EntryComponent,
  EntryLine,
  LabFlag,
  ResultEntryData,
  ReviewItem,
  ReviewValue,
  StaffOption,
  UncataloguedLine,
} from "@/components/emr/results/model";
import type { EmrActor } from "@/lib/emr/actor";
import type { EmrDb, EmrTx } from "@/lib/emr/db";
import type { ReportStatus } from "@/lib/emr/results";
import type { Interpretation } from "@/lib/lab/interpretation";
import { and, asc, desc, eq, inArray, or, sql } from "drizzle-orm";

import { ageSexWords } from "@/components/emr/orders/model";
import { LAB2 } from "@/content/lab-phase-2";
import { fill, LAB3 } from "@/content/lab-phase-3";
import { staffAffiliations } from "@/db/schema/clinician-profiles";
import { devices, diagnosticReports, resultAcknowledgements, testCatalogue } from "@/db/schema/emr";
import { encounterOrders } from "@/db/schema/encounter";
import { labStockLots } from "@/db/schema/lab-quality";
import { downtimeEntries, labResultSnapshots } from "@/db/schema/lab-safety";
import { clinicalObservations } from "@/db/schema/nurse-workspace";
import { patientProfiles } from "@/db/schema/patient-profiles";
import { cadres } from "@/db/schema/reference-data";
import { users } from "@/db/schema/users";
import { signedNumber } from "@/lib/emr/reference/critical";
import { PLAUSIBILITY_REFS } from "@/lib/emr/reference/plausibility";
import {
  ackState,
  currentVersion,
  interpretResult,
  isWithdrawn,
  readLabContext,
} from "@/lib/emr/results";
import { ORDERING_CADRES } from "@/lib/emr/write/orders";
import { UNCATALOGUED } from "@/lib/emr/write/results";
import { decrypt } from "@/lib/encryption";
import { conceptDef } from "@/lib/facts/project/shared";
import { ABNORMAL_ANSWERS, componentsFor } from "@/lib/lab/catalogue-v2";
import {
  labBedsideLiveFor,
  labCatalogueV2LiveFor,
  labDowntimeLiveFor,
  labUnitsRangesLiveFor,
} from "@/lib/lab/feature";
import { ANALYSER_MODELS } from "@/lib/lab/profiles";
import { revealPatientIdentities } from "@/lib/scheduling/patient-identity";

/**
 * Result reads for the lab bench and the orderer (PROMPT §5.8; gate-a E.9, E.10). Service reads
 * over the app database like the workspace's loadEmrTasks: every query is scoped to the viewer's
 * hospital, and the orderer/cover rule is the one lib/emr/write/results.ts requireResponsible
 * enforces, so the page never offers what the write refuses. Names are revealed through the
 * audited reveal (one clinical_phi_access_log row per patient per fetch; fail closed).
 */

const appDb = async (database?: EmrDb): Promise<EmrDb> =>
  database ?? ((await import("@/db")).db as unknown as EmrDb);

const humanise = (s: string) => s.charAt(0).toUpperCase() + s.slice(1).replace(/_/g, " ");

/* ─── Identities ────────────────────────────────────────────────────── */

export async function identitiesFor(
  viewer: { userId: string; hospitalId: string },
  patientIds: readonly string[],
  surface: string,
  database?: EmrDb,
): Promise<Map<string, PatientIdentity>> {
  const ids = [...new Set(patientIds)];
  if (ids.length === 0) return new Map();
  const conn = await appDb(database);
  const rows = await conn
    .select({
      id: patientProfiles.id,
      code: patientProfiles.patientCode,
      first: patientProfiles.firstNameEncrypted,
      surname: patientProfiles.surnameEncrypted,
      sex: patientProfiles.sex,
      dob: patientProfiles.dateOfBirth,
    })
    .from(patientProfiles)
    .where(inArray(patientProfiles.id, ids));
  const revealed = await revealPatientIdentities({
    viewer,
    surface,
    clinical: true,
    patients: rows.map((p) => ({
      patientUserId: p.id,
      patientCode: p.code,
      firstNameEncrypted: p.first,
      surnameEncrypted: p.surname,
      sex: p.sex,
      dateOfBirth: p.dob ? String(p.dob) : null,
      avatarPath: null,
    })),
  });
  const out = new Map<string, PatientIdentity>();
  for (const p of rows) {
    const r = revealed.get(p.id);
    out.set(p.id, {
      // Fail closed: an unaudited name is not shown, and the MRN still identifies the row.
      name: r?.displayName ?? "Name withheld",
      mrn: p.code,
      ageSex: ageSexWords(r?.ageYears ?? null, r?.sex ?? p.sex),
    });
  }
  return out;
}

/** Clinicians at this hospital who can order (forward and call targets). */
export async function clinicianOptions(
  hospitalId: string,
  database?: EmrDb,
): Promise<StaffOption[]> {
  const conn = await appDb(database);
  const rows = await conn
    .selectDistinct({ userId: users.id, name: users.fullName })
    .from(staffAffiliations)
    .innerJoin(users, eq(users.id, staffAffiliations.userId))
    .innerJoin(cadres, eq(cadres.id, staffAffiliations.cadreId))
    .where(
      and(
        eq(staffAffiliations.hospitalId, hospitalId),
        inArray(staffAffiliations.state, ["active", "approved"]),
        inArray(cadres.code, [...ORDERING_CADRES]),
      ),
    )
    .limit(300);
  return rows.sort((a, b) => a.name.localeCompare(b.name));
}

/* ─── Entry ─────────────────────────────────────────────────────────── */

/** The test's components as entry rows: display, value type, coded answers, the default unit
 *  (test menu, else canonical) and signed plausibility bounds only (none today). */
export function entryComponents(
  test: { components: readonly string[]; defaultUnits: unknown } | null,
): EntryComponent[] {
  const defaults = (test?.defaultUnits ?? {}) as Record<string, string>;
  return (test?.components ?? []).flatMap((conceptId): EntryComponent[] => {
    const def = conceptDef(conceptId);
    if (!def || !["quantity", "coded", "ordinal"].includes(def.valueType)) return [];
    return [
      {
        conceptId,
        display: def.display,
        valueType: def.valueType as EntryComponent["valueType"],
        answers: (def.answers ?? []).map((code) => ({ code, label: humanise(code) })),
        defaultUnit: defaults[conceptId] ?? def.canonicalUnit,
        bounds: PLAUSIBILITY_REFS.flatMap((r) => {
          const limit = r.conceptId === conceptId ? signedNumber(r) : null;
          return limit === null ? [] : [{ ruleId: r.id, bound: r.bound, side: r.side, limit }];
        }),
      },
    ];
  });
}

type ObsRow = Pick<
  typeof clinicalObservations.$inferSelect,
  | "id"
  | "reportId"
  | "conceptId"
  | "valueNum"
  | "valueComparator"
  | "valueUnit"
  | "valueCanonical"
  | "valueCode"
  | "context"
  | "noteCiphertext"
>;

const obsColumns = {
  id: clinicalObservations.id,
  reportId: clinicalObservations.reportId,
  conceptId: clinicalObservations.conceptId,
  valueNum: clinicalObservations.valueNum,
  valueComparator: clinicalObservations.valueComparator,
  valueUnit: clinicalObservations.valueUnit,
  valueCanonical: clinicalObservations.valueCanonical,
  valueCode: clinicalObservations.valueCode,
  context: clinicalObservations.context,
  noteCiphertext: clinicalObservations.noteCiphertext,
};

function asTyped(o: ObsRow): { name: string; value: string; unit: string | null } {
  try {
    const j = JSON.parse(decrypt(o.noteCiphertext ?? "")) as {
      name?: string;
      value?: string;
      unit?: string | null;
    };
    return { name: j.name ?? "Uncatalogued", value: j.value ?? "", unit: j.unit ?? null };
  } catch {
    return { name: "Uncatalogued", value: "Not readable", unit: null };
  }
}

/** A saved version's values back into entry lines (re-entry over a preliminary, or amendment). */
export function linesFromValues(values: readonly ObsRow[]): {
  lines: Record<string, EntryLine>;
  uncatalogued: UncataloguedLine[];
} {
  const lines: Record<string, EntryLine> = {};
  const uncatalogued: UncataloguedLine[] = [];
  for (const v of values) {
    if (v.conceptId === UNCATALOGUED) {
      const t = asTyped(v);
      uncatalogued.push({
        key: v.id,
        name: t.name,
        value: t.value,
        unit: t.unit ?? "",
        replaces: v.id,
      });
      continue;
    }
    if (!v.conceptId) continue;
    const { labInterpretation, referenceRange } = readLabContext(v.context);
    lines[v.conceptId] = {
      value: v.valueNum === null ? "" : `${v.valueComparator ?? ""}${v.valueNum}`,
      unit: v.valueUnit ?? "",
      code: v.valueCode ?? "",
      low: referenceRange?.low != null ? String(referenceRange.low) : "",
      high: referenceRange?.high != null ? String(referenceRange.high) : "",
      flag: (labInterpretation ?? "") as LabFlag | "",
      // A saved value already answered its unit question.
      unitConfirmed: true,
    };
  }
  return { lines, uncatalogued };
}

/** Values for review: as reported (comparator kept), the lab's own flag as text, and critical
 *  only from a signed REF-CRIT entry (lib/emr/results.ts). */
export function reviewValues(
  values: readonly ObsRow[],
  /** Lab Phase 1, with LAB_UNITS_RANGES on: each value's snapshot (lib/lab/units.ts). */
  snapshots?: ReadonlyMap<
    string,
    { flagChangeReason: string | null; interpretation?: unknown; labOnly?: boolean }
  >,
  /** Lab Phase 2 (CC-10): mark a coded answer the signed set calls abnormal. Never a critical flag. */
  abnormalAnswers = false,
  /** Lab Phase 3 (QH-2, E-LAB3-08): components of a released report still held for quality control. */
  held?: ReadonlySet<string>,
): ReviewValue[] {
  // Lab Phase 2 (AP-6, DP-2): a lab-only parameter never reaches a clinician's list.
  return values
    .filter((v) => !snapshots?.get(v.id)?.labOnly)
    .map((v): ReviewValue => {
      const uncatalogued = v.conceptId === UNCATALOGUED;
      const i = interpretResult(v, { uncatalogued });
      if (uncatalogued) {
        const t = asTyped(v);
        return {
          key: v.id,
          display: t.name,
          valueText: t.value,
          unit: t.unit,
          flagText: i.flag.text,
          critical: false,
          uncatalogued: true,
        };
      }
      const def = v.conceptId ? conceptDef(v.conceptId) : undefined;
      const display = def?.display ?? v.conceptId ?? "Result";
      // Lab Phase 3: a held component is "to follow", never a value; one released past the hold says so.
      if (held?.has(v.conceptId ?? ""))
        return {
          key: v.id,
          display,
          valueText: "",
          unit: null,
          flagText: null,
          critical: false,
          uncatalogued: false,
          labNote: fill(LAB3.toFollow, { Analyte: display }),
        };
      const overridden = !!(v.context as { qcOverride?: boolean } | null)?.qcOverride;
      const value: ReviewValue = {
        key: v.id,
        display,
        valueText:
          v.valueNum !== null
            ? `${v.valueComparator ?? ""}${v.valueNum}`
            : v.valueCode
              ? humanise(v.valueCode)
              : "",
        unit: v.valueNum !== null ? v.valueUnit : null,
        flagText:
          abnormalAnswers &&
          v.valueCode &&
          v.conceptId &&
          ABNORMAL_ANSWERS[v.conceptId]?.includes(v.valueCode)
            ? "Abnormal"
            : i.flag.text,
        critical: i.critical.isCritical,
        uncatalogued: false,
        ...(snapshots && v.valueNum !== null
          ? snapshots.has(v.id)
            ? {
                labNote: snapshots.get(v.id)!.flagChangeReason
                  ? `Flag changed by the lab: ${snapshots.get(v.id)!.flagChangeReason}`
                  : null,
                ...interpretationWords(v.conceptId, snapshots.get(v.id)!.interpretation),
              }
            : { asTyped: true }
          : {}),
      };
      // Lab Phase 3 Step 8 (BQ-3, D-LAB3-15): a bedside result measured before the day's control check says so.
      const notChecked =
        (v.context as { bedsideQuality?: { deviceCheck?: string } } | null)?.bedsideQuality
          ?.deviceCheck === "not_done";
      const lines = [
        overridden ? LAB3.overrideLine : null,
        notChecked ? LAB3.deviceCheckNotDone : null,
      ].filter(Boolean);
      return lines.length
        ? { ...value, labNote: [...lines, value.labNote].filter(Boolean).join(" ") }
        : value;
    });
}

/**
 * Lab Phase 2 (§5.8, DP-1, EG-5, LD-05): a scheme's category in words beside the value, the line saying what
 * flagged it, the notes (pregnancy not recorded, altitude not adjusted, the fallback), the eGFR caveat, and
 * why no eGFR was reported. Only what the snapshot holds: a later set-up change never alters it (DS-9).
 */
function interpretationWords(
  conceptId: string | null,
  raw: unknown,
): Partial<Pick<ReviewValue, "flagText" | "basis" | "notes">> {
  const t = raw as (Interpretation & { egfr?: string }) | null | undefined;
  if (!t && conceptId !== "obs.egfr") return {};
  const notes: string[] = [];
  if (t?.notes?.includes("pregnancy_not_recorded")) notes.push(LAB2.basis.pregnancyNotRecorded);
  if (t?.notes?.includes("altitude_not_adjusted")) notes.push(LAB2.basis.altitudeNotAdjusted);
  if (t?.fallback) notes.push(LAB2.basis.fallback(t.fallback.replaceAll("_", " ")));
  if (conceptId === "obs.egfr") notes.push(LAB2.egfr.caveat);
  if (t?.egfr) notes.push(LAB2.egfr.notReported(t.egfr.replaceAll("_", " ")));
  const c = t?.basis === "scheme" ? t.category : null;
  const band = t?.reference
    ? `${t.reference.low ?? ""} – ${t.reference.high ?? ""}`.trim()
    : "none";
  return {
    ...(c
      ? {
          flagText: `${c.direction === "low" ? "↓ " : c.direction === "high" ? "↑ " : ""}${c.label}`,
        }
      : {}),
    basis:
      c && t?.scheme ? `Flagged against ${t.scheme.label} (${t.scheme.source}). ${band}` : null,
    notes,
  };
}

const RELEASED = ["final", "amended", "corrected"];

/**
 * The bench's entry screen for one events-lifecycle order here: the patient, the test and its
 * components, and the current report version — preliminary (re-entry) or released (read, amend,
 * and for a critical one the call record).
 */
export async function loadResultEntry(
  actor: Pick<EmrActor, "userId" | "hospitalId">,
  orderId: string,
  opts: { mode: "direct" | "transcribed"; surface: string; database?: EmrDb },
): Promise<ResultEntryData | null> {
  const conn = await appDb(opts.database);
  const [order] = await conn
    .select()
    .from(encounterOrders)
    .where(
      and(
        eq(encounterOrders.id, orderId),
        eq(encounterOrders.hospitalId, actor.hospitalId),
        eq(encounterOrders.lifecycle, "events"),
      ),
    )
    .limit(1);
  if (!order) return null;
  const [test] = order.testId
    ? await conn.select().from(testCatalogue).where(eq(testCatalogue.id, order.testId))
    : [];
  const reports = await conn
    .select()
    .from(diagnosticReports)
    .where(eq(diagnosticReports.orderId, order.id));
  // The live chain (not withdrawn by a rejection); the newest if a recollection made two.
  const chains = new Map<string, typeof reports>();
  for (const r of reports) chains.set(r.logicalId, [...(chains.get(r.logicalId) ?? []), r]);
  const current = [...chains.values()]
    .map((c) => currentVersion(c)!)
    .filter((c) => !isWithdrawn(c.status))
    .sort((a, b) => b.recordedAt.getTime() - a.recordedAt.getTime())[0];
  const values = current
    ? await conn
        .select(obsColumns)
        .from(clinicalObservations)
        .where(eq(clinicalObservations.reportId, current.id))
    : [];
  const identity = (await identitiesFor(actor, [order.patientUserId], opts.surface, conn)).get(
    order.patientUserId,
  );
  if (!identity) return null;
  const released = !!current && RELEASED.includes(current.status);
  const critical = !!current && (current.critical || reviewValues(values).some((v) => v.critical));
  const { lines, uncatalogued } = linesFromValues(values);
  let communicate: ResultEntryData["communicate"] = null;
  if (current && released && critical) {
    const people = await clinicianOptions(actor.hospitalId, conn);
    const orderer = order.authoredByUserId;
    communicate = {
      reportId: current.id,
      ordererUserId: orderer,
      people: [
        ...people.filter((p) => p.userId === orderer),
        ...people.filter((p) => p.userId !== orderer),
      ],
    };
  }
  return {
    orderId: order.id,
    patientUserId: order.patientUserId,
    identity,
    test: order.text,
    kind: order.kind,
    requisitionNo: order.requisitionNo,
    priority: order.priority,
    mode: opts.mode,
    ...(await (async () => {
      // Lab Phase 2: the v2 components, or the pinned profile's rows (AP-5, AP-6); else Phase 1's.
      const v2 = test
        ? await componentsFor(conn as unknown as EmrTx, actor.hospitalId, test, order.id)
        : null;
      const list = entryComponents(
        test && v2 ? { ...test, components: v2.components } : (test ?? null),
      );
      return {
        components: list.map((c) => (v2?.labOnly.has(c.conceptId) ? { ...c, labOnly: true } : c)),
        profile: v2?.profile
          ? {
              model: ANALYSER_MODELS[v2.profile.model]?.display ?? v2.profile.model,
              labOnly: v2.labOnly.size,
            }
          : null,
      };
    })()),
    report: current
      ? {
          id: current.id,
          status: current.status as ReportStatus,
          released,
          critical,
          lines,
          uncatalogued,
          conclusionCode: current.conclusionCode as ConclusionCode | null,
          qcHeld: current.qcHeld ?? [],
        }
      : null,
    communicate,
  };
}

/* ─── Results to review ─────────────────────────────────────────────── */

/**
 * A released result is open work for this viewer when its current version has no acknowledgement
 * and the viewer placed the order or covers its orderer (same department here: requireResponsible's
 * rule), or when its latest acknowledgement forwarded it to the viewer. Seen or acted closes it; a
 * forward hands it over. Shared by the Workspace lanes and /doctor/results.
 */
export function openResultFor(viewer: {
  userId: string;
  hospitalId: string;
  departmentId: string | null;
}) {
  const r = diagnosticReports;
  const o = encounterOrders;
  return or(
    and(
      sql`not exists (select 1 from result_acknowledgements a where a.report_id = ${r.id})`,
      or(
        eq(o.authoredByUserId, viewer.userId),
        viewer.departmentId
          ? sql`exists (select 1 from ${staffAffiliations} sa where sa.user_id = ${o.authoredByUserId}
                and sa.hospital_id = ${viewer.hospitalId} and sa.department_id = ${viewer.departmentId}
                and sa.state in ('active','approved'))`
          : sql`false`,
      ),
    ),
    sql`exists (select 1 from (select a.action, a.forwarded_to_user_id from result_acknowledgements a
          where a.report_id = ${r.id} order by a.recorded_at desc limit 1) l
          where l.action = 'forwarded' and l.forwarded_to_user_id = ${viewer.userId})`,
  );
}

/** Critical first, then oldest first, before any cap: a cap never drops a critical result. */
export const OPEN_RESULT_ORDER = [
  desc(diagnosticReports.critical),
  asc(diagnosticReports.recordedAt),
] as const;

/**
 * Released results on events orders here whose CURRENT version is open work for me
 * (openResultFor) — loadEmrTasks' rule, with the values.
 * A restricted result shows its values to the orderer only; a cover sees the lock and opens the
 * chart, where the access rule decides.
 */
export async function loadResultsToReview(
  actor: Pick<EmrActor, "userId" | "hospitalId" | "departmentId">,
  opts: { database?: EmrDb } = {},
): Promise<ReviewItem[]> {
  const conn = await appDb(opts.database);
  const r = diagnosticReports;
  const o = encounterOrders;
  const rows = await conn
    .select({
      id: r.id,
      logicalId: r.logicalId,
      patientUserId: r.patientUserId,
      critical: r.critical,
      recordedAt: r.recordedAt,
      conclusionCode: r.conclusionCode,
      conclusionCiphertext: r.conclusionCiphertext,
      qcHeld: r.qcHeld,
      encounterId: o.encounterId,
      text: o.text,
      orderer: o.authoredByUserId,
      restricted: sql<boolean>`(${r.sensitivity} <> 'standard' or ${o.sensitivity} <> 'standard')`,
    })
    .from(r)
    .innerJoin(o, eq(o.id, r.orderId))
    .where(
      and(
        eq(r.hospitalId, actor.hospitalId),
        eq(o.lifecycle, "events"),
        inArray(r.status, RELEASED),
        sql`not exists (select 1 from ${diagnosticReports} n where n.logical_id = ${r.logicalId} and n.version > ${r.version})`,
        openResultFor(actor),
      ),
    )
    .orderBy(...OPEN_RESULT_ORDER)
    .limit(200);
  if (rows.length === 0) return [];

  const chainRows = await conn
    .select({
      id: r.id,
      logicalId: r.logicalId,
      version: r.version,
      status: r.status,
      recordedAt: r.recordedAt,
    })
    .from(r)
    .where(
      inArray(
        r.logicalId,
        rows.map((x) => x.logicalId),
      ),
    );
  const [acks, values, identities] = await Promise.all([
    conn
      .select({
        reportId: resultAcknowledgements.reportId,
        action: resultAcknowledgements.action,
        acknowledgedByUserId: resultAcknowledgements.acknowledgedByUserId,
        forwardedToUserId: resultAcknowledgements.forwardedToUserId,
        recordedAt: resultAcknowledgements.recordedAt,
      })
      .from(resultAcknowledgements)
      .where(
        inArray(
          resultAcknowledgements.reportId,
          chainRows.map((c) => c.id),
        ),
      ),
    conn
      .select(obsColumns)
      .from(clinicalObservations)
      .where(
        inArray(
          clinicalObservations.reportId,
          rows.map((x) => x.id),
        ),
      ),
    identitiesFor(
      actor,
      rows.map((x) => x.patientUserId),
      "doctor_results_review",
      conn,
    ),
  ]);

  // Lab Phase 1 (LAB_UNITS_RANGES): each value's snapshot, for the lab's flag note and "unit as typed".
  const snapshots = labUnitsRangesLiveFor(actor.hospitalId)
    ? new Map(
        (values.length
          ? await conn
              .select({
                id: labResultSnapshots.observationId,
                flagChangeReason: labResultSnapshots.flagChangeReason,
                interpretation: labResultSnapshots.interpretation,
                labOnly: labResultSnapshots.labOnly,
              })
              .from(labResultSnapshots)
              .where(
                inArray(
                  labResultSnapshots.observationId,
                  values.map((v) => v.id),
                ),
              )
          : []
        ).map((r) => [r.id, r]),
      )
    : null;
  // Lab Phase 1 DT-7: results entered after downtime say so, with the form's times.
  const paper = labDowntimeLiveFor(actor.hospitalId)
    ? new Map(
        (
          await conn
            .select()
            .from(downtimeEntries)
            .where(
              inArray(
                downtimeEntries.reportId,
                chainRows.map((c) => c.id),
              ),
            )
        ).map((d) => [d.reportId, d]),
      )
    : null;
  // Lab Phase 2 (§5.8): bedside reports carry their device, lot and operator (the columns come with 0110).
  const bedside = labBedsideLiveFor(actor.hospitalId)
    ? new Map(
        (
          await conn
            .select({
              id: r.id,
              device: devices.model,
              lot: labStockLots.lot,
              operator: users.fullName,
            })
            .from(r)
            .innerJoin(devices, eq(devices.id, r.deviceId))
            .innerJoin(labStockLots, eq(labStockLots.id, r.lotId))
            .leftJoin(users, eq(users.id, r.enteredByUserId))
            .where(
              inArray(
                r.id,
                rows.map((x) => x.id),
              ),
            )
        ).map((b) => [b.id, b]),
      )
    : null;
  const hhmm = new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Africa/Kampala",
  });
  const items: ReviewItem[] = [];
  for (const x of rows) {
    const chain = chainRows.filter((c) => c.logicalId === x.logicalId);
    const form = paper ? chain.map((c) => paper.get(c.id)).find(Boolean) : undefined;
    const ack = ackState(chain, acks);
    if (ack.kind === "forwarded" && ack.toUserId !== actor.userId) continue;
    if (ack.kind !== "needs_review" && ack.kind !== "needs_re_ack" && ack.kind !== "forwarded")
      continue;
    const shown = !x.restricted || x.orderer === actor.userId;
    const vals = reviewValues(
      values.filter((v) => v.reportId === x.id),
      snapshots ?? undefined,
      labCatalogueV2LiveFor(actor.hospitalId),
      new Set(x.qcHeld ?? []),
    );
    const critical = x.critical || vals.some((v) => v.critical);
    const bs = shown ? bedside?.get(x.id) : undefined;
    items.push({
      ...(bs
        ? {
            bedside: {
              device: bs.device,
              lot: bs.lot,
              operator: bs.operator ?? "Name withheld",
              glucose: values.some(
                (v) => v.reportId === x.id && !!v.conceptId?.startsWith("obs.glucose"),
              ),
            },
          }
        : {}),
      ...(form
        ? {
            downtimeTag: `Entered after downtime · Resulted ${hhmm.format(form.resultedAt)} · entered ${hhmm.format(form.enteredAt)} · paper form DT-${String(form.formNumber).padStart(5, "0")}`,
          }
        : {}),
      reportId: x.id,
      patientUserId: x.patientUserId,
      identity: identities.get(x.patientUserId) ?? {
        name: "Name withheld",
        mrn: "MRN not found",
        ageSex: ageSexWords(null, null),
      },
      test: shown ? x.text : "Restricted result",
      releasedAtIso: x.recordedAt.toISOString(),
      // Forwarded to me: mine to acknowledge now.
      state: ack.kind === "forwarded" ? "needs_review" : ack.kind,
      critical,
      restricted: x.restricted,
      values: shown ? vals : [],
      conclusion:
        shown && x.conclusionCode
          ? {
              code: x.conclusionCode,
              text: x.conclusionCiphertext ? decrypt(x.conclusionCiphertext) : null,
            }
          : null,
      encounterId: x.encounterId,
    });
  }
  return items;
}
