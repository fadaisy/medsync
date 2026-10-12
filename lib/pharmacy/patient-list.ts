import type { EmrDb, EmrTx } from "@/lib/emr/db";
import type { NotGivenOutcome } from "@/lib/pharmacy/messages";
import type { RxCourse } from "@/lib/prescribing/reference/formulary-types";
import type { SQL } from "drizzle-orm";
import { and, asc, desc, eq, inArray, isNotNull } from "drizzle-orm";
import { z } from "zod";

import { db as appDb } from "@/db";
import { hospitals } from "@/db/schema/hospitals";
import { ncdSmsTemplate } from "@/db/schema/ncd-registry";
import { selfMedications } from "@/db/schema/patient-self-tracking";
import {
  pharmacyLineEvents,
  pharmacyProducts,
  pharmacySignedSets,
  pharmacySupplies,
  pharmacySupplyCorrections,
  pharmacySupplyReversals,
} from "@/db/schema/pharmacy-dispensing";
import { prescriptions } from "@/db/schema/prescribing";
import { asClinicalWriter } from "@/lib/emr/db";
import { EmrWriteError } from "@/lib/emr/write/context";
import { pharmacyPatientListLiveFor } from "@/lib/pharmacy/feature";
import { keyOf, saidCouldNotGet } from "@/lib/pharmacy/lines";
import {
  MESSAGE_COPY,
  notGivenWording,
  PATIENT_COPY,
  patientListEntry,
  refillDate,
  refillStatus,
} from "@/lib/pharmacy/messages";
import { patientSurfacesAllowed } from "@/lib/pharmacy/readiness";
import {
  foldWith,
  loadGroupOfLine,
  loadGroups,
  loadHospitalContext,
} from "@/lib/pharmacy/review/load";
import { nudge } from "@/lib/pharmacy/review/store";
import { localDate } from "@/lib/pharmacy/stock/ledger";
import { lockLine } from "@/lib/pharmacy/write";
import { RX_COURSES } from "@/lib/prescribing/reference/formulary-types";

/**
 * The patient's medicine list from supplies (Pharmacy Phase 1, 5.11, ML-1 to ML-6, W7; ADR 0270).
 *
 * - Writing (ML-1, ML-6): `writeListEntries` runs inside `recordHandover`'s transaction, only when the
 *   action passed `pharmacyPatientList` in; `withdrawListEntry` inside a reversal's or a correction's. One
 *   `self_medications` row per supplied LINE (0091's one-per-prescription index): `source_supply_id` is the
 *   line's first standing supply, so a later supply of the rest changes nothing in the patient's row. A line
 *   whose supplies are all withdrawn ends the row (state `ended`); supplied again, it is restored. A line not
 *   given is never written as a medicine to take (W7).
 * - Reading (the patient's page): a group per hand-over from the supplies, and the lines not given from the
 *   line events, each in the signed patient wording (ML-2). No stock, no staff name.
 * - The patient's taps (ML-4): "I have bought it" closes a buying-outside line as filled elsewhere, said by
 *   the patient; "I could not get it" writes a `patient_reported` event, keeps the line open and nudges the
 *   prescriber on their own `user:<id>` topic.
 * - ML-5 `getRefillStatus`, from supply events alone.
 * - RD-4 `patientListLive`: the flag, and in production everything a patient reads signed.
 */

const defaultDb = () => appDb as unknown as EmrDb;
const asDb = (tx: EmrTx) => tx as unknown as EmrDb;

/* ─── RD-4: the gate ───────────────────────────────────────────────── */

const PHARMACY_PURPOSES = [
  "pharmacy_owed",
  "pharmacy_buying_outside",
  "pharmacy_in_stock",
] as const;

