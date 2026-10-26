import type { PatientIdentity } from "@/components/emr/orders/model";
import type { RenewalRow } from "@/lib/emr/read/renewals";
import type {
  PatientRefills,
  PatientRepeat,
  RefillRow,
  RefillTab,
} from "@/lib/pharmacy/refill-read";
import type { ReviewResult } from "@/lib/pharmacy/review/store";

import { NETWORK_B, NETWORK_UI } from "@/content/pharmacy-network";
import { addDays } from "@/lib/pharmacy/stores/ledger";
import { longDate } from "@/lib/prescribing/repeats";

/**
 * The Phase 4 demo catalogue (owner request, 26 Oct 2026): fixture rows for the Refills board, the patient's Repeat
 * medicines and the prescriber's Renewal requests, rendered by the real views at /styleguide/pharmacy-network/*
 * (MEDSYNC_FIXTURES=1). No database, no signature, no flag: nothing here is written anywhere, and every save in the
 * fixture answers "Demo: nothing is saved".
 *
 * What it is not: no pack values. Repeat counts and intervals below are placeholders to fill the sentences, labelled
 * Demo on the page, never a signed rule. Medicines are names only (no strengths, no doses). Patients are record
 * numbers only; collectors are "Collector NN".
 */

export const DEMO_TODAY = "2026-10-26";
export const DEMO_SAVE = "Demo: nothing is saved.";

type Save = (key: string, data: FormData) => Promise<ReviewResult<unknown>>;
/** A dialog's save, or in the fixture a refusal in words (nothing is sent). */
export const guard = (demo: boolean, save: Save): Save =>
  demo ? async () => ({ ok: false, code: "config", error: DEMO_SAVE }) : save;

/** Names only, from the general formulary's NCD and chronic lines. */
export const DEMO_MEDICINES = [
  "Metformin tablets",
  "Amlodipine tablets",
  "Losartan tablets",
  "Hydrochlorothiazide tablets",
  "Atorvastatin tablets",
  "Glibenclamide tablets",
  "Enalapril tablets",
  "Nifedipine tablets",
  "Carbamazepine tablets",
  "Sodium valproate tablets",
  "Phenytoin tablets",
  "Levothyroxine tablets",
  "Salbutamol inhaler",
  "Beclometasone inhaler",
  "Omeprazole capsules",
  "Folic acid tablets",
] as const;

export const DEMO_POINTS = [
  { id: "demo-point-opd", name: "Outpatient pharmacy" },
  { id: "demo-point-ncd", name: "NCD clinic pharmacy" },
  { id: "demo-point-w4", name: "Ward 4 dispensing point" },
] as const;

const pad = (n: number) => String(n).padStart(4, "0");
export const demoMrn = (n: number) => `MS-DEMO-${pad(n)}`;
const uuid = (kind: number, n: number) =>
  `00000000-0000-4000-8${kind}00-${String(n).padStart(12, "0")}`;
const RELATIONS = ["daughter", "son", "sister", "husband", "wife", "neighbour", "brother"];
const collector = (n: number) =>
  `Collector ${String(n).padStart(2, "0")} (${RELATIONS[n % RELATIONS.length]})`;

/** Every patient as a record number only (owner rule for mocks). */
export function demoIdentities(count = 48): Record<string, PatientIdentity> {
  return Object.fromEntries(
    Array.from({ length: count }, (_, i) => [
      uuid(1, i + 1),
      {
        name: "",
        mrn: demoMrn(i + 1),
        ageSex: `${30 + ((i * 7) % 50)} y · ${i % 2 ? "Male" : "Female"}`,
      },
    ]),
  );
}

const R = NETWORK_UI.refills;
/** How many rows each tab carries; the partner tab waits for Step 6 and stays empty. */
const PER_TAB: Record<RefillTab, number> = {
  to_prepare: 14,
  needs_clinic: 8,
  prepared: 10,
  collected: 6,
  not_collected: 6,
  partner: 0,
};
const NOTES = [
  "I have 3 days left",
  "Please keep it at the NCD clinic window",
  "My daughter will collect after work",
  null,
  "Travelling next week",
  null,
];

/** The board: 44 rows over five tabs, every timing word, every channel, self and named collectors. */
export function demoRefillRows(): RefillRow[] {
  const rows: RefillRow[] = [];
  let n = 0;
  for (const tab of Object.keys(PER_TAB) as RefillTab[]) {
    for (let i = 0; i < PER_TAB[tab]; i++) {
      n++;
      const point = DEMO_POINTS[n % DEMO_POINTS.length]!;
      const medicine = DEMO_MEDICINES[n % DEMO_MEDICINES.length]!;
      const supplies = 1 + (n % 5);
      const interval = [28, 30, 56, 84][n % 4]!;
      const lastOn = addDays(DEMO_TODAY, -(interval + ((n % 7) - 3) * 4));
      const gap = ((n % 7) - 3) * 4;
      const early = tab === "needs_clinic" && i % 2 === 0;
      const late = tab !== "needs_clinic" && n % 5 === 0;
      rows.push({
        lineId: uuid(2, n),
        requestId: uuid(3, n),
        prescriptionId: uuid(4, n),
        patientUserId: uuid(1, n),
        pointId: point.id,
        medicine,
        medicineId: `demo_${n}`,
        tab,
        allows:
          tab === "needs_clinic" && !early
            ? i % 3 === 0
              ? R.noRepeats
              : R.noneLeft
            : R.allows(supplies, interval, longDate(addDays(DEMO_TODAY, 180 + n * 3))),
        lastSupply:
          n % 9 === 0
            ? null
            : `${longDate(lastOn)}${gap === 0 ? "" : gap < 0 ? `, ${R.askedBefore(-gap)}` : `, ${R.askedAfter(gap)}`}`,
        timing: {
          early: early ? R.early(longDate(addDays(DEMO_TODAY, 3 + i))) : null,
          late,
        },
        collectAt: point.name,
        collector: n % 3 === 0 ? collector(n) : R.self,
        heldUntil:
          tab === "prepared"
            ? addDays(DEMO_TODAY, 1 + (i % 6))
            : tab === "not_collected"
              ? addDays(DEMO_TODAY, -1 - i)
              : tab === "collected"
                ? addDays(DEMO_TODAY, 4)
                : null,
        channel: (["app", "window", "phone"] as const)[n % 3]!,
        note: NOTES[n % NOTES.length] ?? null,
        requestedAt: `${addDays(DEMO_TODAY, -(n % 4))}T0${n % 9}:15:00.000Z`,
        products: [
          { id: `demo-product-${n}-a`, name: `${medicine} (pack of 28)` },
          { id: `demo-product-${n}-b`, name: `${medicine} (loose)` },
        ],
      });
    }
  }
  return rows;
}

