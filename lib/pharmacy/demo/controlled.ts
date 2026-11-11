import "server-only";

import { randomUUID } from "node:crypto";
import type { DemoPatient, DemoState, PointKey } from "./state";
import type { PharmacyActor } from "@/lib/pharmacy/write";
import { sql } from "drizzle-orm";

import * as cd from "@/lib/pharmacy/controlled-store";
import * as entry from "@/lib/pharmacy/downtime-entry";
import * as sheets from "@/lib/pharmacy/downtime-store";
import * as review from "@/lib/pharmacy/review/store";
import { localDate } from "@/lib/pharmacy/stock/ledger";
import * as supply from "@/lib/pharmacy/supply/store";
import { DEFAULT_TIME_ZONE, startOfLocalDay } from "@/supabase/functions/_shared/slots";
import { at, bump, chiefActor, DEMO_DOSE, one, pharmacyActor, q, witness, write } from "./state";
import { shelfAt } from "./stock";

/**
 * Sections 5–7: the controlled register (a month of witnessed counts and supplies at the points that hold controlled
 * medicines), downtime (printed sheets at two points, a past outage entered from paper, a drill) and emergency doses
 * (resus episodes over the last 30 days). Stock moves in time order, so every count matches the ledger at its time.
 */

const HOUR = 3_600_000;
/** A time `days` ago at `hour` EAT; today's are `hour` hours before now instead, but still today and never ahead. */
const when = (s: DemoState, days: number, hour = 9) => {
  if (days) return at(s, days, hour);
  const now = s.now.getTime();
  return new Date(
    Math.max(now - hour * HOUR, (startOfLocalDay(s.now, DEFAULT_TIME_ZONE).getTime() + now) / 2),
  );
};

/** The point's pharmacist (the first six points have one) and technician, in setup's POINTS order. */
const POINT_ORDER: PointKey[] = [
  "opd",
  "emergency",
  "inpatient",
  "paediatrics",
  "maternity",
  "art",
  "ncd",
  "private",
];
const pharmacistAt = (s: DemoState, p: PointKey) =>
  pharmacyActor(s, s.people.pharmacists[POINT_ORDER.indexOf(p)] ?? s.people.chief, "PHARMACIST", p);
const techOf = (s: DemoState, p: PointKey) => s.people.techs[POINT_ORDER.indexOf(p)]!;

/** Each batch's balance now (the sum of its movements). */
async function balances(s: DemoState, batchIds: string[]) {
  const rows = await q<{ id: string; n: number }>(
    s,
    sql`SELECT b.id, coalesce(sum(m.quantity), 0)::int AS n FROM pharmacy_batches b
      LEFT JOIN pharmacy_stock_movements m ON m.batch_id = b.id
      WHERE b.id IN (${sql.join(
        batchIds.map((b) => sql`${b}::uuid`),
        sql`, `,
      )}) GROUP BY b.id`,
  );
  return new Map(rows.map((r) => [r.id, Number(r.n)]));
}

/** A witnessed controlled count of every batch of a medicine at a point; `short` units missing from the first batch. */
async function countNow(
  s: DemoState,
  actor: PharmacyActor,
  witnessUser: string,
  medicineId: string,
  point: PointKey,
  t: Date,
  scope: "controlled_shift" | "controlled_supply",
  short = 0,
) {
  const batches = s.stock.get(medicineId)!.get(point)!.batches;
  const bal = await balances(s, batches);
  const w = await witness(
    s,
    actor.userId,
    witnessUser,
    scope === "controlled_supply" ? "controlled_supply" : "controlled_count",
  );
  await write(
    s,
    actor,
    cd.ControlledCountInput,
    cd.CONTROLLED_NEED,
    cd.recordControlledCount,
    {
      medicineId,
      scope,
      witnessAttestationId: w,
      lines: batches.map((b, i) => ({
        batchId: b,
        counted: Math.max(0, (bal.get(b) ?? 0) - (i === 0 ? short : 0)),
      })),
    },
    t,
  );
  bump(s, "controlled_counts");
  return { total: [...bal.values()].reduce((a, b) => a + b, 0) - short, witness: w };
}

