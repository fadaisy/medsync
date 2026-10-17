import "server-only";

import type { ComponentEntry, UnitRegistry } from "./referral-results";
import type { EmrTx } from "@/lib/emr/db";
import type { WriteCtx } from "@/lib/emr/write/context";
import type { ResultValueInput } from "@/lib/emr/write/results";
import { and, desc, eq, inArray, isNull, ne, sql } from "drizzle-orm";

import { LAB4 } from "@/content/lab-phase-4";
import {
  clinicalObservations,
  diagnosticReports,
  encounterOrders,
  exchangeEvents,
  exchangeMessages,
  labComponentMeasures,
  labMatchItems,
  labPartners,
  labReferrals,
  labResultAttachments,
  labResultSnapshots,
  labTranscriptionChecks,
  patientProfiles,
  ucumUnits,
} from "@/db/schema";
import { EmrWriteError } from "@/lib/emr/write/context";
import { enterReferredResult } from "@/lib/emr/write/results";
import { decrypt, encrypt } from "@/lib/encryption";
import { contentHash } from "@/lib/exchange/outbox";
import { fromCanonical, toCanonical } from "@/lib/units";
import { unitsRangesLive } from "./criticals/readiness";
import { alertAfterRelease } from "./criticals/store";
import {
  compareIdentity,
  componentEntry,
  criticalCheckInput,
  provenance,
  releaseErrors,
  secondPersonRule,
  snapshotFields,
} from "./referral-results";
import { appendEvent, partnerConfig } from "./referral-store";

/**
 * Results back on the database (Lab Phase 4 §6.3, RB-1..RB-10; gate-a-proposal §3.3). A returned result files on
 * the referral's original order through `enterReferredResult` (the shared version writer), then each value's
 * snapshot records the reference lab's range and what was printed, and the value in this hospital's unit so
 * Phase 1's critical check reads it unchanged (RB-5).
 */

type Actor = { userId: string; hospitalId: string };
const invalid = (m: string) => new EmrWriteError("invalid", m);

export interface ReferralForEntry {
  id: string;
  number: string;
  state: string;
  orderId: string;
  specimenId: string;
  patientUserId: string;
  partnerId: string;
  partnerName: string;
  theirNumbers: string[];
  testId: string | null;
  cancelRequested: boolean;
}

export async function referralForEntry(
  tx: EmrTx,
  hospitalId: string,
  referralId: string,
): Promise<ReferralForEntry> {
  const [r] = await tx
    .select({
      id: labReferrals.id,
      number: labReferrals.number,
      state: labReferrals.state,
      orderIds: labReferrals.orderIds,
      specimenId: labReferrals.specimenId,
      patientUserId: labReferrals.patientUserId,
      partnerId: labReferrals.partnerId,
      partnerName: labPartners.name,
      externalIds: labReferrals.externalIds,
      cancelRequested: labReferrals.cancelRequested,
    })
    .from(labReferrals)
    .innerJoin(labPartners, eq(labPartners.id, labReferrals.partnerId))
    .where(and(eq(labReferrals.id, referralId), eq(labReferrals.hospitalId, hospitalId)));
  if (!r) throw new EmrWriteError("not_found", "That referral was not found.");
  const [o] = await tx
    .select({ testId: encounterOrders.testId })
    .from(encounterOrders)
    .where(eq(encounterOrders.id, r.orderIds[0]!));
  return {
    ...r,
    orderId: r.orderIds[0]!,
    theirNumbers: Object.values((r.externalIds ?? {}) as Record<string, string>),
    testId: o?.testId ?? null,
  };
}

/** The patient's name, date of birth and hospital number, for comparison on the server only (never returned). */
async function patientForCompare(tx: EmrTx, patientUserId: string) {
  const [p] = await tx
    .select({
      code: patientProfiles.patientCode,
      first: patientProfiles.firstNameEncrypted,
      surname: patientProfiles.surnameEncrypted,
      dob: patientProfiles.dateOfBirth,
    })
    .from(patientProfiles)
    .where(eq(patientProfiles.id, patientUserId));
  const open = (v: string | null) => {
    try {
      return v ? decrypt(v) : "";
    } catch {
      return "";
    }
  };
  return {
    name: p ? `${open(p.first)} ${open(p.surname)}`.trim() || null : null,
    birthDate: p?.dob ? String(p.dob) : null,
    hospitalNumber: p?.code ?? null,
  };
}

