import "server-only";

import type { HmisRole } from "./hmis-designations";
import type {
  Cell,
  CellChange,
  Count105,
  HmisForm,
  HmisMapping,
  HmisReferralRecord,
  HmisReport,
} from "./hmis105";
import type { Payload } from "./signed-config";
import type { StockKind, TxKind } from "./stock";
import type { EmrTx } from "@/lib/emr/db";
import { and, desc, eq, gte, inArray, isNull, lt, or, sql } from "drizzle-orm";

import {
  clinicalObservations,
  diagnosticOfferings,
  diagnosticReports,
  downtimeEntries,
  encounterOrders,
  encounters,
  hmisDesignations,
  labControlChecks,
  labHmisReports,
  labReferrals,
  labSignedConfigs,
  labStockItems,
  labStockTransactions,
  specimenEvents,
  specimens,
  testCatalogue,
} from "@/db/schema";
import { EmrWriteError } from "@/lib/emr/write/context";
import { DEFAULT_TIME_ZONE } from "@/supabase/functions/_shared/slots";
import { loadConfigs, saveConfigDraft, signConfig } from "./catalogue-v2";
import { eqaRoundsFor } from "./eqa-store";
import { hmisRolesFor } from "./hmis-designations";
import { hmisForm } from "./hmis-form";
import {
  cellKey,
  count105,
  hmisTransition,
  mappingSignErrors,
  recordsCover104,
  referralCells104,
  revisionDiff,
  rowKey,
  toCsv,
} from "./hmis105";
import { inForce, PAYLOADS } from "./signed-config";
import { addDays, daysOfMonth, endOfDay } from "./stock";

/**
 * HMIS 105 on the database (Lab Phase 3 Step 9, §6.11 HM-1..HM-13; GATE A §5.6, §8; 0117). The mapping is the
 * signed config kind `hmis_mapping` (the lead, then the HMIS focal person); a report is generated from one read
 * of the month's source rows, counted by the pure `count105`, checked by the lead, signed by the Health Unit
 * In-Charge with a fresh second factor and then frozen (trigger); a later change is a new revision. "Changed
 * since signing" (HM-11) is the frozen cells against a fresh count, computed on view and by the nightly job.
 */

type Actor = { userId: string; hospitalId: string };
type FormArg = { form: HmisForm; hash: string };
export type MappingPayload = Payload<"hmis_mapping">;
const TZ = DEFAULT_TIME_ZONE;
const invalid = (m: string) => new EmrWriteError("invalid", m);
const conflict = (m: string) => new EmrWriteError("conflict", m);
const RELEASED = ["final", "amended", "corrected"];

/** The mapping's key is the form version it maps. */
export const mappingKey = (form: HmisForm) => form.version;

const firstDay = (month: string) => `${month}-01`;

export interface StoredCell {
  value: number | null;
  bedside?: number;
  manual?: true;
}

/** Cells as stored (values) and their record ids (sources), joined back into the engine's shape. */
export const joinCells = (
  cells: Record<string, StoredCell>,
  sources: Record<string, string[]>,
): Record<string, Cell> =>
  Object.fromEntries(
    Object.entries(cells).map(([k, c]) => [k, { ...c, sources: sources[k] ?? [] }]),
  );

const splitCells = (cells: Record<string, Cell>) => ({
  cells: Object.fromEntries(
    Object.entries(cells).map(([k, { sources: _s, ...c }]) => [k, c as StoredCell]),
  ),
  sources: Object.fromEntries(Object.entries(cells).map(([k, c]) => [k, c.sources])),
});

/** HM-2, HM-3 (i): in-house lab tests on the hospital's menu (the hub's provision `in_house`). */
export async function inHouseMenu(tx: EmrTx, hospitalId: string): Promise<string[]> {
  const rows = await tx
    // Lab test menu v2 (TM-3): the offering is keyed by the catalogue test itself.
    .selectDistinct({ code: testCatalogue.code })
    .from(diagnosticOfferings)
    .innerJoin(
      testCatalogue,
      and(eq(testCatalogue.code, diagnosticOfferings.code), isNull(testCatalogue.hospitalId)),
    )
    .where(
      and(
        eq(diagnosticOfferings.hospitalId, hospitalId),
        eq(diagnosticOfferings.kind, "lab"),
        eq(diagnosticOfferings.provision, "in_house"),
      ),
    );
  return rows.map((r) => r.code).sort();
}

/** Every version of the hospital's HMIS mapping, newest first. */
export async function mappingVersions(tx: EmrTx, hospitalId: string, form: HmisForm) {
  const rows = await tx
    .select()
    .from(labSignedConfigs)
    .where(
      and(
        eq(labSignedConfigs.hospitalId, hospitalId),
        eq(labSignedConfigs.kind, "hmis_mapping"),
        eq(labSignedConfigs.key, mappingKey(form)),
      ),
    )
    .orderBy(desc(labSignedConfigs.version));
  return rows.flatMap((r) => {
    const p = PAYLOADS.hmis_mapping.safeParse(r.payload);
    return p.success ? [{ ...r, payload: p.data }] : [];
  });
}

