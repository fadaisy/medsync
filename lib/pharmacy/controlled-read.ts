import type { EmrDb } from "@/lib/emr/db";
import type { PharmacyPermission } from "@/lib/pharmacy/access";
import type { WitnessList } from "@/lib/pharmacy/controlled";
import type { Movement, MovementKind } from "@/lib/pharmacy/stock/ledger";
import { and, asc, desc, eq, inArray, isNull, sql } from "drizzle-orm";

import { db as appDb } from "@/db";
import { staffAffiliations } from "@/db/schema/clinician-profiles";
import { hospitalDepartments } from "@/db/schema/hospital-departments";
import { hospitals } from "@/db/schema/hospitals";
import {
  pharmacyAttestations,
  pharmacyBatches,
  pharmacyControlledDifferences,
  pharmacyControlledEntries,
  pharmacyCounts,
  pharmacyHandovers,
  pharmacyProducts,
  pharmacySignedSets,
  pharmacyStockMovements,
  pharmacySupplies,
} from "@/db/schema/pharmacy-dispensing";
import { prescriptions } from "@/db/schema/prescribing";
import { cadres } from "@/db/schema/reference-data";
import { users } from "@/db/schema/users";
import { PHARMACY_PERMISSIONS, pharmacyDispensingAccess } from "@/lib/pharmacy/access";
import {
  controlledClasses,
  PROPOSED_WITNESS_LIST,
  runningBalance,
  witnessAllowed,
} from "@/lib/pharmacy/controlled";
import { cadreOfUsers } from "@/lib/pharmacy/read";
import { expiresOn, isExpired, localDate } from "@/lib/pharmacy/stock/ledger";
import { drugById, DRUGS } from "@/lib/prescribing/formulary";
import { DEFAULT_TIME_ZONE, startOfLocalDay } from "@/supabase/functions/_shared/slots";

/**
 * Controlled drugs, read (Pharmacy Phase 1, 5.9, CD-1, CD-2, CD-6, PA2-6, DT-8; Section 8
 * `getControlledRegister`). The hospital always comes from the caller's scope. No read returns a
 * balance before a count is committed: the supply screen gets batches without figures, and the
 * Controlled drugs page (for `pharmacy.view`) is a read of the ledger after the fact.
 */

const defaultDb = () => appDb as unknown as EmrDb;
const DAY_MS = 86_400_000;
const sentence = (s: string) => s.charAt(0) + s.slice(1).toLowerCase();
const medicineName = (id: string) => drugById(id)?.generic ?? id;

async function signedContent(database: EmrDb, hospitalId: string, kind: string) {
  const [row] = await database
    .select({ content: pharmacySignedSets.content })
    .from(pharmacySignedSets)
    .where(
      and(
        eq(pharmacySignedSets.hospitalId, hospitalId),
        eq(pharmacySignedSets.kind, kind),
        eq(pharmacySignedSets.status, "signed"),
      ),
    )
    .orderBy(desc(pharmacySignedSets.version))
    .limit(1);
  return row?.content ?? null;
}

/** CT-7, CD-1: the medicines this hospital signed controlled, with their class. */
export async function controlledMedicineIds(
  database: unknown,
  hospitalId: string,
): Promise<ReadonlyMap<string, string>> {
  return controlledClasses(
    await signedContent(database as EmrDb, hospitalId, "controlled_classes"),
  );
}

/** CD-1: flagged at prescribing (the catalogue's draft flag) or signed controlled here. */
export async function isControlledMedicine(
  database: unknown,
  hospitalId: string,
  medicineId: string,
): Promise<boolean> {
  return (
    !!drugById(medicineId)?.flags.controlled ||
    (await controlledMedicineIds(database, hospitalId)).has(medicineId)
  );
}

/**
 * PA2-6, D-PH1-27: the signed witness list (`{ permissions: [...] }`), or the drafted one outside
 * production. In production with nothing signed, nobody may witness (Law 8; RD-1 keeps the point
 * from going live meanwhile).
 */
