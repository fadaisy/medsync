import type { EmrDb } from "@/lib/emr/db";
import type { StrengthMatch } from "@/lib/pharmacy/catalogue";
import type { LaneReasonCode, PrescriptionLane } from "@/lib/pharmacy/lanes";
import type { LineStatus, OpenOutcome, Stage } from "@/lib/pharmacy/lines";
import type { ViewLineInput } from "@/lib/pharmacy/prescription-view";
import type { SlipResult } from "@/lib/pharmacy/print/slip";
import type {
  Group,
  GroupLine,
  HospitalContext,
  PaymentStatus,
  RxRow,
  Shelf,
} from "@/lib/pharmacy/review/load";
import type { Recipients } from "@/lib/pharmacy/review/store";
import { and, asc, count, desc, eq, inArray, sql } from "drizzle-orm";

import { REVIEW } from "@/content/pharmacy-review";
import { db as appDb } from "@/db";
import { clinicianProfiles, staffAffiliations } from "@/db/schema/clinician-profiles";
import { hospitals } from "@/db/schema/hospitals";
import {
  pharmacyPrintEvents,
  pharmacySlips,
  pharmacyStockAnswers,
} from "@/db/schema/pharmacy-dispensing";
import { cadres, councils } from "@/db/schema/reference-data";
import { users } from "@/db/schema/users";
import { decrypt } from "@/lib/encryption";
import { sameStrength } from "@/lib/pharmacy/catalogue";
import { leastAdvanced, queryState, saidCouldNotGet } from "@/lib/pharmacy/lines";
import { buildPrescriptionView } from "@/lib/pharmacy/prescription-view";
import { slipFor, VERIFICATION_CODE_PATTERN } from "@/lib/pharmacy/print/slip";
import { cadreOfUsers } from "@/lib/pharmacy/read";
import {
  loadGroupByKey,
  loadGroupOfLine,
  loadHospitalContext,
  loadScopeGroups,
  loadShelf,
  pointIsLive,
  shelfKey,
} from "@/lib/pharmacy/review/load";
import { queryOutcomeForPharmacy } from "@/lib/pharmacy/review/queries";
import { acceptanceNeeded, reviewBasis } from "@/lib/pharmacy/review/review";
import { recipientsFor } from "@/lib/pharmacy/review/store";
import { daysBetween, expiresOn, isExpired, localDate } from "@/lib/pharmacy/stock/ledger";
import { drugById, offersRegimens } from "@/lib/prescribing/formulary";
import { DEFAULT_TIME_ZONE, startOfLocalDay } from "@/supabase/functions/_shared/slots";

/**
 * Review, queries and outcomes, read (Pharmacy Phase 1, Section 8 reads: the extended
 * `getPharmacyQueue`, `getReview`, `getOpenLines`; the slip, LB-5, LB-6). Every read takes the
 * hospital from the caller's scope, never from the client, and returns plain data the screens render.
 * Lanes come from `lanes.ts` with the hospital's signed rule (none → pharmacist-first, LN-4), stages
 * and outcomes from `lines.ts`, scope from `lines.inScope` with the first live point (LO-6), query words
 * from `queries.queryOutcomeForPharmacy`, stock from the ledger (`stock/ledger.ts`).
 */

const defaultDb = () => appDb as unknown as EmrDb;
const DAY_MS = 86_400_000;

const safeDecrypt = (c: string | null) => {
  if (!c) return null;
  try {
    return decrypt(c);
  } catch {
    return null;
  }
};

/* ─── The shelf, in words the screens use (AV-3, 5.3, 5.5) ──────────── */

export interface ShelfAnswer {
  state: "no_product" | "not_counted" | "out" | "on_shelf";
  quantity: number;
  issueUnit: string | null;
  lastCounted: string | null;
  outSince: string | null;
  firstBatch: { batchNumber: string; expiry: string; expiryMonthOnly: boolean } | null;
  expired: { batchNumber: string; expiry: string }[];
}