/**
 * RB-2, S21: the paper's form number, name and date of birth against the referral. A disagreement refuses entry
 * and opens an item in the reconciliation queue (the MA-6 path), with no values in it.
 */
export async function checkPaperIdentity(
  tx: EmrTx,
  a: Actor,
  i: { referralId: string; theirNumber: string; name: string; birthDate: string },
  now: Date,
): Promise<{ agrees: true } | { agrees: false; itemId: string }> {
  const r = await referralForEntry(tx, a.hospitalId, i.referralId);
  const p = await patientForCompare(tx, r.patientUserId);
  const c = compareIdentity(
    { theirNumber: i.theirNumber, name: i.name, birthDate: i.birthDate },
    { theirNumbers: r.theirNumbers, name: p.name, birthDate: p.birthDate },
  );
  if (c.agrees) return { agrees: true };
  // The typed identity is the message: kept encrypted, never shown in the queue (EX-9, MA-5).
  const raw = JSON.stringify({ referral: r.number, typed: i });
  const sha = contentHash(`${raw}:${now.toISOString()}`);
  const [m] = await tx
    .insert(exchangeMessages)
    .values({
      hospitalId: a.hospitalId,
      senderId: null,
      direction: "in",
      channel: "manual_note",
      contentType: "application/json",
      payloadCiphertext: encrypt(raw),
      sha256: sha,
      about: `Paper report, form ${i.theirNumber.slice(0, 40)}`,
      receivedAt: now,
    })
    .returning({ id: exchangeMessages.id });
  await tx
    .insert(exchangeEvents)
    .values({ hospitalId: a.hospitalId, messageId: m!.id, state: "received", at: now });
  await tx.insert(exchangeEvents).values({
    hospitalId: a.hospitalId,
    messageId: m!.id,
    state: "waiting_match",
    detail: { reason: "demographics_disagree" },
    at: now,
  });
  const [item] = await tx
    .insert(labMatchItems)
    .values({
      hospitalId: a.hospitalId,
      messageId: m!.id,
      componentKey: "paper",
      reason: "demographics_disagree",
      candidateReferralId: r.id,
      comparison: c.rows,
      state: "waiting",
      createdAt: now,
    })
    .returning({ id: labMatchItems.id });
  return { agrees: false, itemId: item!.id };
}

/** The unit registry for one component: the curated UCUM list, and conversion through lib/units only. */
export async function registryFor(
  tx: EmrTx,
  hospitalId: string,
  testId: string | null,
  conceptId: string,
): Promise<UnitRegistry & { measure: { id: string; version: number } | null }> {
  const units = await tx
    .select({ code: ucumUnits.code, display: ucumUnits.display })
    .from(ucumUnits);
  const known = new Set(units.flatMap((u) => [u.code, u.display]));
  const toCode = new Map(units.map((u) => [u.display, u.code]));
  const [m] = testId
    ? await tx
        .select()
        .from(labComponentMeasures)
        .where(
          and(
            eq(labComponentMeasures.hospitalId, hospitalId),
            eq(labComponentMeasures.testId, testId),
            eq(labComponentMeasures.conceptId, conceptId),
            isNull(labComponentMeasures.supersededBy),
          ),
        )
    : [];
  const hospitalUnit = m?.unitUcum ?? "";
  return {
    knows: (u) => known.has(u),
    hospitalUnit,
    measure: m ? { id: m.id, version: m.version } : null,
    toHospital: (value, unit) => {
      if (!hospitalUnit) return null;
      const from = toCode.get(unit) ?? unit;
      const c = toCanonical(conceptId, value, from);
      if ("error" in c) return null;
      const h = fromCanonical(conceptId, c.value, hospitalUnit);
      return "error" in h ? null : h.value;
    },
  };
}