/** A past visit for a patient, finished the same day (an owner insert, as setup writes visits). */
async function pastVisit(s: DemoState, p: DemoPatient, doctor: string, t: Date) {
  return (
    await one<{ id: string }>(
      s,
      sql`INSERT INTO encounters (hospital_id, patient_user_id, clinician_user_id, department_id, state, started_at,
          ended_at, encounter_type, disposition)
        VALUES (${s.h}, ${p.id}, ${doctor}, ${s.clinics[p.clinic!]}, 'completed',
          ${new Date(t.getTime() - HOUR).toISOString()}::timestamptz, ${new Date(t.getTime() + HOUR).toISOString()}::timestamptz,
          ${p.clinic === "ed" ? "emergency" : "opd"}, 'home') RETURNING id`,
    )
  ).id;
}

/** One controlled line by a medical officer, as the prescribing desk leaves it (the tests' `place()`). */
async function prescribe(
  s: DemoState,
  p: DemoPatient,
  enc: string,
  doctor: string,
  medicineId: string,
  route: string,
  t: Date,
) {
  const m = s.medicines.find((x) => x.id === medicineId)!;
  return (
    await one<{ id: string }>(
      s,
      sql`INSERT INTO prescriptions (hospital_id, encounter_id, patient_user_id, prescriber_user_id, prescriber_cadre,
          drug_id, drug_name, dose, route, frequency, is_emergency, state, placement_id, placement_line, created_at,
          updated_at, check_answers, controlled, edits)
        VALUES (${s.h}, ${enc}, ${p.id}, ${doctor}, 'MEDICAL_OFFICER', ${m.id}, ${m.name}, ${DEMO_DOSE}, ${route},
          ${DEMO_DOSE}, false, 'active', ${randomUUID()}, 1, ${t.toISOString()}::timestamptz, ${t.toISOString()}::timestamptz,
          '[]'::jsonb, true, '[]'::jsonb) RETURNING id`,
    )
  ).id;
}

const typedDob = (dob: string) => `${dob.slice(8, 10)}/${dob.slice(5, 7)}/${dob.slice(0, 4)}`;

/**
 * A controlled supply as the window does it: the line written before the visit ends, accepted and staged by the
 * point's pharmacist, the witness attested, every batch counted with them, the date of birth checked, then the
 * hand-over with both paper attestations and the balance the witness agreed.
 */
async function controlledSupply(
  s: DemoState,
  point: PointKey,
  p: DemoPatient,
  doctor: string,
  medicineId: string,
  route: string,
  quantity: number,
  t: Date,
) {
  const actor = pharmacistAt(s, point);
  const enc = await pastVisit(s, p, doctor, t);
  const lineId = await prescribe(
    s,
    p,
    enc,
    doctor,
    medicineId,
    route,
    new Date(t.getTime() - 50 * 60_000),
  );
  const reviewedAt = new Date(t.getTime() - 20 * 60_000);
  try {
    await write(
      s,
      actor,
      review.LineInput,
      review.REVIEW_NEED,
      review.acceptLine,
      { lineId },
      reviewedAt,
    );
  } catch {
    await write(
      s,
      actor,
      review.LineInput,
      review.REVIEW_NEED,
      review.acceptRemainingLines,
      { lineId },
      reviewedAt,
    );
  }
  await write(
    s,
    actor,
    review.DecisionsInput,
    review.DISPENSE_NEED,
    review.saveLineDecisions,
    {
      decisions: [{ lineId, kind: "full", quantity }],
    },
    reviewedAt,
  );
  const c = await countNow(s, actor, techOf(s, point), medicineId, point, t, "controlled_supply");
  const clientKey = randomUUID();
  await write(
    s,
    actor,
    supply.IdentifierInput,
    supply.DISPENSE_LIVE,
    supply.checkSecondIdentifier,
    {
      clientKey,
      lineId,
      kind: "date_of_birth",
      typed: typedDob(p.dob),
    },
    t,
  );
  const { productId, batches } = s.stock.get(medicineId)!.get(point)!;
  await write(
    s,
    actor,
    cd.ControlledSupplyInput,
    cd.CONTROLLED_LIVE,
    (ctx, input) => cd.recordControlledSupply(ctx, input),
    {
      clientKey,
      lines: [
        { lineId, productId, rows: [{ batchId: batches[0]!, quantity }], strengthConfirmed: true },
      ],
      collector: { kind: "patient" },
      identity: { route: "two_identifiers", nameAttested: true },
      payment: { status: "not_recorded" },
      witnessAttestationId: c.witness,
      paperPrescriptionAttested: true,
      registerAttested: true,
      agreedBalances: [{ medicineId, balance: c.total - quantity }],
    },
    t,
  );
  bump(s, "controlled_supplies");
}