export function shelfAnswer(
  shelf: Shelf,
  pointId: string,
  medicineId: string,
  now: Date,
): ShelfAnswer {
  const k = shelfKey(pointId, medicineId);
  const products = shelf.products.get(k) ?? [];
  const today = localDate(now);
  const own = shelf.batches.filter((b) => b.pointId === pointId && b.medicineId === medicineId);
  const usable = own
    .filter((b) => !isExpired(b, today) && b.balance > 0)
    .sort((a, b) => expiresOn(a).localeCompare(expiresOn(b)));
  const quantity = usable.reduce((s, b) => s + b.balance, 0);
  const lastCounted = shelf.lastCounted.get(k) ?? null;
  const state: ShelfAnswer["state"] = !products.length
    ? "no_product"
    : own.some((b) => b.balance < 0) || (!lastCounted && !own.length)
      ? "not_counted"
      : quantity > 0
        ? "on_shelf"
        : "out";
  return {
    state,
    quantity,
    issueUnit: products[0]?.issueUnit ?? null,
    lastCounted: lastCounted?.toISOString() ?? null,
    outSince: shelf.outSince.get(k)?.toISOString() ?? null,
    firstBatch: usable[0]
      ? {
          batchNumber: usable[0].batchNumber,
          expiry: usable[0].expiry,
          expiryMonthOnly: usable[0].expiryMonthOnly,
        }
      : null,
    expired: own
      .filter((b) => isExpired(b, today) && b.balance > 0)
      .map((b) => ({ batchNumber: b.batchNumber, expiry: b.expiry })),
  };
}

/* ─── The queue (5.2) ─────────────────────────────────────────────────── */

export interface ReviewRow {
  key: string;
  firstLineId: string;
  patientUserId: string;
  medicines: string[];
  lineCount: number;
  /** At the acting point: lines not on the shelf, and whether any is not counted. */
  notOnShelf: number;
  notCounted: boolean;
  from: string | null;
  prescriberCadre: string | null;
  origin: "window" | "ward";
  lane: PrescriptionLane;
  reasons: LaneReasonCode[];
  stage: Stage;
  /** When the open query on the row was sent, for "Queried · {n} min". */
  queriedSince: string | null;
  writtenAt: string;
  /** B-10: written before today (hospital-local), with its age in days. */
  earlier: boolean;
  ageDays: number;
  payment: PaymentStatus | null;
  changedSincePrint: boolean;
}

export interface ReviewQueueData {
  rows: ReviewRow[];
  points: { id: string; name: string; serves: string; live: boolean }[];
  rule: { signed: boolean; reasonsOn: LaneReasonCode[]; highRiskSigned: boolean };
  serverNow: string;
}

function rowOf(g: Group, shelf: Shelf, pointId: string | null, now: Date): ReviewRow | null {
  const staged = g.lines.filter((l) => l.status?.kind === "stage");
  if (!staged.length) return null; // LO-3: every line has an outcome
  const stages = staged.map((l) => (l.status as { stage: Stage }).stage);
  const openQueries = g.queries.filter((q) => queryState(q.lite) === "open");
  const today = startOfLocalDay(now, DEFAULT_TIME_ZONE);
  let notOnShelf = 0;
  let notCounted = false;
  if (pointId)
    for (const l of staged) {
      const a = shelfAnswer(shelf, pointId, l.row.drugId, now);
      if (a.state === "not_counted") notCounted = true;
      else if (a.state !== "on_shelf") notOnShelf += 1;
    }
  return {
    key: g.key,
    firstLineId: g.lines[0]!.row.id,
    patientUserId: g.patientUserId,
    medicines: staged.map((l) => l.row.drugName),
    lineCount: staged.length,
    notOnShelf,
    notCounted,
    from: g.encounter?.departmentName ?? null,
    prescriberCadre: g.prescriberCadre,
    origin: g.origin,
    lane: g.lane.lane,
    reasons: g.lane.reasons,
    stage: leastAdvanced(stages)!,
    queriedSince: openQueries[0]?.createdAt.toISOString() ?? null,
    writtenAt: g.writtenAt.toISOString(),
    earlier: g.writtenAt.getTime() < today.getTime(),
    ageDays: Math.max(
      0,
      Math.floor(
        (today.getTime() - startOfLocalDay(g.writtenAt, DEFAULT_TIME_ZONE).getTime()) / DAY_MS,
      ),
    ),
    payment: g.payment?.status ?? null,
    changedSincePrint: g.changedSincePrint,
  };
}