/** The hospital's message name (D-PH1-39): signed, or outside production the latest draft. */
export async function messageNameOf(
  database: EmrDb,
  hospitalId: string,
  production: boolean,
): Promise<{ name: string | null; signed: boolean }> {
  const rows = await database
    .select({ content: pharmacySignedSets.content, status: pharmacySignedSets.status })
    .from(pharmacySignedSets)
    .where(
      and(
        eq(pharmacySignedSets.hospitalId, hospitalId),
        eq(pharmacySignedSets.kind, "message_name"),
      ),
    )
    .orderBy(desc(pharmacySignedSets.version));
  const nameOf = (c: unknown) => {
    const n = (c as { name?: unknown } | null)?.name;
    return typeof n === "string" && n.trim() ? n.trim() : null;
  };
  const signed = rows.find((r) => r.status === "signed" && nameOf(r.content));
  if (signed) return { name: nameOf(signed.content), signed: true };
  const draft = rows.find((r) => r.status === "draft" && nameOf(r.content));
  return { name: !production && draft ? nameOf(draft.content) : null, signed: false };
}

/** RD-4: what a patient reads is signed, every pharmacy template approved, and a message name signed. */
export async function patientSurfaces(database: EmrDb, hospitalId: string, production: boolean) {
  const [name, approved] = await Promise.all([
    messageNameOf(database, hospitalId, production),
    database
      .selectDistinct({ purpose: ncdSmsTemplate.purpose })
      .from(ncdSmsTemplate)
      .where(
        and(
          eq(ncdSmsTemplate.facilityId, hospitalId),
          eq(ncdSmsTemplate.workspace, "pharmacy"),
          eq(ncdSmsTemplate.status, "approved"),
        ),
      ),
  ]);
  const purposes = new Set(approved.map((a) => a.purpose));
  const signed = (c: { status: string }) => c.status === "signed";
  return patientSurfacesAllowed({
    production,
    patientCopySigned: signed(PATIENT_COPY),
    templatesApproved: signed(MESSAGE_COPY) && PHARMACY_PURPOSES.every((p) => purposes.has(p)),
    messageNameSigned: name.signed,
  });
}

/** `pharmacyPatientList` for a hospital, refused in production while RD-4 does not hold (S96). */
export async function patientListLive(
  hospitalId: string,
  database: EmrDb = defaultDb(),
  production = process.env.VERCEL_ENV === "production",
): Promise<boolean> {
  if (!pharmacyPatientListLiveFor(hospitalId)) return false;
  return (await patientSurfaces(database, hospitalId, production)).allowed;
}

/* ─── The supplies of some lines, as the list reads them ──────────── */

const supplyColumns = {
  id: pharmacySupplies.id,
  handoverId: pharmacySupplies.handoverId,
  hospitalId: pharmacySupplies.hospitalId,
  lineId: pharmacySupplies.prescriptionId,
  quantity: pharmacySupplies.quantity,
  issueUnit: pharmacySupplies.issueUnit,
  suppliedAt: pharmacySupplies.suppliedAt,
  daysCovered: pharmacySupplies.daysCovered,
  pharmacistLine: pharmacySupplies.pharmacistLine,
  product: pharmacyProducts.name,
  strength: pharmacyProducts.strength,
  hospitalName: hospitals.name,
  drugId: prescriptions.drugId,
  dose: prescriptions.dose,
  route: prescriptions.route,
  frequency: prescriptions.frequency,
  duration: prescriptions.duration,
  reversal: pharmacySupplyReversals.id,
  correction: pharmacySupplyCorrections.id,
};

type SupplyRow = Awaited<ReturnType<typeof supplyRows>>[number];

function supplyRows(database: EmrDb, where: SQL | undefined) {
  return database
    .select(supplyColumns)
    .from(pharmacySupplies)
    .innerJoin(pharmacyProducts, eq(pharmacyProducts.id, pharmacySupplies.productId))
    .innerJoin(prescriptions, eq(prescriptions.id, pharmacySupplies.prescriptionId))
    .innerJoin(hospitals, eq(hospitals.id, pharmacySupplies.supplyingHospitalId))
    .leftJoin(pharmacySupplyReversals, eq(pharmacySupplyReversals.supplyId, pharmacySupplies.id))
    .leftJoin(
      pharmacySupplyCorrections,
      eq(pharmacySupplyCorrections.supplyId, pharmacySupplies.id),
    )
    .where(and(isNotNull(pharmacySupplies.prescriptionId), where))
    .orderBy(asc(pharmacySupplies.suppliedAt), asc(pharmacySupplies.id));
}