/** The mapping a count uses: the one in force, else the newest draft (a draft report shows it unsigned). */
export async function mappingForCount(tx: EmrTx, hospitalId: string, form: HmisForm) {
  const all = await mappingVersions(tx, hospitalId, form);
  return all.find((m) => m.status === "signed") ?? all.find((m) => m.status === "draft") ?? null;
}

/* ─── HM-3: the month's source rows, read in one go ─────────────────────── */

export async function monthSources(tx: EmrTx, hospitalId: string, month: string) {
  const days = daysOfMonth(month);
  const from = endOfDay(addDays(days[0]!, -1), TZ);
  const to = endOfDay(days.at(-1)!, TZ);
  const inWindow = (c: Parameters<typeof gte>[0]) => and(gte(c, from), lt(c, to));

  // (a): every result with a release (or a downtime form time) in the month; then every version of each.
  const touched = await tx
    .selectDistinct({ logicalId: diagnosticReports.logicalId })
    .from(diagnosticReports)
    .leftJoin(downtimeEntries, eq(downtimeEntries.reportId, diagnosticReports.id))
    .where(
      and(
        eq(diagnosticReports.hospitalId, hospitalId),
        eq(diagnosticReports.kind, "lab"),
        inArray(diagnosticReports.status, RELEASED),
        or(inWindow(diagnosticReports.recordedAt), inWindow(downtimeEntries.resultedAt)),
      ),
    );
  const logicalIds = touched.map((t) => t.logicalId);

  const [versions, events, referrals, checks, eqaRounds, items, txs] = await Promise.all([
    logicalIds.length
      ? tx
          .select({
            id: diagnosticReports.id,
            logicalId: diagnosticReports.logicalId,
            version: diagnosticReports.version,
            status: diagnosticReports.status,
            performer: diagnosticReports.performer,
            source: diagnosticReports.source,
            recordedAt: diagnosticReports.recordedAt,
            testCode: testCatalogue.code,
            formAt: downtimeEntries.resultedAt,
            purpose: encounterOrders.testPurpose,
          })
          .from(diagnosticReports)
          .innerJoin(testCatalogue, eq(testCatalogue.id, diagnosticReports.testId))
          .leftJoin(downtimeEntries, eq(downtimeEntries.reportId, diagnosticReports.id))
          .leftJoin(encounterOrders, eq(encounterOrders.id, diagnosticReports.orderId))
          .where(
            and(
              eq(diagnosticReports.hospitalId, hospitalId),
              inArray(diagnosticReports.logicalId, logicalIds),
            ),
          )
      : Promise.resolve([]),
    tx
      .select({
        specimenId: specimenEvents.specimenId,
        kind: specimenEvents.kind,
        at: specimenEvents.recordedAt,
        reasonCode: specimenEvents.reasonCode,
      })
      .from(specimenEvents)
      .where(
        and(
          eq(specimenEvents.hospitalId, hospitalId),
          inArray(specimenEvents.kind, ["received", "rejected"]),
          inWindow(specimenEvents.recordedAt),
        ),
      ),
    // (e), HM-7: orders placed in the month while the hub said referred.
    tx
      .select({
        id: encounterOrders.id,
        placedAt: encounterOrders.effectiveAt,
        snapshot: encounterOrders.availabilitySnapshot,
        testCode: testCatalogue.code,
      })
      .from(encounterOrders)
      .innerJoin(testCatalogue, eq(testCatalogue.id, encounterOrders.testId))
      .where(
        and(
          eq(encounterOrders.hospitalId, hospitalId),
          eq(encounterOrders.kind, "lab"),
          inWindow(encounterOrders.effectiveAt),
          sql`${encounterOrders.availabilitySnapshot}->>'state' IN ('referred','down_referred')`,
        ),
      ),
    tx
      .select({ itemId: labControlChecks.itemId, at: labControlChecks.at })
      .from(labControlChecks)
      .where(
        and(
          eq(labControlChecks.hospitalId, hospitalId),
          eq(labControlChecks.hmisIqc, true),
          inWindow(labControlChecks.at),
        ),
      ),
    eqaRoundsFor(tx, hospitalId),
    tx.select().from(labStockItems).where(eq(labStockItems.hospitalId, hospitalId)),
    tx
      .select()
      .from(labStockTransactions)
      .where(and(eq(labStockTransactions.hospitalId, hospitalId), lt(labStockTransactions.at, to))),
  ]);

  const reportIds = versions.map((v) => v.id);
  const specimenIds = [...new Set(events.map((e) => e.specimenId))];
  const [observations, specimenRows] = await Promise.all([
    reportIds.length
      ? tx
          .select({
            id: clinicalObservations.id,
            reportId: clinicalObservations.reportId,
            conceptId: clinicalObservations.conceptId,
            code: clinicalObservations.valueCode,
            status: clinicalObservations.status,
            supersedesId: clinicalObservations.supersedesId,
            context: clinicalObservations.context,
          })
          .from(clinicalObservations)
          .where(inArray(clinicalObservations.reportId, reportIds))
      : Promise.resolve([]),
    specimenIds.length
      ? tx
          .select({
            id: specimens.id,
            patientId: specimens.patientUserId,
            specimenType: specimens.specimenType,
            encounterType: encounters.encounterType,
          })
          .from(specimens)
          .innerJoin(encounterOrders, eq(encounterOrders.id, specimens.orderId))
          .innerJoin(encounters, eq(encounters.id, encounterOrders.encounterId))
          .where(inArray(specimens.id, specimenIds))
      : Promise.resolve([]),
  ]);

  // HM-5: the kit of each HIV step is the signed algorithm version named on the outcome's context.
  const algorithmIds = [
    ...new Set(
      observations
        .map((o) => (o.context as { algorithmId?: string } | null)?.algorithmId)
        .filter((x): x is string => !!x),
    ),
  ];
  const algorithms = algorithmIds.length
    ? await tx
        .select({ id: labSignedConfigs.id, payload: labSignedConfigs.payload })
        .from(labSignedConfigs)
        .where(inArray(labSignedConfigs.id, algorithmIds))
    : [];
  const assaysOf = new Map(
    algorithms.map((a) => [a.id, (a.payload as Payload<"hiv_algorithm">).assays]),
  );

  const obsByReport = new Map<string, typeof observations>();
  for (const o of observations) {
    const list = obsByReport.get(o.reportId!) ?? [];
    list.push(o);
    obsByReport.set(o.reportId!, list);
  }
  const reports: HmisReport[] = versions.map((v) => {
    const rows = obsByReport.get(v.id) ?? [];
    const superseded = new Set(rows.map((o) => o.supersedesId));
    // A held component (preliminary inside a final report) and a voided value are not released results.
    const current = rows.filter(
      (o) => !superseded.has(o.id) && RELEASED.includes(o.status ?? "") && o.conceptId,
    );
    const outcome = rows.find((o) => o.conceptId === "obs.hiv_algorithm_outcome");
    const algorithmId = (outcome?.context as { algorithmId?: string } | null)?.algorithmId;
    return {
      id: v.id,
      logicalId: v.logicalId,
      version: v.version,
      hospitalId,
      testCode: v.testCode,
      status: v.status as HmisReport["status"],
      performer: v.performer as HmisReport["performer"],
      bedside: v.source === "poc_staff",
      resultAt: v.recordedAt,
      formResultAt: v.formAt,
      observations: current.map((o) => ({ conceptId: o.conceptId!, code: o.code })),
      hiv: {
        assays: (algorithmId && assaysOf.get(algorithmId)) || [],
        outcome: outcome?.code ?? null,
        purpose: v.purpose,
      },
    };
  });

  const byId = new Map(specimenRows.map((s) => [s.id, s]));
  const specimensOut = specimenIds.flatMap((id) => {
    const s = byId.get(id);
    if (!s) return [];
    const mine = events.filter((e) => e.specimenId === id);
    const received = mine.filter((e) => e.kind === "received").map((e) => e.at);
    const rejected = mine.find((e) => e.kind === "rejected");
    return [
      {
        id,
        hospitalId,
        patientId: s.patientId,
        specimenType: s.specimenType,
        encounterType: s.encounterType,
        receivedAt: received.length ? new Date(Math.max(...received.map(Number))) : null,
        collectedHere: true, // SC02 needs referral-in (Phase 4)
        rejected: rejected ? { at: rejected.at, reasonCode: rejected.reasonCode ?? "" } : null,
      },
    ];
  });

  return {
    reports,
    specimens: specimensOut,
    referrals: referrals.map((o) => {
      const snap = (o.snapshot ?? {}) as { state?: string; reason?: string | null };
      // P17: orders placed before the snapshot carried a reason have no key ("none", counted under Others);
      // a referred provision with no open problem is "referred".
      const reason =
        snap.reason ?? ("reason" in snap && snap.state === "referred" ? "referred" : null);
      return { orderId: o.id, hospitalId, testCode: o.testCode, placedAt: o.placedAt!, reason };
    }),
    controlChecks: checks
      .filter((c) => c.itemId)
      .map((c) => ({ hospitalId, itemId: c.itemId!, at: c.at, hmisIqc: true })),
    eqaRounds,
    stockItems: items.map((i) => ({
      id: i.id,
      hospitalId: i.hospitalId,
      name: i.name,
      kind: i.kind as StockKind,
      testsPerUnit: i.testsPerUnit === null ? null : Number(i.testsPerUnit),
      testCodes: i.testCodes,
      hmisTracerCode: i.hmisTracerCode,
      minMonths: i.minMonths === null ? null : Number(i.minMonths),
      maxMonths: i.maxMonths === null ? null : Number(i.maxMonths),
    })),
    stockTxs: txs.map((t) => ({
      hospitalId: t.hospitalId,
      itemId: t.itemId,
      lotId: t.lotId,
      kind: t.kind as TxKind,
      quantity: t.quantity,
      reason: t.reason,
      at: t.at,
    })),
  };
}

