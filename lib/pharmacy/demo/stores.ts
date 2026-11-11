import "server-only";

import { randomUUID as uuid } from "node:crypto";
import type { DemoMedicine, DemoState, PointKey } from "./state";
import type { EmrTx } from "@/lib/emr/db";
import type { PharmacyActor } from "@/lib/pharmacy/write";
import { sql } from "drizzle-orm";

import { withStoreAccess } from "@/lib/pharmacy/access";
import * as dist from "@/lib/pharmacy/distribution/store";
import { pharmacyCatalogueLiveFor } from "@/lib/pharmacy/feature";
import * as iss from "@/lib/pharmacy/stores/issue-store";
import * as loc from "@/lib/pharmacy/stores/location-store";
import { buildProposal } from "@/lib/pharmacy/stores/order-read";
import * as orders from "@/lib/pharmacy/stores/order-store";
import * as packs from "@/lib/pharmacy/stores/packs";
import * as rcv from "@/lib/pharmacy/stores/receiving-store";
import { storeNeed } from "@/lib/pharmacy/stores/write";
import { at, bump, chiefActor, DAY, demoAccount, one, pharmacyActor, q, write } from "./state";

/**
 * Section 8: the medicines stores of a national referral hospital. A bulk store, a main store and a quarantine,
 * each switched on through the go-live rules (opening count, in-charge, briefing, drill, a second hospital admin);
 * suppliers, a donor programme and another hospital; the signed stores packs (order parameters, tracer list, the
 * stock-out day rule, reason lists) and a draft; orders (one part delivered, one sent, one draft checked on paper);
 * deliveries over the past month and one being counted; requisitions from the points at every state, their issues,
 * a return; loans lent and borrowed, one settled. Every workflow write goes through the real stores. Places and
 * counterparties are found by name first, so a second load reuses them.
 */

const STORE_NEED = storeNeed("pharmacy.store");
const STOCK_NEED = storeNeed("pharmacy.stock");

/** A pharmacy actor as the app builds one with the store on (map v3 adds `pharmacy.store`). */
function storeActor(
  s: DemoState,
  userId: string,
  cadre: "PHARMACIST" | "PHARMACY_TECH",
  point: PointKey | null,
): PharmacyActor {
  const a = pharmacyActor(s, userId, cadre, point);
  return { ...a, access: withStoreAccess(a.access, cadre, true) };
}

/** "YYYY-MM-DD HH:MM" in Kampala time, as the delivery form takes it. */
const kampala = (d: Date) =>
  new Date(d.getTime() + 3 * 3_600_000).toISOString().slice(0, 16).replace("T", " ");
const day = (d: Date) => d.toISOString().slice(0, 10);
/** `at`, never later than two hours before the load (a load early in the morning keeps today's rows in the past). */
const ago = (s: DemoState, daysAgo: number, hour = 9) => {
  const d = at(s, daysAgo, hour);
  const latest = s.now.getTime() - 2 * 3_600_000;
  return d.getTime() > latest ? new Date(latest) : d;
};
const ahead = (s: DemoState, days: number) => day(new Date(s.now.getTime() + days * DAY));

/** Whole issue units of one product in a typical store line. */
const base = (m: DemoMedicine) =>
  ({
    tablet: 1000,
    capsule: 1000,
    sachet: 300,
    bottle: 100,
    inhaler: 40,
    vial: 100,
    ampoule: 100,
    bag: 200,
    tube: 50,
    pen: 20,
  })[m.unit];

