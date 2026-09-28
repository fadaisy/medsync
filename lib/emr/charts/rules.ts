/**
 * Which monitoring charts the plan opens (ADR 0189, MONITORING-CHARTS.md §2). Pure: the server
 * runs it when the plan is placed, and the Plan shows the same answer before placing.
 *
 * A rule marked `proposed` is in the table but off until the CSO signs it (owner decision). Every
 * chart records the rule and the plan item(s) that opened it, in words.
 */

export const CHART_KINDS = [
  "observations",
  "temperature",
  "fluid_balance",
  "glucose",
  "mar",
] as const;
export type ChartKind = (typeof CHART_KINDS)[number];

export const CHART_NAME: Record<ChartKind, string> = {
  observations: "Observations and NEWS2",
  temperature: "Temperature",
  fluid_balance: "Fluid balance",
  glucose: "Capillary glucose",
  mar: "Medicine administration record",
};

export type ObsFrequency = "continuous" | "hourly" | "4h" | "12h";
export type ChartFrequency = ObsFrequency | "6h" | "daily" | "with_observations";

export const CHART_FREQUENCY_WORD: Record<ChartFrequency, string> = {
  continuous: "Continuous",
  hourly: "Hourly",
  "4h": "4-hourly",
  "6h": "6-hourly",
  "12h": "12-hourly",
  daily: "Daily",
  with_observations: "With each set of observations",
};

export interface ChartRule {
  id: string;
  chart: ChartKind;
  /** The condition, in words, as the rule table states it. */
  when: string;
  status: "on" | "proposed";
}

export const CHART_RULES: readonly ChartRule[] = [
  {
    id: "obs.frequency",
    chart: "observations",
    when: "Observation frequency set in the Plan",
    status: "on",
  },
  {
    id: "obs.news2_clerking",
    chart: "observations",
    when: "NEWS2 of 1 or more at clerking",
    status: "proposed",
  },
  {
    id: "temp.problem",
    chart: "temperature",
    when: "Hypothermia or fever on the problem list",
    status: "on",
  },
  { id: "temp.core", chart: "temperature", when: "Core temperature ordered", status: "on" },
  { id: "fluid.iv", chart: "fluid_balance", when: "An IV fluid prescription placed", status: "on" },
  {
    id: "fluid.problem",
    chart: "fluid_balance",
    when: "AKI, sepsis, heart failure or DKA on the problem list",
    status: "proposed",
  },
  {
    id: "glucose.monitoring",
    chart: "glucose",
    when: "Glucose monitoring frequency set",
    status: "on",
  },
  {
    id: "glucose.rx",
    chart: "glucose",
    when: "Insulin, a sulfonylurea or IV glucose prescribed",
    status: "on",
  },
  { id: "glucose.fluid", chart: "glucose", when: "Glucose 5% or 10% as a fluid", status: "on" },
  { id: "mar.rx", chart: "mar", when: "Any prescription placed", status: "on" },
];

/** Problem profiles the table names (by the diagnosis catalogue's ids). */
const TEMPERATURE_PROBLEMS = new Set([
  "dx.hypothermia_accidental",
  "dx.hypothermia_unexplained",
  "dx.fever_unexplained",
]);
const FLUID_PROBLEMS = new Set([
  "dx.aki",
  "dx.sepsis",
  "dx.septic_shock",
  "dx.heart_failure",
  "dx.heart_failure_acute",
  "dx.dka",
]);
const SULFONYLUREAS = new Set(["glibenclamide", "gliclazide"]);
const IV_GLUCOSE = new Set(["glucose_10", "glucose_50"]);
const GLUCOSE_FLUIDS = new Set(["glucose_5", "glucose_10"]);
/** Tests whose repeat frequency is "glucose monitoring". No capillary test is on the menu yet. */
const GLUCOSE_TESTS = new Set(["test.glucose_random"]);
/** No core-temperature order exists on the menu yet: the rule cannot fire until one does. */
const CORE_TEMPERATURE_TESTS = new Set<string>();

export type PlanChartItem =
  | {
      type: "prescription";
      id: string;
      drugId: string;
      classId: string;
      kind: "drug" | "fluid";
      label: string;
    }
  | { type: "order"; id: string; testKey: string; frequency: string | null; label: string };

export interface PlanForCharts {
  observationFrequency: ObsFrequency | null;
  problems: readonly { profileId: string | null; label: string }[];
  items: readonly PlanChartItem[];
  news2AtClerking: number | null;
}

export interface ChartOpening {
  kind: ChartKind;
  rule: string;
  /** What opened it, in words: "Hourly observations in the plan", "Ringer's lactate …". */
  label: string;
  items: { type: "prescription" | "order" | "plan" | "problem"; id: string | null }[];
  frequency: ChartFrequency | null;
}