/** HM-3: the count for one hospital and month, over one read of its source rows. */
export async function countMonth(
  tx: EmrTx,
  hospitalId: string,
  month: string,
  mapping: HmisMapping,
  manual: Record<string, number>,
): Promise<Count105> {
  const [sources, menu, from] = await Promise.all([
    monthSources(tx, hospitalId, month),
    inHouseMenu(tx, hospitalId),
    referralRecordsFrom(tx, hospitalId),
  ]);
  const counted = count105({ hospitalId, month, timeZone: TZ, mapping, menu, manual, ...sources });
  // Lab Phase 4 (HM-14..HM-17): from the month the lab lead declares, 10.4 comes from referral records; the
  // hand-entered 10.4 cells are retired for that month (HM-16).
  if (!recordsCover104(month, from)) return counted;
  const rows = hmisForm()
    .form.rows.filter((r) => r.section === "10.4")
    .map((r) => r.code)
    .filter((c): c is string => !!c);
  const cells = referralCells104({
    hospitalId,
    month,
    timeZone: TZ,
    mapping,
    rows,
    referrals: await referralRecords(tx, hospitalId),
  });
  const ignored = Object.keys(cells).filter((k) => counted.cells[k]?.manual);
  return {
    ...counted,
    cells: { ...counted.cells, ...cells },
    manualIgnored: [...counted.manualIgnored, ...ignored],
  };
}

