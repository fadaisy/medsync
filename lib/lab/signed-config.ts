/**
 * The signed configuration (Lab Phase 2, gate-a-proposal P1; ADR 0252). One two-signature store holds every
 * decision scheme, flag basis, elevation, HIV algorithm, NCD field mapping, REF entry and the concept
 * addendum; each kind's payload is validated here. Pure. Nothing here carries a clinical number: payloads
 * arrive as drafts from the research file or a person, and only a signed version is ever in force.
 */
import { z } from "zod";

import { compareDecimal, isDecimal } from "@/lib/lab/catalogue";
import { RULE_IDS } from "@/lib/lab/qc-rules";
import { inForceAt } from "@/lib/lab/ranges";

const decimal = z.string().refine(isDecimal, "a decimal");
const days = z.number().int().min(0).nullable();
const source = z.string().trim().min(3).max(500);

/** Pregnancy rows carry their gestation span in days (no trimester boundary is written in code, Law 3). */
export const CONTEXTS = ["any", "not_pregnant", "pregnant"] as const;
export type SchemeContext = (typeof CONTEXTS)[number];
export const METHODS = ["lab", "bedside"] as const;
export type ResultMethod = (typeof METHODS)[number];

const Bound = z.object({
  category: z.string().min(1).max(40),
  from: decimal.nullable(),
  fromInclusive: z.boolean(),
  to: decimal.nullable(),
  toInclusive: z.boolean(),
});

/** DS-1: categories, the rows they apply to (sex, age in days per RR-4, context, methods), adjustments. */
export const SchemePayload = z.object({
  concept: z.string().min(3).max(80),
  unit: z.string().min(1).max(40),
  label: z.string().min(3).max(120),
  source,
  categories: z
    .array(
      z.object({
        code: z.string().min(1).max(40),
        label: z.string().min(1).max(80),
        abnormal: z.boolean(),
        /** The category a "not detected" result falls in (viral load's "undetectable"). */
        notDetected: z.boolean().optional(),
      }),
    )
    .min(1),
  rows: z
    .array(
      z.object({
        sex: z.enum(["female", "male", "any"]),
        ageFromDays: days,
        ageToDays: days,
        context: z.enum(CONTEXTS),
        gestationFromDays: days.optional(),
        gestationToDays: days.optional(),
        methods: z.array(z.enum(METHODS)).min(1),
        bounds: z.array(Bound).min(1),
        source,
      }),
    )
    .min(1),
  elevation: z
    .object({
      unit: z.string().min(1).max(40),
      table: z
        .array(z.object({ fromM: z.number().int(), toM: z.number().int(), amount: decimal }))
        .min(1),
      source,
    })
    .optional(),
});
export type SchemePayload = z.infer<typeof SchemePayload>;