export async function signedWitnessList(
  database: unknown,
  hospitalId: string,
): Promise<WitnessList | null> {
  const content = (await signedContent(database as EmrDb, hospitalId, "witness_list")) as {
    permissions?: unknown;
  } | null;
  if (Array.isArray(content?.permissions))
    return {
      permissions: content.permissions.filter((p): p is PharmacyPermission =>
        (PHARMACY_PERMISSIONS as readonly unknown[]).includes(p),
      ),
    };
  return process.env.VERCEL_ENV === "production" ? null : PROPOSED_WITNESS_LIST;
}

export interface WitnessOption {
  userId: string;
  /** Their name, so the witness can choose their own; and the approved cadre's name (Law 4). */
  label: string;
  cadre: string;
}

/** CD-2, PA2-6: the staff of this hospital allowed to witness, never the actor. */
export async function witnessCandidates(
  database: unknown,
  hospitalId: string,
  actorUserId: string,
): Promise<WitnessOption[]> {
  const d = database as EmrDb;
  const list = await signedWitnessList(d, hospitalId);
  if (!list) return [];
  const rows = await d
    .select({
      userId: staffAffiliations.userId,
      name: users.fullName,
      code: cadres.code,
      cadre: cadres.name,
    })
    .from(staffAffiliations)
    .innerJoin(cadres, eq(cadres.id, staffAffiliations.cadreId))
    .leftJoin(users, eq(users.id, staffAffiliations.userId))
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
    const ok = witnessAllowed({
      witnessPermissions: [...pharmacyDispensingAccess(r.code).permissions],
      signedWitnessList: list,
      witnessUserId: r.userId,
      actorUserId,
    });
    if (!ok) return [];
    const cadre = sentence(r.cadre);
    return [{ userId: r.userId, label: [r.name, cadre].filter(Boolean).join(" · "), cadre }];
  });
}

/* ─── The Controlled drugs page (5.9, CD-6) ───────────────────────────── */

export interface ControlledRow {
  key: string;
  at: string;
  /** A movement kind, or a witnessed count with no movement. */
  what: MovementKind | "count";
  quantityIn: number | null;
  quantityOut: number | null;
  /** The medicine's total at this point after the row: the ledger's balance (CD-6). */
  balance: number;
  batchNumber: string;
  by: string;
  witness: string | null;
  /** The controlled entry the row belongs to, for the register slip (LB-7). */
  entryId: string | null;
  supply: boolean;
}

export interface ControlledRegister {
  medicines: { id: string; name: string }[];
  medicineId: string | null;
  rows: ControlledRow[];
  balance: number;
  batches: {
    id: string;
    productId: string;
    batchNumber: string;
    expiry: string;
    expiryMonthOnly: boolean;
    issueUnit: string;
  }[];
  products: { id: string; name: string; issueUnit: string }[];
  differences: {
    id: string;
    at: string;
    batchNumber: string;
    counted: number;
    recorded: number;
    supplier: string;
    witness: string;
  }[];
  backEntered: {
    id: string;
    at: string;
    medicine: string;
    witnessAsWritten: string | null;
    by: string;
  }[];
  from: string;
  to: string;
}

/**
 * `getControlledRegister`: one medicine at one point. Every movement of its batches in ledger order
 * through `runningBalance` (so the balance equals `balances()` at every row), with each witnessed
 * count beside them; the window shown is `from`..`to` (hospital-local dates), the balance always
 * counted from the first movement. Open differences and back-entered supplies to confirm are listed
 * for the whole point.
 */