/** HM-16: the signed operational setting naming the first month 10.4 comes from records. */
export async function referralRecordsFrom(tx: EmrTx, hospitalId: string): Promise<string | null> {
  const ops = inForce(await loadConfigs(tx, hospitalId), "referral_ops", "settings", new Date());
  return ops?.payload.hmis104RecordsFrom ?? null;
}

/** HM-14: every referral of the hospital, with its tests (by code), for the 10.4 count. */
async function referralRecords(tx: EmrTx, hospitalId: string): Promise<HmisReferralRecord[]> {
  const rows = await tx
    .select({
      id: labReferrals.id,
      routine: labReferrals.routine,
      state: labReferrals.state,
      sentAt: labReferrals.sentAt,
      completedAt: labReferrals.completedAt,
      stateAt: labReferrals.stateAt,
      testCode: testCatalogue.code,
    })
    .from(labReferrals)
    .innerJoin(specimens, eq(specimens.id, labReferrals.specimenId))
    .innerJoin(encounterOrders, eq(encounterOrders.id, specimens.orderId))
    .leftJoin(testCatalogue, eq(testCatalogue.id, encounterOrders.testId))
    .where(eq(labReferrals.hospitalId, hospitalId));
  return rows.map((r) => ({
    referralId: r.id,
    hospitalId,
    testCodes: r.testCode ? [r.testCode] : [],
    routine: r.routine,
    state: r.state,
    sentAt: r.sentAt,
    completedAt: r.completedAt,
    stateAt: r.stateAt,
  }));
}

/* ─── HM-10..HM-12: the report's lifecycle ──────────────────────────────── */

export type ReportRow = typeof labHmisReports.$inferSelect;

/** Every revision of a month, newest first. */
export async function revisionsOf(tx: EmrTx, hospitalId: string, month: string) {
  return tx
    .select()
    .from(labHmisReports)
    .where(
      and(eq(labHmisReports.hospitalId, hospitalId), eq(labHmisReports.month, firstDay(month))),
    )
    .orderBy(desc(labHmisReports.revision));
}

async function latest(tx: EmrTx, hospitalId: string, month: string): Promise<ReportRow | null> {
  const [r] = await tx
    .select()
    .from(labHmisReports)
    .where(
      and(eq(labHmisReports.hospitalId, hospitalId), eq(labHmisReports.month, firstDay(month))),
    )
    .orderBy(desc(labHmisReports.revision))
    .limit(1)
    .for("update");
  return r ?? null;
}

async function countFor(
  tx: EmrTx,
  a: Actor,
  month: string,
  manual: Record<string, number>,
  f: FormArg,
) {
  const mapping = await mappingForCount(tx, a.hospitalId, f.form);
  if (!mapping)
    throw invalid("There is no HMIS mapping yet: the laboratory lead maps the form first.");
  const count = await countMonth(tx, a.hospitalId, month, mapping.payload, manual);
  const signed = mapping.status === "signed";
  return {
    ...splitCells(count.cells),
    formHash: f.hash,
    mappingConfigId: signed ? mapping.id : null,
    mappingVersion: signed ? mapping.version : null,
  };
}

