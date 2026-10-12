import type { EmrDb } from "@/lib/emr/db";
import type { PaymentStatus } from "@/lib/pharmacy/review/load";
import type { LineStock, StagedDecision } from "@/lib/pharmacy/review/read";
import { and, asc, desc, eq, gte, inArray, lt, sql } from "drizzle-orm";

import { WITHOUT_PHARMACIST_REASONS } from "@/content/pharmacy-review";
import {
  CORRECTION_REASONS,
  COUNSELLING_POINTS,
  IDENTITY_ROUTES,
  REVERSAL_REASONS,
} from "@/content/pharmacy-supply";
import { db as appDb } from "@/db";
import { staffAffiliations } from "@/db/schema/clinician-profiles";
import { hospitals } from "@/db/schema/hospitals";
import {
  pharmacyBatches,
  pharmacyHandovers,
  pharmacyIdentityAttempts,
  pharmacyLineEvents,
  pharmacyLookBacks,
  pharmacyProducts,
  pharmacySupplies,
  pharmacySupplyCorrections,
  pharmacySupplyReversals,
} from "@/db/schema/pharmacy-dispensing";
import { prescriptions } from "@/db/schema/prescribing";
import { cadres } from "@/db/schema/reference-data";
import { users } from "@/db/schema/users";
import { classLabel } from "@/lib/pharmacy/controlled";
import { countableBatches } from "@/lib/pharmacy/controlled-read";
import { quantityLeft } from "@/lib/pharmacy/lines";
import { cadreOfUsers } from "@/lib/pharmacy/read";
import {
  loadGroupByKey,
  loadHospitalContext,
  loadShelf,
  pointIsLive,
} from "@/lib/pharmacy/review/load";
import { lineStock } from "@/lib/pharmacy/review/read";
import { reviewBasis } from "@/lib/pharmacy/review/review";
import { localDate } from "@/lib/pharmacy/stock/ledger";
import { attemptsLeft } from "@/lib/pharmacy/supply/identity";
import { signedCodes } from "@/lib/pharmacy/supply/store";
import { DEFAULT_TIME_ZONE, startOfLocalDay } from "@/supabase/functions/_shared/slots";

/**
 * Hand-over and supply, read (Pharmacy Phase 1, 5.6, 5.7; Section 8 reads `getReview` for the
 * hand-over, `getSuppliedToday` with its "identified another way" filter, `getLookBack`). The hospital
 * comes from the caller's scope, never from the client. No read here returns a stored date of birth or
 * phone number: the typed check answers through `checkSecondIdentifier` only (SU-4, Section 12).
 */

const defaultDb = () => appDb as unknown as EmrDb;
const DAY_MS = 86_400_000;
const uniq = <T>(xs: readonly T[]) => [...new Set(xs)];

/* ─── The hand-over screen (5.6) ──────────────────────────────────────── */

export interface HandoverLineView {
  lineId: string;
  medicineId: string;
  medicine: string;
  concentration: string | null;
  /** Law 7: each stored field as stored, joined only by the separator the review screen uses. */
  directions: string;
  /** Staged at Ready on the review screen, or "Supply now" from Open lines (5.7). */
  mode: "staged" | "supply_now";
  status: "ready" | "owed" | "buying_outside";
  /** LO-9: what is left to supply, where recorded. */
  left: number | null;
  staged: StagedDecision | null;
  /** CD-1: a controlled line. Its batches carry no balance here: the count comes first (CD-3). */
  controlled: boolean;
  stock: LineStock;
}

/** 5.9: the controlled supply's head and the cupboard to count, for a hand-over with a controlled line. */
export interface ControlledHandover {
  /** CD-1: the class from signed data, or "Controlled drug" with no class. */
  classLabel: string;
  /** CD-8, B-08. */
  changedSincePrinting: boolean;
  prescriber: string | null;
  medicines: {
    medicineId: string;
    name: string;
    unit: string;
    /** Every batch in the cupboard to count (an expired, empty one is not), without its figure. */
    batches: { id: string; batchNumber: string; expiry: string; expiryMonthOnly: boolean }[];
  }[];
}

