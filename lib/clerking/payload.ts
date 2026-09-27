import { z } from "zod";

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
    substances: z.array(id).max(10).optional(),
    living: id.optional(),
    activity: id.optional(),
    occupation: text(200).optional(),
    travel: id.optional(),
    travelDetail: text(500).optional(),
    diet: id.optional(),
  }),
});

const BadgeSnapshot = z.object({
  label: text(200),
  level: z.enum(["urgent", "caution"]),
  reasons: z.array(z.object({ reason: text(500), where: text(200) })).max(30),
  ruleIds: z.array(id).max(30),
  section: id,
  restricted: z.boolean(),
});

/** The v2-only keys of NoteContent. */
export const ContentV2Keys = {
  schema: z.literal(2).optional(),
  catalogueVersion: text(40).optional(),
  history: HistorySchema.optional(),
  edited: z.record(id, text(20_000)).optional(),
  flags: z.array(BadgeSnapshot).max(100).optional(),
};