/** HM-3, HM-10: (re)count the month into a draft. A checked report goes back to draft; a signed one never. */
export async function generateHmis(
  tx: EmrTx,
  a: Actor,
  input: { month: string },
  f: FormArg = hmisForm(),
): Promise<string> {
  const r = await latest(tx, a.hospitalId, input.month);
  if (r && (r.state === "signed" || r.state === "exported"))
    throw conflict("This month is signed. Prepare a revision to count it again.");
  const manual = (r?.manual ?? {}) as Record<string, number>;
  const counted = await countFor(tx, a, input.month, manual, f);
  if (r) {
    await tx
      .update(labHmisReports)
      .set({ ...counted, manual, state: "draft", checkedBy: null, checkedAt: null })
      .where(eq(labHmisReports.id, r.id));
    return r.id;
  }
  const [row] = await tx
    .insert(labHmisReports)
    .values({
      hospitalId: a.hospitalId,
      month: firstDay(input.month),
      revision: 1,
      ...counted,
      manual,
    })
    .returning({ id: labHmisReports.id });
  return row!.id;
}

/** HM-11: "Prepare revision": revision n + 1 in draft, counted afresh, the hand-entered cells carried over. */
export async function prepareRevision(
  tx: EmrTx,
  a: Actor,
  input: { month: string },
  f: FormArg = hmisForm(),
): Promise<string> {
  const r = await latest(tx, a.hospitalId, input.month);
  if (!r || (r.state !== "signed" && r.state !== "exported"))
    throw conflict("Only a signed month gets a revision; this one is still open.");
  const manual = r.manual as Record<string, number>;
  const counted = await countFor(tx, a, input.month, manual, f);
  const [row] = await tx
    .insert(labHmisReports)
    .values({
      hospitalId: a.hospitalId,
      month: r.month,
      revision: r.revision + 1,
      ...counted,
      manual,
    })
    .returning({ id: labHmisReports.id });
  return row!.id;
}

/**
 * HM-5, HM-6, HM-8: the cells entered by hand: 10.3 repeat testers and DNA-confirmed, every 10.4 cell (until
 * referral tracking), 10.5's confirmatory and QA re-testing columns and every 10.6 cell (until microbiology).
 */
export function manualKeys(form: HmisForm): string[] {
  const hand: Record<string, string[] | "all"> = {
    "10.3": ["Repeat Testers", "DNA Confirmed Tests"],
    "10.4": "all",
    "10.5": ["Confirmatory testing", "For QA re-testing"],
    "10.6": "all",
  };
  return form.rows.flatMap((r) => {
    const cols = hand[r.section];
    if (!cols) return [];
    return r.cells
      .filter((c) => cols === "all" || cols.includes(c.column))
      .map((c) => cellKey(rowKey(r), c.column));
  });
}

export async function saveManualCells(
  tx: EmrTx,
  a: Actor,
  input: { month: string; cells: Record<string, number | null> },
  f: FormArg = hmisForm(),
): Promise<string> {
  const r = await latest(tx, a.hospitalId, input.month);
  if (!r) throw conflict("Generate the month first.");
  if (r.state !== "draft") throw conflict("Only a draft takes hand-entered numbers.");
  const records = recordsCover104(input.month, await referralRecordsFrom(tx, a.hospitalId));
  const allowed = new Set(
    manualKeys(f.form).filter(
      (k) =>
        !(
          records && f.form.rows.some((r) => r.section === "10.4" && k.startsWith(`${rowKey(r)}|`))
        ),
    ),
  );
  const manual = { ...(r.manual as Record<string, number>) };
  const cells = { ...(r.cells as Record<string, StoredCell>) };
  for (const [key, value] of Object.entries(input.cells)) {
    if (!allowed.has(key)) throw invalid(`${key.replace("|", " · ")} is counted from the records.`);
    if (value === null) {
      delete manual[key];
      delete cells[key];
    } else {
      manual[key] = value;
      cells[key] = { value, manual: true };
    }
  }
  await tx.update(labHmisReports).set({ manual, cells }).where(eq(labHmisReports.id, r.id));
  return r.id;
}

/** HM-10: the laboratory lead checks the draft (the action holds `lab.hmis.check`). */
export async function checkHmis(
  tx: EmrTx,
  a: Actor,
  input: { month: string; revision: number },
  now: Date,
): Promise<string> {
  const r = await latest(tx, a.hospitalId, input.month);
  if (!r || r.revision !== input.revision)
    throw conflict("A newer revision exists: reload the page.");
  const e = hmisTransition(r.state as never, "checked", {
    isLead: true,
    isInCharge: false,
    freshSecondFactor: false,
  });
  if (e) throw conflict("Only a draft is checked.");
  await tx
    .update(labHmisReports)
    .set({ state: "checked", checkedBy: a.userId, checkedAt: now })
    .where(eq(labHmisReports.id, r.id));
  return r.id;
}