/** The extended `getPharmacyQueue` (5.2): every prescription in scope with a line at a stage. */
export async function getReviewQueue(
  hospitalId: string,
  pointId: string | null,
  database: EmrDb = defaultDb(),
  now = new Date(),
): Promise<ReviewQueueData> {
  const h = await loadHospitalContext(database, hospitalId);
  const groups = await loadScopeGroups(database, h);
  const shelf = await loadShelf(
    database,
    hospitalId,
    groups.flatMap((g) => g.lines.map((l) => l.row.drugId)),
  );
  return {
    rows: groups.flatMap((g) => rowOf(g, shelf, pointId, now) ?? []),
    points: h.points.map((p) => ({
      id: p.id,
      name: p.name,
      serves: p.serves,
      live: pointIsLive(p),
    })),
    rule: ruleSummary(h),
    serverNow: now.toISOString(),
  };
}

function ruleSummary(h: HospitalContext): ReviewQueueData["rule"] {
  return {
    signed: h.rule !== null,
    reasonsOn: h.rule
      ? [
          ...new Set<LaneReasonCode>([
            ...h.rule.reasons.filter((r) => r.on).map((r) => r.code),
            "controlled", // LN-5: always on
          ]),
        ]
      : [],
    highRiskSigned: h.highRisk !== null,
  };
}

/* ─── One prescription (5.3) ──────────────────────────────────────────── */

export interface ReviewQueryView {
  id: string;
  scope: "line" | "prescription";
  lineIds: string[];
  type: string;
  proposal: string;
  patientWaiting: boolean;
  sentAt: string;
  senderCadre: string | null;
  state: "not_sent" | "open" | "answered" | "withdrawn";
  words: string;
  caution: boolean;
}

/** The staged decision (`decision_saved`), as saveLineDecisions wrote it. */
export interface StagedDecision {
  kind: "full" | "part";
  productId?: string;
  batches?: { batchId: string; quantity: number }[];
  quantity: number;
  notSupplied: number | null;
  rest: "owed" | "buying_outside" | null;
  reasonCode?: string | null;
  batchChoiceReason?: string | null;
  daysCovered?: number | null;
}

export interface LineStock {
  products: {
    id: string;
    name: string;
    strength: string | null;
    issueUnit: string;
    /** H2, CT-4: the pack's strength against the prescribed one, as text. */
    match: StrengthMatch;
  }[];
  batches: {
    id: string;
    productId: string;
    batchNumber: string;
    expiry: string;
    expiryMonthOnly: boolean;
    balance: number;
    expired: boolean;
  }[];
}

/** The products and batches of one medicine at one point (5.3.1, SU-3); expired ones flagged, never offered. */
export function lineStock(
  shelf: Shelf,
  pointId: string | null,
  medicineId: string,
  now: Date,
  prescribedStrength: string | null = null,
): LineStock {
  if (!pointId) return { products: [], batches: [] };
  const today = localDate(now);
  const products = shelf.products.get(shelfKey(pointId, medicineId)) ?? [];
  const ids = new Set(products.map((p) => p.id));
  return {
    products: products.map((p) => ({
      id: p.id,
      name: p.name,
      strength: p.strength,
      issueUnit: p.issueUnit,
      match: sameStrength(prescribedStrength, p.strength),
    })),
    batches: shelf.batches
      .filter((b) => b.pointId === pointId && ids.has(b.productId) && b.balance > 0)
      .sort((a, b) => expiresOn(a).localeCompare(expiresOn(b)))
      .map((b) => ({
        id: b.id,
        productId: b.productId,
        batchNumber: b.batchNumber,
        expiry: b.expiry,
        expiryMonthOnly: b.expiryMonthOnly,
        balance: b.balance,
        expired: isExpired(b, today),
      })),
  };
}