/** RB-7, P13: other people with a lab write in this hospital within the presence window (operational). */
async function activeOthers(tx: EmrTx, a: Actor, since: Date) {
  const rows = (await tx.execute(sql`
    SELECT actor AS "userId", max(at) AS "lastActiveAt" FROM (
      SELECT recorded_by_user_id AS actor, recorded_at AS at FROM diagnostic_reports
       WHERE hospital_id = ${a.hospitalId} AND kind = 'lab' AND recorded_at >= ${since.toISOString()}
      UNION ALL
      SELECT actor_user_id, recorded_at FROM specimen_events
       WHERE hospital_id = ${a.hospitalId} AND recorded_at >= ${since.toISOString()}
      UNION ALL
      SELECT actor_user_id, recorded_at FROM lab_referral_events
       WHERE hospital_id = ${a.hospitalId} AND actor_user_id IS NOT NULL AND recorded_at >= ${since.toISOString()}
    ) w WHERE actor <> ${a.userId} GROUP BY actor`)) as unknown as
    | { userId: string; lastActiveAt: string }[]
    | { rows: { userId: string; lastActiveAt: string }[] };
  return (Array.isArray(rows) ? rows : rows.rows).map((r) => ({
    userId: r.userId,
    lastActiveAt: new Date(r.lastActiveAt),
  }));
}

export interface PaperResultInput {
  referralId: string;
  theirNumber: string;
  name: string;
  birthDate: string;
  theirReport: string;
  reportedAt: string;
  authorisedBy: string;
  components: {
    conceptId: string;
    value: string;
    unitAsPrinted: string;
    rangeAsPrinted: string | null;
  }[];
  checkedByUserId: string | null;
  scanConfirmed: boolean;
  calledWard: string | null;
  clientKey: string;
}

/**
 * RB-1..RB-8, S20–S27: enter a result typed from the paper and release it to the doctor. Refused when the identity
 * disagrees (RB-2), a unit is unknown (RB-3) or the scan is missing (RB-6); when a second person is active and has
 * not checked it, it waits for them (RB-7), else it releases marked "Entered by one person" with a check task.
 */