/**
 * HM-10: the Health Unit In-Charge signs with a fresh second factor; the cells, their sources and the mapping
 * version freeze (the 0117 trigger keeps them). D-LAB1-12: the person who checked does not also sign when
 * another In-Charge is designated.
 */
export async function signHmis(
  tx: EmrTx,
  a: Actor,
  input: { month: string; revision: number; freshSecondFactor: boolean },
  now: Date,
): Promise<string> {
  const r = await latest(tx, a.hospitalId, input.month);
  if (!r || r.revision !== input.revision)
    throw conflict("A newer revision exists: reload the page.");
  const roles = await hmisRolesFor(tx, a.hospitalId, a.userId, now);
  const e = hmisTransition(r.state as never, "signed", {
    isLead: false,
    isInCharge: roles.includes("in_charge"),
    freshSecondFactor: input.freshSecondFactor,
  });
  if (e === "not_in_charge")
    throw new EmrWriteError("forbidden", "Only the Health Unit In-Charge signs the HMIS 105.");
  if (e === "second_factor_not_fresh")
    throw new EmrWriteError("forbidden", "reauth: enter your authenticator code to sign.");
  if (e) throw conflict("The laboratory lead checks the report before it is signed.");
  if (!r.mappingConfigId)
    throw conflict(
      "These numbers were counted with an unsigned mapping. Sign the mapping, then count the month again.",
    );
  if (r.checkedBy === a.userId) {
    const day = now.toLocaleDateString("en-CA", { timeZone: TZ });
    const [other] = await tx
      .select({ id: hmisDesignations.id })
      .from(hmisDesignations)
      .where(
        and(
          eq(hmisDesignations.hospitalId, a.hospitalId),
          eq(hmisDesignations.role, "in_charge"),
          sql`${hmisDesignations.userId} <> ${a.userId}`,
          sql`${hmisDesignations.startsOn} <= ${day}`,
          or(isNull(hmisDesignations.endsOn), sql`${hmisDesignations.endsOn} >= ${day}`),
        ),
      )
      .limit(1);
    if (other)
      throw new EmrWriteError("forbidden", "You checked this report: another In-Charge signs it.");
  }
  await tx
    .update(labHmisReports)
    .set({ state: "signed", signedBy: a.userId, signedAt: now })
    .where(eq(labHmisReports.id, r.id));
  return r.id;
}

/**
 * HM-12: the CSV in the form's eHMIS data-element order. While the form has no eHMIS ids (OA-2) the file says
 * so in comment lines naming each cell and its value: ids are null, never invented. Exporting a signed report
 * records the export, once.
 */
export async function exportHmis(
  tx: EmrTx,
  a: Actor,
  input: { month: string; revision: number },
  now: Date,
  f: FormArg = hmisForm(),
): Promise<{ csv: string; missingIds: string[] }> {
  const [r] = await tx
    .select()
    .from(labHmisReports)
    .where(
      and(
        eq(labHmisReports.hospitalId, a.hospitalId),
        eq(labHmisReports.month, firstDay(input.month)),
        eq(labHmisReports.revision, input.revision),
      ),
    );
  if (!r) throw new EmrWriteError("not_found", "That report was not found.");
  const mapping = r.mappingConfigId
    ? (await mappingVersions(tx, a.hospitalId, f.form)).find((m) => m.id === r.mappingConfigId)
    : null;
  const orgUnit = mapping?.payload.orgUnitCode ?? null;
  const cells = joinCells(r.cells as Record<string, StoredCell>, {});
  const out = toCsv(f.form, cells, { month: input.month, orgUnit: orgUnit ?? "null" });
  const notes = [
    `# HMIS 105 laboratory, ${input.month}, revision ${r.revision}, ${r.state}.`,
    ...(orgUnit ? [] : ["# Organisation unit code: null (not set in the signed mapping)."]),
    ...(out.missingIds.length
      ? [
          `# eHMIS data-element ids: null for ${out.missingIds.length} cells (not yet supplied, owner action OA-2). These cells are not rows of this file; nothing is invented:`,
          ...out.missingIds.map(
            (k) =>
              `# null,null,${cells[k]!.value},${input.month.replace("-", "")},${orgUnit ?? "null"},${k}`,
          ),
        ]
      : []),
  ];
  if (r.state === "signed")
    await tx
      .update(labHmisReports)
      .set({ state: "exported", exportedBy: a.userId, exportedAt: now })
      .where(eq(labHmisReports.id, r.id));
  return { csv: `${notes.join("\n")}\n${out.csv}`, missingIds: out.missingIds };
}