export interface HandoverData {
  key: string;
  patientUserId: string;
  firstLineId: string;
  origin: "window" | "ward";
  ward: string | null;
  head:
    | { kind: "reviewed"; cadre: string; at: string }
    | { kind: "standard" }
    | { kind: "without"; reason: string }
    | null;
  lines: HandoverLineView[];
  /** 5.9: set when any line is controlled; the whole hand-over then goes through the controlled supply. */
  controlled: ControlledHandover | null;
  labelMode: "printed" | "by_hand";
  pointName: string | null;
  pointLive: boolean;
  identityRoutes: { code: string; words: string }[] | null;
  counselling: { code: string; words: string }[] | null;
  payment: { status: PaymentStatus; detail: string | null } | null;
  paymentRequired: boolean;
  inpatientSupplyOn: boolean;
  wardStaff: { userId: string; label: string }[];
  typedCheck: { attemptsLeft: number };
  serverNow: string;
}

/** 5.6: the lines staged at Ready with their decisions, or one open line for "Supply now". */
export async function getHandover(
  hospitalId: string,
  key: string,
  point: { id: string; labelMode: "printed" | "by_hand" } | null,
  supplyNowLineId: string | null = null,
  database: EmrDb = defaultDb(),
  now = new Date(),
): Promise<HandoverData | null> {
  const h = await loadHospitalContext(database, hospitalId);
  const g = await loadGroupByKey(database, h, key);
  if (!g || g.scope !== "supply") return null;
  const picked = g.lines.filter((l) => {
    const s = l.status;
    if (!s) return false;
    if (supplyNowLineId) return l.row.id === supplyNowLineId && s.kind === "open";
    return (
      s.kind === "stage" && s.stage === "ready" && l.events.some((e) => e.kind === "decision_saved")
    );
  });
  const pointRow = h.points.find((p) => p.id === point?.id) ?? null;
  const [shelf, routes, counselling, attempts, wardStaff, people] = await Promise.all([
    loadShelf(
      database,
      hospitalId,
      picked.map((l) => l.row.drugId),
    ),
    signedCodes(database, hospitalId, "identity_routes", IDENTITY_ROUTES),
    signedCodes(database, hospitalId, "counselling_points", COUNSELLING_POINTS),
    database
      .select({
        outcome: pharmacyIdentityAttempts.outcome,
        attemptedAt: pharmacyIdentityAttempts.attemptedAt,
      })
      .from(pharmacyIdentityAttempts)
      .where(
        and(
          eq(pharmacyIdentityAttempts.hospitalId, hospitalId),
          eq(pharmacyIdentityAttempts.patientUserId, g.patientUserId),
          gte(pharmacyIdentityAttempts.attemptedAt, startOfLocalDay(now, DEFAULT_TIME_ZONE)),
        ),
      ),
    h.settings.individualInpatientSupply && g.origin === "ward"
      ? staffHere(database, hospitalId)
      : Promise.resolve([]),
    cadreOfUsers(
      database,
      hospitalId,
      picked.flatMap((l) => l.events.map((e) => e.actorUserId)),
    ),
  ]);

  // The head (5.6): who reviewed, or the standard lane, or D-PH1-05's reason.
  let head: HandoverData["head"] = null;
  if (g.lane.lane === "standard") head = { kind: "standard" };
  else
    for (const l of picked) {
      const b = reviewBasis(g.lane.lane, l.row.id, l.reviewEvents);
      if (!b || b.kind === "checked_at_supply") continue;
      const e = l.events.find((x) => x.id === b.eventId);
      if (b.kind === "supplied_without_review") {
        const code = (b.reasonCode ?? "other") as keyof typeof WITHOUT_PHARMACIST_REASONS;
        head = { kind: "without", reason: WITHOUT_PHARMACIST_REASONS[code] ?? b.reasonCode ?? "" };
        break;
      }
      if (e && (!head || (head.kind === "reviewed" && head.at < e.occurredAt.toISOString())))
        head = {
          kind: "reviewed",
          cadre: e.actorCadre ?? people.get(e.actorUserId) ?? "",
          at: e.occurredAt.toISOString(),
        };
    }

  return {
    key: g.key,
    patientUserId: g.patientUserId,
    firstLineId: g.lines[0]!.row.id,
    origin: g.origin,
    ward: g.origin === "ward" ? (g.encounter?.departmentName ?? null) : null,
    head,
    lines: picked.map((l) => {
      const s = l.status!;
      const staged = ([...l.events].reverse().find((e) => e.kind === "decision_saved")?.decision ??
        null) as StagedDecision | null;
      const decided = staged ? staged.quantity + (staged.notSupplied ?? 0) : null;
      return {
        lineId: l.row.id,
        medicineId: l.row.drugId,
        medicine: l.row.drugName,
        concentration: l.row.concentration,
        directions: [l.row.dose, l.row.route, l.row.frequency].filter(Boolean).join(" · "),
        mode: s.kind === "open" ? "supply_now" : "staged",
        status: s.kind === "open" ? s.outcome : "ready",
        left: quantityLeft(s, decided),
        staged: s.kind === "open" ? null : staged,
        controlled: l.row.controlled,
        stock: blind(
          lineStock(shelf, point?.id ?? null, l.row.drugId, now, l.row.concentration),
          l.row.controlled,
        ),
      };
    }),
    controlled: controlledOf(g, picked, h.controlledClasses, shelf, point?.id ?? null, now),
    labelMode: point?.labelMode ?? "printed",
    pointName: pointRow?.name ?? null,
    pointLive: pointRow ? pointIsLive(pointRow) : false,
    identityRoutes: routes?.items ?? null,
    counselling: counselling?.items ?? null,
    payment: g.payment ? { status: g.payment.status, detail: g.payment.detail } : null,
    paymentRequired: h.settings.paymentStatusRequired,
    inpatientSupplyOn: h.settings.individualInpatientSupply,
    wardStaff,
    typedCheck: { attemptsLeft: attemptsLeft(attempts, localDate(now)) },
    serverNow: now.toISOString(),
  };
}