/** The signed reason lists every stores screen picks from (codes and words only). */
const REASON_LISTS: packs.PackContent<"stores_reason_lists">["lists"] = {
  receiving_decisions: [
    { code: "accepted_as_counted", words: "Accepted as counted" },
    { code: "accepted_supplier_told", words: "Accepted, supplier told" },
  ],
  refused_lines: [
    { code: "damaged", words: "Damaged in transit" },
    { code: "wrong_product", words: "Wrong product" },
    { code: "short_dated", words: "Too close to expiry" },
  ],
  returns: [
    { code: "no_longer_needed", words: "No longer needed" },
    { code: "near_expiry", words: "Near expiry" },
  ],
  receipt_differences: [
    { code: "broken_in_box", words: "Broken in the box" },
    { code: "short_in_box", words: "Fewer in the box than the voucher" },
  ],
  quarantine: [
    { code: "expired", words: "Expired" },
    { code: "damaged", words: "Damaged" },
    { code: "recalled", words: "Recalled" },
  ],
  write_off: [
    { code: "expired", words: "Expired" },
    { code: "damaged", words: "Damaged beyond use" },
    { code: "recalled", words: "Recalled by the manufacturer" },
  ],
  count_differences: [
    { code: "unrecorded_issue", words: "An issue was not recorded" },
    { code: "unknown", words: "Cause not known" },
  ],
  month_end_differences: [
    { code: "unrecorded_issue", words: "An issue was not recorded" },
    { code: "not_reached", words: "Could not be reached" },
  ],
  order_changes: [
    { code: "last_cycle", words: "Last cycle's quantity" },
    { code: "budget", words: "Kept within the budget" },
  ],
  order_line_closes: [
    { code: "supplier_out", words: "Supplier out of stock" },
    { code: "cancelled", words: "Cancelled" },
  ],
  cart_explanations: [{ code: "used_in_emergency", words: "Used in an emergency" }],
  recall_contact_outcomes: [
    { code: "reached", words: "Reached" },
    { code: "not_reached", words: "Could not be reached" },
  ],
};

const PARAMETERS = {
  cycleMonths: 2,
  maxMonths: 4,
  minMonths: 2,
  emergencyOrderPointMonths: 1,
  reviewWindowMonths: 1,
  minHistoryDays: 90,
  unclassedTrimAs: "N",
  budgetSource: "Demo: the hospital's medicines budget line",
} as const;

/** A unit of the PHARMACY department (a store is a hub unit), found by name first. */
async function unit(s: DemoState, name: string) {
  const [found] = await q<{ id: string }>(
    s,
    sql`SELECT id FROM hospital_departments WHERE hospital_id = ${s.h} AND parent_id = ${s.pharmacyDept} AND name = ${name}
      AND archived_at IS NULL LIMIT 1`,
  );
  if (found) return found.id;
  return (
    await one<{ id: string }>(
      s,
      sql`INSERT INTO hospital_departments (hospital_id, parent_id, name, slug, kind)
        VALUES (${s.h}, ${s.pharmacyDept}, ${name}, ${`demo-${name.toLowerCase().replace(/\W+/g, "-")}-${uuid().slice(0, 6)}`}, 'support')
        RETURNING id`,
    )
  ).id;
}

/** A store or the quarantine, found by kind and name first, else made through `createLocation`. */
async function place(
  s: DemoState,
  kind: "store" | "quarantine",
  name: string,
  departmentId: string | null,
  when: Date,
) {
  const [found] = await q<{ id: string; live: boolean }>(
    s,
    sql`SELECT id, live_at IS NOT NULL AS live FROM pharmacy_locations WHERE hospital_id = ${s.h} AND kind = ${kind}
      AND (name = ${name} OR ${kind} = 'quarantine') AND archived_at IS NULL ORDER BY created_at LIMIT 1`,
  );
  if (found) return found;
  const r = await write(
    s,
    chiefActor(s, null),
    loc.CreateLocationInput,
    packs.PACK_NEED,
    loc.createLocation,
    {
      clientKey: uuid(),
      kind,
      name,
      departmentId,
    },
    when,
  );
  bump(s, "store_places");
  return { id: r.id, live: false };
}

/** A supplier or facility, found by name first, else saved through `saveCounterparty`. */
async function counterparty(
  s: DemoState,
  kind: "supplier" | "facility",
  name: string,
  code: string,
  takesReturns: boolean,
  when: Date,
) {
  const [found] = await q<{ id: string }>(
    s,
    sql`SELECT id FROM pharmacy_counterparties WHERE hospital_id = ${s.h} AND name = ${name} AND retired_at IS NULL LIMIT 1`,
  );
  if (found) return found.id;
  bump(s, "counterparties");
  return (
    await write(
      s,
      chiefActor(s, null),
      loc.CounterpartyInput,
      packs.PACK_NEED,
      loc.saveCounterparty,
      {
        clientKey: uuid(),
        kind,
        name,
        code,
        takesReturns,
      },
      when,
    )
  ).id;
}

