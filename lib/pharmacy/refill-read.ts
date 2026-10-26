import "server-only";

import type { EmrDb } from "@/lib/emr/db";
import type { LineRepeat } from "@/lib/pharmacy/refill-store";
import type { RefillState } from "@/lib/pharmacy/refills";
import { and, desc, eq, inArray, isNull } from "drizzle-orm";

import { NETWORK_B, NETWORK_UI } from "@/content/pharmacy-network";
import { hospitalDepartments } from "@/db/schema/hospital-departments";
import { pharmacyDispensingPoints } from "@/db/schema/pharmacy";
import { pharmacyProducts, pharmacySupplies } from "@/db/schema/pharmacy-dispensing";
import {
  patientCollectors,
  pharmacyRefillEvents,
  pharmacyRefillRequestLines,
  pharmacyRefillRequests,
  prescriptionRepeatAuthorisations,
} from "@/db/schema/pharmacy-network";
import { networkPack } from "@/lib/pharmacy/network-packs";
import { isNotCollected, lineRepeats } from "@/lib/pharmacy/refill-store";
import { mayAskNow, refillLineState, timingLabels } from "@/lib/pharmacy/refills";
import { localDate } from "@/lib/pharmacy/stock/ledger";
import { addDays } from "@/lib/pharmacy/stores/ledger";
import { longDate } from "@/lib/prescribing/repeats";

/**
 * Refill reads (Pharmacy Phase 4, Step 5): the pharmacy's six tabs (5.5) and the patient's repeat medicines (5.4).
 * Words come from content/pharmacy-network.ts. No stock count reaches the patient; no price is shown anywhere.
 */

const W = NETWORK_UI.refills;
export type RefillTab = keyof typeof W.tabs;

export interface RefillRow {
  lineId: string;
  requestId: string;
  prescriptionId: string;
  patientUserId: string;
  pointId: string | null;
  medicine: string;
  medicineId: string;
  tab: RefillTab;
  allows: string;
  lastSupply: string | null;
  timing: { early: string | null; late: boolean };
  collectAt: string;
  collector: string;
  heldUntil: string | null;
  channel: "app" | "window" | "phone";
  note: string | null;
  requestedAt: string;
  /** Products of this medicine at the hospital, for Set aside. */
  products: { id: string; name: string }[];
}

const allowsWords = (
  r: LineRepeat | undefined,
  a: { furtherSupplies: number; minIntervalDays: number; notAfter: string } | undefined,
) =>
  !a
    ? W.noRepeats
    : r && a.furtherSupplies - r.used > 0
      ? W.allows(a.furtherSupplies - r.used, a.minIntervalDays, longDate(a.notAfter))
      : W.noneLeft;