const on = (id: string, rules: readonly ChartRule[]) =>
  rules.some((r) => r.id === id && r.status === "on");

/** The charts this plan opens, one per kind (the first rule that fires names it). */
export function chartsToOpen(
  plan: PlanForCharts,
  rules: readonly ChartRule[] = CHART_RULES,
): ChartOpening[] {
  const out = new Map<ChartKind, ChartOpening>();
  const open = (o: ChartOpening) => {
    if (!out.has(o.kind)) out.set(o.kind, o);
  };
  const rx = plan.items.filter((i) => i.type === "prescription");
  const orders = plan.items.filter((i) => i.type === "order");

  if (plan.observationFrequency && on("obs.frequency", rules))
    open({
      kind: "observations",
      rule: "obs.frequency",
      label: `${CHART_FREQUENCY_WORD[plan.observationFrequency]} observations in the plan`,
      items: [{ type: "plan", id: null }],
      frequency: plan.observationFrequency,
    });
  if (plan.news2AtClerking != null && plan.news2AtClerking >= 1 && on("obs.news2_clerking", rules))
    open({
      kind: "observations",
      rule: "obs.news2_clerking",
      label: `NEWS2 ${plan.news2AtClerking} at clerking`,
      items: [{ type: "plan", id: null }],
      frequency: null,
    });

  const tempProblem = plan.problems.find(
    (p) => p.profileId && TEMPERATURE_PROBLEMS.has(p.profileId),
  );
  if (tempProblem && on("temp.problem", rules))
    open({
      kind: "temperature",
      rule: "temp.problem",
      label: `${tempProblem.label} on the problem list`,
      items: [{ type: "problem", id: tempProblem.profileId }],
      frequency: "with_observations",
    });
  const core = orders.find((o) => o.type === "order" && CORE_TEMPERATURE_TESTS.has(o.testKey));
  if (core && on("temp.core", rules))
    open({
      kind: "temperature",
      rule: "temp.core",
      label: core.label,
      items: [{ type: "order", id: core.id }],
      frequency: "with_observations",
    });

  const fluids = rx.filter((i) => i.type === "prescription" && i.kind === "fluid");
  if (fluids.length && on("fluid.iv", rules))
    open({
      kind: "fluid_balance",
      rule: "fluid.iv",
      label: fluids.map((f) => f.label).join("; "),
      items: fluids.map((f) => ({ type: "prescription" as const, id: f.id })),
      frequency: "hourly",
    });
  const fluidProblem = plan.problems.find((p) => p.profileId && FLUID_PROBLEMS.has(p.profileId));
  if (fluidProblem && on("fluid.problem", rules))
    open({
      kind: "fluid_balance",
      rule: "fluid.problem",
      label: `${fluidProblem.label} on the problem list`,
      items: [{ type: "problem", id: fluidProblem.profileId }],
      frequency: "4h",
    });

  const monitoring = orders.find(
    (o) =>
      o.type === "order" && GLUCOSE_TESTS.has(o.testKey) && o.frequency && o.frequency !== "once",
  );
  if (monitoring && monitoring.type === "order" && on("glucose.monitoring", rules))
    open({
      kind: "glucose",
      rule: "glucose.monitoring",
      label: monitoring.label,
      items: [{ type: "order", id: monitoring.id }],
      frequency:
        monitoring.frequency === "daily" ||
        monitoring.frequency === "12h" ||
        monitoring.frequency === "6h"
          ? monitoring.frequency
          : null,
    });
  const glucoseRx = rx.find(
    (i) =>
      i.type === "prescription" &&
      i.kind === "drug" &&
      (i.classId === "insulin" || SULFONYLUREAS.has(i.drugId) || IV_GLUCOSE.has(i.drugId)),
  );
  if (glucoseRx && on("glucose.rx", rules))
    open({
      kind: "glucose",
      rule: "glucose.rx",
      label: glucoseRx.label,
      items: [{ type: "prescription", id: glucoseRx.id }],
      frequency: null,
    });
  const glucoseFluid = rx.find(
    (i) => i.type === "prescription" && i.kind === "fluid" && GLUCOSE_FLUIDS.has(i.drugId),
  );
  if (glucoseFluid && on("glucose.fluid", rules))
    open({
      kind: "glucose",
      rule: "glucose.fluid",
      label: glucoseFluid.label,
      items: [{ type: "prescription", id: glucoseFluid.id }],
      frequency: null,
    });

  if (rx.length && on("mar.rx", rules))
    open({
      kind: "mar",
      rule: "mar.rx",
      label: rx.length === 1 ? rx[0]!.label : `${rx.length} prescriptions`,
      items: rx.map((r) => ({ type: "prescription" as const, id: r.id })),
      frequency: null,
    });

  return CHART_KINDS.flatMap((k) => (out.has(k) ? [out.get(k)!] : []));
}
