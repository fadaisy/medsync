/**
 * The command path (§9): every capture write is a command with a client-generated UUID, a type, a
 * payload and a client timestamp. Zod at the server boundary; the server applies each command once.
 * Client-safe (no server imports): the offline outbox builds these.
 */
import { z } from "zod";

import { codesOf, KNOWN_CVD } from "../standard/code-lists";

const uuid = z.string().uuid();
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const bp = z.tuple([z.number().int().min(0).max(400), z.number().int().min(0).max(300)]);
const nonNeg = z.number().finite().min(0);
const text = (max = 120) => z.string().trim().max(max);

export const identitySchema = z.object({
  givenName: text(60).min(1),
  familyName: text(60).min(1),
  sex: z.enum(["female", "male"]),
  dateOfBirth: isoDate.nullish(),
  ageYears: z.number().int().min(0).max(130).nullish(),
  phone1: text(20).nullish(),
  phone2: text(20).nullish(),
  nokName: text(80).nullish(),
  nokPhone: text(20).nullish(),
  hospitalNumber: text(40).nullish(),
  nationalId: text(20).nullish(),
  district: z.object({ code: text(20), name: text(60) }).nullish(),
  subcounty: z.object({ code: text(20), name: text(60) }).nullish(),
  parish: text(60).nullish(),
  village: text(80).nullish(),
});
export type IdentityInput = z.infer<typeof identitySchema>;

export const registrationInput = z.object({
  registrationId: uuid,
  condition: z.string().min(1).max(60),
  subtype: z.string().min(1).max(60),
  diagnosisYear: z.number().int().min(1900).max(2100),
  diagnosisMonth: z.number().int().min(1).max(12).nullish(),
  basisOfDiagnosis: z.string().min(1).max(60),
  whereFirstDiagnosed: z.enum(["this_facility", "other_facility", "unknown"]).nullish(),
  referralSource: z
    .enum(["self", "outpatients", "ward", "other_facility", "community_screening", "other"])
    .nullish(),
  /** Legacy back-entry and the demo loader only; otherwise the server uses today. */
  registrationDate: isoDate.nullish(),
});

export const baselineSchema = z.object({
  heightCm: nonNeg.nullish(),
  tobacco: z.enum(["never", "former", "current"]).nullish(),
  alcohol: z.enum(["none", "occasional", "regular"]).nullish(),
  knownCvd: z.array(z.enum(codesOf(KNOWN_CVD))).default([]),
  knownKidneyDisease: z.boolean().nullish(),
  familyHistoryDiabetes: z.boolean().nullish(),
  familyHistoryHypertension: z.boolean().nullish(),
});

const glucoseInput = z.object({
  value: nonNeg,
  unit: z.enum(["mmol", "mgdl"]).default("mmol"),
  type: z.enum(["fasting", "random", "post_meal"]),
  method: z.enum(["capillary", "laboratory"]).default("capillary"),
});
const hba1cInput = z.object({ percent: nonNeg, resultDate: isoDate });
const conditionFields = z.object({
  registrationId: uuid,
  recordedControl: z
    .enum(["controlled", "partly_controlled", "not_controlled", "not_assessed"])
    .nullish(),
  observations: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).default({}),
});

export const nursePart = z.object({
  weightKg: nonNeg.nullish(),
  bp: z.array(bp).max(3).default([]),
  glucose: glucoseInput.nullish(),
});
export const clinicianPart = z.object({
  medicines: z
    .object({
      codes: z.array(z.string().min(1).max(60)).max(30),
      otherText: text(200).nullish(),
      confirmedUnchanged: z.boolean().default(false),
    })
    .nullish(),
  missedDoses: z.enum(["none", "1_to_2_days", "3_or_more_days", "not_asked"]).nullish(),
  hypoglycaemia: z.enum(["none", "mild_self_treated", "severe_needed_help", "not_asked"]).nullish(),
  medicinesObtained: z.enum(["full", "partial", "none", "not_applicable"]).nullish(),
  notObtainedReason: z.enum(["stock_out", "cost", "other"]).nullish(),
  hba1c: hba1cInput.nullish(),
  conditionFields: z.array(conditionFields).default([]),
  nextAppointmentDate: isoDate.nullish(),
  disposition: z.enum(["transfer_out", "discharged_to_primary_care"]).nullish(),
  confirmations: z.array(z.string()).default([]),
});