/** The points whose controlled register this section fills. */
const REGISTER_POINTS: PointKey[] = ["opd", "emergency", "inpatient", "paediatrics"];
/** Left to the downtime section: phenobarbital at the outpatient window is supplied on paper during the outage. */
const PAPER_CONTROLLED = { point: "opd" as PointKey, medicineId: "phenobarbital" };

/**
 * Section 5, the Controlled drugs page and its register slips: at four points, a witnessed shift count of every
 * controlled medicine weekly and this morning, two differences (one closed by the in-charge with the reason, one open
 * today), and ten witnessed supplies to demo patients over the month (tramadol and codeine at the outpatient window,
 * morphine at the emergency pharmacy). Receipts are the stock section's.
 */
export async function controlledSection(s: DemoState): Promise<void> {
  const steps: { t: Date; run: () => Promise<unknown> }[] = [];
  const pairs = REGISTER_POINTS.flatMap((point) =>
    shelfAt(point, s.medicines)
      .filter((m) => m.controlled && s.stock.get(m.id)?.get(point))
      .filter((m) => !(point === PAPER_CONTROLLED.point && m.id === PAPER_CONTROLLED.medicineId))
      .map((m) => ({ point, medicineId: m.id })),
  );

  for (const { point, medicineId } of pairs)
    for (const days of [28, 21, 14, 7, 0]) {
      const short =
        days === 14 && point === "inpatient" && medicineId === "morphine"
          ? 1
          : days === 0 && point === "opd" && medicineId === "tramadol"
            ? 2
            : 0;
      const t = when(s, days, days === 0 ? 1 : 8);
      steps.push({
        t,
        run: () =>
          countNow(
            s,
            pharmacistAt(s, point),
            techOf(s, point),
            medicineId,
            point,
            t,
            "controlled_shift",
            short,
          ),
      });
    }

  const gopd = s.patients.filter((p) => p.clinic === "gopd" && p.point === "opd");
  const ed = s.patients.filter((p) => p.clinic === "ed");
  const [mo1, mo2] = s.people.doctors;
  const plan: [
    PointKey,
    DemoPatient | undefined,
    string,
    string,
    string,
    number,
    number,
    number,
  ][] = [
    ["opd", gopd[0], mo1!, "tramadol", "oral", 20, 25, 10],
    ["opd", gopd[1], mo1!, "tramadol", "oral", 10, 18, 11],
    ["opd", gopd[2], mo1!, "codeine", "oral", 20, 16, 14],
    ["opd", gopd[3], mo1!, "tramadol", "oral", 15, 11, 10],
    ["opd", gopd[4], mo1!, "codeine", "oral", 10, 9, 15],
    ["opd", gopd[5], mo1!, "tramadol", "oral", 10, 4, 12],
    ["opd", gopd[6], mo1!, "tramadol", "oral", 20, 2, 11],
    ["emergency", ed[0], mo2!, "morphine", "IV", 2, 19, 22],
    ["emergency", ed[1], mo2!, "morphine", "IV", 1, 8, 3],
    ["emergency", ed[2], mo2!, "morphine", "IV", 2, 1, 20],
  ];
  for (const [point, p, doctor, medicineId, route, quantity, days, hour] of plan)
    if (p && s.stock.get(medicineId)?.get(point)) {
      const t = when(s, days, hour);
      steps.push({
        t,
        run: () => controlledSupply(s, point, p, doctor, medicineId, route, quantity, t),
      });
    }

  // The in-charge closes the morphine difference the morning after, with the reason found.
  const closed = when(s, 13, 10);
  steps.push({
    t: closed,
    run: async () => {
      const [d] = await q<{ id: string }>(
        s,
        sql`SELECT id FROM pharmacy_controlled_differences WHERE hospital_id = ${s.h} AND closed_at IS NULL
          AND dispensing_point_id = ${s.points.inpatient.id} ORDER BY recorded_at LIMIT 1`,
      );
      if (!d) return;
      await write(
        s,
        chiefActor(s, "inpatient"),
        cd.CloseDifferenceInput,
        cd.CLOSE_NEED,
        cd.closeControlledDifference,
        {
          differenceId: d.id,
          note: "Demo: one ampoule broken in the cupboard on the night round; the broken ampoule kept for the in-charge.",
        },
        closed,
      );
      bump(s, "controlled_differences_closed");
    },
  });

  steps.sort((a, b) => a.t.getTime() - b.t.getTime());
  for (const step of steps) await step.run();
}

