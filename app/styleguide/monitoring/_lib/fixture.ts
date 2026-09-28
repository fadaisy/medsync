import type {
  ChartRowIn,
  FluidEntryRowIn,
  MarRowIn,
  MonitoringInput,
  PrescriptionRowIn,
  VitalReading,
} from "@/lib/emr/charts/build";
import type { MonitoringPayload } from "@/lib/emr/charts/payload";

import { buildMonitoringPayload } from "@/lib/emr/charts/build";

/**
 * FIXTURE, not a patient: fictional record rows for one night on the ward, shaped by the real
 * builder so the screenshots show what the chart would draw. Kampala time (UTC+3). The plan was
 * placed at 23:40; the clerking set at 23:00 scored NEWS2 5 (an ink dot); nursing sets follow.
 * Weight 58 kg, so the urine reference line is 29 mL/h. Ringer's lactate 1000 mL over 8 h is
 * 125 mL/h, 42 drops/min on a 20-drop set. 03:00 has no entry (a gap); at 02:00 urine was not
 * measured. Drug doses are left out on purpose: no dose appears that is not signed.
 */

/** "2026-09-28 07:20" in Kampala → a Date. `day` 27 is the evening before the chart day. */
const at = (hhmm: string, day = 28) => new Date(`2026-09-${day}T${hhmm}:00+03:00`);

export const FIXTURE_NOW = at("07:20");
const PLAN = at("23:40", 27);
const NO_DOSE = "(fixture, dose not shown)";

const RL = "00000000-0000-4000-8000-00000000f001";
const CEFTRIAXONE = "00000000-0000-4000-8000-00000000f002";
const PARACETAMOL = "00000000-0000-4000-8000-00000000f003";
const INSULIN = "00000000-0000-4000-8000-00000000f004";
const OMEPRAZOLE = "00000000-0000-4000-8000-00000000f005";

const chart = (
  id: string,
  kind: string,
  rule: string,
  label: string,
  frequency: string | null,
  measureUrine = false,
): ChartRowIn => ({
  id: `00000000-0000-4000-8000-0000000c00${id}`,
  kind,
  openedBy: { rule, label, items: [] },
  frequency,
  measureUrine,
  openedAt: PLAN,
  closedAt: null,
});

const CHARTS: ChartRowIn[] = [
  chart("01", "observations", "obs.frequency", "Hourly observations in the plan", "hourly"),
  chart(
    "02",
    "temperature",
    "temp.problem",
    "Fever, cause not yet known on the problem list",
    "with_observations",
  ),
  chart("03", "fluid_balance", "fluid.iv", "Ringer's lactate 1000 mL over 8 h", "hourly", true),
  chart("04", "glucose", "glucose.monitoring", "Random glucose, 6-hourly", "6h"),
  chart("05", "mar", "mar.rx", "5 prescriptions", null),
];

const rx = (
  id: string,
  drugName: string,
  route: string,
  frequency: string | null,
  extra: Partial<PrescriptionRowIn> = {},
): PrescriptionRowIn => ({
  id,
  drugName,
  dose: NO_DOSE,
  route,
  frequency,
  prn: false,
  start: "now",
  state: "active",
  kind: "drug",
  fluidPurpose: null,
  volumeMl: null,
  overMinutes: null,
  givingSetDropsPerMl: null,
  createdAt: PLAN,
  ...extra,
});

const PRESCRIPTIONS: PrescriptionRowIn[] = [
  rx(RL, "Ringer's lactate", "iv", null, {
    dose: "1000 mL",
    kind: "fluid",
    fluidPurpose: "maintenance",
    volumeMl: "1000",
    overMinutes: 480,
    givingSetDropsPerMl: 20,
  }),
  rx(CEFTRIAXONE, "Ceftriaxone", "iv", "daily"),
  rx(PARACETAMOL, "Paracetamol", "oral", "6h"),
  rx(INSULIN, "Soluble insulin", "sc", "12h"),
  rx(OMEPRAZOLE, "Omeprazole", "oral", "daily"),
];

const mar = (
  id: string,
  prescriptionId: string,
  administeredAt: Date,
  extra: Partial<MarRowIn> = {},
): MarRowIn => ({
  id: `00000000-0000-4000-8000-0000000a00${id}`,
  prescriptionId,
  state: "administered",
  withheldReason: null,
  scheduledFor: null,
  administeredAt,
  isHighAlert: false,
  cosignedByUserId: null,
  ...extra,
});

const MAR: MarRowIn[] = [
  mar("01", RL, at("23:50", 27)),
  mar("02", CEFTRIAXONE, at("23:55", 27)),
  mar("03", PARACETAMOL, at("23:58", 27)),
  mar("04", PARACETAMOL, at("06:05"), {
    state: "refused",
    withheldReason: "declined when woken",
    scheduledFor: at("05:58"),
  }),
  mar("05", INSULIN, at("00:30"), { isHighAlert: true }),
];