const standing = (r: SupplyRow) => !r.reversal && !r.correction;

/** "As supplied": the product's name, with its strength where the name does not already carry it. */
const asSupplied = (r: SupplyRow) =>
  r.strength && !r.product.includes(r.strength) ? `${r.product} ${r.strength}` : r.product;

/** Law 7: the stored fields, each unchanged, joined as the label and the slip join them. */
const directionsOf = (r: SupplyRow) =>
  [r.dose, r.route, r.frequency, r.duration].filter(Boolean).join(" · ");

const courseOf = (duration: string | null): RxCourse | null =>
  (RX_COURSES as readonly string[]).includes(duration ?? "") ? (duration as RxCourse) : null;

function byLine(rows: readonly SupplyRow[]) {
  const out = new Map<string, SupplyRow[]>();
  for (const r of rows) out.set(r.lineId!, [...(out.get(r.lineId!) ?? []), r]);
  return out;
}

/** The hand-overs that supplied a line in full ("supplied" events), from the line events alone (ML-3). */
async function fullHandovers(database: EmrDb, lineIds: readonly string[]) {
  if (!lineIds.length) return new Set<string>();
  const rows = await database
    .select({ line: pharmacyLineEvents.prescriptionId, handover: pharmacyLineEvents.handoverId })
    .from(pharmacyLineEvents)
    .where(
      and(
        inArray(pharmacyLineEvents.prescriptionId, [...lineIds]),
        eq(pharmacyLineEvents.kind, "supplied"),
        isNotNull(pharmacyLineEvents.handoverId),
      ),
    );
  return new Set(rows.map((r) => `${r.line}:${r.handover}`));
}

function refillOf(rows: readonly SupplyRow[], full: ReadonlySet<string>): string | null {
  const latest = rows.filter(standing).at(-1);
  if (!latest) return null;
  return refillDate({
    suppliedOn: localDate(latest.suppliedAt),
    daysCovered: latest.daysCovered,
    courseCode: courseOf(latest.duration),
    suppliedInFull: full.has(`${latest.lineId}:${latest.handoverId}`),
  });
}

function entryOf(rows: readonly SupplyRow[], refillOn: string | null) {
  const r0 = rows[0]!;
  return patientListEntry({
    medicine: asSupplied(r0),
    directions: directionsOf(r0),
    hospitalName: r0.hospitalName,
    supplies: rows.map((r) => ({
      id: r.id,
      quantity: r.quantity,
      issueUnit: r.issueUnit,
      suppliedAt: r.suppliedAt.toISOString(),
      pharmacistLine: r.pharmacistLine,
      withdrawn: !standing(r),
    })),
    refillOn,
  });
}

/* ─── ML-1: written in the hand-over's transaction ────────────────── */

/**
 * One entry per supplied line, for the patient's own row (written as the owner). A new line inserts; a
 * line whose entry was withdrawn and is supplied again is restored and repointed; an entry the patient
 * added from the visit summary is linked to the supply; anything else is left as it is.
 */
export async function writeListEntries(
  tx: EmrTx,
  a: { patientUserId: string; lineIds: readonly string[]; now: Date },
): Promise<void> {
  if (!a.lineIds.length) return;
  const rows = await supplyRows(
    asDb(tx),
    and(
      eq(pharmacySupplies.patientUserId, a.patientUserId),
      inArray(pharmacySupplies.prescriptionId, [...a.lineIds]),
    ),
  );
  const existing = await tx
    .select({
      id: selfMedications.id,
      line: selfMedications.sourcePrescriptionId,
      supply: selfMedications.sourceSupplyId,
    })
    .from(selfMedications)
    .where(
      and(
        eq(selfMedications.patientUserId, a.patientUserId),
        inArray(selfMedications.sourcePrescriptionId, [...a.lineIds]),
      ),
    );
  for (const [lineId, rs] of byLine(rows)) {
    const e = entryOf(rs, null);
    if (!e) continue;
    const fields = {
      name: e.row.name,
      instructions: e.row.instructions,
      notes: e.row.notes,
      sourceSupplyId: e.row.source_supply_id,
    };
    const mine = existing.find((x) => x.line === lineId);
    if (!mine) {
      await tx.insert(selfMedications).values({
        patientUserId: a.patientUserId,
        ...fields,
        dose: e.row.dose,
        schedulePattern: e.row.schedule_pattern,
        scheduleTimes: e.row.schedule_times,
        startedOn: localDate(a.now),
        sourcePrescriptionId: lineId,
      });
    } else if (mine.supply === null) {
      await tx
        .update(selfMedications)
        .set({ sourceSupplyId: fields.sourceSupplyId, updatedAt: a.now })
        .where(eq(selfMedications.id, mine.id));
    } else if (!rs.some((r) => r.id === mine.supply && standing(r))) {
      await tx
        .update(selfMedications)
        .set({ ...fields, state: "active", endedOn: null, updatedAt: a.now })
        .where(eq(selfMedications.id, mine.id));
    }
  }
}