/* ─── Downtime ───────────────────────────────────────────────────────── */

/**
 * Section 6, the downtime pages at the outpatient and maternity pharmacies: blank sheets printed sixteen days ago, a
 * drill, a network outage twelve days ago whose paper prescriptions were entered that afternoon (one sheet complete,
 * one part-entered, one not started), a spoilt sheet voided at each point, and a power cut at maternity five days ago
 * still to enter. Two phenobarbital supplies on the sheets are back-entered controlled entries: one confirmed against
 * the register with a witness, the other waiting on the Controlled drugs page.
 */
export async function downtimeSection(s: DemoState): Promise<void> {
  const opd = pharmacistAt(s, "opd");
  const mat = pharmacistAt(s, "maternity");
  const printed = when(s, 16, 8);
  const reserve = async (a: PharmacyActor, count: number) => {
    const r = await write(
      s,
      a,
      sheets.ReserveInput,
      sheets.SHEETS_NEED,
      sheets.reserveSheetNumbers,
      { count },
      printed,
    );
    bump(s, "downtime_sheets", count);
    return r.numbers;
  };
  const opdSheets = await reserve(opd, 20);
  const matSheets = await reserve(mat, 10);

  await write(
    s,
    opd,
    sheets.DrillInput,
    sheets.SHEETS_NEED,
    sheets.recordDrill,
    {
      heldOn: localDate(when(s, 20, 10)),
      participants: "Demo pharmacist 1, Demo pharmacy technician 1",
      whatWasDone:
        "Demo drill: the window worked on paper sheets for an hour, then the rows were entered.",
      problems:
        "Demo: the box of blank sheets was not where the list said; moved to the dispensing counter.",
    },
    when(s, 20, 12),
  );
  bump(s, "downtime_drills");

  // The outage, recorded by the in-charge when the network came back.
  const start = when(s, 12, 8);
  const end = new Date(start.getTime() + 3.5 * HOUR);
  await write(
    s,
    chiefActor(s, "opd"),
    sheets.PeriodInput,
    sheets.MANAGE_SHEETS_NEED,
    sheets.recordDowntime,
    {
      startsAt: start.toISOString(),
      endsAt: end.toISOString(),
      reason: "network",
      note: "Demo: the hospital network was down; the outpatient pharmacy worked on paper.",
      sheets: opdSheets.slice(0, 3),
    },
    new Date(end.getTime() + 15 * 60_000),
  );
  bump(s, "downtime_periods");
  for (const [point, n, reason] of [
    ["opd", opdSheets.at(-1)!, "Demo: sheet spoilt by a spill at the counter."],
    ["maternity", matSheets.at(-1)!, "Demo: sheet torn while printing."],
  ] as const)
    await write(
      s,
      chiefActor(s, point),
      sheets.VoidInput,
      sheets.MANAGE_SHEETS_NEED,
      sheets.voidSheetNumber,
      { number: n, reason },
      when(s, 11, 9),
    );

  // The paper rows, entered that afternoon at the window.
  const gopd = s.patients.filter((p) => p.clinic === "gopd" && p.point === "opd");
  const enteredAt = new Date(end.getTime() + 2 * HOUR);
  let minute = 0;
  const row = async (
    sheet: number,
    rowNo: number,
    p: DemoPatient,
    medicineId: string,
    quantity: number | null,
    o: { identity?: "checked" | "not_checked"; controlled?: boolean } = {},
  ) => {
    const m = s.medicines.find((x) => x.id === medicineId)!;
    const stock = s.stock.get(medicineId)!.get("opd")!;
    const r = await write(
      s,
      opd,
      entry.RowInput,
      entry.ENTRY_NEED,
      entry.enterDowntimeRow,
      {
        sheet,
        section: quantity ? "supply" : "not_supplied",
        row: rowNo,
        patientUserId: p.id,
        suppliedAt: new Date(start.getTime() + (20 + (minute += 17)) * 60_000).toISOString(),
        prescription: {
          kind: "paper",
          prescriberName: "Demo medical officer 1",
          prescriberCadre: "Medical officer",
          writtenOn: localDate(start),
          lines: [
            {
              medicineAsWritten: m.name,
              directionsAsWritten: DEMO_DOSE,
              quantityAsWritten: quantity ? String(quantity) : null,
            },
          ],
          lineNo: 1,
        },
        supply: quantity
          ? {
              productId: stock.productId,
              batchId: stock.batches[0],
              quantity,
              suppliedByCadre: "PHARMACIST",
              identity: o.identity ?? "checked",
              pharmacistInitials: "DP1",
              controlled: o.controlled
                ? { witnessNameAsWritten: "Demo pharmacy technician 1", registerAttested: true }
                : null,
            }
          : null,
        notSupplied: quantity ? null : { outcome: "owed", reasonCode: "out_point" },
      },
      enteredAt,
    );
    bump(s, "downtime_rows");
    return r.id;
  };
  const [first, second] = opdSheets; // the third sheet of the outage is still to enter
  await row(first!, 1, gopd[0]!, "amoxicillin", 15);
  await row(first!, 2, gopd[1]!, "paracetamol", 20);
  const confirmed = await row(first!, 3, gopd[2]!, "phenobarbital", 30, { controlled: true });
  await row(first!, 4, gopd[3]!, "artemether_lumefantrine", null);
  await row(second!, 1, gopd[4]!, "metformin", 60, { identity: "not_checked" });
  await row(second!, 2, gopd[5]!, "phenobarbital", 30, { controlled: true });
  await write(
    s,
    opd,
    sheets.CompleteInput,
    sheets.SHEETS_NEED,
    sheets.completeSheet,
    { number: first! },
    new Date(enteredAt.getTime() + 10 * 60_000),
  );

  // The first back-entered phenobarbital supply, confirmed against the register with a witness.
  const [e] = await q<{ id: string }>(
    s,
    sql`SELECT id FROM pharmacy_controlled_entries WHERE handover_id = ${confirmed} AND kind = 'back_entered_supply'`,
  );
  if (e) {
    const t = new Date(enteredAt.getTime() + 30 * 60_000);
    const w = await witness(s, opd.userId, techOf(s, "opd"), "back_entry_confirmed");
    await write(
      s,
      opd,
      cd.ConfirmBackEntryInput,
      cd.CONTROLLED_NEED,
      cd.confirmBackEnteredControlledSupply,
      {
        entryId: e.id,
        witnessAttestationId: w,
      },
      t,
    );
    bump(s, "controlled_back_entries_confirmed");
  }

  // A power cut at maternity five days ago: its sheet waits to be entered.
  const cut = when(s, 5, 13);
  await write(
    s,
    chiefActor(s, "maternity"),
    sheets.PeriodInput,
    sheets.MANAGE_SHEETS_NEED,
    sheets.recordDowntime,
    {
      startsAt: cut.toISOString(),
      endsAt: new Date(cut.getTime() + 70 * 60_000).toISOString(),
      reason: "power",
      note: "Demo: power cut; the maternity pharmacy worked on paper until the generator came on.",
      sheets: matSheets.slice(0, 1),
    },
    new Date(cut.getTime() + 2 * HOUR),
  );
  bump(s, "downtime_periods");
}