const reviewData = z.discriminatedUnion("component", [
  z.object({
    component: z.literal("kidney"),
    creatinine: nonNeg.nullish(),
    creatinineUnit: z.enum(["umol", "mgdl"]).default("umol"),
    urineTest: z.enum(["acr", "dipstick"]).nullish(),
    acrMgMmol: nonNeg.nullish(),
    dipstick: z.enum(["negative", "trace", "1+", "2+", "3+"]).nullish(),
  }),
  z.object({
    component: z.literal("eyes"),
    examined: z.boolean(),
    method: z.enum(["dilated_fundoscopy", "fundus_photograph", "other"]).nullish(),
    retinopathyGrade: z
      .enum([
        "no_apparent_retinopathy",
        "mild_npdr",
        "moderate_npdr",
        "severe_npdr",
        "proliferative",
        "ungradable",
      ])
      .nullish(),
    macularOedema: z.enum(["absent", "present", "not_assessed"]).nullish(),
    referred: z.boolean().nullish(),
  }),
  z.object({
    component: z.literal("feet"),
    lossOfProtectiveSensation: z.boolean(),
    absentPulses: z.boolean(),
    deformity: z.boolean(),
    currentUlcer: z.boolean(),
    previousUlcer: z.boolean(),
    amputation: z.enum(["none", "minor", "major"]),
  }),
  z.object({
    component: z.literal("lipids"),
    totalCholesterol: nonNeg.nullish(),
    ldl: nonNeg.nullish(),
  }),
  z.object({
    component: z.literal("other"),
    cvRiskCategory: z
      .enum(["lt_5", "5_to_lt_10", "10_to_lt_20", "20_to_lt_30", "gte_30", "not_assessed"])
      .nullish(),
    ecgDone: z.boolean().nullish(),
    lvh: z.enum(["yes", "no", "unknown"]).nullish(),
    tobacco: z.enum(["never", "former", "current"]).nullish(),
    alcohol: z.enum(["none", "occasional", "regular"]).nullish(),
  }),
]);
export type ReviewData = z.infer<typeof reviewData>;