/** One patient's Repeat medicines: every status sentence and every request state. */
export function demoPatientRefills(): PatientRefills {
  const h = "demo-hospital";
  const r = (
    i: number,
    words: string,
    o: Partial<Pick<PatientRepeat, "allowed" | "canAsk" | "canAskClinic" | "request">> = {},
  ): PatientRepeat => ({
    prescriptionId: uuid(5, i),
    hospitalId: h,
    medicine: DEMO_MEDICINES[i % DEMO_MEDICINES.length]!,
    words,
    allowed: null,
    canAsk: false,
    canAskClinic: false,
    request: null,
    ...o,
  });
  const allowed = (n: number, i: number) =>
    NETWORK_B.patientAllowed(
      n,
      longDate(addDays(DEMO_TODAY, 120 + i * 10)),
      longDate(addDays(DEMO_TODAY, 90 + i * 10)),
    );
  const due = (d: number) => NETWORK_B.patientDue(longDate(addDays(DEMO_TODAY, d)));
  const P = R.patient;
  return {
    repeats: [
      r(0, NETWORK_B.patientCanAsk, { allowed: allowed(3, 0), canAsk: true }),
      r(1, NETWORK_B.patientCanAsk, { allowed: allowed(1, 1), canAsk: true }),
      r(2, due(2), { allowed: allowed(2, 2), canAsk: true }),
      r(3, due(19), { allowed: allowed(4, 3) }),
      r(4, NETWORK_B.patientCanAsk, { allowed: allowed(2, 4), request: P.sent }),
      r(5, NETWORK_B.patientCanAsk, {
        allowed: allowed(1, 5),
        request: NETWORK_B.patientReady(DEMO_POINTS[1].name, longDate(addDays(DEMO_TODAY, 5))),
      }),
      r(6, NETWORK_B.patientRenew, { request: P.toClinic }),
      r(7, NETWORK_B.patientRenew, { canAskClinic: true }),
      r(8, NETWORK_B.patientRenew, { canAskClinic: true, request: P.released }),
      r(9, NETWORK_B.patientNever),
      r(10, due(0)),
      r(11, NETWORK_B.patientCanAsk, { allowed: allowed(5, 11), canAsk: true }),
    ],
    points: { [h]: DEMO_POINTS.map((p) => ({ id: p.id, name: p.name })) },
    collectors: [1, 2].map((n) => ({
      id: uuid(6, n),
      name: `Collector ${String(n).padStart(2, "0")}`,
      relationship: RELATIONS[n]!,
    })),
  };
}

/** The prescriber's list: every reason, with and without a visit, notes and review dates. */
export function demoRenewals(): RenewalRow[] {
  const reasons = Object.keys(NETWORK_UI.renewalReasons);
  return Array.from({ length: 21 }, (_, i) => {
    const reason = reasons[i % reasons.length]!;
    const authorised = reason === "no_authorisation" ? null : 2 + (i % 4);
    return {
      id: uuid(7, i + 1),
      patientUserId: uuid(1, i + 1),
      name: "",
      mrn: demoMrn(i + 1),
      medicine: DEMO_MEDICINES[(i * 3) % DEMO_MEDICINES.length]!,
      prescriptionId: uuid(4, i + 1),
      drugId: `demo_${i}`,
      conditionId: null,
      encounterId: i % 4 === 3 ? null : uuid(8, i + 1),
      reason,
      note: i % 3 === 0 ? "Patient says the clinic visit is next month" : null,
      lastSuppliedOn: i % 5 === 4 ? null : addDays(DEMO_TODAY, -(28 + i * 2)),
      used: authorised === null ? null : reason === "none_left" ? authorised : i % authorised,
      authorised,
      reviewBy: i % 2 ? addDays(DEMO_TODAY, 30 + i) : null,
      waitingSince: `${addDays(DEMO_TODAY, -(i % 6))}T07:${String(10 + i).padStart(2, "0")}:00.000Z`,
    };
  });
}

/** Demo decline reasons, worded as demo so they are never mistaken for the signed list. */
export const DEMO_DECLINE_REASONS = [
  { code: "demo_review", words: "Demo reason: needs a review visit first" },
  { code: "demo_changed", words: "Demo reason: the medicine is being changed" },
  { code: "demo_elsewhere", words: "Demo reason: now prescribed by another clinic" },
];