/** CD-3: a controlled line's batches go to the screen without their figures. */
const blind = (stock: LineStock, controlled: boolean): LineStock =>
  controlled ? { ...stock, batches: stock.batches.map((b) => ({ ...b, balance: 0 })) } : stock;

function controlledOf(
  g: NonNullable<Awaited<ReturnType<typeof loadGroupByKey>>>,
  picked: typeof g.lines,
  classes: ReadonlyMap<string, string>,
  shelf: Awaited<ReturnType<typeof loadShelf>>,
  pointId: string | null,
  now: Date,
): ControlledHandover | null {
  const lines = picked.filter((l) => l.row.controlled);
  if (!lines.length) return null;
  const today = localDate(now);
  const medicineIds = [...new Set(lines.map((l) => l.row.drugId))];
  const signed = [
    ...new Set(medicineIds.flatMap((m) => (classes.get(m) ? [classes.get(m)!] : []))),
  ];
  return {
    classLabel: classLabel(signed.join(", ") || null),
    changedSincePrinting: g.changedSincePrint,
    prescriber: g.prescriberCadre,
    medicines: medicineIds.map((medicineId) => {
      const stock = lineStock(shelf, pointId, medicineId, now);
      const batches = countableBatches(
        stock.batches,
        new Map(stock.batches.map((b) => [b.id, b.balance])),
        today,
      );
      return {
        medicineId,
        name: lines.find((l) => l.row.drugId === medicineId)!.row.drugName,
        unit: stock.products[0]?.issueUnit ?? "",
        batches: batches.map((b) => ({
          id: b.id,
          batchNumber: b.batchNumber,
          expiry: b.expiry,
          expiryMonthOnly: b.expiryMonthOnly,
        })),
      };
    }),
  };
}

/** SU-4, SU-5: this hospital's staff, for a ward hand-over to a named member of ward staff. */
async function staffHere(database: EmrDb, hospitalId: string) {
  const rows = await database
    .select({ userId: staffAffiliations.userId, name: users.fullName, cadre: cadres.name })
    .from(staffAffiliations)
    .innerJoin(cadres, eq(cadres.id, staffAffiliations.cadreId))
    .innerJoin(users, eq(users.id, staffAffiliations.userId))
    .where(
      and(
        eq(staffAffiliations.hospitalId, hospitalId),
        inArray(staffAffiliations.state, ["active", "approved"]),
      ),
    )
    .orderBy(asc(users.fullName));
  const seen = new Set<string>();
  return rows.flatMap((r) => {
    if (seen.has(r.userId)) return [];
    seen.add(r.userId);
    const cadre = r.cadre.charAt(0) + r.cadre.slice(1).toLowerCase();
    return [{ userId: r.userId, label: [r.name, cadre].filter(Boolean).join(" · ") }];
  });
}