export interface ReviewLineView {
  id: string;
  input: ViewLineInput;
  drugId: string;
  status: LineStatus | null;
  reasons: LaneReasonCode[];
  need: "none" | "own_tap" | "accept_remaining";
  /** RQ-1: the standing acceptance (or D-PH1-05 reason) of this version. */
  basis: {
    kind: "accepted" | "supplied_without_review";
    byCadre: string | null;
    at: string;
  } | null;
  staged: StagedDecision | null;
  shelf: ShelfAnswer | null;
  /** 5.3.1: the products set up here for this medicine and their batches, for the Change dialog. */
  stock: LineStock;
  elsewhere: string[];
  /** RQ-9: replaced by the prescriber, with when. */
  replacedAt: string | null;
  replaces: string | null;
  suppliedEarlier: { quantity: number; at: string } | null;
  checks: { code: string; title: string; level: "stop" | "check"; answer: string | null }[];
  overriddenStops: string[];
  doseSource: "regimen" | "typed" | null;
  outcomeReason: string | null;
  outcomeSince: string | null;
  /** D-PH1-44: the stock answer the prescriber was shown, in words; null for none or "in stock". */
  stockAnswer?: string | null;
}

export interface ReviewData {
  key: string;
  patientUserId: string;
  firstLineId: string;
  lane: PrescriptionLane;
  laneReasons: LaneReasonCode[];
  scope: "out" | "supply" | "review_only";
  origin: "window" | "ward";
  from: string | null;
  prescriberCadre: string | null;
  writtenAt: string;
  beforeGoLive: boolean;
  cosignAwaiting: boolean;
  changedSincePrint: boolean;
  payment: { status: PaymentStatus; detail: string | null } | null;
  lines: ReviewLineView[];
  queries: ReviewQueryView[];
  /** B-01: of the active doses, how many have a signed reference. */
  doses: { signed: number; total: number };
  recipients: {
    cadre: string;
    place: string | null;
    role: "prescriber" | "responsible_clinician";
  }[];
  skipped: { cadre: string }[];
  settings: { supplyWithoutPharmacist: boolean; liveSms: boolean };
  pointLive: boolean;
  pointName: string | null;
  pointPhone: string | null;
  /** Other live points (for "Send for it", AV-5). */
  otherLivePoints: { id: string; name: string }[];
  serverNow: string;
}

function lineView(
  g: Group,
  l: GroupLine,
  shelf: Shelf,
  h: HospitalContext,
  pointId: string | null,
  people: Map<string, string>,
  view: ReturnType<typeof buildPrescriptionView>["lines"][number] | undefined,
  input: ViewLineInput,
  now: Date,
): ReviewLineView {
  const basis = reviewBasis(g.lane.lane, l.row.id, l.reviewEvents);
  const basisEvent =
    basis && basis.kind !== "checked_at_supply"
      ? l.events.find((e) => e.id === basis.eventId)
      : null;
  const staged = [...l.events].reverse().find((e) => e.kind === "decision_saved");
  const d = (staged?.decision ?? null) as ReviewLineView["staged"];
  const opened = [...l.events]
    .reverse()
    .find((e) => e.kind === "owed" || e.kind === "buying_outside");
  const live = h.points.filter(pointIsLive);
  const holds = (p: { id: string }) =>
    shelfAnswer(shelf, p.id, l.row.drugId, now).state === "on_shelf";
  const here = pointId ? shelfAnswer(shelf, pointId, l.row.drugId, now) : null;
  return {
    id: l.row.id,
    input,
    drugId: l.row.drugId,
    status: l.status,
    reasons: l.reasons,
    need: acceptanceNeeded(g.lane.lane, g.lane.perLine, l.row.id),
    basis:
      basis && basisEvent
        ? {
            kind: basis.kind === "accepted" ? "accepted" : "supplied_without_review",
            byCadre: basisEvent.actorCadre ?? people.get(basisEvent.actorUserId) ?? null,
            at: basisEvent.occurredAt.toISOString(),
          }
        : null,
    staged: d && (d.kind === "full" || d.kind === "part") ? d : null,
    shelf: here,
    stock: lineStock(shelf, pointId, l.row.drugId, now, l.row.concentration),
    elsewhere:
      here && here.state !== "on_shelf"
        ? live.filter((p) => p.id !== pointId && holds(p)).map((p) => p.name)
        : [],
    replacedAt: l.replacedBy ? (l.cancellationAt?.toISOString() ?? null) : null,
    replaces: l.replaces,
    suppliedEarlier: l.suppliedEarlier
      ? { quantity: l.suppliedEarlier.quantity, at: l.suppliedEarlier.at.toISOString() }
      : null,
    checks: view?.checks ?? [],
    overriddenStops: view?.overriddenStops ?? [],
    doseSource: view?.doseSource ?? null,
    outcomeReason: opened?.reasonCode ?? null,
    outcomeSince: opened?.occurredAt.toISOString() ?? null,
    stockAnswer: null,
  };
}