/** A pack drafted and signed by the chief pharmacist and the demo CSO, each with a passed second factor. */
async function signPack(s: DemoState, kind: packs.PackKind, content: unknown, when: Date) {
  const chief = chiefActor(s, null);
  const draft = await write(
    s,
    chief,
    packs.SavePackInput,
    packs.PACK_NEED,
    packs.saveSignedPack,
    { kind, content },
    when,
  );
  const attest = async (by: string) =>
    (
      await one<{ id: string }>(
        s,
        sql`INSERT INTO pharmacy_attestations (hospital_id, actor_user_id, attester_user_id, purpose, action, outcome)
          VALUES (${s.h}, ${s.people.chief}, ${by}, 'signer', 'sign_pack', 'passed') RETURNING id`,
      )
    ).id;
  await write(
    s,
    chief,
    packs.SignPackInput,
    packs.PACK_NEED,
    packs.signPack,
    {
      packId: draft.id,
      firstAttestationId: await attest(s.people.chief),
      second: { attestationId: await attest(s.people.cso) },
    },
    when,
  );
  bump(s, "store_packs");
}

/** A place switched on by a demo hospital admin with a second one approving; a store first gets its briefing and drill. */
async function goLive(
  s: DemoState,
  admins: [string, string],
  locationId: string,
  store: boolean,
  when: Date,
) {
  const [a, b] = admins;
  const admin = { userId: a, hospitalId: s.h };
  await s.db.transaction(async (raw) => {
    const tx = raw as unknown as EmrTx;
    if (store) {
      await loc.recordLocationBriefing(
        tx,
        admin,
        {
          locationId,
          heldOn: day(when),
          notes: "Demo: stores team briefed on receiving and issuing.",
        },
        when,
      );
      await loc.recordLocationDrill(
        tx,
        admin,
        {
          locationId,
          heldOn: day(when),
          participants: "Demo stores officer, demo chief pharmacist",
          whatWasDone: "Demo: a delivery and an issue recorded on paper, then entered.",
          problems: null,
          includedDelivery: true,
          includedIssue: true,
        },
        when,
      );
    }
    const approval = await one<{ id: string }>(
      { db: tx as unknown as DemoState["db"] },
      sql`INSERT INTO pharmacy_attestations (hospital_id, actor_user_id, attester_user_id, purpose, action, outcome)
        VALUES (${s.h}, ${a}, ${b}, 'signer', 'location_golive', 'passed') RETURNING id`,
    );
    await loc.switchLocation(
      tx,
      admin,
      { locationId, action: "on", reason: null, approvalAttestationId: approval.id },
      new Date(when.getTime() + 3_600_000),
    );
  });
  bump(s, "store_golive");
}

/** The batches an issue (or return) put at the receiving place, for its confirmation. */
const receivedBy = (s: DemoState, issueId: string) =>
  q<{ batchId: string; medicine: string; quantity: number }>(
    s,
    sql`SELECT m.batch_id AS "batchId", p.medicine_id AS medicine, m.quantity::int AS quantity
      FROM pharmacy_stock_movements m JOIN pharmacy_batches b ON b.id = m.batch_id JOIN pharmacy_products p ON p.id = b.product_id
      WHERE m.source_id = ${issueId} AND m.kind IN ('received_from_issue', 'returned_in') ORDER BY m.batch_id`,
  );

type Line = {
  m: DemoMedicine;
  note: number;
  accepted?: number;
  kept?: number;
  expiryDays?: number;
  ordered?: boolean;
};
type Req = {
  point: PointKey;
  ids: string[];
  raised: number;
  issued?: number;
  confirmed?: number;
  /** A line issued as zero, with its reason. */
  short?: string;
  /** A line confirmed two fewer than issued. */
  broken?: string;
  /** A line refused at the store. */
  refuse?: string;
  /** A line partly returned to the store afterwards. */
  returned?: string;
};