let n = 0;
const entry = (
  hhmm: string,
  kind: FluidEntryRowIn["kind"],
  volumeMl: number | null,
  extra: Partial<FluidEntryRowIn> = {},
): FluidEntryRowIn => ({
  id: `00000000-0000-4000-8000-0000000e${String(++n).padStart(4, "0")}`,
  kind,
  routeDetail: null,
  volumeMl: volumeMl === null ? null : String(volumeMl),
  measured: volumeMl !== null,
  prescriptionId: kind === "iv_in" ? RL : null,
  effectiveAt: at(hhmm),
  recordedAt: at(hhmm),
  state: "recorded",
  replacesId: null,
  ...extra,
});

const MISREAD = entry("01:55", "urine_out", 53);
const DOUBLE = entry("02:50", "iv_in", 125);
const FLUIDS: FluidEntryRowIn[] = [
  entry("00:50", "iv_in", 125),
  entry("00:55", "urine_out", 40),
  entry("01:50", "iv_in", 125),
  MISREAD,
  // The 01:55 urine was misread: corrected to 35 mL; the first entry is kept, not counted.
  entry("01:55", "urine_out", 35, { replacesId: MISREAD.id, recordedAt: at("02:10") }),
  entry("02:50", "iv_in", 125),
  DOUBLE,
  // Recorded twice: withdrawn as entered in error.
  entry("02:50", "iv_in", null, {
    state: "entered_in_error",
    replacesId: DOUBLE.id,
    measured: true,
    recordedAt: at("02:55"),
  }),
  entry("02:55", "urine_out", null),
  // 03:00 to 04:00: no entry.
  entry("04:50", "iv_in", 125),
  entry("04:20", "oral_in", 100, { routeDetail: "oral" }),
  entry("04:55", "urine_out", 30),
  entry("05:50", "iv_in", 125),
  entry("05:55", "urine_out", 25),
  entry("06:50", "iv_in", 125),
  entry("06:55", "urine_out", 32),
  entry("06:30", "other_out", 150, { routeDetail: "vomit" }),
];

const set = (
  key: string,
  hhmm: string,
  v: { rr?: number; spo2?: number; sbp?: number; pulse?: number; temp?: number; site?: string },
  opts: { day?: number; acvpu?: "A" | null; oxygen?: "air" | null } = {},
): VitalReading[] => {
  const when = at(hhmm, opts.day);
  const acvpu = opts.acvpu === undefined ? "A" : opts.acvpu;
  const oxygen = opts.oxygen === undefined ? "air" : opts.oxygen;
  const line = (k: VitalReading["key"], value: number | undefined): VitalReading[] =>
    value === undefined
      ? []
      : [
          {
            id: `${key}:${k}`,
            key: k,
            value,
            acvpu,
            at: when,
            setKey: key,
            site: k === "temp" ? (v.site ?? null) : null,
            oxygen: k === "spo2" ? oxygen : null,
            spo2Scale: "scale1",
          },
        ];
  return [
    ...line("rr", v.rr),
    ...line("spo2", v.spo2),
    ...line("sbp", v.sbp),
    ...line("pulse", v.pulse),
    ...line("temp", v.temp),
    ...(acvpu
      ? [{ id: `${key}:acvpu`, key: "acvpu" as const, value: null, acvpu, at: when, setKey: key }]
      : []),
  ];
};
const glucose = (key: string, hhmm: string, value: number, day?: number): VitalReading => ({
  id: key,
  key: "glucose",
  value,
  at: at(hhmm, day),
  setKey: key,
});

const VITALS: VitalReading[] = [
  // Clerking, before the plan: NEWS2 5 (RR 22 → 2, SBP 108 → 1, pulse 104 → 1, 38.4 °C → 1).
  ...set(
    "clerking",
    "23:00",
    { rr: 22, spo2: 96, sbp: 108, pulse: 104, temp: 38.4, site: "oral" },
    { day: 27 },
  ),
  glucose("g-clerking", "23:10", 7.2, 27),
  ...set("n1", "00:05", { rr: 20, spo2: 95, sbp: 110, pulse: 98, temp: 38.2, site: "axillary" }),
  ...set("n2", "02:00", { rr: 20, spo2: 96, sbp: 110, pulse: 96, temp: 38.1, site: "axillary" }),
  ...set("n3", "04:00", { rr: 18, spo2: 96, sbp: 114, pulse: 92, temp: 38.6, site: "rectal" }),
  glucose("g-n1", "05:00", 5.4),
  ...set("n4", "06:00", { rr: 18, spo2: 97, sbp: 118, pulse: 92, temp: 37.6, site: "axillary" }),
  // A partial set (no air or oxygen, no consciousness): drawn on the strips, not scored.
  ...set("n5", "07:00", { rr: 16, spo2: 97 }, { acvpu: null, oxygen: null }),
  glucose("g-n2", "07:10", 4.8),
];

export function fixtureInput(variant: "full" | "noweight" | "empty" = "full"): MonitoringInput {
  const empty = variant === "empty";
  return {
    charts: CHARTS,
    fluidEntries: empty ? [] : FLUIDS,
    prescriptions: PRESCRIPTIONS,
    mar: empty ? [] : MAR,
    vitals: empty ? [] : VITALS,
    weight: variant === "noweight" ? null : { kg: 58, at: at("23:10", 27), source: "clerking" },
    now: FIXTURE_NOW,
  };
}

export function monitoringFixture(
  variant: "full" | "noweight" | "empty" = "full",
): MonitoringPayload {
  return buildMonitoringPayload(fixtureInput(variant));
}