/* ─── Supplied today (5.7) ─────────────────────────────────────────────── */

export interface SuppliedLine {
  lineId: string;
  medicine: string;
  quantity: number;
  unit: string;
  batches: { number: string; expiry: string; expiryMonthOnly: boolean; quantity: number }[];
  reversed: { at: string; cadre: string; reason: string } | null;
  inError: string | null;
  controlled: boolean;
}

export interface SuppliedRow {
  handoverId: string;
  at: string;
  patientUserId: string;
  lines: SuppliedLine[];
  suppliedBy: string;
  /** X-8 / X-9: who reviewed (cadre and time), or the standard lane. */
  reviewed: { cadre: string; at: string } | null;
  collector: "patient" | "representative" | "ward_staff";
  collectorName: string | null;
  collectorRelationship: string | null;
  identifiedAnotherWay: string | null;
  labelMode: string;
  enteredAfterDowntime: boolean;
  /** SU-11: on the hospital-local day it was recorded only. */
  reversible: boolean;
}

/** `getSuppliedToday` (5.7): every hand-over at this point on one hospital-local day, newest first. */
export async function getSupplied(
  hospitalId: string,
  pointId: string,
  day: string,
  database: EmrDb = defaultDb(),
  now = new Date(),
): Promise<{ rows: SuppliedRow[]; lookBackWaiting: number; day: string; today: string }> {
  const start = startOfLocalDay(new Date(`${day}T12:00:00+03:00`), DEFAULT_TIME_ZONE);
  const end = new Date(start.getTime() + DAY_MS);
  const handovers = await database
    .select()
    .from(pharmacyHandovers)
    .where(
      and(
        eq(pharmacyHandovers.hospitalId, hospitalId),
        eq(pharmacyHandovers.dispensingPointId, pointId),
        gte(pharmacyHandovers.suppliedAt, start),
        lt(pharmacyHandovers.suppliedAt, end),
      ),
    )
    .orderBy(desc(pharmacyHandovers.suppliedAt));
  const today = localDate(now);
  const waiting = await lookBackRows(database, hospitalId);
  if (!handovers.length) return { rows: [], lookBackWaiting: waiting.length, day, today };
  const supplies = await database
    .select({
      id: pharmacySupplies.id,
      handoverId: pharmacySupplies.handoverId,
      lineId: pharmacySupplies.prescriptionId,
      quantity: pharmacySupplies.quantity,
      unit: pharmacySupplies.issueUnit,
      reviewEventId: pharmacySupplies.reviewEventId,
      medicine: prescriptions.drugName,
      controlled: prescriptions.controlled,
      batch: pharmacyBatches.batchNumber,
      expiry: pharmacyBatches.expiry,
      expiryMonthOnly: pharmacyBatches.expiryMonthOnly,
      reversedAt: pharmacySupplyReversals.reversedAt,
      reversedCadre: pharmacySupplyReversals.actorCadre,
      reversedReason: pharmacySupplyReversals.reasonCode,
      correctedReason: pharmacySupplyCorrections.reasonCode,
    })
    .from(pharmacySupplies)
    .innerJoin(pharmacyBatches, eq(pharmacyBatches.id, pharmacySupplies.batchId))
    .leftJoin(prescriptions, eq(prescriptions.id, pharmacySupplies.prescriptionId))
    .leftJoin(pharmacySupplyReversals, eq(pharmacySupplyReversals.supplyId, pharmacySupplies.id))
    .leftJoin(
      pharmacySupplyCorrections,
      eq(pharmacySupplyCorrections.supplyId, pharmacySupplies.id),
    )
    .where(
      and(
        eq(pharmacySupplies.hospitalId, hospitalId),
        inArray(
          pharmacySupplies.handoverId,
          handovers.map((x) => x.id),
        ),
      ),
    )
    .orderBy(asc(pharmacyBatches.expiry));
  const reviewIds = uniq(supplies.flatMap((s) => (s.reviewEventId ? [s.reviewEventId] : [])));
  const reviews = reviewIds.length
    ? await database
        .select({
          id: pharmacyLineEvents.id,
          cadre: pharmacyLineEvents.actorCadre,
          kind: pharmacyLineEvents.kind,
          at: pharmacyLineEvents.occurredAt,
        })
        .from(pharmacyLineEvents)
        .where(inArray(pharmacyLineEvents.id, reviewIds))
    : [];
  const reviewOf = new Map(reviews.map((r) => [r.id, r]));

  const rows = handovers.map((ho): SuppliedRow => {
    const mine = supplies.filter((s) => s.handoverId === ho.id);
    const byLine = new Map<string, SuppliedLine>();
    for (const s of mine) {
      const k = s.lineId ?? s.id;
      const line = byLine.get(k) ?? {
        lineId: k,
        medicine: s.medicine ?? "",
        quantity: 0,
        unit: s.unit,
        batches: [],
        reversed: s.reversedAt
          ? {
              at: s.reversedAt.toISOString(),
              cadre: s.reversedCadre ?? "",
              reason:
                REVERSAL_REASONS[s.reversedReason as keyof typeof REVERSAL_REASONS] ??
                s.reversedReason ??
                "",
            }
          : null,
        inError: s.correctedReason
          ? (CORRECTION_REASONS[s.correctedReason as keyof typeof CORRECTION_REASONS] ??
            s.correctedReason)
          : null,
        controlled: s.controlled === true,
      };
      line.quantity += s.quantity;
      line.batches.push({
        number: s.batch,
        expiry: s.expiry,
        expiryMonthOnly: s.expiryMonthOnly,
        quantity: s.quantity,
      });
      byLine.set(k, line);
    }
    const review = mine
      .map((s) => (s.reviewEventId ? reviewOf.get(s.reviewEventId) : undefined))
      .find((r) => r && r.kind !== "supplied_without_review");
    const recordedDay = localDate(ho.enteredAfterDowntime ? ho.enteredAt : ho.suppliedAt);
    return {
      handoverId: ho.id,
      at: ho.suppliedAt.toISOString(),
      patientUserId: ho.patientUserId,
      lines: [...byLine.values()],
      suppliedBy: ho.actorCadre ?? "",
      reviewed: review ? { cadre: review.cadre ?? "", at: review.at.toISOString() } : null,
      collector: ho.collector as SuppliedRow["collector"],
      collectorName: ho.collectorName,
      collectorRelationship: ho.collectorRelationship,
      identifiedAnotherWay:
        ho.identityRoute === "identified_another_way"
          ? (IDENTITY_ROUTES[ho.identifiedHow as keyof typeof IDENTITY_ROUTES] ??
            ho.identifiedHow ??
            "")
          : null,
      labelMode: ho.labelMode,
      enteredAfterDowntime: ho.enteredAfterDowntime,
      reversible: recordedDay === today,
    };
  });
  return { rows, lookBackWaiting: waiting.length, day, today };
}