export async function getControlledRegister(
  hospitalId: string,
  pointId: string,
  medicineId: string | null,
  range: { from: string; to: string } | null = null,
  database: EmrDb = defaultDb(),
  now = new Date(),
): Promise<ControlledRegister> {
  const signed = await controlledMedicineIds(database, hospitalId);
  const products = await database
    .select({
      id: pharmacyProducts.id,
      medicineId: pharmacyProducts.medicineId,
      name: pharmacyProducts.name,
      issueUnit: pharmacyProducts.issueUnit,
    })
    .from(pharmacyProducts)
    .where(eq(pharmacyProducts.hospitalId, hospitalId));
  const controlledIds = new Set([
    ...DRUGS.filter((d) => d.flags.controlled).map((d) => d.id),
    ...signed.keys(),
  ]);
  const medicines = [...controlledIds]
    .map((id) => ({ id, name: medicineName(id) }))
    .sort((a, b) => a.name.localeCompare(b.name));
  const chosen = medicineId && controlledIds.has(medicineId) ? medicineId : null;
  const today = localDate(now);
  const from = range?.from ?? today;
  const to = range?.to ?? today;
  const start = startOfLocalDay(new Date(`${from}T12:00:00+03:00`), DEFAULT_TIME_ZONE);
  const end = new Date(
    startOfLocalDay(new Date(`${to}T12:00:00+03:00`), DEFAULT_TIME_ZONE).getTime() + DAY_MS,
  );

  const [differences, backEntered] = await Promise.all([
    database
      .select({
        id: pharmacyControlledDifferences.id,
        at: pharmacyControlledDifferences.recordedAt,
        batchNumber: pharmacyBatches.batchNumber,
        counted: pharmacyControlledDifferences.countedQuantity,
        recorded: pharmacyControlledDifferences.recordedBalance,
        supplier: pharmacyControlledDifferences.supplierUserId,
        witness: pharmacyAttestations.attesterUserId,
      })
      .from(pharmacyControlledDifferences)
      .innerJoin(pharmacyBatches, eq(pharmacyBatches.id, pharmacyControlledDifferences.batchId))
      .innerJoin(
        pharmacyAttestations,
        eq(pharmacyAttestations.id, pharmacyControlledDifferences.witnessAttestationId),
      )
      .where(
        and(
          eq(pharmacyControlledDifferences.hospitalId, hospitalId),
          eq(pharmacyControlledDifferences.dispensingPointId, pointId),
          isNull(pharmacyControlledDifferences.closedAt),
        ),
      )
      .orderBy(asc(pharmacyControlledDifferences.recordedAt)),
    database
      .select({
        id: pharmacyControlledEntries.id,
        at: pharmacyControlledEntries.recordedAt,
        medicineId: pharmacyControlledEntries.medicineId,
        witness: pharmacyControlledEntries.witnessNameAsWritten,
        actor: pharmacyControlledEntries.actorUserId,
        cadre: pharmacyControlledEntries.actorCadre,
      })
      .from(pharmacyControlledEntries)
      .where(
        and(
          eq(pharmacyControlledEntries.hospitalId, hospitalId),
          eq(pharmacyControlledEntries.dispensingPointId, pointId),
          eq(pharmacyControlledEntries.kind, "back_entered_supply"),
        ),
      )
      .orderBy(asc(pharmacyControlledEntries.recordedAt)),
  ]);
  const confirmed = backEntered.length
    ? new Set(
        (
          await database
            .select({ id: pharmacyControlledEntries.confirmsEntryId })
            .from(pharmacyControlledEntries)
            .where(
              and(
                eq(pharmacyControlledEntries.hospitalId, hospitalId),
                inArray(
                  pharmacyControlledEntries.confirmsEntryId,
                  backEntered.map((b) => b.id),
                ),
              ),
            )
        ).map((r) => r.id),
      )
    : new Set<string | null>();

  const mine = products.filter((p) => p.medicineId === chosen);
  const batches = mine.length
    ? await database
        .select({
          id: pharmacyBatches.id,
          productId: pharmacyBatches.productId,
          batchNumber: pharmacyBatches.batchNumber,
          expiry: pharmacyBatches.expiry,
          expiryMonthOnly: pharmacyBatches.expiryMonthOnly,
        })
        .from(pharmacyBatches)
        .where(
          and(
            eq(pharmacyBatches.dispensingPointId, pointId),
            inArray(
              pharmacyBatches.productId,
              mine.map((p) => p.id),
            ),
          ),
        )
        .orderBy(asc(pharmacyBatches.expiry))
    : [];
  const batchIds = batches.map((b) => b.id);
  const [movements, counts, entries] = batchIds.length
    ? await Promise.all([
        database
          .select({
            id: pharmacyStockMovements.id,
            batchId: pharmacyStockMovements.batchId,
            pointId: sql<string>`${pharmacyStockMovements.dispensingPointId}`,
            kind: pharmacyStockMovements.kind,
            quantity: pharmacyStockMovements.quantity,
            effectiveAt: pharmacyStockMovements.effectiveAt,
            recordedAt: pharmacyStockMovements.recordedAt,
            downtime: pharmacyStockMovements.downtime,
            actor: pharmacyStockMovements.actorUserId,
            witness: pharmacyAttestations.attesterUserId,
          })
          .from(pharmacyStockMovements)
          .leftJoin(
            pharmacyAttestations,
            eq(pharmacyAttestations.id, pharmacyStockMovements.witnessAttestationId),
          )
          .where(inArray(pharmacyStockMovements.batchId, batchIds)),
        database
          .select({
            id: pharmacyCounts.id,
            at: pharmacyCounts.countedAt,
            by: pharmacyCounts.countedBy,
            witness: pharmacyAttestations.attesterUserId,
          })
          .from(pharmacyCounts)
          .leftJoin(
            pharmacyAttestations,
            eq(pharmacyAttestations.id, pharmacyCounts.witnessAttestationId),
          )
          .where(
            and(
              eq(pharmacyCounts.hospitalId, hospitalId),
              eq(pharmacyCounts.dispensingPointId, pointId),
              eq(pharmacyCounts.medicineId, chosen!),
              inArray(pharmacyCounts.scope, ["controlled_supply", "controlled_shift"]),
            ),
          ),
        database
          .select({
            id: pharmacyControlledEntries.id,
            movementId: pharmacyControlledEntries.movementId,
            countId: pharmacyControlledEntries.countId,
            kind: pharmacyControlledEntries.kind,
          })
          .from(pharmacyControlledEntries)
          .where(
            and(
              eq(pharmacyControlledEntries.hospitalId, hospitalId),
              eq(pharmacyControlledEntries.dispensingPointId, pointId),
              eq(pharmacyControlledEntries.medicineId, chosen!),
            ),
          ),
      ])
    : [[], [], []];

  const people = await cadreOfUsers(
    database,
    hospitalId,
    [
      ...movements.flatMap((m) => [m.actor, m.witness]),
      ...counts.flatMap((c) => [c.by, c.witness]),
      ...differences.flatMap((d) => [d.supplier, d.witness]),
      ...backEntered.map((b) => b.actor),
    ].filter((x): x is string => !!x),
  );
  const who = (id: string | null) => (id ? (people.get(id) ?? "") : null);
  const numberOf = new Map(batches.map((b) => [b.id, b.batchNumber]));
  const entryOfMovement = new Map(
    entries.filter((e) => e.movementId).map((e) => [e.movementId!, e]),
  );

  const ledger = runningBalance(
    movements.map((m) => ({ ...m, kind: m.kind as MovementKind }) satisfies Movement & object),
  );
  const balanceAt = (t: Date) => {
    let b = 0;
    for (const r of ledger) if (r.effectiveAt.getTime() <= t.getTime()) b = r.balance;
    return b;
  };
  const rows: (ControlledRow & { t: number })[] = [
    ...ledger.map((m) => {
      const e = entryOfMovement.get(m.id);
      return {
        key: m.id,
        t: m.effectiveAt.getTime(),
        at: m.effectiveAt.toISOString(),
        what: m.kind,
        quantityIn: m.quantity > 0 ? m.quantity : null,
        quantityOut: m.quantity < 0 ? -m.quantity : null,
        balance: m.balance,
        batchNumber: numberOf.get(m.batchId) ?? "",
        by: who(m.actor) ?? "",
        witness: who(m.witness),
        entryId: e?.id ?? null,
        supply: m.kind === "supplied",
      };
    }),
    ...counts.map((c) => ({
      key: c.id,
      t: c.at.getTime(),
      at: c.at.toISOString(),
      what: "count" as const,
      quantityIn: null,
      quantityOut: null,
      balance: balanceAt(c.at),
      batchNumber: "",
      by: who(c.by) ?? "",
      witness: who(c.witness),
      entryId: entries.find((e) => e.countId === c.id && e.kind === "count")?.id ?? null,
      supply: false,
    })),
  ];
  const shown = rows
    .filter((r) => r.t >= start.getTime() && r.t < end.getTime())
    .sort((a, b) => b.t - a.t)
    .map(({ t: _t, ...r }) => r);

  const unitOf = new Map(mine.map((p) => [p.id, p.issueUnit]));
  return {
    medicines,
    medicineId: chosen,
    rows: shown,
    balance: ledger.at(-1)?.balance ?? 0,
    batches: batches
      .filter((b) => !isExpired(b, today) || ledger.some((m) => m.batchId === b.id))
      .map((b) => ({
        ...b,
        issueUnit: unitOf.get(b.productId) ?? "",
      })),
    products: mine.map((p) => ({ id: p.id, name: p.name, issueUnit: p.issueUnit })),
    differences: differences.map((d) => ({
      id: d.id,
      at: d.at.toISOString(),
      batchNumber: d.batchNumber,
      counted: d.counted,
      recorded: d.recorded,
      supplier: who(d.supplier) ?? "",
      witness: who(d.witness) ?? "",
    })),
    backEntered: backEntered
      .filter((b) => !confirmed.has(b.id))
      .map((b) => ({
        id: b.id,
        at: b.at.toISOString(),
        medicine: medicineName(b.medicineId),
        witnessAsWritten: b.witness,
        by: b.cadre ?? who(b.actor) ?? "",
      })),
    from,
    to,
  };
}