/** ML-6: a reversal or a correction withdraws the entry when none of the line's supplies stands. */
export async function withdrawListEntry(
  tx: EmrTx,
  a: { patientUserId: string; lineId: string; now: Date },
): Promise<void> {
  const [mine] = await tx
    .select({
      id: selfMedications.id,
      supply: selfMedications.sourceSupplyId,
      state: selfMedications.state,
    })
    .from(selfMedications)
    .where(
      and(
        eq(selfMedications.patientUserId, a.patientUserId),
        eq(selfMedications.sourcePrescriptionId, a.lineId),
        isNotNull(selfMedications.sourceSupplyId),
      ),
    );
  if (!mine) return;
  const left = (
    await supplyRows(
      asDb(tx),
      and(
        eq(pharmacySupplies.patientUserId, a.patientUserId),
        eq(pharmacySupplies.prescriptionId, a.lineId),
      ),
    )
  ).filter(standing);
  if (!left.length) {
    if (mine.state !== "ended")
      await tx
        .update(selfMedications)
        .set({ state: "ended", endedOn: localDate(a.now), updatedAt: a.now })
        .where(eq(selfMedications.id, mine.id));
    return;
  }
  if (!left.some((r) => r.id === mine.supply))
    await tx
      .update(selfMedications)
      .set({ sourceSupplyId: left[0]!.id, updatedAt: a.now })
      .where(eq(selfMedications.id, mine.id));
}

/* ─── ML-5: the refill status, from supply events alone ───────────── */

export async function getRefillStatus(
  patientUserId: string,
  options: { database?: EmrDb; now?: Date } = {},
) {
  const database = options.database ?? defaultDb();
  const rows = await supplyRows(database, eq(pharmacySupplies.patientUserId, patientUserId));
  const full = await fullHandovers(database, [...new Set(rows.map((r) => r.lineId!))]);
  return refillStatus(
    rows.map((r) => ({
      medicineId: r.drugId,
      suppliedOn: localDate(r.suppliedAt),
      daysCovered: r.daysCovered,
      courseCode: courseOf(r.duration),
      suppliedInFull: full.has(`${r.lineId}:${r.handoverId}`),
      withdrawn: !standing(r),
    })),
    options.now ?? new Date(),
  );
}

/* ─── The patient's page ──────────────────────────────────────────── */

export interface PatientListMedicine {
  lineId: string;
  /** The patient's tracker row for this line, if any (for the dose times). */
  medicationId: string | null;
  medicationState: string | null;
  medicine: string;
  directions: string;
  pharmacistLine: string | null;
  given: string;
  refill: string | null;
}

export interface PatientListGroup {
  handoverId: string;
  head: string;
  medicines: PatientListMedicine[];
}

export interface NotGivenLine {
  lineId: string;
  /** As written on the prescription; the patient's own list, after sign-in (never a message). */
  medicine: string;
  outcome: NotGivenOutcome;
  lead: string;
  text: string;
  /** ML-4: the patient may tap "I have bought it" or "I could not get it". */
  canReport: boolean;
  couldNotGet: boolean;
}