export async function releasePaperResult(
  ctx: WriteCtx,
  i: PaperResultInput,
): Promise<{ id: string; oneEntrant: boolean; notes: string[] } | { waitingItemId: string }> {
  const { tx, actor, now } = ctx;
  const a = { userId: actor.userId, hospitalId: actor.hospitalId };
  const r = await referralForEntry(tx, a.hospitalId, i.referralId);
  if (
    ![
      "handed_over",
      "at_hub",
      "received_by_lab",
      "accepted",
      "in_progress",
      "on_hold",
      "cancelled",
    ].includes(r.state) &&
    !r.cancelRequested
  )
    throw new EmrWriteError("conflict", "This referral is not waiting for a result.");
  // RB-2: a disagreement is not an error to roll back: the reconciliation item must stay. Nothing else is written.
  const identity = await checkPaperIdentity(tx, a, i, now);
  if (!identity.agrees) return { waitingItemId: identity.itemId };
  const [scan] = await tx
    .select({ id: labResultAttachments.id })
    .from(labResultAttachments)
    .where(
      and(
        eq(labResultAttachments.referralId, r.id),
        eq(labResultAttachments.hospitalId, a.hospitalId),
      ),
    )
    .limit(1);
  const entries: {
    conceptId: string;
    e: ComponentEntry;
    registry: Awaited<ReturnType<typeof registryFor>>;
  }[] = [];
  for (const c of i.components) {
    const registry = await registryFor(tx, a.hospitalId, r.testId, c.conceptId);
    entries.push({
      conceptId: c.conceptId,
      registry,
      e: componentEntry({
        value: c.value,
        unitAsPrinted: c.unitAsPrinted,
        rangeAsPrinted: c.rangeAsPrinted,
        registry,
      }),
    });
  }
  const errors = releaseErrors({ scanAttached: !!scan, entries: entries.map((x) => x.e) });
  if (errors.includes("scan_required")) throw invalid("Attach the scan of the paper report first.");
  if (errors.includes("unknown_unit"))
    throw invalid(entries.find((x) => x.e.blocks.length)!.e.blocks[0]!);
  if (errors.length) throw invalid("Enter at least one value.");
  const ops = await partnerConfig(tx, a.hospitalId, "referral_ops", "settings", now);
  const presence = ops?.payload.presenceMinutes ?? 30;
  const check = secondPersonRule({
    enteredBy: a.userId,
    checkedBy: i.checkedByUserId,
    scanConfirmed: i.scanConfirmed,
    activeOthers: await activeOthers(tx, a, new Date(now.getTime() - presence * 60_000)),
    presenceMinutes: presence,
    now,
  });
  if (check === "needs_checker")
    throw new EmrWriteError(
      "conflict",
      "A second person is on duty: they check it against the paper before release.",
    );
  const oneEntrant = check === "one_person";
  const prov = provenance({
    partner: r.partnerName,
    theirReport: i.theirReport,
    reportedAt: i.reportedAt,
    authorisedBy: i.authorisedBy,
    enteredBy: a.userId,
    checkedBy: oneEntrant ? null : i.checkedByUserId,
    oneEntrant,
    cancelledAfterSending: r.cancelRequested || r.state === "cancelled",
  });
  const values: ResultValueInput[] = entries.map(({ conceptId, e }) => ({
    conceptId,
    value: e.value,
    unit: e.unit,
    unitConfirmed: true,
    ...(e.range && (e.range.low !== undefined || e.range.high !== undefined)
      ? {
          referenceRange: {
            ...(e.range.low !== undefined ? { low: e.range.low } : {}),
            ...(e.range.high !== undefined ? { high: e.range.high } : {}),
            unit: e.unit,
          },
        }
      : {}),
    ...(e.flag
      ? {
          labInterpretation:
            e.flag === "low" ? "L" : e.flag === "high" ? "H" : e.flag === "normal" ? "N" : "A",
        }
      : {}),
    extraContext: { printed: { range: e.range?.text ?? null, flag: e.flag } },
  }));
  const report = await enterReferredResult(ctx, {
    patientUserId: r.patientUserId,
    orderId: r.orderId,
    referralId: r.id,
    performerLabName: r.partnerName,
    entryMode: "transcribed",
    values,
    checkedByUserId: oneEntrant ? null : i.checkedByUserId,
    provenance: {
      ...prov,
      components: Object.fromEntries(
        entries.map(({ conceptId, e }) => [conceptId, snapshotFields(e).printed]),
      ),
      calledWard: i.calledWard,
    } as unknown as Record<string, unknown>,
    clientKey: i.clientKey,
  });
  await writeSnapshots(tx, a, report.id, r.patientUserId, entries);
  await tx.insert(labTranscriptionChecks).values(
    oneEntrant
      ? { hospitalId: a.hospitalId, reportId: report.id, kind: "task_opened", at: now }
      : {
          hospitalId: a.hospitalId,
          reportId: report.id,
          kind: "checked_at_entry",
          checkerUserId: i.checkedByUserId,
          scanConfirmed: true,
          at: now,
        },
  );
  await appendEvent(
    tx,
    a,
    r.id,
    { kind: "completed", eventAt: now, source: "person", document: "their_paper" },
    now,
  );
  await appendEvent(
    tx,
    a,
    r.id,
    { kind: "result_filed", eventAt: now, source: "person", note: i.theirReport },
    now,
  );
  // RB-5: Phase 1's critical call flow, on the value in this hospital's unit.
  if (await unitsRangesLive(a.hospitalId))
    await alertAfterRelease(ctx, {
      patientUserId: r.patientUserId,
      orderId: r.orderId,
      reportId: report.id,
      marks: [],
      note: i.calledWard,
      clientKey: i.clientKey,
    });
  const notes = entries.flatMap(({ e }) => {
    const c = criticalCheckInput(e);
    return [...e.notes, ...(!c.run && c.note ? [c.note] : [])];
  });
  return {
    id: report.id,
    oneEntrant,
    notes: oneEntrant ? [LAB4.provenanceOnePerson, ...notes] : notes,
  };
}

