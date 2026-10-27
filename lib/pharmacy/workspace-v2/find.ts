/**
 * Find (board 9): the result rows the palette shows. Pure types and row shaping; the reads are in
 * app/pharmacy/find-actions.ts.
 */
import { fill } from "@/content/pharmacy-workspace-v2";
import { PHWS2_FIND as W } from "@/content/pharmacy-workspace-v2-find";
import { DEFAULT_TIME_ZONE } from "@/supabase/functions/_shared/slots";

export type FindGroup = "patient" | "prescription" | "batch" | "supplied" | "slip" | "delivery" | "page";

export interface FindRow {
  group: FindGroup;
  label: string;
  sub?: string;
  href: string;
  /** Identifier text (batch, slip, delivery note): shown in mono. */
  mono?: boolean;
}

export interface FindHit {
  rows: FindRow[];
}

/** At most this many patients supplied from a batch. */
export const SUPPLIED_MAX = 10;

const day = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: DEFAULT_TIME_ZONE });
const dayTime = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
  timeZone: DEFAULT_TIME_ZONE,
});
const asDate = (d: Date | string) => (typeof d === "string" ? new Date(`${d}T12:00:00+03:00`) : d);

/** The prescription page key (lib/pharmacy/read.ts `keyFilter`): the placement, or the time key without one. */
export function prescriptionKey(p: {
  placementId: string | null;
  encounterId: string | null;
  prescriberUserId: string;
  createdAt: Date;
}): string {
  return p.placementId ?? `t:${p.encounterId ?? "none"}:${p.prescriberUserId}:${p.createdAt.toISOString()}`;
}

export interface BatchMatch {
  batchNumber: string;
  firstBatchNumber: string;
  expiry: Date | string;
  productName: string;
  medicineId: string;
  placeName: string | null;
}

/** Batch rows, each linking to its medicine's stock page. */
export function batchRows(batches: readonly BatchMatch[]): FindRow[] {
  return batches.map((b) => {
    const expiry = day.format(asDate(b.expiry));
    const sub = [
      b.placeName ? fill(W.batchSub, { place: b.placeName, expiry }) : fill(W.batchSubNoPlace, { expiry }),
      b.firstBatchNumber !== b.batchNumber ? fill(W.firstNumber, { first: b.firstBatchNumber }) : null,
    ]
      .filter(Boolean)
      .join(" · ");
    return {
      group: "batch",
      label: fill(W.batch, { product: b.productName, batch: b.batchNumber }),
      sub,
      href: `/pharmacy/stock/${encodeURIComponent(b.medicineId)}`,
      mono: true,
    };
  });
}

export interface SupplyMatch {
  patientUserId: string;
  suppliedAt: Date;
  /** A reversal row exists (loadTraceBase's left join). */
  reversed: boolean;
  medicine: string;
  medicineId: string;
  /** The prescription page key, or null (a paper line). */
  key: string | null;
}

/**
 * Patients supplied from the batch: net of reversals, newest supply per patient, at most SUPPLIED_MAX. Two
 * identifiers (Law 5) from `identitiesFor`; a patient without an identity is left out rather than shown unnamed.
 */
export function suppliedRows(
  supplies: readonly SupplyMatch[],
  ids: ReadonlyMap<string, { name: string; mrn: string }>,
): FindRow[] {
  const seen = new Set<string>();
  const out: FindRow[] = [];
  for (const s of [...supplies].filter((x) => !x.reversed).sort((a, b) => +b.suppliedAt - +a.suppliedAt)) {
    if (seen.has(s.patientUserId) || out.length >= SUPPLIED_MAX) continue;
    const who = ids.get(s.patientUserId);
    if (!who) continue;
    seen.add(s.patientUserId);
    out.push({
      group: "supplied",
      label: who.name,
      sub: fill(W.supplied, { mrn: who.mrn, medicine: s.medicine, at: dayTime.format(s.suppliedAt) }),
      href: s.key
        ? `/pharmacy/prescriptions/${encodeURIComponent(s.key)}`
        : `/pharmacy/stock/${encodeURIComponent(s.medicineId)}`,
    });
  }
  return out;
}

/** Patients to ask identities for: the same filter as suppliedRows, so nobody else is revealed (and audited). */
export function suppliedPatientIds(supplies: readonly SupplyMatch[]): string[] {
  const out: string[] = [];
  for (const s of [...supplies].filter((x) => !x.reversed).sort((a, b) => +b.suppliedAt - +a.suppliedAt))
    if (!out.includes(s.patientUserId) && out.length < SUPPLIED_MAX) out.push(s.patientUserId);
  return out;
}

/** Delivery rows by note number, each linking to the delivery. */
export function deliveryRows(
  ds: readonly { id: string; noteNumber: string; supplier: string; placeName: string; arrivedAt: Date }[],
): FindRow[] {
  return ds.map((d) => ({
    group: "delivery",
    label: d.noteNumber,
    sub: fill(W.delivery, { supplier: d.supplier, place: d.placeName, at: dayTime.format(d.arrivedAt) }),
    href: `/pharmacy/store/deliveries/${d.id}`,
    mono: true,
  }));
}