export const COMMANDS = {
  "person.enrol": z.object({
    personId: uuid,
    searchToken: z.string().min(10),
    identity: identitySchema,
    registrations: z.array(registrationInput).min(1).max(10),
    baseline: baselineSchema.default({ knownCvd: [] }),
    privacy: z.object({ version: z.string().min(1), acknowledged: z.literal(true) }),
    smsAllowed: z.boolean(),
    callsAllowed: z.boolean(),
    isSynthetic: z.boolean(),
    registryNumber: z
      .string()
      .regex(/^DEMO-[A-Z0-9-]+$/)
      .nullish(),
    dismissedCandidates: z.array(uuid).default([]),
    confirmations: z.array(z.string()).default([]),
  }),
  "registration.add": registrationInput.extend({ personId: uuid }),
  "person.update": z.object({
    personId: uuid,
    reason: text(200).min(3),
    identity: identitySchema.partial().default({}),
    baseline: baselineSchema.partial().default({}),
    smsAllowed: z.boolean().nullish(),
    callsAllowed: z.boolean().nullish(),
    optOutSms: z.boolean().nullish(),
  }),
  "visit.arrive": z.object({
    visitId: uuid,
    personId: uuid,
    appointmentId: uuid.nullish(),
    visitType: z.enum(["scheduled", "unscheduled", "refill_only", "remote"]),
  }),
  "visit.save_nurse": nursePart.extend({
    visitId: uuid,
    personId: uuid,
    confirmations: z.array(z.string()).default([]),
  }),
  "visit.start_clinician": z.object({ visitId: uuid, personId: uuid }),
  "visit.save_clinician": clinicianPart.extend({ visitId: uuid, personId: uuid }),
  "visit.close": clinicianPart.extend({ visitId: uuid, personId: uuid }),
  /** A complete visit in one command: legacy back-entry (historical) and the demo loader. */
  "visit.record": nursePart.merge(clinicianPart).extend({
    visitId: uuid,
    personId: uuid,
    visitDate: isoDate,
    visitType: z.enum(["scheduled", "unscheduled", "refill_only", "remote"]),
    isHistorical: z.boolean(),
  }),
  "visit.add_lab": z.object({
    visitId: uuid,
    personId: uuid,
    hba1c: hba1cInput,
    reason: text(200).default("Late laboratory result"),
    confirmations: z.array(z.string()).default([]),
  }),
  "visit.mark_invalid": z.object({ visitId: uuid, personId: uuid, reason: text(200).min(3) }),
  "review.save": z.object({
    reviewId: uuid,
    personId: uuid,
    reviewDate: isoDate,
    isHistorical: z.boolean().default(false),
    data: reviewData,
    confirmations: z.array(z.string()).default([]),
  }),
  "event.record": z.object({
    eventId: uuid,
    personId: uuid,
    type: z.string().min(1).max(60),
    eventDate: isoDate,
    dateEstimated: z.boolean().default(false),
    reportingUnit: z
      .enum(["ncd_clinic", "medical_ward", "dialysis_unit", "other"])
      .default("ncd_clinic"),
    admissionReason: z.string().max(60).nullish(),
    death: z
      .object({
        place: z.enum(["this_facility", "other_facility", "home", "unknown"]),
        cause: text(300).nullish(),
        source: z.enum(["ward", "family_call", "records", "other"]),
      })
      .nullish(),
    transferDestination: text(200).nullish(),
  }),
  "call.log": z.object({
    callId: uuid,
    personId: uuid,
    appointmentId: uuid.nullish(),
    outcome: z.enum([
      "will_return",
      "call_later",
      "no_answer",
      "moved_or_transferred",
      "died",
      "wrong_number",
      "declined",
    ]),
    newAppointmentDate: isoDate.nullish(),
    phoneSlot: z.union([z.literal(1), z.literal(2)]).nullish(),
    callDate: isoDate.nullish(),
  }),
  "merge.request": z.object({
    mergeId: uuid,
    personId: uuid,
    loserPersonId: uuid,
    reason: text(300).min(3),
  }),
  "merge.decide": z.object({ mergeId: uuid, personId: uuid, approve: z.boolean() }),
  "query.resolve": z.object({
    queryId: uuid,
    personId: uuid,
    status: z.enum(["resolved", "dismissed"]),
    note: text(300).min(3),
  }),
  "person.flag_phone": z.object({
    personId: uuid,
    slot: z.union([z.literal(1), z.literal(2)]),
    invalid: z.boolean(),
  }),
} as const;

export type CommandType = keyof typeof COMMANDS;
export type Payload<T extends CommandType> = z.infer<(typeof COMMANDS)[T]>;

export const commandEnvelope = z.object({
  id: uuid,
  type: z.enum(Object.keys(COMMANDS) as [CommandType, ...CommandType[]]),
  payload: z.unknown(),
  clientTs: z.string().datetime({ offset: true }).nullish(),
});
export type CommandEnvelope = z.infer<typeof commandEnvelope>;

/** Death, transfer, merge, approvals: never queued offline (§9). */
export const ONLINE_ONLY = new Set<CommandType>([
  "merge.request",
  "merge.decide",
  "event.record",
  "query.resolve",
]);