/** 5.5: every open refill line at the hospital, and today's collected ones, each in its tab. */
export async function refillBoard(db: EmrDb, hospitalId: string, now: Date): Promise<RefillRow[]> {
  const today = localDate(now);
  const lines = await db
    .select({
      lineId: pharmacyRefillRequestLines.id,
      requestId: pharmacyRefillRequests.id,
      prescriptionId: pharmacyRefillRequestLines.prescriptionId,
      patientUserId: pharmacyRefillRequests.patientUserId,
      pointId: pharmacyRefillRequests.dispensingPointId,
      pointName: hospitalDepartments.name,
      channel: pharmacyRefillRequests.channel,
      note: pharmacyRefillRequests.note,
      requestedAt: pharmacyRefillRequests.requestedAt,
      collectorName: patientCollectors.name,
      collectorRelationship: patientCollectors.relationship,
    })
    .from(pharmacyRefillRequestLines)
    .innerJoin(
      pharmacyRefillRequests,
      eq(pharmacyRefillRequests.id, pharmacyRefillRequestLines.requestId),
    )
    .leftJoin(
      hospitalDepartments,
      eq(hospitalDepartments.id, pharmacyRefillRequests.dispensingPointId),
    )
    .leftJoin(patientCollectors, eq(patientCollectors.id, pharmacyRefillRequests.collectorId))
    .where(eq(pharmacyRefillRequestLines.hospitalId, hospitalId))
    .orderBy(pharmacyRefillRequests.requestedAt);
  if (!lines.length) return [];
  const lineIds = lines.map((l) => l.lineId);
  const rxIds = [...new Set(lines.map((l) => l.prescriptionId))];
  const [events, repeats, auths, supplies, timing] = await Promise.all([
    db
      .select({
        lineId: pharmacyRefillEvents.lineId,
        kind: pharmacyRefillEvents.kind,
        heldUntil: pharmacyRefillEvents.heldUntil,
        reasonNote: pharmacyRefillEvents.reasonNote,
        at: pharmacyRefillEvents.at,
      })
      .from(pharmacyRefillEvents)
      .where(inArray(pharmacyRefillEvents.lineId, lineIds))
      .orderBy(pharmacyRefillEvents.at, pharmacyRefillEvents.id),
    lineRepeats(db, hospitalId, rxIds, today),
    db
      .select()
      .from(prescriptionRepeatAuthorisations)
      .where(inArray(prescriptionRepeatAuthorisations.prescriptionId, rxIds)),
    db
      .select({
        line: pharmacySupplies.prescriptionId,
        at: pharmacySupplies.suppliedAt,
        days: pharmacySupplies.daysCovered,
      })
      .from(pharmacySupplies)
      .where(inArray(pharmacySupplies.prescriptionId, rxIds))
      .orderBy(desc(pharmacySupplies.suppliedAt)),
    networkPack(db, hospitalId, "refill_timing"),
  ]);
  const medicines = [...new Set([...repeats.values()].map((r) => r.drugId))];
  const products = medicines.length
    ? await db
        .select({
          id: pharmacyProducts.id,
          medicineId: pharmacyProducts.medicineId,
          name: pharmacyProducts.name,
        })
        .from(pharmacyProducts)
        .where(
          and(
            eq(pharmacyProducts.hospitalId, hospitalId),
            inArray(pharmacyProducts.medicineId, medicines),
          ),
        )
    : [];
  const out: RefillRow[] = [];
  for (const l of lines) {
    const ev = events.filter((e) => e.lineId === l.lineId);
    const state = refillLineState(ev as { kind: RefillState }[]);
    const prepared = ev.find((e) => e.kind === "prepared");
    const heldUntil = ev.filter((e) => e.heldUntil).at(-1)?.heldUntil ?? null;
    const last = ev.at(-1);
    let tab: RefillTab | null = null;
    if (state === "to_prepare") tab = "to_prepare";
    else if (state === "needs_clinic") tab = "needs_clinic";
    else if (state === "routed") tab = "partner";
    else if (state === "collected") tab = last && localDate(last.at) === today ? "collected" : null;
    else if ((state === "prepared" || state === "held_longer") && prepared && heldUntil)
      tab = isNotCollected(
        { preparedOn: localDate(prepared.at), heldUntil, extensions: 0, released: false },
        today,
      )
        ? "not_collected"
        : "prepared";
    if (!tab) continue;
    const r = repeats.get(l.prescriptionId);
    const a = auths.find((x) => x.prescriptionId === l.prescriptionId);
    // The supply before this request (a refill's own supply is after it).
    const before = supplies.find((s) => s.line === l.prescriptionId && s.at < l.requestedAt);
    const refillOn = before?.days ? addDays(localDate(before.at), before.days) : null;
    const askedOn = localDate(l.requestedAt);
    const early = ev.find(
      (e) => e.kind === "needs_clinic" && e.reasonNote && /^\d{4}-\d{2}-\d{2}$/.test(e.reasonNote),
    );
    const labels = timingLabels({
      askedOn,
      nextAllowed: early?.reasonNote ?? null,
      refillOn,
      pack: timing?.content ?? null,
    });
    const gap = refillOn
      ? Math.round((Date.parse(askedOn) - Date.parse(refillOn)) / 86_400_000)
      : null;
    out.push({
      lineId: l.lineId,
      requestId: l.requestId,
      prescriptionId: l.prescriptionId,
      patientUserId: l.patientUserId,
      pointId: l.pointId,
      medicine: r?.drugName ?? "",
      medicineId: r?.drugId ?? "",
      tab,
      allows: allowsWords(r, a),
      lastSupply: before
        ? `${longDate(localDate(before.at))}${gap === null || gap === 0 ? "" : gap < 0 ? `, ${W.askedBefore(-gap)}` : `, ${W.askedAfter(gap)}`}`
        : null,
      timing: {
        early: labels.early && early?.reasonNote ? W.early(longDate(early.reasonNote)) : null,
        late: labels.late,
      },
      collectAt: l.pointName ?? "",
      collector: l.collectorName ? `${l.collectorName} (${l.collectorRelationship})` : W.self,
      heldUntil,
      channel: l.channel,
      note: l.note,
      requestedAt: l.requestedAt.toISOString(),
      products: products
        .filter((p) => p.medicineId === r?.drugId)
        .map((p) => ({ id: p.id, name: p.name })),
    });
  }
  return out;
}