/* ─── The look-back list (5.7) ─────────────────────────────────────────── */

export interface LookBackRow {
  supplyId: string;
  at: string;
  patientUserId: string;
  medicine: string;
  quantity: number;
  unit: string;
  reasons: string[];
}

async function lookBackRows(database: EmrDb, hospitalId: string) {
  return database
    .select({
      supplyId: pharmacyLookBacks.supplyId,
      reasons: pharmacyLookBacks.reasons,
    })
    .from(pharmacyLookBacks)
    .where(
      and(
        eq(pharmacyLookBacks.hospitalId, hospitalId),
        eq(pharmacyLookBacks.kind, "flagged"),
        sql`NOT EXISTS (SELECT 1 FROM public.pharmacy_look_backs l
                         WHERE l.supply_id = ${pharmacyLookBacks.supplyId} AND l.kind = 'looked')`,
      ),
    );
}

/** `getLookBack` (5.7): supplies recorded without a check a live supply needs, oldest first, each with why. */
export async function getLookBack(
  hospitalId: string,
  database: EmrDb = defaultDb(),
): Promise<LookBackRow[]> {
  const flagged = await lookBackRows(database, hospitalId);
  if (!flagged.length) return [];
  const supplies = await database
    .select({
      id: pharmacySupplies.id,
      at: pharmacySupplies.suppliedAt,
      patientUserId: pharmacySupplies.patientUserId,
      medicine: prescriptions.drugName,
      product: pharmacyProducts.name,
      quantity: pharmacySupplies.quantity,
      unit: pharmacySupplies.issueUnit,
    })
    .from(pharmacySupplies)
    .innerJoin(pharmacyProducts, eq(pharmacyProducts.id, pharmacySupplies.productId))
    .leftJoin(prescriptions, eq(prescriptions.id, pharmacySupplies.prescriptionId))
    .where(
      and(
        eq(pharmacySupplies.hospitalId, hospitalId),
        inArray(
          pharmacySupplies.id,
          flagged.map((f) => f.supplyId),
        ),
      ),
    )
    .orderBy(asc(pharmacySupplies.suppliedAt));
  return supplies.map((s) => ({
    supplyId: s.id,
    at: s.at.toISOString(),
    patientUserId: s.patientUserId,
    medicine: s.medicine ?? s.product,
    quantity: s.quantity,
    unit: s.unit,
    reasons: uniq(flagged.filter((f) => f.supplyId === s.id).flatMap((f) => f.reasons)),
  }));
}