/** Requisitions from the points to the main store, at every state the Issues page shows. */
const REQUISITIONS: Req[] = [
  {
    point: "opd",
    ids: ["amoxicillin", "paracetamol", "metronidazole", "ferrous_sulfate"],
    raised: 15,
    issued: 14,
    confirmed: 13,
  },
  {
    point: "inpatient",
    ids: ["ceftriaxone", "gentamicin", "metronidazole", "omeprazole", "paracetamol"],
    raised: 8,
    issued: 7,
    confirmed: 6,
    short: "omeprazole",
    broken: "ceftriaxone",
  },
  {
    point: "maternity",
    ids: ["ferrous_sulfate", "folic_acid", "paracetamol", "amoxicillin"],
    raised: 5,
    issued: 4,
    confirmed: 4,
    returned: "folic_acid",
  },
  {
    point: "art",
    ids: ["tld", "dolutegravir", "co_trimoxazole", "fluconazole"],
    raised: 4,
    refuse: "tld",
  },
  {
    point: "ncd",
    ids: ["metformin", "amlodipine", "atorvastatin", "losartan", "aspirin"],
    raised: 3,
    issued: 2,
  },
  {
    point: "paediatrics",
    ids: ["amoxicillin", "oral_rehydration_salts", "zinc_sulfate", "albendazole"],
    raised: 0,
  },
  { point: "opd", ids: ["co_trimoxazole", "ibuprofen", "omeprazole"], raised: 0 },
];