/* ─── The patient's side (5.4) ───────────────────────────────────────── */

export interface PatientRepeat {
  prescriptionId: string;
  hospitalId: string;
  medicine: string;
  /** The one status sentence (5.4). */
  words: string;
  /** "{n} more supplies allowed until {date}. Next review by {date}." where authorised. */
  allowed: string | null;
  canAsk: boolean;
  canAskClinic: boolean;
  /** The latest request's state, in words. */
  request: string | null;
}

export interface PatientRefills {
  repeats: PatientRepeat[];
  points: Record<string, { id: string; name: string }[]>;
  collectors: { id: string; name: string; relationship: string }[];
}

const OPEN: RefillState[] = [
  "to_prepare",
  "needs_clinic",
  "prepared",
  "held_longer",
  "not_collected",
  "routed",
];

/** 5.4: every medicine with repeats, each in one sentence; the hospital places that may be chosen; saved collectors. */
export async function patientRefills(
  db: EmrDb,
  patientUserId: string,
  now: Date,
): Promise<PatientRefills> {
  const today = localDate(now);
  const auths = await db
    .select({
      prescriptionId: prescriptionRepeatAuthorisations.prescriptionId,
      hospitalId: prescriptionRepeatAuthorisations.hospitalId,
      reviewBy: prescriptionRepeatAuthorisations.reviewBy,
      notAfter: prescriptionRepeatAuthorisations.notAfter,
      n: prescriptionRepeatAuthorisations.furtherSupplies,
    })
    .from(prescriptionRepeatAuthorisations)
    .where(eq(prescriptionRepeatAuthorisations.patientUserId, patientUserId));
  const hospitals = [...new Set(auths.map((a) => a.hospitalId))];
  const [collectors, points, lines] = await Promise.all([
    db
      .select({
        id: patientCollectors.id,
        name: patientCollectors.name,
        relationship: patientCollectors.relationship,
      })
      .from(patientCollectors)
      .where(
        and(
          eq(patientCollectors.patientUserId, patientUserId),
          isNull(patientCollectors.removedAt),
        ),
      ),
    hospitals.length
      ? db
          .select({
            id: pharmacyDispensingPoints.departmentId,
            hospitalId: pharmacyDispensingPoints.hospitalId,
            name: hospitalDepartments.name,
            liveAt: pharmacyDispensingPoints.liveAt,
            offAt: pharmacyDispensingPoints.switchedOffAt,
          })
          .from(pharmacyDispensingPoints)
          .innerJoin(
            hospitalDepartments,
            eq(hospitalDepartments.id, pharmacyDispensingPoints.departmentId),
          )
          .where(inArray(pharmacyDispensingPoints.hospitalId, hospitals))
      : [],
    auths.length
      ? db
          .select({
            id: pharmacyRefillRequestLines.id,
            rx: pharmacyRefillRequestLines.prescriptionId,
            at: pharmacyRefillRequests.requestedAt,
            place: hospitalDepartments.name,
          })
          .from(pharmacyRefillRequestLines)
          .innerJoin(
            pharmacyRefillRequests,
            eq(pharmacyRefillRequests.id, pharmacyRefillRequestLines.requestId),
          )
          .leftJoin(
            hospitalDepartments,
            eq(hospitalDepartments.id, pharmacyRefillRequests.dispensingPointId),
          )
          .where(
            inArray(
              pharmacyRefillRequestLines.prescriptionId,
              auths.map((a) => a.prescriptionId),
            ),
          )
          .orderBy(desc(pharmacyRefillRequests.requestedAt))
      : [],
  ]);
  const events = lines.length
    ? await db
        .select({
          lineId: pharmacyRefillEvents.lineId,
          kind: pharmacyRefillEvents.kind,
          heldUntil: pharmacyRefillEvents.heldUntil,
        })
        .from(pharmacyRefillEvents)
        .where(
          inArray(
            pharmacyRefillEvents.lineId,
            lines.map((l) => l.id),
          ),
        )
        .orderBy(pharmacyRefillEvents.at, pharmacyRefillEvents.id)
    : [];
  const repeats: PatientRepeat[] = [];
  for (const hospitalId of hospitals) {
    const mine = auths.filter((a) => a.hospitalId === hospitalId);
    const [status, timing, rules] = await Promise.all([
      lineRepeats(
        db,
        hospitalId,
        mine.map((a) => a.prescriptionId),
        today,
      ),
      networkPack(db, hospitalId, "refill_timing"),
      networkPack(db, hospitalId, "repeat_rules"),
    ]);
    for (const a of mine) {
      const r = status.get(a.prescriptionId);
      if (!r) continue;
      const latest = lines.find((l) => l.rx === a.prescriptionId);
      const ev = latest ? events.filter((e) => e.lineId === latest.id) : [];
      const state = latest ? refillLineState(ev as { kind: RefillState }[]) : null;
      const held = ev.filter((e) => e.heldUntil).at(-1)?.heldUntil;
      const request =
        state === "to_prepare"
          ? W.patient.sent
          : state === "prepared" || state === "held_longer" || state === "not_collected"
            ? NETWORK_B.patientReady(latest?.place ?? "", longDate(held ?? today))
            : state === "needs_clinic"
              ? W.patient.toClinic
              : state === "released"
                ? W.patient.released
                : null;
      const open = state !== null && OPEN.includes(state);
      const s = r.status;
      const never = !!rules?.content.neverRepeat.includes(r.drugId);
      const words = never
        ? NETWORK_B.patientNever
        : s.kind === "allowed"
          ? NETWORK_B.patientCanAsk
          : s.kind === "too_early"
            ? NETWORK_B.patientDue(longDate(s.on))
            : s.kind === "first_supply_open"
              ? NETWORK_B.patientDue(longDate(today))
              : NETWORK_B.patientRenew;
      const left = a.n - r.used;
      repeats.push({
        prescriptionId: a.prescriptionId,
        hospitalId,
        medicine: r.drugName,
        words,
        allowed:
          left > 0 && (s.kind === "allowed" || s.kind === "too_early")
            ? NETWORK_B.patientAllowed(
                left,
                longDate(a.notAfter),
                longDate(a.reviewBy ?? a.notAfter),
              )
            : null,
        canAsk:
          !open &&
          !never &&
          (s.kind === "allowed" ||
            (s.kind === "too_early" && mayAskNow(today, s.on, timing?.content ?? null))),
        canAskClinic:
          !open &&
          !never &&
          s.kind !== "allowed" &&
          s.kind !== "too_early" &&
          s.kind !== "first_supply_open",
        request,
      });
    }
  }
  return {
    repeats,
    points: Object.fromEntries(
      hospitals.map((h) => [
        h,
        points
          .filter((p) => p.hospitalId === h && p.liveAt && !p.offAt)
          .map((p) => ({ id: p.id, name: p.name })),
      ]),
    ),
    collectors,
  };
}