/* ─── Labels (LB-1) ─────────────────────────────────────────────────────── */

export interface LabelSource {
  handoverId: string;
  patientUserId: string;
  labelMode: string;
  pointName: string;
  suppliedAt: string;
  supplies: {
    id: string;
    product: string;
    quantity: number;
    unit: string;
    batchNumber: string;
    expiry: string;
    expiryMonthOnly: boolean;
    pharmacistLine: string | null;
    /** Law 7: the stored fields, each unchanged, joined as the slip joins them. */
    directions: string;
    reversed: boolean;
  }[];
  hospital: { name: string; district: string | null };
}

/** One supply event per label (LB-1): the product, the batch, the prescription's stored directions. */
export async function getLabelSource(
  hospitalId: string,
  handoverId: string,
  database: EmrDb = defaultDb(),
): Promise<LabelSource | null> {
  const [ho] = await database
    .select()
    .from(pharmacyHandovers)
    .where(and(eq(pharmacyHandovers.id, handoverId), eq(pharmacyHandovers.hospitalId, hospitalId)));
  if (!ho) return null;
  const [h, [hospital]] = await Promise.all([
    loadHospitalContext(database, hospitalId),
    database
      .select({ name: hospitals.name, district: hospitals.district })
      .from(hospitals)
      .where(eq(hospitals.id, hospitalId)),
  ]);
  const rows = await database
    .select({
      id: pharmacySupplies.id,
      product: pharmacyProducts.name,
      quantity: pharmacySupplies.quantity,
      unit: pharmacySupplies.issueUnit,
      batchNumber: pharmacyBatches.batchNumber,
      expiry: pharmacyBatches.expiry,
      expiryMonthOnly: pharmacyBatches.expiryMonthOnly,
      pharmacistLine: pharmacySupplies.pharmacistLine,
      dose: prescriptions.dose,
      route: prescriptions.route,
      frequency: prescriptions.frequency,
      duration: prescriptions.duration,
      reversal: pharmacySupplyReversals.id,
      correction: pharmacySupplyCorrections.id,
    })
    .from(pharmacySupplies)
    .innerJoin(pharmacyProducts, eq(pharmacyProducts.id, pharmacySupplies.productId))
    .innerJoin(pharmacyBatches, eq(pharmacyBatches.id, pharmacySupplies.batchId))
    .leftJoin(prescriptions, eq(prescriptions.id, pharmacySupplies.prescriptionId))
    .leftJoin(pharmacySupplyReversals, eq(pharmacySupplyReversals.supplyId, pharmacySupplies.id))
    .leftJoin(
      pharmacySupplyCorrections,
      eq(pharmacySupplyCorrections.supplyId, pharmacySupplies.id),
    )
    .where(eq(pharmacySupplies.handoverId, ho.id))
    .orderBy(asc(pharmacySupplies.prescriptionId), asc(pharmacyBatches.expiry));
  return {
    handoverId: ho.id,
    patientUserId: ho.patientUserId,
    labelMode: ho.labelMode,
    pointName: h.points.find((p) => p.id === ho.dispensingPointId)?.name ?? "",
    suppliedAt: ho.suppliedAt.toISOString(),
    supplies: rows.map(({ reversal, correction, dose, route, frequency, duration, ...r }) => ({
      ...r,
      directions: [dose, route, frequency, duration].filter(Boolean).join(" · "),
      reversed: !!reversal || !!correction,
    })),
    hospital: { name: hospital?.name ?? "", district: hospital?.district ?? null },
  };
}