/** The batches a controlled count covers: each at the point, except an expired one that is empty. */
export function countableBatches<
  B extends { id: string; expiry: string; expiryMonthOnly: boolean },
>(batches: readonly B[], balances: ReadonlyMap<string, number>, today: string): B[] {
  return batches.filter((b) => !(isExpired(b, today) && (balances.get(b.id) ?? 0) === 0));
}

/* ─── The register slip (LB-7) ────────────────────────────────────────── */

export interface RegisterEntrySource {
  entryId: string;
  kind: string;
  hospital: string;
  pointId: string;
  point: string;
  recordedAt: string;
  patientUserId: string | null;
  medicine: string;
  quantity: number;
  issueUnit: string;
  batchNumber: string;
  expiry: string;
  balanceAfter: number | null;
  prescriber: string | null;
  suppliedBy: string;
  witness: string;
  collectedBy: string | null;
}

/** One controlled entry's facts for the slip; null when it is not this hospital's or has no movement. */
export async function getRegisterEntry(
  hospitalId: string,
  entryId: string,
  database: EmrDb = defaultDb(),
): Promise<RegisterEntrySource | null> {
  const [e] = await database
    .select({
      id: pharmacyControlledEntries.id,
      kind: pharmacyControlledEntries.kind,
      pointId: pharmacyControlledEntries.dispensingPointId,
      medicineId: pharmacyControlledEntries.medicineId,
      recordedAt: pharmacyControlledEntries.recordedAt,
      balance: pharmacyControlledEntries.witnessAgreedBalance,
      actor: pharmacyControlledEntries.actorUserId,
      actorCadre: pharmacyControlledEntries.actorCadre,
      witnessName: pharmacyControlledEntries.witnessNameAsWritten,
      witness: pharmacyAttestations.attesterUserId,
      quantity: pharmacyStockMovements.quantity,
      batchNumber: pharmacyBatches.batchNumber,
      expiry: pharmacyBatches.expiry,
      expiryMonthOnly: pharmacyBatches.expiryMonthOnly,
      product: pharmacyProducts.name,
      strength: pharmacyProducts.strength,
      unit: pharmacyProducts.issueUnit,
      hospital: hospitals.name,
      point: hospitalDepartments.name,
      handoverId: pharmacyControlledEntries.handoverId,
      sourceId: pharmacyStockMovements.sourceId,
    })
    .from(pharmacyControlledEntries)
    .innerJoin(hospitals, eq(hospitals.id, pharmacyControlledEntries.hospitalId))
    .innerJoin(
      hospitalDepartments,
      eq(hospitalDepartments.id, pharmacyControlledEntries.dispensingPointId),
    )
    .innerJoin(
      pharmacyStockMovements,
      eq(pharmacyStockMovements.id, pharmacyControlledEntries.movementId),
    )
    .innerJoin(pharmacyBatches, eq(pharmacyBatches.id, pharmacyStockMovements.batchId))
    .innerJoin(pharmacyProducts, eq(pharmacyProducts.id, pharmacyBatches.productId))
    .leftJoin(
      pharmacyAttestations,
      eq(pharmacyAttestations.id, pharmacyControlledEntries.witnessAttestationId),
    )
    .where(
      and(
        eq(pharmacyControlledEntries.id, entryId),
        eq(pharmacyControlledEntries.hospitalId, hospitalId),
      ),
    );
  if (!e) return null;
  const [h] = e.handoverId
    ? await database
        .select({
          patient: pharmacyHandovers.patientUserId,
          collector: pharmacyHandovers.collector,
          name: pharmacyHandovers.collectorName,
          relationship: pharmacyHandovers.collectorRelationship,
          prescriber: prescriptions.prescriberUserId,
        })
        .from(pharmacyHandovers)
        .leftJoin(pharmacySupplies, eq(pharmacySupplies.id, e.sourceId ?? e.id))
        .leftJoin(prescriptions, eq(prescriptions.id, pharmacySupplies.prescriptionId))
        .where(eq(pharmacyHandovers.id, e.handoverId))
    : [];
  const people = await cadreOfUsers(
    database,
    hospitalId,
    [e.actor, e.witness, h?.prescriber].filter((x): x is string => !!x),
  );
  const collectedBy = !h
    ? null
    : h.collector === "patient"
      ? "The patient"
      : h.collector === "representative"
        ? [h.name, h.relationship].filter(Boolean).join(", ")
        : "Ward staff";
  const expiry = e.expiryMonthOnly
    ? `${e.expiry.slice(5, 7)}/${e.expiry.slice(0, 4)}`
    : expiresOn({ expiry: e.expiry, expiryMonthOnly: false });
  return {
    entryId: e.id,
    kind: e.kind,
    hospital: e.hospital,
    pointId: e.pointId,
    point: e.point,
    recordedAt: e.recordedAt.toISOString(),
    patientUserId: h?.patient ?? null,
    medicine: [e.product, e.strength].filter(Boolean).join(" · ") || medicineName(e.medicineId),
    quantity: Math.abs(e.quantity),
    issueUnit: e.unit,
    batchNumber: e.batchNumber,
    expiry,
    balanceAfter: e.balance,
    prescriber: h?.prescriber ? (people.get(h.prescriber) ?? null) : null,
    suppliedBy: e.actorCadre ?? people.get(e.actor) ?? "",
    witness: e.witness ? (people.get(e.witness) ?? "") : (e.witnessName ?? ""),
    collectedBy,
  };
}

/** Day bounds for the page's "Print entries" range, validated (hospital-local YYYY-MM-DD). */
export function rangeOf(from?: string, to?: string): { from: string; to: string } | null {
  const ok = (s?: string) => !!s && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s));
  if (!ok(from) && !ok(to)) return null;
  const f = ok(from) ? from! : to!;
  const t = ok(to) ? to! : f;
  return f <= t ? { from: f, to: t } : { from: t, to: f };
}