/* ─── Emergency doses ────────────────────────────────────────────────── */

type Dose =
  | {
      drug: string;
      route: string;
      cart: string | null;
      controlled?: boolean;
      witness?: boolean;
      minute: number;
      wrongCart?: string;
    }
  | {
      protocol: string;
      state: "performed" | "indicated";
      step: "A" | "B" | "C" | "D" | "E";
      minute: number;
    };

/**
 * Section 7, the Emergency doses page: seven resus episodes in the last 30 days (emergency department patients,
 * intensive care patients, one patient not yet identified, one still open), each with the doses given on the desk:
 * grab-and-give doses by cart (controlled ones witnessed by the emergency medical officer), protocol doses performed
 * from an ABCDE step, one indicated and never given, and one cart typed wrong and corrected. Owner inserts, as the
 * tests write the timeline; every dose reads `[demo dose]`.
 */
export async function emergencySection(s: DemoState): Promise<void> {
  const CART_A = "Demo resus cart A (emergency)";
  const CART_B = "Demo resus cart B (intensive care)";
  const ed = s.patients.filter((p) => p.clinic === "ed");
  const icu = s.patients.filter((p) => p.ward === "icu");
  const [n1, n2, n3] = s.people.nurses;
  const edDoctor = s.people.doctors[1]!;
  const episodes: {
    patient: DemoPatient | null;
    days: number;
    hour: number;
    giver: string;
    doses: Dose[];
  }[] = [
    {
      patient: ed[0] ?? null,
      days: 27,
      hour: 14,
      giver: n1!,
      doses: [
        { protocol: "Oxygen", state: "performed", step: "B", minute: 2 },
        { drug: "adrenaline", route: "IM", cart: CART_A, minute: 4 },
        { drug: "hydrocortisone", route: "IV", cart: CART_A, minute: 12 },
        { drug: "chlorphenamine", route: "IV", cart: CART_A, minute: 15 },
      ],
    },
    {
      patient: icu[0] ?? null,
      days: 22,
      hour: 3,
      giver: n2!,
      doses: [
        { drug: "diazepam", route: "IV", cart: CART_B, controlled: true, witness: true, minute: 3 },
        { drug: "glucose_50", route: "IV", cart: CART_B, minute: 6 },
        { protocol: "Glucose check and correction", state: "performed", step: "D", minute: 7 },
      ],
    },
    {
      patient: null,
      days: 18,
      hour: 21,
      giver: n1!,
      doses: [
        { drug: "tranexamic_acid", route: "IV", cart: CART_A, minute: 5 },
        { protocol: "Fluid bolus", state: "performed", step: "C", minute: 6 },
        { drug: "ceftriaxone", route: "IV", cart: CART_A, minute: 30 },
      ],
    },
    {
      patient: ed[1] ?? null,
      days: 12,
      hour: 10,
      giver: n3!,
      doses: [
        { drug: "morphine", route: "IV", cart: CART_A, controlled: true, witness: true, minute: 8 },
        { drug: "ondansetron", route: "IV", cart: CART_A, minute: 10, wrongCart: CART_B },
      ],
    },
    {
      patient: icu[1] ?? null,
      days: 6,
      hour: 16,
      giver: n2!,
      doses: [
        { protocol: "Adrenaline during arrest", state: "performed", step: "C", minute: 2 },
        { drug: "adrenaline", route: "IV", cart: CART_B, minute: 5 },
        { drug: "adrenaline", route: "IV", cart: CART_B, minute: 9 },
        { protocol: "Antibiotics within the hour", state: "indicated", step: "E", minute: 20 },
      ],
    },
    {
      patient: ed[2] ?? null,
      days: 3,
      hour: 1,
      giver: n1!,
      doses: [
        { drug: "salbutamol", route: "Inhaled", cart: CART_A, minute: 2 },
        { drug: "magnesium_sulfate", route: "IV", cart: CART_A, minute: 6 },
        { drug: "hydrocortisone", route: "IV", cart: CART_A, minute: 10 },
      ],
    },
    {
      patient: icu[2] ?? null,
      days: 0,
      hour: 3,
      giver: n3!,
      doses: [
        { protocol: "Airway opened", state: "performed", step: "A", minute: 1 },
        {
          drug: "midazolam",
          route: "IV",
          cart: CART_B,
          controlled: true,
          witness: true,
          minute: 4,
        },
        { drug: "naloxone", route: "IV", cart: null, minute: 25 },
      ],
    },
  ];
  const nameOf = (id: string) => s.medicines.find((m) => m.id === id)?.name ?? id;
  for (const ep of episodes) {
    const started = when(s, ep.days, ep.hour);
    const open = ep.days === 0;
    const onWard = !!ep.patient?.ward;
    const row = await one<{ id: string }>(
      s,
      sql`INSERT INTO resus_episodes (hospital_id, department_id, patient_user_id, encounter_id, trigger_kind,
          trigger_reason, state, disposition, started_at, ended_at, opened_by_user_id)
        VALUES (${s.h}, ${onWard ? s.wards[ep.patient!.ward!] : s.clinics.ed}, ${ep.patient?.id ?? null},
          ${open || onWard ? (ep.patient?.enc ?? null) : null}, ${onWard ? "in_resus_deterioration" : "triage_red"},
          ${onWard ? "Demo: deteriorated on the unit" : "Demo: red at triage"}, ${open ? "active" : "concluded"},
          ${open ? null : onWard ? "icu" : "ward"}, ${started.toISOString()}::timestamptz,
          ${open ? null : new Date(started.getTime() + 75 * 60_000).toISOString()}::timestamptz, ${ep.giver})
        RETURNING id`,
    );
    bump(s, "resus_episodes");
    for (const d of ep.doses) {
      const t = new Date(
        Math.min(started.getTime() + d.minute * 60_000, s.now.getTime() - 60_000),
      ).toISOString();
      const event = async (payload: unknown, step: string, supersedes: string | null = null) =>
        (
          await one<{ id: string }>(
            s,
            sql`INSERT INTO resus_timeline_events (episode_id, kind, step, recorded_by_user_id, recorded_at, payload,
                supersedes_event_id)
              VALUES (${row.id}, 'drug', ${step}, ${ep.giver}, ${t}::timestamptz, ${JSON.stringify(payload)}::jsonb,
                ${supersedes}) RETURNING id`,
          )
        ).id;
      if ("protocol" in d) await event({ label: d.protocol, state: d.state }, d.step);
      else {
        const given = (cart: string | null) => ({
          prescribing: {
            drugId: d.drug,
            drugName: nameOf(d.drug),
            dose: DEMO_DOSE,
            route: d.route,
            cart,
            giverUserId: ep.giver,
            witnessUserId: d.witness ? edDoctor : null,
            controlled: d.controlled === true,
          },
        });
        // A cart typed wrong at the bedside is replaced by a later event that supersedes it.
        const firstId = await event(given(d.wrongCart ?? d.cart), "C");
        if (d.wrongCart) await event(given(d.cart), "C", firstId);
      }
      bump(s, "resus_drug_events");
    }
  }
}