/** HM-11: the frozen cells of the newest signed revision against a fresh count, with the records behind each. */
export async function changedSinceSigning(
  tx: EmrTx,
  hospitalId: string,
  month: string,
  f: FormArg = hmisForm(),
): Promise<{ revision: number; changes: CellChange[]; downtime: boolean } | null> {
  const signed = (await revisionsOf(tx, hospitalId, month)).find(
    (r) => r.state === "signed" || r.state === "exported",
  );
  if (!signed?.mappingConfigId) return null;
  const mapping = (await mappingVersions(tx, hospitalId, f.form)).find(
    (m) => m.id === signed.mappingConfigId,
  );
  if (!mapping) return null;
  const fresh = await countMonth(
    tx,
    hospitalId,
    month,
    mapping.payload,
    signed.manual as Record<string, number>,
  );
  const changes = revisionDiff(
    joinCells(
      signed.cells as Record<string, StoredCell>,
      signed.sources as Record<string, string[]>,
    ),
    fresh.cells,
  );
  // The usual cause: paper results from downtime, entered after the signature for a day before it.
  const added = [...new Set(changes.flatMap((c) => c.added).map((s) => s.split(":")[0]!))];
  const late = added.length
    ? await tx
        .select({ id: downtimeEntries.reportId })
        .from(downtimeEntries)
        .innerJoin(diagnosticReports, eq(diagnosticReports.id, downtimeEntries.reportId))
        .where(inArray(diagnosticReports.logicalId, added))
        .limit(1)
    : [];
  return { revision: signed.revision, changes, downtime: late.length > 0 };
}

/* ─── HM-2: the mapping, saved and signed ───────────────────────────────── */

export async function saveMapping(
  tx: EmrTx,
  a: Actor,
  payload: MappingPayload,
  now: Date,
  f: FormArg = hmisForm(),
): Promise<string> {
  if (payload.formHash !== f.hash)
    throw invalid("This mapping was made for another version of the form file. Reload the page.");
  return saveConfigDraft(tx, a, { kind: "hmis_mapping", key: mappingKey(f.form), payload }, now);
}

/** What stops a signature: the engine's errors (S40) and a form file changed since the mapping was made. */
export async function mappingBlocks(
  tx: EmrTx,
  hospitalId: string,
  payload: MappingPayload,
  f: FormArg,
): Promise<string[]> {
  const menu = await inHouseMenu(tx, hospitalId);
  return [
    ...(payload.formHash === f.hash ? [] : ["form_changed"]),
    ...mappingSignErrors(payload, f.form, menu),
  ];
}

export const BLOCK_WORDS: Record<string, string> = {
  form_changed: "The form file changed after this mapping was made.",
  form_not_verified:
    "The form rows are not yet verified against eHMIS (owner action OA-1): nothing can be signed until they are.",
};
export const blockWords = (e: string) =>
  BLOCK_WORDS[e] ??
  (e.startsWith("unmapped_test:")
    ? `${e.slice(14)} is on the menu and in no row: map it, put it in an Others row, or mark it not reported.`
    : `Not on the form: ${e.split(":").slice(1).join(":")}.`);

/** S40: the lead signs first, then the HMIS focal person (designated, fresh factor), each only when unblocked. */
export async function signMapping(
  tx: EmrTx,
  a: Actor & { as: "lead" | "focal" },
  input: { configId: string; exceptionNote: string | null },
  now: Date,
  f: FormArg = hmisForm(),
): Promise<string> {
  const [c] = await tx
    .select()
    .from(labSignedConfigs)
    .where(
      and(
        eq(labSignedConfigs.id, input.configId),
        eq(labSignedConfigs.hospitalId, a.hospitalId),
        eq(labSignedConfigs.kind, "hmis_mapping"),
      ),
    );
  if (!c) throw new EmrWriteError("not_found", "That mapping was not found.");
  if (a.as === "focal" && !(await hmisRolesFor(tx, a.hospitalId, a.userId, now)).includes("focal"))
    throw new EmrWriteError("forbidden", "Only the HMIS focal person co-signs the mapping.");
  const blocks = await mappingBlocks(tx, a.hospitalId, c.payload as MappingPayload, f);
  if (blocks.length) throw invalid(blocks.map(blockWords).join(" "));
  await signConfig(tx, { ...a, as: a.as }, input, now);
  return c.id;
}

/* ─── E-LAB3-11: designations, set by the hospital admin ────────────────── */

export async function setDesignation(
  tx: EmrTx,
  a: Actor,
  input: { role: HmisRole; userId: string; startsOn: string },
  now: Date,
): Promise<string> {
  const [row] = await tx
    .insert(hmisDesignations)
    .values({ hospitalId: a.hospitalId, ...input, setBy: a.userId, setAt: now })
    .returning({ id: hmisDesignations.id });
  return row!.id;
}