function viewInput(
  r: RxRow,
  c: GroupLine["cosign"],
  reviewers: Map<string, string>,
): ViewLineInput {
  return {
    id: r.id,
    placementLine: r.placementLine,
    kind: r.kind,
    drugName: r.drugName,
    concentration: r.concentration,
    dose: r.dose,
    route: r.route,
    frequency: r.frequency,
    duration: r.duration,
    quantity: r.quantity,
    method: r.method,
    infusionOver: r.infusionOver,
    diluent: r.diluent,
    prn: r.prn,
    fluidPurpose: r.fluidPurpose,
    volumeMl: r.volumeMl,
    overMinutes: r.overMinutes,
    instructions: safeDecrypt(r.instructionsCiphertext),
    indication: r.conditionTerm ?? safeDecrypt(r.conditionText) ?? r.indication,
    conditionId: r.conditionId,
    regimenId: r.regimenId,
    edits: r.edits,
    controlled: r.controlled,
    state: r.state,
    cosign: c
      ? {
          state: c.state,
          reviewedAt: c.reviewedAt,
          reviewerCadre: c.reviewedByUserId ? (reviewers.get(c.reviewedByUserId) ?? null) : null,
        }
      : null,
    checkAnswers: r.checkAnswers,
    confirmedFlags: r.confirmedFlags,
    reasons: safeDecrypt(r.reasonCiphertext),
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  };
}

/** `getReview` (5.3): one prescription with its lines, stages, shelf, checks and queries. */
export async function getReview(
  hospitalId: string,
  key: string,
  pointId: string | null,
  database: EmrDb = defaultDb(),
  now = new Date(),
): Promise<ReviewData | null> {
  const h = await loadHospitalContext(database, hospitalId);
  const g = await loadGroupByKey(database, h, key);
  if (!g) return null;
  return reviewOf(database, h, g, pointId, now);
}

