import { z } from "zod";

/**
 * The examination section of the v2 draft (PROMPT-CLERKING-EXAM-V2 §8), at the trust boundary.
 * Ids only, bounded; an unrecorded item is an absent key (never stored as normal, E2).
 */

const id = z.string().max(80);
const text = (n: number) => z.string().max(n);
const attrValue = z.union([id, z.array(id).max(40), z.number().min(-1000).max(100_000)]);

export const NotExaminedSchema = z.object({
  id,
  detail: text(300).optional(),
  equipment: text(80).optional(),
});
export type NotExamined = z.infer<typeof NotExaminedSchema>;

export const EntrySchema = z.object({
  state: z.enum(["negative", "positive", "not_examined"]),
  choice: id.optional(),
  attrs: z.record(id, attrValue).optional(),
  reason: NotExaminedSchema.optional(),
});
export type ExamEntry = z.infer<typeof EntrySchema>;
export type AttrValue = z.infer<typeof attrValue>;

const side = <T extends z.ZodTypeAny>(v: T) => z.object({ R: v.optional(), L: v.optional() });
const mrc = z.enum(["0", "1", "2", "3", "4-", "4", "4+", "5"]);
export type MrcGrade = z.infer<typeof mrc>;

export const ConsciousnessSchema = z.object({
  method: z.enum(["gcs", "acvpu"]),
  E: z.number().int().min(1).max(4).optional(),
  V: z.number().int().min(1).max(5).optional(),
  M: z.number().int().min(1).max(6).optional(),
  /** Not testable, with its reason (never scored as 1). */
  nt: z
    .object({ E: text(120).optional(), V: text(120).optional(), M: text(120).optional() })
    .optional(),
  baseline: z.boolean().optional(),
  orientation: z
    .object({
      time: z.enum(["yes", "no"]).optional(),
      place: z.enum(["yes", "no"]).optional(),
      person: z.enum(["yes", "no"]).optional(),
    })
    .optional(),
  acvpu: z.enum(["A", "C", "V", "P", "U"]).optional(),
});
export type Consciousness = z.infer<typeof ConsciousnessSchema>;

export const BlocksSchema = z.object({
  consciousness: ConsciousnessSchema.optional(),
  amts: z.record(id, z.enum(["correct", "incorrect"])).optional(),
  power: z.record(text(60), side(mrc)).optional(),
  reflexes: z.record(text(60), side(z.number().int().min(0).max(4))).optional(),
  plantars: side(z.enum(["flexor", "extensor", "equivocal", "no_response"])).optional(),
  pulses: z.record(text(60), side(z.enum(["present", "reduced", "absent", "bounding"]))).optional(),
});
export type Blocks = z.infer<typeof BlocksSchema>;

const num = z.number().min(0).max(400);
export const PanelsSchema = z.object({
  postural: z
    .object({
      lying: z.object({ sbp: num, dbp: num }).partial().optional(),
      standing_1min: z.object({ sbp: num, dbp: num }).partial().optional(),
      standing_3min: z.object({ sbp: num, dbp: num }).partial().optional(),
      symptoms: z.enum(["yes", "no"]).optional(),
    })
    .optional(),
  bothArms: z
    .object({
      right: z.object({ sbp: num, dbp: num }).partial().optional(),
      left: z.object({ sbp: num, dbp: num }).partial().optional(),
      repeated: z.boolean().optional(),
    })
    .optional(),
  peakFlow: z
    .object({
      best: z.number().min(0).max(1000).optional(),
      reference: z.number().min(0).max(1000).optional(),
      referenceKind: z.enum(["personal_best", "predicted"]).optional(),
    })
    .optional(),
  asthmaConfirmed: z.boolean().optional(),
  /** ROSIER: syncope and seizure confirmed for this episode, and each +1 sign confirmed as new. */
  rosier: z
    .object({
      syncope: z.enum(["yes", "no"]).optional(),
      seizure: z.enum(["yes", "no"]).optional(),
      newSigns: z.array(id).max(10).optional(),
    })
    .optional(),
  westHaven: z.enum(["I", "II", "III", "IV"]).optional(),
  /** The ketone panel (EC-7): either field may be recorded; never required. */
  ketones: z
    .object({
      blood: z.number().min(0).max(12).optional(),
      urine: z.enum(["neg", "trace", "1plus", "2plus", "3plus"]).optional(),
    })
    .optional(),
});
export type Panels = z.infer<typeof PanelsSchema>;

/** The unsaved "Now" column: what was typed, kept across reloads until it is saved as a set. */
export const VitalsDraftSchema = z.object({
  bp: text(12).optional(),
  arm: z.enum(["right", "left"]).optional(),
  position: z.enum(["lying", "sitting", "standing"]).optional(),
  cuff: z.enum(["standard_adult", "large_adult", "small_adult_or_child"]).optional(),
  pulse: text(8).optional(),
  rhythm: z.enum(["regular", "regularly_irregular", "irregularly_irregular"]).optional(),
  apex: text(8).optional(),
  rr: text(8).optional(),
  spo2: text(8).optional(),
  scale2: z.boolean().optional(),
  temp: text(8).optional(),
  site: z.enum(["axillary", "oral", "tympanic", "rectal", "temporal"]).optional(),
  glucose: text(8).optional(),
  glucoseUnit: z.enum(["mmol/L", "mg/dL"]).optional(),
  /** "HI" or "LO" in `glucose` is a meter reading outside its range (EC-6). */
  glucoseContext: z
    .enum(["random", "fasting", "two_hours_after_food", "two_hours_after_glucose"])
    .optional(),
  weight: text(8).optional(),
  weightMethod: z.enum(["measured", "estimated", "stated"]).optional(),
  height: text(8).optional(),
  heightMethod: z.enum(["measured", "estimated", "stated"]).optional(),
  waist: text(8).optional(),
  /** Implausible values the clinician confirmed ("keep"). */
  confirmed: z.array(id).max(20).optional(),
});
export type VitalsDraft = z.infer<typeof VitalsDraftSchema>;

export const GateSchema = z.object({
  reason: text(300),
  consent: z.enum(["verbal", "best_interests"]),
  chaperone: z.enum(["present", "declined", "not_offered_emergency"]),
  name: text(120).optional(),
  role: text(80).optional(),
  at: text(40),
  by: text(80),
});
export type Gate = z.infer<typeof GateSchema>;

export const ExamSchema = z.object({
  catalogueVersion: text(40),
  entries: z.record(id, EntrySchema),
  systems: z.record(id, z.object({ notExamined: NotExaminedSchema.optional() })).optional(),
  blocks: BlocksSchema,
  panels: PanelsSchema.optional(),
  vitalsDraft: VitalsDraftSchema.optional(),
  /** The last set saved from this draft (ISO time), so the card reads "Saved at 16:10". */
  vitalsSavedAt: text(40).optional(),
  /** Which fields that set held (vs.* ids), so a suggestion to measure them reads as done. */
  vitalsSavedFields: z.array(id).max(20).optional(),
  gate: GateSchema.optional(),
});
export type ExamDraft = z.infer<typeof ExamSchema>;

export const emptyExam = (catalogueVersion: string): ExamDraft => ({
  catalogueVersion,
  entries: {},
  blocks: {},
});