export async function endDesignation(
  tx: EmrTx,
  a: Actor,
  input: { id: string; endsOn: string },
): Promise<string> {
  const [row] = await tx
    .update(hmisDesignations)
    .set({ endsOn: input.endsOn })
    .where(
      and(
        eq(hmisDesignations.id, input.id),
        eq(hmisDesignations.hospitalId, a.hospitalId),
        isNull(hmisDesignations.endsOn),
        sql`${hmisDesignations.startsOn} <= ${input.endsOn}`,
      ),
    )
    .returning({ id: hmisDesignations.id });
  if (!row) throw conflict("That designation is already ended, or ends before it starts.");
  return row.id;
}

/* ─── The page's one read ───────────────────────────────────────────────── */

/**
 * §5.11: every revision of the month, the mapping, a fresh count (what is unmapped this month, purposes not
 * recorded) and, once signed, "Changed since signing" (HM-11, computed on view).
 */
export async function loadHmisMonth(
  tx: EmrTx,
  hospitalId: string,
  month: string,
  f: FormArg = hmisForm(),
) {
  const [revisions, mapping, versions] = await Promise.all([
    revisionsOf(tx, hospitalId, month),
    mappingForCount(tx, hospitalId, f.form),
    mappingVersions(tx, hospitalId, f.form),
  ]);
  const manual = (revisions[0]?.manual ?? {}) as Record<string, number>;
  const [fresh, changed] = await Promise.all([
    mapping ? countMonth(tx, hospitalId, month, mapping.payload, manual) : null,
    changedSinceSigning(tx, hospitalId, month, f),
  ]);
  return {
    revisions,
    mapping: mapping && {
      id: mapping.id,
      version: mapping.version,
      status: mapping.status,
      signedAt: mapping.inForceFrom,
      orgUnitCode: mapping.payload.orgUnitCode,
    },
    draftMapping: versions.find((v) => v.status === "draft") ?? null,
    unmapped: fresh?.unmapped ?? [],
    purposeNotRecorded: fresh?.purposeNotRecorded ?? 0,
    changed,
  };
}

/** HM-11, Law 7: the records behind one cell, for lab roles (patients through the page's audited reveal). */
export async function recordsFor(tx: EmrTx, hospitalId: string, sources: readonly string[]) {
  const ids = [...new Set(sources.map((s) => s.split(":")[0]!))].filter((s) =>
    /^[0-9a-f-]{36}$/.test(s),
  );
  if (!ids.length) return { results: [], specimens: [], orders: [], other: sources.length };
  const [results, specimenRows, orderRows] = await Promise.all([
    tx
      .selectDistinctOn([diagnosticReports.logicalId], {
        logicalId: diagnosticReports.logicalId,
        orderId: diagnosticReports.orderId,
        patientUserId: diagnosticReports.patientUserId,
        at: diagnosticReports.recordedAt,
        status: diagnosticReports.status,
        sensitivity: diagnosticReports.sensitivity,
        test: testCatalogue.display,
      })
      .from(diagnosticReports)
      .innerJoin(testCatalogue, eq(testCatalogue.id, diagnosticReports.testId))
      .where(
        and(
          eq(diagnosticReports.hospitalId, hospitalId),
          inArray(diagnosticReports.logicalId, ids),
        ),
      )
      .orderBy(diagnosticReports.logicalId, desc(diagnosticReports.version)),
    tx
      .select({
        id: specimens.id,
        orderId: specimens.orderId,
        patientUserId: specimens.patientUserId,
        type: specimens.specimenType,
        sensitivity: encounterOrders.sensitivity,
        test: testCatalogue.display,
      })
      .from(specimens)
      .innerJoin(encounterOrders, eq(encounterOrders.id, specimens.orderId))
      .innerJoin(testCatalogue, eq(testCatalogue.id, encounterOrders.testId))
      .where(and(eq(specimens.hospitalId, hospitalId), inArray(specimens.id, ids))),
    tx
      .select({
        id: encounterOrders.id,
        patientUserId: encounterOrders.patientUserId,
        at: encounterOrders.effectiveAt,
        sensitivity: encounterOrders.sensitivity,
        test: testCatalogue.display,
      })
      .from(encounterOrders)
      .innerJoin(testCatalogue, eq(testCatalogue.id, encounterOrders.testId))
      .where(and(eq(encounterOrders.hospitalId, hospitalId), inArray(encounterOrders.id, ids))),
  ]);
  const found = new Set([
    ...results.map((r) => r.logicalId),
    ...specimenRows.map((r) => r.id),
    ...orderRows.map((r) => r.id),
  ]);
  // QC checks, EQA samples and stock items: counted, never patients (their own pages hold them).
  const other = sources.filter((s) => !found.has(s.split(":")[0]!)).length;
  return { results, specimens: specimenRows, orders: orderRows, other };
}