async function reviewOf(
  database: EmrDb,
  h: HospitalContext,
  g: Group,
  pointId: string | null,
  now: Date,
): Promise<ReviewData> {
  const first = g.lines[0]!.row;
  const [shelf, people, who, answers] = await Promise.all([
    loadShelf(
      database,
      h.hospitalId,
      g.lines.map((l) => l.row.drugId),
    ),
    cadreOfUsers(
      database,
      h.hospitalId,
      g.lines.flatMap((l) => [
        ...l.events.map((e) => e.actorUserId),
        ...(l.cosign?.reviewedByUserId ? [l.cosign.reviewedByUserId] : []),
      ]),
    ),
    recipientsFor(database, h.hospitalId, first.prescriberUserId, first.encounterId),
    database
      .select({ line: pharmacyStockAnswers.prescriptionId, state: pharmacyStockAnswers.state })
      .from(pharmacyStockAnswers)
      .where(
        and(
          eq(pharmacyStockAnswers.hospitalId, h.hospitalId),
          inArray(
            pharmacyStockAnswers.prescriptionId,
            g.lines.map((l) => l.row.id),
          ),
        ),
      ),
  ]);
  const answerOf = new Map(answers.map((a) => [a.line, REVIEW.stockAnswer[a.state] ?? null]));
  const whoCadres = await cadreOfUsers(database, h.hospitalId, [
    ...who.recipients.map((r) => r.userId),
    ...who.skipped.map((r) => r.userId),
  ]);
  const inputs = new Map(g.lines.map((l) => [l.row.id, viewInput(l.row, l.cosign, people)]));
  const view = buildPrescriptionView({
    lines: [...inputs.values()],
    encounter: g.encounter,
    prescriberCadre: g.prescriberCadre,
  });
  const viewOf = new Map(view.lines.map((v) => [v.id, v]));
  const point = h.points.find((p) => p.id === pointId) ?? null;
  const active = g.lines.filter((l) => l.row.state === "active" || l.row.state === "administered");
  return {
    key: g.key,
    patientUserId: g.patientUserId,
    firstLineId: first.id,
    lane: g.lane.lane,
    laneReasons: g.lane.reasons,
    scope: g.scope,
    origin: g.origin,
    from: g.encounter?.departmentName ?? null,
    prescriberCadre: g.prescriberCadre,
    writtenAt: g.writtenAt.toISOString(),
    beforeGoLive:
      g.scope === "out" &&
      !g.broughtIn &&
      h.firstLiveAt !== null &&
      g.writtenAt.getTime() < h.firstLiveAt.getTime(),
    cosignAwaiting: g.lines.some(
      (l) => l.status?.kind === "stage" && l.status.stage === "awaiting_cosign",
    ),
    changedSincePrint: g.changedSincePrint,
    payment: g.payment ? { status: g.payment.status, detail: g.payment.detail } : null,
    lines: g.lines.map((l) => ({
      ...lineView(
        g,
        l,
        shelf,
        h,
        pointId,
        people,
        viewOf.get(l.row.id),
        inputs.get(l.row.id)!,
        now,
      ),
      stockAnswer: answerOf.get(l.row.id) ?? null,
    })),
    queries: g.queries.map((q) => {
      const o = queryOutcomeForPharmacy({ sentAt: q.createdAt, events: q.events });
      return {
        id: q.id,
        scope: q.scope,
        lineIds: [...q.lite.lineIds],
        type: q.typeCode,
        proposal: q.proposal,
        patientWaiting: q.patientWaiting,
        sentAt: q.createdAt.toISOString(),
        senderCadre: q.senderCadre,
        state: o.state,
        words: o.words,
        caution: o.caution,
      };
    }),
    doses: {
      total: active.length,
      signed: active.filter((l) => {
        const d = drugById(l.row.drugId);
        return l.row.regimenId !== null && !!d && offersRegimens(d.dose);
      }).length,
    },
    recipients: who.recipients.map((r) => ({
      cadre: whoCadres.get(r.userId) ?? "Prescriber",
      place: g.encounter?.departmentName ?? null,
      role: r.role,
    })),
    skipped: who.skipped.map((r) => ({ cadre: whoCadres.get(r.userId) ?? "Prescriber" })),
    settings: {
      supplyWithoutPharmacist: h.settings.supplyWithoutPharmacist,
      liveSms: h.settings.liveSms,
    },
    pointLive: point ? pointIsLive(point) : false,
    pointName: point?.name ?? null,
    pointPhone: point?.phone ?? null,
    otherLivePoints: h.points
      .filter((p) => p.id !== pointId && pointIsLive(p))
      .map((p) => ({ id: p.id, name: p.name })),
    serverNow: now.toISOString(),
  };
}

/** The review of the prescription a line belongs to (for Find a prescription's earlier rows). */
export async function getReviewOfLine(
  hospitalId: string,
  lineId: string,
  pointId: string | null,
  database: EmrDb = defaultDb(),
  now = new Date(),
) {
  const h = await loadHospitalContext(database, hospitalId);
  const found = await loadGroupOfLine(database, h, lineId);
  return found ? reviewOf(database, h, found.group, pointId, now) : null;
}