export const PAYLOADS = {
  scheme: SchemePayload,
  flag_basis: z.object({ basis: z.enum(["reference", "scheme"]) }),
  elevation: z.object({ metres: z.number().int().min(-500).max(6000), source }),
  hiv_algorithm: z.object({
    assays: z
      .array(z.object({ step: z.number().int().min(1).max(3), kit: z.string().min(2).max(80) }))
      .min(2),
    rules: z
      .array(
        z.object({
          t1: z.enum(["reactive", "non_reactive"]),
          t2: z.enum(["reactive", "non_reactive"]).nullable(),
          t3: z.enum(["reactive", "non_reactive"]).nullable(),
          outcome: z.enum([
            "negative",
            "positive",
            "inconclusive",
            "inconclusive_refer",
            "discrepant",
          ]),
        }),
      )
      .min(1),
    retestDays: z.number().int().min(1).max(365),
    circular: source,
  }),
  ncd_mapping: z.object({
    concept: z.string().min(3).max(80),
    unit: z.string().min(1).max(40),
    methods: z.array(z.enum(METHODS)).min(1),
    windowDays: z.number().int().min(1).max(3650),
  }),
  ref: z.object({ constants: z.record(z.string(), decimal), source }),
  addendum: z.object({ hash: z.string().regex(/^[0-9a-f]{64}$/) }),
  /** Lab Phase 3 LA-1, LA-2 (GATE A §3.1): key = the stock item id. Every number is the lead's, with its source. */
  acceptance_plan: z
    .object({
      method: z.enum(["qc_pass", "lot_comparison", "certificate", "none"]),
      triggers: z.array(z.enum(["new_lot", "new_shipment", "new_formulation"])),
      comparison: z
        .object({
          samples: z.number().int().min(1).max(40),
          spread: z.string().trim().min(3).max(300),
          criterion: z
            .object({
              absolute: z.number().positive().optional(),
              percent: z.number().positive().optional(),
              combine: z.enum(["larger", "both"]),
            })
            .refine((c) => c.absolute !== undefined || c.percent !== undefined, "a criterion"),
          qcAlso: z.boolean(),
        })
        .optional(),
      certificateAllowed: z.boolean(),
      source,
    })
    .refine((p) => p.method !== "lot_comparison" || !!p.comparison, "the comparison"),
  /** Lab Phase 3 QQ-2 (GATE A §3.1): key `{deviceId}:{conceptId}`. Targets and SDs are the maker's or the lab's. */
  qc_plan: z.object({
    unit: z.string().trim().min(1).max(40),
    levels: z
      .array(
        z.object({
          level: z.number().int().min(1).max(6),
          label: z.string().trim().min(1).max(60),
          controlItemId: z.uuid(),
        }),
      )
      .min(1),
    frequency: z.object({
      kind: z.enum(["each_day_before_patients", "per_run", "per_n_samples"]),
      n: z.number().int().positive().optional(),
    }),
    rejectRules: z.array(z.enum(RULE_IDS)).min(1),
    warnRules: z.array(z.enum(RULE_IDS)),
    tenXAcrossLevels: z.boolean(),
    holdWhenNotRun: z.boolean(),
    targets: z.array(
      z.object({
        level: z.number().int().min(1).max(6),
        controlLotId: z.uuid(),
        mean: z.number().finite(),
        sd: z.number().positive(),
        source: z.enum(["maker_provisional", "lab"]),
        runs: z.number().int().positive().optional(),
        from: z.string().optional(),
        to: z.string().optional(),
      }),
    ),
    source,
  }),
  /** QQ-3, D-LAB3-04: key `hospital`. The minimum runs and days before the lab's own target. */
  qc_policy: z.object({
    minRunsForTarget: z.number().int().min(2).max(500),
    minDaysForTarget: z.number().int().min(1).max(365),
    sources: z.array(source).min(1),
  }),
  /** KQ-1, KQ-5 (GATE A §3.1): key = the kit or stain stock item id. Signed by the lead alone. */
  kit_qc_rule: z.object({
    triggers: z
      .array(
        z
          .object({
            kind: z.enum([
              "each_day_of_use",
              "new_lot",
              "new_shipment",
              "new_operator",
              "schedule",
              "after_maintenance",
            ]),
            weekday: z.number().int().min(1).max(7).optional(),
          })
          .refine((t) => t.kind !== "schedule" || t.weekday !== undefined, "a weekday"),
      )
      .min(1),
    controls: z
      .array(
        z.object({
          name: z.string().trim().min(1).max(80),
          expected: z.union([
            z.object({ code: z.string().trim().min(1).max(60) }),
            z.object({ passCriteria: z.array(z.string().trim().min(2).max(200)).min(1) }),
          ]),
        }),
      )
      .min(1),
    requiredBeforeUse: z.boolean(),
    hmisIqc: z.boolean(),
    source,
  }),
  /** BQ-1 (GATE A §3.1, P9): key = the bedside test code. The ranges come from each strip lot, never from here. */
  device_qc_rule: z.object({
    triggers: z
      .array(z.enum(["each_day_of_use", "new_strip_lot", "new_control_vial", "after_incident"]))
      .min(1, "Tick when a check is due."),
    levels: z.array(z.string().trim().min(1).max(40)).min(1, "Name the control levels."),
    requiredBeforeUse: z.boolean(),
    source,
  }),
  /** BQ-4, D-LAB3-16 (GATE A §3.1): key = the bedside test code. Validity and grace are the lead's. */
  competency_validity: z.object({
    methods: z
      .array(z.enum(["training", "observed_test", "known_value_sample"]))
      .min(1, "Tick the assessment methods."),
    validDays: z.number().int().min(1).max(3650),
    graceDays: z.number().int().min(0).max(365),
    source,
  }),
} as const;
/** E-LAB3-12: kinds the laboratory lead signs alone (in force on the lead's signature). */
export const LEAD_ONLY_KINDS: readonly string[] = [
  "kit_qc_rule",
  "acceptance_plan",
  "device_qc_rule",
  "competency_validity",
  "register_config",
];
export type ConfigKind = keyof typeof PAYLOADS;
export type Payload<K extends ConfigKind> = z.infer<(typeof PAYLOADS)[K]>;

export interface SignedConfig<K extends ConfigKind = ConfigKind> {
  id: string;
  hospitalId: string | null;
  kind: K;
  key: string;
  version: number;
  status: "draft" | "signed" | "superseded";
  payload: Payload<K>;
  inForceFrom: Date | null;
  supersededAt: Date | null;
}

/** The version in force at `at` for this kind and key (a draft never is; RR-2's rule). */
export function inForce<K extends ConfigKind>(
  configs: readonly SignedConfig[],
  kind: K,
  key: string,
  at: Date,
): SignedConfig<K> | null {
  const hit = configs
    .filter((c) => c.kind === kind && c.key === key && inForceAt(c, at))
    .sort((a, b) => b.version - a.version)[0];
  return (hit as SignedConfig<K> | undefined) ?? null;
}

/** What makes a draft unsignable: a payload that does not parse, and for schemes, rows whose categories do
 *  not exist or whose bounds overlap or leave a gap (A7: no value may fall in no category). */
export function configSignErrors(kind: ConfigKind, payload: unknown): string[] {
  const p = PAYLOADS[kind].safeParse(payload);
  if (!p.success) return p.error.issues.map((i) => `payload:${i.path.join(".")}`);
  if (kind !== "scheme") return [];
  const s = p.data as SchemePayload;
  const codes = new Set(s.categories.map((c) => c.code));
  const errors: string[] = [];
  s.rows.forEach((r, i) => {
    for (const b of r.bounds) if (!codes.has(b.category)) errors.push(`row_${i}:unknown_category`);
    if (!coversLine(r.bounds)) errors.push(`row_${i}:gap_or_overlap`);
  });
  return errors;
}

/** The bounds, sorted, must tile the number line: open below, open above, each meeting the next exactly
 *  with exactly one side inclusive. */
function coversLine(bounds: readonly z.infer<typeof Bound>[]): boolean {
  const sorted = [...bounds].sort((a, b) =>
    a.from === null ? -1 : b.from === null ? 1 : compareDecimal(a.from, b.from),
  );
  if (sorted[0]!.from !== null || sorted.at(-1)!.to !== null) return false;
  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1]!;
    const cur = sorted[i]!;
    if (prev.to === null || cur.from === null || compareDecimal(prev.to, cur.from) !== 0)
      return false;
    if (prev.toInclusive === cur.fromInclusive) return false;
  }
  return true;
}