/** RB-4, Law 8: per numeric value in this hospital's unit, the snapshot; the printed facts ride along. */
async function writeSnapshots(
  tx: EmrTx,
  a: Actor,
  reportId: string,
  patientUserId: string,
  entries: {
    conceptId: string;
    e: ComponentEntry;
    registry: Awaited<ReturnType<typeof registryFor>>;
  }[],
) {
  const obs = await tx
    .select({ id: clinicalObservations.id, conceptId: clinicalObservations.conceptId })
    .from(clinicalObservations)
    .where(eq(clinicalObservations.reportId, reportId));
  for (const { conceptId, e, registry } of entries) {
    const o = obs.find((x) => x.conceptId === conceptId);
    const c = criticalCheckInput(e);
    if (!o || !registry.measure || !c.run) continue; // no measure or no value in our unit: nothing to snapshot
    const sameUnit = e.converted === "same_unit";
    const f = snapshotFields(e);
    await tx.insert(labResultSnapshots).values({
      observationId: o.id,
      reportId,
      hospitalId: a.hospitalId,
      patientUserId,
      measureId: registry.measure.id,
      measureVersion: registry.measure.version,
      valueDecimal: String(c.value),
      valueText: e.value,
      unitUcum: registry.hospitalUnit,
      unitDisplay: registry.hospitalUnit,
      rangeState: "performing_lab",
      rangeLow: sameUnit && e.range?.low !== undefined ? String(e.range.low) : null,
      rangeHigh: sameUnit && e.range?.high !== undefined ? String(e.range.high) : null,
      flagComputed: e.flag === "low" || e.flag === "high" || e.flag === "normal" ? e.flag : null,
      flagFinal: e.flag === "low" || e.flag === "high" || e.flag === "normal" ? e.flag : null,
      rangeSource: f.range_source,
      printed: f.printed,
    });
  }
}

/** RB-6, A9: record a scan the server has checked (size, type and hash computed from the stored object). */
export async function attachScan(
  tx: EmrTx,
  a: Actor,
  i: {
    referralId: string;
    path: string;
    sha256: string;
    bytes: number;
    mime: string;
    theirReport: string | null;
  },
  now: Date,
): Promise<string> {
  await referralForEntry(tx, a.hospitalId, i.referralId);
  if (!i.path.startsWith(`${a.hospitalId}/${i.referralId}/`))
    throw invalid("That file is not this referral's.");
  const [row] = await tx
    .insert(labResultAttachments)
    .values({
      hospitalId: a.hospitalId,
      referralId: i.referralId,
      path: i.path,
      sha256: i.sha256,
      bytes: i.bytes,
      mime: i.mime,
      theirReport: i.theirReport,
      uploadedBy: a.userId,
      uploadedAt: now,
    })
    .onConflictDoNothing()
    .returning({ id: labResultAttachments.id });
  return row?.id ?? i.path;
}

/** RB-7, S25: the next shift's check of a one-person entry; a difference goes to the amendment path. */
export async function checkTranscription(
  tx: EmrTx,
  a: Actor,
  i: { reportId: string; scanConfirmed: boolean; differs: boolean; note: string | null },
  now: Date,
) {
  const [rep] = await tx
    .select({ id: diagnosticReports.id, enteredBy: diagnosticReports.enteredByUserId })
    .from(diagnosticReports)
    .where(
      and(eq(diagnosticReports.id, i.reportId), eq(diagnosticReports.hospitalId, a.hospitalId)),
    );
  if (!rep) throw new EmrWriteError("not_found", "That result was not found.");
  if (rep.enteredBy === a.userId)
    throw new EmrWriteError("forbidden", "Someone other than the person who entered it checks it.");
  if (!i.scanConfirmed) throw invalid("Confirm the scan shows this report first.");
  await tx.insert(labTranscriptionChecks).values({
    hospitalId: a.hospitalId,
    reportId: rep.id,
    kind: i.differs ? "differs_amended" : "checked_later",
    checkerUserId: a.userId,
    scanConfirmed: true,
    note: i.note,
    at: now,
  });
}

/** One-person entries still waiting for their check (RB-7), for the lab's list. */
export async function openChecks(tx: EmrTx, hospitalId: string) {
  const opened = await tx
    .select({ reportId: labTranscriptionChecks.reportId, at: labTranscriptionChecks.at })
    .from(labTranscriptionChecks)
    .where(
      and(
        eq(labTranscriptionChecks.hospitalId, hospitalId),
        eq(labTranscriptionChecks.kind, "task_opened"),
      ),
    )
    .orderBy(desc(labTranscriptionChecks.at));
  if (!opened.length) return [];
  const done = await tx
    .select({ reportId: labTranscriptionChecks.reportId })
    .from(labTranscriptionChecks)
    .where(
      and(
        inArray(
          labTranscriptionChecks.reportId,
          opened.map((o) => o.reportId),
        ),
        ne(labTranscriptionChecks.kind, "task_opened"),
      ),
    );
  const closed = new Set(done.map((d) => d.reportId));
  return opened.filter((o) => !closed.has(o.reportId));
}