/** 5.4 "Log a phone answer": the staff of this hospital who may prescribe here (RQ-6, RQ-7). */
export async function prescribersHere(hospitalId: string, database: EmrDb = defaultDb()) {
  const rows = await database
    .select({ userId: staffAffiliations.userId, name: users.fullName, cadre: cadres.name })
    .from(staffAffiliations)
    .innerJoin(cadres, eq(cadres.id, staffAffiliations.cadreId))
    .innerJoin(users, eq(users.id, staffAffiliations.userId))
    .where(
      and(
        eq(staffAffiliations.hospitalId, hospitalId),
        inArray(staffAffiliations.state, ["active", "approved"]),
        sql`EXISTS (SELECT 1 FROM public.clinical_cosign_policies cp
                     WHERE cp.hospital_id = ${staffAffiliations.hospitalId} AND cp.cadre_code = ${cadres.code}
                       AND cp.action_kind = 'prescription_routine'
                       AND cp.requirement IN ('allowed','cosign_required'))`,
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

/* ─── Open lines (5.7) ────────────────────────────────────────────────── */

export interface OpenLineRow {
  lineId: string;
  key: string;
  patientUserId: string;
  medicine: string;
  controlled: boolean;
  outcome: OpenOutcome;
  supplied: number;
  notSupplied: number | null;
  reasonCode: string | null;
  since: string;
  slipPrintedAt: string | null;
  /** 5.7: "Supply now" only when the medicine is on the shelf at the acting point. */
  onShelfHere: boolean;
  /** 5.7, ML-4: the patient said in the app they could not get it (still open). */
  patientCouldNotGet: boolean;
}

/** `getOpenLines` (LO-3): every line with an open outcome, oldest first. Nothing drops off (LO-5). */
export async function getOpenLines(
  hospitalId: string,
  database: EmrDb = defaultDb(),
  pointId: string | null = null,
  now = new Date(),
) {
  const h = await loadHospitalContext(database, hospitalId);
  const groups = await loadScopeGroups(database, h);
  const shelf = pointId
    ? await loadShelf(
        database,
        hospitalId,
        groups.flatMap((g) =>
          g.lines.filter((l) => l.status?.kind === "open").map((l) => l.row.drugId),
        ),
      )
    : null;
  const rows: OpenLineRow[] = [];
  for (const g of groups)
    for (const l of g.lines) {
      if (l.status?.kind !== "open") continue;
      const opened = [...l.events]
        .reverse()
        .find((e) => e.kind === "owed" || e.kind === "buying_outside");
      rows.push({
        lineId: l.row.id,
        key: g.key,
        patientUserId: g.patientUserId,
        medicine: l.row.drugName,
        controlled: l.row.controlled,
        outcome: l.status.outcome,
        supplied: l.status.supplied,
        notSupplied: l.status.notSupplied,
        reasonCode: opened?.reasonCode ?? null,
        since: (opened?.occurredAt ?? g.writtenAt).toISOString(),
        slipPrintedAt: null,
        onShelfHere:
          !!shelf &&
          !!pointId &&
          shelfAnswer(shelf, pointId, l.row.drugId, now).state === "on_shelf",
        patientCouldNotGet: saidCouldNotGet(l.events),
      });
    }
  if (rows.length) {
    const slips = await database
      .select({ ids: pharmacySlips.prescriptionIds, at: pharmacySlips.printedAt })
      .from(pharmacySlips)
      .where(eq(pharmacySlips.hospitalId, hospitalId))
      .orderBy(desc(pharmacySlips.printedAt));
    for (const r of rows)
      r.slipPrintedAt = slips.find((s) => s.ids.includes(r.lineId))?.at.toISOString() ?? null;
  }
  return {
    liveSms: h.settings.liveSms,
    rows: rows.sort((a, b) => a.since.localeCompare(b.since)),
    points: h.points.map((p) => ({
      id: p.id,
      name: p.name,
      live: pointIsLive(p),
      wasLive: p.liveAt !== null,
    })),
  };
}

/* ─── The slip (5.5, LB-5, LB-6) ──────────────────────────────────────── */

/** LB-6: a code resolves only for this hospital's pharmacy; anything else is the same as unknown. */
export async function findSlipByCode(
  hospitalId: string,
  typed: string,
  database: EmrDb = defaultDb(),
): Promise<{ id: string } | null> {
  const code = typed.replace(/[\s-]/g, "").toUpperCase();
  if (!VERIFICATION_CODE_PATTERN.test(code)) return null;
  const [row] = await database
    .select({ id: pharmacySlips.id })
    .from(pharmacySlips)
    .where(and(eq(pharmacySlips.hospitalId, hospitalId), eq(pharmacySlips.code, code)));
  return row ?? null;
}

/** The slip's facts, through `slipFor`. Null when the slip is not this hospital's. */
export async function getSlip(
  hospitalId: string,
  slipId: string,
  patient: (
    patientUserId: string,
  ) => Promise<{ name: string; medsyncNumber: string; sexAndAge: string }>,
  database: EmrDb = defaultDb(),
): Promise<{ result: SlipResult; code: string } | null> {
  const [slip] = await database
    .select()
    .from(pharmacySlips)
    .where(and(eq(pharmacySlips.id, slipId), eq(pharmacySlips.hospitalId, hospitalId)));
  if (!slip) return null;
  const h = await loadHospitalContext(database, hospitalId);
  const found = await loadGroupOfLine(database, h, slip.prescriptionIds[0]!);
  if (!found) return null;
  const g = found.group;
  const first = g.lines[0]!.row;
  const [[hospital], [prescriber], [printed], who] = await Promise.all([
    database
      .select({ name: hospitals.name, district: hospitals.district })
      .from(hospitals)
      .where(eq(hospitals.id, hospitalId)),
    database
      .select({
        name: users.fullName,
        number: clinicianProfiles.registrationNumber,
        council: councils.shortName,
      })
      .from(users)
      .leftJoin(clinicianProfiles, eq(clinicianProfiles.id, users.id))
      .leftJoin(councils, eq(councils.id, clinicianProfiles.councilId))
      .where(eq(users.id, first.prescriberUserId)),
    database
      .select({ n: count() })
      .from(pharmacyPrintEvents)
      .where(and(eq(pharmacyPrintEvents.refId, slipId), eq(pharmacyPrintEvents.kind, "slip"))),
    patient(g.patientUserId),
  ]);
  const point = h.points.find((p) => p.id === slip.dispensingPointId);
  const lastChange = g.lines
    .flatMap((l) => [l.row.createdAt, ...(l.cancellationAt ? [l.cancellationAt] : [])])
    .filter((d) => g.lastPrintAt && d > g.lastPrintAt)
    .sort((a, b) => b.getTime() - a.getTime())[0];
  const result = slipFor({
    hospital: { name: hospital?.name ?? "", district: hospital?.district ?? null },
    point: { name: point?.name ?? "", phone: point?.phone ?? null },
    prescriptionNumber: null,
    patient: who,
    prescriber: {
      name: prescriber?.name ?? "",
      cadre: g.prescriberCadre ?? "",
      councilNumber: prescriber?.number
        ? [prescriber.council, prescriber.number].filter(Boolean).join(" ")
        : null,
    },
    lines: g.lines
      .filter((l) => slip.prescriptionIds.includes(l.row.id))
      .map((l) => ({
        outcome: l.status?.kind === "open" ? l.status.outcome : (l.status?.kind ?? "none"),
        controlled: l.row.controlled,
        medicine: [drugById(l.row.drugId)?.generic ?? l.row.drugName, l.row.concentration]
          .filter(Boolean)
          .join(", "),
        directions: [l.row.dose, l.row.route, l.row.frequency, l.row.duration]
          .filter(Boolean)
          .join(" · "),
        quantityNotSupplied: l.status?.kind === "open" ? l.status.notSupplied : null,
      })),
    changedAt: g.changedSincePrint && lastChange ? lastChange.toISOString() : null,
    code: slip.code,
    printedAt: slip.printedAt.toISOString(),
    copy: {
      n: Math.max(1, Number(printed?.n ?? 0)),
      of: Math.max(slip.copyCount, Number(printed?.n ?? 0)),
    },
    timeZone: DEFAULT_TIME_ZONE,
  });
  return { result, code: slip.code };
}

/** Whole days between two instants, hospital-local (for "Open since"). */
export const ageInDays = (from: string, now: Date) =>
  Math.max(0, daysBetween(localDate(new Date(from)), localDate(now)));

export type { Recipients };