export async function storesSection(s: DemoState): Promise<void> {
  const tag = s.loadId.slice(0, 4).toUpperCase();
  const chief = chiefActor(s, null);
  const keeper = storeActor(s, s.people.storekeeper, "PHARMACY_TECH", null);
  // Controlled medicines move with a witness on the Controlled drugs page; the stores demo keeps to the rest.
  const controlled = await s.db.transaction((tx) => loc.controlledSet(tx as unknown as EmrTx, s.h));
  const meds = s.medicines.filter((m) => !m.controlled && !controlled(m.id) && s.stock.has(m.id));
  const product = (m: DemoMedicine) => [...s.stock.get(m.id)!.values()][0]!.productId;
  const med = (id: string) => meds.find((m) => m.id === id);
  const pick = (ids: string[]) => ids.map(med).filter((m): m is DemoMedicine => !!m);

  // 39 days ago: counterparties, places and the stores' signed packs, with one draft waiting for its signers.
  const t0 = ago(s, 39);
  const nms = await counterparty(s, "supplier", "National Medical Stores", "NMS", true, t0);
  const supplierA = await counterparty(s, "supplier", "Demo supplier A", "DSA", true, t0);
  const donor = await counterparty(s, "supplier", "Demo donor programme", "DDP", false, t0);
  const facility = await counterparty(
    s,
    "facility",
    "Demo regional referral hospital",
    "DRRH",
    false,
    t0,
  );
  const bulk = await place(s, "store", "Bulk store", await unit(s, "Bulk store"), t0);
  const main = await place(s, "store", "Main store", await unit(s, "Main store"), t0);
  const quarantine = await place(s, "quarantine", "Quarantine", null, t0);

  await signPack(s, "order_parameters", PARAMETERS, t0);
  await signPack(s, "stockout_day_rule", { rule: "end_of_day" }, t0);
  await signPack(
    s,
    "tracer_list",
    {
      source: "Demo tracer list for this demo hospital",
      medicineIds: pick([
        "amoxicillin",
        "artemether_lumefantrine",
        "oral_rehydration_salts",
        "zinc_sulfate",
        "co_trimoxazole",
        "oxytocin",
        "ferrous_sulfate",
        "metformin",
        "amlodipine",
        "tld",
        "paracetamol",
        "ceftriaxone",
      ]).map((m) => m.id),
    },
    t0,
  );
  await signPack(s, "stores_reason_lists", { lists: REASON_LISTS }, t0);
  await write(s, chief, packs.SavePackInput, packs.PACK_NEED, packs.saveSignedPack, {
    kind: "order_parameters",
    content: { ...PARAMETERS, maxMonths: 3, minMonths: 1, reviewWindowMonths: 2 },
  });
  bump(s, "store_pack_drafts");

  // 38–37 days ago: opening counts, in-charges, briefings and drills; each place switched on by two demo admins.
  if (!bulk.live || !main.live || !quarantine.live) {
    const admins: [string, string] = [
      await demoAccount(s, "Demo hospital administrator"),
      await demoAccount(s, "Demo deputy administrator"),
    ];
    for (const a of admins)
      await s.db.execute(
        sql`INSERT INTO user_roles (user_id, role, hospital_id) VALUES (${a}, 'hospital_admin', ${s.h}) ON CONFLICT DO NOTHING`,
      );
    const opening = [
      [bulk, "B", 10, s.people.chief],
      [main, "M", 3, s.people.storekeeper],
    ] as const;
    for (const [where, letter, times, inCharge] of opening) {
      if (where.live) continue;
      await write(
        s,
        keeper,
        loc.StoreCountInput,
        STOCK_NEED,
        loc.recordStoreCount,
        {
          step: "opening",
          clientKey: uuid(),
          locationId: where.id,
          lines: meds.map((m, i) => ({
            productId: product(m),
            batchNumber: `DEMO-${tag}-${letter}${String(i + 1).padStart(3, "0")}`,
            expiry: ahead(s, 400 + i * 4),
            counted: base(m) * times,
          })),
        },
        ago(s, 38),
      );
      await write(
        s,
        chief,
        loc.InChargeInput,
        packs.PACK_NEED,
        loc.setLocationInCharge,
        { locationId: where.id, userId: inCharge },
        ago(s, 38),
      );
      await goLive(s, admins, where.id, true, ago(s, 37));
      bump(s, "store_opening_counts");
    }
    if (!quarantine.live) {
      await write(
        s,
        chief,
        loc.InChargeInput,
        packs.PACK_NEED,
        loc.setLocationInCharge,
        {
          locationId: quarantine.id,
          userId: s.people.pharmacists[0]!,
        },
        ago(s, 38),
      );
      await goLive(s, admins, quarantine.id, false, ago(s, 37));
    }
  }

  /** An order from the server's proposal at `when`, every line with the in-charge's quantity; saved (sent) or left a draft. */
  const order = async (
    kind: "cycle" | "emergency",
    supplier: string,
    when: Date,
    medicineIds: string[] | null,
    save: boolean,
  ) => {
    const proposal = await buildProposal(s.db, s.h, when, medicineIds);
    const id = uuid();
    await write(
      s,
      chief,
      orders.ProposalInput,
      orders.MANAGE_NEED,
      orders.saveOrderProposal,
      {
        clientKey: id,
        kind,
        medicineIds,
        counterpartyId: supplier,
        chosen: save
          ? proposal.lines.map((l) => {
              const m = s.medicines.find((x) => x.id === l.medicineId);
              const units = l.row.proposedUnits > 0 ? l.row.proposedUnits : m ? base(m) * 4 : 100;
              return {
                productId: l.productId,
                units,
                reason: units === l.row.proposedUnits ? null : "Demo: last cycle's quantity",
              };
            })
          : [],
      },
      when,
    );
    if (save)
      await write(
        s,
        chief,
        orders.SaveOrderInput,
        orders.MANAGE_NEED,
        orders.saveOrder,
        { clientKey: uuid(), orderId: id },
        when,
      );
    bump(s, "store_orders");
    return id;
  };

  // 32 days ago: the cycle order to National Medical Stores, sent.
  const cycle = await order("cycle", nms, ago(s, 32), null, true);
  const orderLines = new Map(
    (
      await q<{ id: string; medicine: string; units: number }>(
        s,
        sql`SELECT id, medicine_id AS medicine, chosen_units::int AS units FROM pharmacy_order_lines WHERE order_id = ${cycle}`,
      )
    ).map((l) => [l.medicine, l]),
  );

  /** A delivery started, every line counted, a short-dated line decided, then received (or left counting). */
  let batchNo = 0;
  const deliver = async (o: {
    supplier: string;
    note: string;
    where: string;
    daysAgo: number;
    order?: string;
    lines: Line[];
    receive: boolean;
    print?: boolean;
  }) => {
    const arrived = ago(s, o.daysAgo, o.daysAgo ? 10 : 8);
    const when = new Date(arrived.getTime() + 3_600_000);
    const d = await write(
      s,
      keeper,
      rcv.StartDeliveryInput,
      STORE_NEED,
      rcv.startDelivery,
      {
        clientKey: uuid(),
        supplierId: o.supplier,
        noteNumber: `${o.note}-${tag}`,
        orderId: o.order ?? null,
        arrivedAt: kampala(arrived),
        locationId: o.where,
        witnessName: "Demo stores witness",
        delivererName: "Demo driver",
        vehicleRegistration: "DEMO 001",
      },
      when,
    );
    for (const [i, l] of o.lines.entries()) {
      batchNo += 1;
      const kept = l.kept ?? 0;
      await write(
        s,
        keeper,
        rcv.DeliveryLineInput,
        STORE_NEED,
        rcv.saveDeliveryLine,
        {
          deliveryId: d.id,
          lineNo: i + 1,
          productId: product(l.m),
          orderLineId: l.ordered ? (orderLines.get(l.m.id)?.id ?? null) : null,
          noteQuantity: l.note,
          accepted: l.accepted ?? l.note - kept,
          rejectedKept: kept,
          rejectedReturned: 0,
          rejectReason: kept ? "damaged" : null,
          batchNumber: `DEMO-${tag}-D${String(batchNo).padStart(3, "0")}`,
          expiry: ahead(s, l.expiryDays ?? 500 + batchNo * 3),
          note: kept ? "Demo: cartons crushed in transit." : null,
        },
        when,
      );
      if (l.expiryDays !== undefined && l.expiryDays < 90)
        await write(
          s,
          keeper,
          rcv.ShortDatedInput,
          STORE_NEED,
          rcv.recordShortDatedDecision,
          { deliveryId: d.id, lineNo: i + 1, decision: "accept_tell" },
          when,
        );
    }
    if (o.receive)
      await write(
        s,
        keeper,
        rcv.ReceiveDeliveryInput,
        STORE_NEED,
        rcv.receiveDelivery,
        { deliveryId: d.id, witnesses: [] },
        when,
      );
    if (o.print)
      for (const fn of [rcv.printGrn, rcv.printDiscrepancyReport])
        await write(
          s,
          keeper,
          rcv.PrintDeliveryInput,
          STORE_NEED,
          fn,
          { clientKey: uuid(), deliveryId: d.id },
          when,
        );
    bump(s, "store_deliveries");
    bump(s, "store_delivery_lines", o.lines.length);
    return d.id;
  };
  const ordered = (
    ids: string[],
    f: (m: DemoMedicine, i: number, units: number) => Partial<Line> = () => ({}),
  ) =>
    pick(ids).map((m, i) => {
      const units = orderLines.get(m.id)?.units ?? base(m) * 4;
      return { m, note: units, ordered: true, ...f(m, i, units) };
    });

  // 26 days ago: National Medical Stores' first delivery against the cycle order, with two discrepancies.
  await deliver({
    supplier: nms,
    note: "NMS-DN-0412",
    where: bulk.id,
    daysAgo: 26,
    order: cycle,
    receive: true,
    print: true,
    lines: ordered(
      [
        "amoxicillin",
        "paracetamol",
        "co_trimoxazole",
        "metronidazole",
        "ferrous_sulfate",
        "folic_acid",
        "oral_rehydration_salts",
        "zinc_sulfate",
        "metformin",
        "amlodipine",
        "omeprazole",
        "ceftriaxone",
        "gentamicin",
      ],
      (_m, i, units) =>
        i === 3 ? { accepted: Math.round(units * 0.9) } : i === 6 ? { kept: 20 } : {},
    ),
  });

  // 24 days ago: the bulk store tops up the main store; the main store confirms the next morning.
  const transfer = await write(
    s,
    keeper,
    iss.DirectIssueInput,
    STORE_NEED,
    iss.directIssue,
    {
      clientKey: uuid(),
      fromLocationId: bulk.id,
      toLocationId: main.id,
      lines: pick([
        "amoxicillin",
        "paracetamol",
        "co_trimoxazole",
        "metronidazole",
        "ferrous_sulfate",
        "oral_rehydration_salts",
        "metformin",
        "amlodipine",
      ]).map((m) => ({ productId: product(m), quantity: base(m) * 2 })),
    },
    ago(s, 24, 14),
  );
  await write(
    s,
    keeper,
    iss.ConfirmReceiptInput,
    STOCK_NEED,
    iss.confirmIssueReceipt,
    {
      issueId: transfer.id,
      lines: (await receivedBy(s, transfer.id)).map((b) => ({
        batchId: b.batchId,
        confirmed: b.quantity,
      })),
    },
    ago(s, 23, 8),
  );
  bump(s, "store_issues");

  // 19 and 16 days ago: a private supplier (one short-dated line, accepted and the supplier told), the donor programme.
  await deliver({
    supplier: supplierA,
    note: "DSA-INV-2207",
    where: main.id,
    daysAgo: 19,
    receive: true,
    lines: pick([
      "ibuprofen",
      "salbutamol",
      "hydrochlorothiazide",
      "atorvastatin",
      "aspirin",
      "glibenclamide",
      "losartan",
      "enalapril",
    ]).map((m, i) => ({ m, note: base(m) * 2, ...(i === 2 ? { expiryDays: 60 } : {}) })),
  });
  await deliver({
    supplier: donor,
    note: "DDP-SHIP-031",
    where: main.id,
    daysAgo: 16,
    receive: true,
    lines: pick(["tld", "dolutegravir", "co_trimoxazole", "fluconazole", "rhze_fdc"]).map((m) => ({
      m,
      note: base(m) * 3,
    })),
  });

  // The points' requisitions to the main store, issued first expiry first, confirmed at the point.
  const keys = Object.keys(s.points) as PointKey[];
  for (const r of REQUISITIONS) {
    const tech = storeActor(s, s.people.techs[keys.indexOf(r.point)]!, "PHARMACY_TECH", r.point);
    const raised = await write(
      s,
      tech,
      iss.RaiseRequisitionInput,
      STORE_NEED,
      iss.raiseRequisition,
      {
        clientKey: uuid(),
        requestingLocationId: s.points[r.point].id,
        issuingLocationId: main.id,
        lines: pick(r.ids).map((m) => ({
          productId: product(m),
          quantity: Math.round(base(m) / 4),
        })),
      },
      ago(s, r.raised, r.raised ? 9 : 8),
    );
    bump(s, "store_requisitions");
    const lines = await q<{ id: string; medicine: string; asked: number }>(
      s,
      sql`SELECT l.id, p.medicine_id AS medicine, l.quantity_asked::int AS asked FROM pharmacy_requisition_lines l
        JOIN pharmacy_products p ON p.id = l.product_id WHERE l.requisition_id = ${raised.id}`,
    );
    const refused = lines.find((l) => l.medicine === r.refuse);
    if (refused)
      await write(
        s,
        keeper,
        iss.RefuseInput,
        STORE_NEED,
        iss.refuseRequisitionLine,
        {
          requisitionId: raised.id,
          lineId: refused.id,
          reason: "Demo: the point holds a month",
        },
        ago(s, r.raised, 13),
      );
    if (r.issued === undefined) continue;
    // Catalogue slice Step 10: with the check on, each issued line is picked first (ticked by hand here).
    if (pharmacyCatalogueLiveFor(s.h))
      for (const l of lines.filter((l) => l.medicine !== r.short && l.medicine !== r.refuse))
        await write(
          s,
          keeper,
          dist.RecordPickInput,
          STORE_NEED,
          dist.recordPick,
          {
            requisitionId: raised.id,
            lineId: l.id,
            raw: null,
          },
          ago(s, r.issued, 10),
        );
    const issued = await write(
      s,
      keeper,
      iss.IssueRequisitionInput,
      STORE_NEED,
      iss.issueRequisition,
      {
        requisitionId: raised.id,
        lines: lines.map((l) =>
          l.medicine === r.short
            ? { lineId: l.id, quantity: 0, notIssuedReason: "Demo: kept for the wards" }
            : { lineId: l.id, quantity: l.asked },
        ),
      },
      ago(s, r.issued, 11),
    );
    bump(s, "store_issues");
    if (r.confirmed === undefined) continue;
    const got = await receivedBy(s, issued.id);
    const broken = got.find((b) => b.medicine === r.broken)?.batchId;
    await write(
      s,
      tech,
      iss.ConfirmReceiptInput,
      STOCK_NEED,
      iss.confirmIssueReceipt,
      {
        issueId: issued.id,
        lines: got.map((b) => ({
          batchId: b.batchId,
          confirmed: b.batchId === broken ? b.quantity - 2 : b.quantity,
        })),
        reason: broken ? "Demo: two broken in the box." : null,
      },
      ago(s, r.confirmed, 15),
    );
    const back = got.find((b) => b.medicine === r.returned);
    if (back) {
      await write(
        s,
        tech,
        iss.ReturnInput,
        STOCK_NEED,
        iss.returnStock,
        {
          clientKey: uuid(),
          fromLocationId: s.points[r.point].id,
          toLocationId: main.id,
          batchId: back.batchId,
          quantity: Math.min(50, back.quantity),
          reasonCode: "no_longer_needed",
          note: "Demo: more than the point uses before the next issue.",
          fit: true,
        },
        ago(s, 2, 10),
      );
      bump(s, "store_returns");
    }
  }

  // Loans with the regional referral hospital: one settled by its return, one lent and one borrowed outstanding.
  const batchAt = async (medicineId: string) =>
    (
      await one<{ id: string }>(
        s,
        sql`SELECT b.id FROM pharmacy_batches b JOIN pharmacy_products p ON p.id = b.product_id
          WHERE b.location_id = ${main.id} AND p.medicine_id = ${medicineId} ORDER BY b.expiry LIMIT 1`,
      )
    ).id;
  const lend = async (m: DemoMedicine, quantity: number, daysAgo: number) =>
    (
      await write(
        s,
        chief,
        iss.LendInput,
        packs.PACK_NEED,
        iss.lendStock,
        {
          clientKey: uuid(),
          locationId: main.id,
          batchId: await batchAt(m.id),
          quantity,
          counterpartyId: facility,
        },
        ago(s, daysAgo, 12),
      )
    ).id;
  const [first, second, third] = [
    med("ceftriaxone") ?? meds[0]!,
    med("amoxicillin") ?? meds[1]!,
    med("magnesium_sulfate") ?? med("oxytocin") ?? meds[2]!,
  ];
  const settled = await lend(first, 40, 20);
  await write(
    s,
    chief,
    iss.CloseLoanInput,
    packs.PACK_NEED,
    iss.closeLoan,
    { clientKey: uuid(), loanMovementId: settled, returned: 40 },
    ago(s, 11, 12),
  );
  await lend(second, 500, 12);
  await write(
    s,
    chief,
    iss.BorrowInput,
    packs.PACK_NEED,
    iss.borrowStock,
    {
      clientKey: uuid(),
      locationId: main.id,
      counterpartyId: facility,
      productId: product(third),
      batchNumber: `DEMO-${tag}-L001`,
      expiry: ahead(s, 380),
      quantity: 30,
    },
    ago(s, 9, 16),
  );
  bump(s, "store_loans", 3);

  // 6 days ago: an emergency order to the private supplier, sent and not yet delivered.
  await order(
    "emergency",
    supplierA,
    ago(s, 6),
    pick(["ceftriaxone", "gentamicin", "metronidazole", "omeprazole"]).map((m) => m.id),
    true,
  );

  // The cycle order: a line the supplier cannot fill is closed; a second delivery (yesterday) part fills another.
  const out = orderLines.get("albendazole") ?? orderLines.get("zinc_sulfate");
  if (out)
    await write(
      s,
      chief,
      orders.CloseLineInput,
      orders.MANAGE_NEED,
      orders.closeOrderLine,
      {
        clientKey: uuid(),
        orderLineId: out.id,
        reason: "supplier_out",
        note: "Demo: out of stock at the supplier this cycle.",
      },
      ago(s, 2, 9),
    );
  await deliver({
    supplier: nms,
    note: "NMS-DN-0533",
    where: bulk.id,
    daysAgo: 1,
    order: cycle,
    receive: true,
    lines: ordered(
      [
        "glibenclamide",
        "hydrochlorothiazide",
        "furosemide",
        "salbutamol",
        "fluconazole",
        "ibuprofen",
      ],
      (_m, i, units) => (i === 0 ? { note: Math.round(units / 2) } : {}),
    ),
  });

  // This morning: a delivery at the main store still being counted.
  await deliver({
    supplier: supplierA,
    note: "DSA-INV-2311",
    where: main.id,
    daysAgo: 0,
    receive: false,
    lines: pick(["paracetamol", "amoxicillin", "omeprazole", "atorvastatin", "metformin"]).map(
      (m) => ({ m, note: base(m) }),
    ),
  });

  // Today's cycle proposal saved as a draft and checked against the in-charge's paper figures (ordering's go-live).
  const draft = await order("cycle", nms, s.now, null, false);
  const draftLines = await q<{ productId: string; units: number }>(
    s,
    sql`SELECT product_id AS "productId", coalesce(proposed_units, 0)::int AS units FROM pharmacy_order_lines WHERE order_id = ${draft}`,
  );
  await write(
    s,
    chief,
    orders.PaperComparisonInput,
    orders.MANAGE_NEED,
    orders.recordPaperOrderComparison,
    {
      clientKey: uuid(),
      orderId: draft,
      lines: draftLines.map((l, i) =>
        i < 2
          ? {
              productId: l.productId,
              paperUnits: l.units + 100,
              explanation: "Demo: the paper sheet used last quarter's consumption.",
            }
          : { productId: l.productId, paperUnits: l.units },
      ),
    },
  );
  bump(s, "store_paper_comparisons");
}