export interface PatientMedicineList {
  groups: PatientListGroup[];
  notGiven: NotGivenLine[];
  /** Tracker rows the pharmacy section shows (or withdrew), left out of the patient's own list. */
  coveredMedicationIds: string[];
}

const MAX_GROUPS = 20;

/**
 * The patient's list at the hospitals where it is live. Supplies give the groups (ML-1); line events give
 * the medicines not given (ML-2). Returns no stock figure and no member of staff.
 */
export async function getPatientMedicineList(
  patientUserId: string,
  live: (hospitalId: string) => Promise<boolean>,
  options: { database?: EmrDb; now?: Date } = {},
): Promise<PatientMedicineList> {
  const database = options.database ?? defaultDb();
  const now = options.now ?? new Date();
  const seen = await database
    .selectDistinct({ hospitalId: pharmacyLineEvents.hospitalId })
    .from(pharmacyLineEvents)
    .where(eq(pharmacyLineEvents.patientUserId, patientUserId));
  const out: PatientMedicineList = { groups: [], notGiven: [], coveredMedicationIds: [] };
  for (const { hospitalId } of seen) {
    if (!(await live(hospitalId))) continue;

    // The groups, from the supplies.
    const rows = await supplyRows(
      database,
      and(
        eq(pharmacySupplies.patientUserId, patientUserId),
        eq(pharmacySupplies.hospitalId, hospitalId),
      ),
    );
    const lines = byLine(rows);
    const [full, meds] = await Promise.all([
      fullHandovers(database, [...lines.keys()]),
      lines.size
        ? database
            .select({
              id: selfMedications.id,
              line: selfMedications.sourcePrescriptionId,
              state: selfMedications.state,
            })
            .from(selfMedications)
            .where(
              and(
                eq(selfMedications.patientUserId, patientUserId),
                inArray(selfMedications.sourcePrescriptionId, [...lines.keys()]),
                isNotNull(selfMedications.sourceSupplyId),
              ),
            )
        : Promise.resolve([]),
    ]);
    out.coveredMedicationIds.push(...meds.map((m) => m.id));
    const groups = new Map<string, PatientListGroup & { at: number }>();
    for (const [lineId, rs] of lines) {
      const e = entryOf(rs, refillOf(rs, full));
      if (!e) continue;
      const first = rs.find((r) => r.id === e.row.source_supply_id)!;
      const g = groups.get(first.handoverId) ?? {
        handoverId: first.handoverId,
        head: e.row.notes,
        medicines: [],
        at: first.suppliedAt.getTime(),
      };
      const med = meds.find((m) => m.line === lineId);
      g.medicines.push({
        lineId,
        medicationId: med?.id ?? null,
        medicationState: med?.state ?? null,
        medicine: e.row.name,
        directions: e.row.instructions,
        pharmacistLine: e.pharmacistLine,
        given: e.given,
        refill: e.refill,
      });
      groups.set(first.handoverId, g);
    }
    for (const { at: _at, ...g } of [...groups.values()].sort((a, b) => b.at - a.at))
      out.groups.push(g);

    // The lines not given, from the line events.
    const h = await loadHospitalContext(database, hospitalId);
    const touched = database
      .select({ id: pharmacyLineEvents.prescriptionId })
      .from(pharmacyLineEvents)
      .where(
        and(
          eq(pharmacyLineEvents.patientUserId, patientUserId),
          eq(pharmacyLineEvents.hospitalId, hospitalId),
        ),
      );
    const today = localDate(now);
    for (const g of await loadGroups(database, h, inArray(prescriptions.id, touched)))
      for (const l of g.lines) {
        const s = l.status;
        const outcome: NotGivenOutcome | null =
          s?.kind === "open"
            ? s.outcome
            : s?.kind === "closed" &&
                s.outcome === "declined" &&
                l.events.some((e) => e.kind === "declined" && localDate(e.occurredAt) === today)
              ? "declined"
              : null;
        if (!outcome) continue;
        const pointId = [...l.events].reverse().find((e) => e.dispensingPointId)?.dispensingPointId;
        const phone =
          h.points.find((p) => p.id === pointId)?.phone ??
          h.points.find((p) => p.phone)?.phone ??
          "";
        const words = notGivenWording(outcome, phone);
        out.notGiven.push({
          lineId: l.row.id,
          medicine: l.row.drugName,
          outcome,
          lead: words.lead,
          text: words.text,
          canReport: outcome === "buying_outside",
          couldNotGet: outcome === "buying_outside" && saidCouldNotGet(l.events),
        });
      }
  }
  out.groups = out.groups.slice(0, MAX_GROUPS);
  return out;
}

