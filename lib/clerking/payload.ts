import { z } from "zod";

import { ExamSchema } from "./exam/payload";

/**
 * Payload v2 at the trust boundary (saveNoteDraft): the shape of lib/clerking/answers `History`,
 * with bounds. Ids are short tokens; free text is bounded; nothing unknown passes.
 */

const id = z.string().max(80);
const yn = z.enum(["yes", "no"]);
const text = (n: number) => z.string().max(n);
const propValue = z.union([id, z.array(id).max(40), z.number().int().min(0).max(999)]);

const entry = {
  duration: z
    .object({
      value: z.number().int().min(1).max(999),
      unit: z.enum(["hours", "days", "weeks", "months", "years"]),
    })
    .optional(),
  props: z.record(id, z.union([propValue, text(500)])),
  flags: z.record(id, yn),
};

export const HistorySchema = z.object({
  complaints: z
    .array(
      z.object({ key: text(40), symptom: id.nullable(), text: text(200).optional(), ...entry }),
    )
    .max(20),
  story: text(10_000).optional(),
  alsoAsked: z.record(text(170), yn),
  ros: z.record(id, yn),
  rosDetail: z.record(id, z.object(entry)),
  past: z.object({
    conditions: z.record(
      id,
      z.object({ answer: yn, since: id.optional(), onProblemList: z.boolean().optional() }),
    ),
    operations: z
      .union([
        z.literal("none"),
        z
          .array(
            z.object({
              text: text(200),
              code: id.optional(),
              year: z.number().int().min(1900).max(2100).optional(),
              where: text(200).optional(),
            }),
          )
          .max(30),
      ])
      .optional(),
    transfusions: z
      .union([
        z.literal("none"),
        z.array(z.object({ when: id.optional(), reaction: id.optional() })).max(30),
      ])
      .optional(),
    allergiesConfirmed: z.boolean().optional(),
    medicinesNone: z.boolean().optional(),
  }),
  family: z.record(id, z.object({ answer: yn, relations: z.array(id).max(6).optional() })),
  social: z.object({
    tobacco: id.optional(),
    perDay: z.number().int().min(0).max(999).optional(),
    years: z.number().int().min(0).max(120).optional(),
    otherForms: z.array(id).max(10).optional(),
    quitWhen: id.optional(),
    alcohol: id.optional(),
    drinks: z.array(id).max(10).optional(),
    cage: z.record(id, yn).optional(),
    substances: z.array(id).max(10).optional(),
    living: id.optional(),
    activity: id.optional(),
    occupation: text(200).optional(),
    occupationCode: id.optional(),
    travel: id.optional(),
    travelDetail: text(500).optional(),
    diet: id.optional(),
  }),
  converted: z
    .object({
      table: text(80),
      reviewed: z.boolean().optional(),
      lines: z
        .array(
          z.object({
            token: id,
            label: text(200),
            answer: yn,
            from: z.enum(["complaint", "ros"]),
            result: z.enum([
              "converted",
              "choose",
              "text",
              "not_asked",
              "left_out",
              "wrong_sex",
              "proposed",
              "contradiction",
            ]),
            to: z.array(id).max(10).optional(),
            review: z.boolean().optional(),
            flag: id.optional(),
            ask: z.array(id).max(10).optional(),
          }),
        )
        .max(300),
      pending: z
        .array(
          z.object({
            id: text(20),
            token: id,
            label: text(200),
            answer: yn,
            from: z.enum(["complaint", "ros"]),
            kind: z.enum(["symptom", "property", "activity", "pregnancy", "lnmp"]),
            options: z.array(id).max(10),
            symptom: id.optional(),
            property: id.optional(),
            preset: z.record(id, propValue).optional(),
            text: z.boolean().optional(),
            complaintKey: text(40).optional(),
            propose: id.optional(),
            flag: id.optional(),
            restricted: z.boolean().optional(),
          }),
        )
        .max(100),
      text: z
        .array(z.object({ label: text(200), answer: yn, restricted: z.boolean().optional() }))
        .max(300),
    })
    .optional(),
});

const BadgeSnapshot = z.object({
  label: text(200),
  level: z.enum(["urgent", "caution"]),
  reasons: z.array(z.object({ reason: text(500), where: text(200) })).max(30),
  ruleIds: z.array(id).max(30),
  section: id,
  restricted: z.boolean(),
});

/* ─── Steps 08 and 09 (PROMPT-CLERKING-SUMMARY-IMPRESSION §8) ─────── */

const ref = z.string().max(160); // a typed finding ref, never a label
const uuid = z.string().uuid();
const stamp = { by: z.string().max(80), at: z.string().max(40) };

const SummarySnapshotSchema = z.object({
  items: z.array(z.object({ ref, text: text(500), included: z.boolean() })).max(600),
  syndrome: text(120),
  mode: z.enum(["composed", "words"]),
  words: text(20_000),
  text: text(20_000),
});

export const SummarySchema = z.object({
  mode: z.enum(["composed", "words"]),
  words: text(20_000).optional(),
  wordsBase: text(40).optional(),
  syndrome: text(120).optional(),
  include: z.record(ref, z.boolean()).optional(),
  review: z.object({ ...stamp, inputsHash: text(40), snapshot: SummarySnapshotSchema }).optional(),
  text: text(40_000).optional(),
});

const SignedDiagnosisSchema = z.object({
  logicalId: uuid,
  versionId: uuid,
  display: text(300),
  code: text(20).nullable(),
  rank: z.enum(["primary", "secondary"]),
  verification: id,
  restricted: z.boolean(),
  cosignPending: z.boolean(),
});

export const ImpressionSchema = z.object({
  order: z.array(uuid).max(60),
  /** By logical id; "term:<uuid>" or "typed:<words>" holds a suggestion's likelihood until the
   *  condition it creates arrives. */
  likelihood: z.record(z.string().max(160), z.enum(["likely", "possible", "unlikely"])),
  reasons: z.record(uuid, text(2_000)),
  evidence: z.record(uuid, z.record(ref, z.object({ w: z.enum(["for", "against"]), ...stamp }))),
  meta: z.record(
    uuid,
    z.object({
      onset: z.enum(["acute", "chronic", "acute_on_chronic", "recurrent"]).optional(),
      severity: text(120).optional(),
      reasoning: text(10_000).optional(),
    }),
  ),
  catalogueVersion: text(40),
  /** The diagnoses as they stood at signing (D-SI-20). */
  snapshot: z.array(SignedDiagnosisSchema).max(60).optional(),
  text: text(40_000).optional(),
});

/** One diagnosis as it stood when the note was signed (`impression.snapshot`, D-SI-20). */
export type SignedDiagnosis = z.infer<typeof SignedDiagnosisSchema>;
export type ImpressionContent = z.infer<typeof ImpressionSchema>;

/** The v2-only keys of NoteContent. */
export const ContentV2Keys = {
  schema: z.literal(2).optional(),
  catalogueVersion: text(40).optional(),
  history: HistorySchema.optional(),
  /** Step 07, the structured examination (PROMPT-CLERKING-EXAM-V2 §8). */
  exam: ExamSchema.optional(),
  edited: z.record(id, text(20_000)).optional(),
  flags: z.array(BadgeSnapshot).max(100).optional(),
  /** Step 08, the composed summary (PROMPT-CLERKING-SUMMARY-IMPRESSION §8). */
  summary: SummarySchema.optional(),
  /** Step 09, the reasoning around the visit's diagnoses (the diagnoses stay conditions rows). */
  impression: ImpressionSchema.optional(),
};