/* ─── ML-4: the patient's taps ────────────────────────────────────── */

export const PatientReportInput = z.object({
  clientKey: z.uuid(),
  lineId: z.uuid(),
  report: z.enum(["bought", "could_not_get"]),
});

export const PATIENT_REPORT_COPY = {
  notYours: "That medicine is not on your list.",
  notOpen: "This medicine is no longer waiting to be bought. Your list has been updated.",
} as const;

/**
 * ML-4, for the patient's own line only, as the owner in one transaction under the line locks (ADR 0265).
 * The actor is the patient; who said so is recorded ("patient"). Never a change to the prescription.
 */
export async function reportFromPatient(
  patientUserId: string,
  input: z.infer<typeof PatientReportInput>,
  options: { database?: EmrDb; now?: Date } = {},
): Promise<{ id: string }> {
  const database = options.database ?? defaultDb();
  const now = options.now ?? new Date();
  const [rx] = await database
    .select({ hospitalId: prescriptions.hospitalId, patientUserId: prescriptions.patientUserId })
    .from(prescriptions)
    .where(eq(prescriptions.id, input.lineId));
  if (!rx || rx.patientUserId !== patientUserId)
    throw new EmrWriteError("not_found", PATIENT_REPORT_COPY.notYours);
  return asClinicalWriter(
    { userId: patientUserId, hospitalId: rx.hospitalId },
    async (tx) => {
      const [done] = await tx
        .select({ id: pharmacyLineEvents.id })
        .from(pharmacyLineEvents)
        .where(eq(pharmacyLineEvents.clientKey, input.clientKey));
      if (done) return { id: done.id };
      const h = await loadHospitalContext(asDb(tx), rx.hospitalId);
      const first = await loadGroupOfLine(asDb(tx), h, input.lineId);
      if (!first) throw new EmrWriteError("not_found", PATIENT_REPORT_COPY.notYours);
      for (const id of first.group.lines.map((l) => l.row.id).sort()) await lockLine(tx, id);
      const found = await loadGroupOfLine(asDb(tx), h, input.lineId);
      const s = found?.line.status;
      if (!found || s?.kind !== "open" || s.outcome !== "buying_outside")
        throw new EmrWriteError("conflict", PATIENT_REPORT_COPY.notOpen);
      const { group, line } = found;
      const bought = input.report === "bought";
      const kind = bought ? "filled_elsewhere" : "patient_reported";
      const reasonCode = bought ? "patient" : "could_not_get";
      if (bought) {
        const after = foldWith(group, line, {
          events: [
            {
              id: "probe",
              kind,
              occurredAt: now,
              effectiveAt: now,
              lane: group.lane.lane,
              quantitySupplied: null,
              quantityNotSupplied: null,
              reasonCode,
              handoverId: null,
              actorCadre: null,
            },
          ],
        });
        if (keyOf(after) !== "closed")
          throw new EmrWriteError("conflict", PATIENT_REPORT_COPY.notOpen);
      }
      const [row] = await tx
        .insert(pharmacyLineEvents)
        .values({
          hospitalId: rx.hospitalId,
          prescriptionId: line.row.id,
          patientUserId,
          kind,
          lane: group.lane.lane,
          laneReasons: group.lane.reasons,
          ruleVersion: group.lane.ruleVersion,
          reasonCode,
          actorUserId: patientUserId,
          actorCadre: "Patient",
          occurredAt: now,
          effectiveAt: now,
          clientKey: input.clientKey,
        })
        .returning({ id: pharmacyLineEvents.id });
      if (!bought) await nudge({ tx }, line.row.prescriberUserId, "patient_could_not_get", row!.id);
      return { id: row!.id };
    },
    database,
  );
}
