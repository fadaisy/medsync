/**
 * The command handlers (§7 A, B, C, D, E, G). Each runs inside `applyCommand`'s transaction under
 * medsync_ncd_app, after the envelope and payload are validated; each checks its capability first
 * (layer 1) and the policies check again (layer 2).
 */
import "server-only";

import type { NcdContext } from "../context";
import type { NcdTx } from "../db";
import type { ConditionModule } from "../standard/types";
import type { Payload } from "./schema";
import { and, asc, desc, eq, inArray, isNull, ne, sql } from "drizzle-orm";

import {
  ncdAppointment,
  ncdAuditSample,
  ncdCall,
  ncdEvent,
  ncdMergeRequest,
  ncdNameIndex,
  ncdObservation,
  ncdPerson,
  ncdQuery,
  ncdRegistration,
  ncdReminder,
  ncdReview,
  ncdSmsLog,
  ncdVisit,
} from "@/db/schema";
import { authorize, can, moduleOf, NcdError } from "../context";
import { enc, hospitalNumberHmac, nameTokenHmacs, nationalIdHmac, phoneHmac } from "../crypto";
import { rows } from "../db";
import {
  bmi,
  creatinineMgdlToUmol,
  egfr,
  footRisk,
  FORMULAS,
  glucoseMgdlToMmol,
  hba1cMmolMol,
  kdigoA,
  kdigoG,
  visitBp,
} from "../standard/calculations";
import { ADMISSION_REASON, EVENT_TYPE, medicineByCode } from "../standard/code-lists";
import { OTHER_ANNUAL_ITEMS_MODULES } from "../standard/conditions";
import { ADULT_AGE, needsConfirmation } from "../standard/validation";
import {
  addDays,
  assertPersonAlive,
  attendAppointments,
  cancelAllPending,
  createAppointment,
  enabledConditions,
  findCandidates,
  refreshQueries,
  snapshotVersion,
  verifySearchToken,
} from "./shared";

type Result = Record<string, unknown>;

/* ─── helpers ──────────────────────────────────────────────────────────── */

const yearOf = (iso: string) => Number(iso.slice(0, 4));

function requireConfirmed(
  values: Record<string, number | null | undefined>,
  confirmations: readonly string[],
) {
  const pending = needsConfirmation(values).filter((f) => !confirmations.includes(f));
  if (pending.length)
    throw new NcdError(
      "needs_confirmation",
      "Some values are outside the usual range. Confirm them to save.",
      {
        fields: pending,
      },
    );
}

async function personRow(tx: NcdTx, personId: string) {
  const [p] = await tx.select().from(ncdPerson).where(eq(ncdPerson.id, personId));
  if (!p) throw new NcdError("not_found", "Person not found.");
  if (p.mergedIntoId)
    throw new NcdError("conflict", "This record was merged into another.", {
      survivor: p.mergedIntoId,
    });
  return p;
}

async function registrationsOf(tx: NcdTx, personId: string) {
  return tx
    .select()
    .from(ncdRegistration)
    .where(and(eq(ncdRegistration.personId, personId), isNull(ncdRegistration.supersededById)));
}

async function visitRow(tx: NcdTx, visitId: string, personId: string) {
  const [v] = await tx.select().from(ncdVisit).where(eq(ncdVisit.id, visitId));
  if (!v || v.personId !== personId) throw new NcdError("not_found", "Visit not found.");
  return v;
}

/** Which writer principal labels the row (demo actors only; real rows carry the user id). */
const who = (ctx: NcdContext) => ({
  principal: ctx.principal,
  enteredBy: ctx.userId,
  enteredAt: ctx.enteredAt,
});

/* ─── A. Enrolment and identity ────────────────────────────────────────── */

export async function enrol(
  tx: NcdTx,
  ctx: NcdContext,
  p: Payload<"person.enrol">,
): Promise<Result> {
  authorize(ctx, "enrol", "legacy_entry", "demo_write");
  if (!verifySearchToken(ctx, p.searchToken))
    throw new NcdError("forbidden", "Search for the patient before creating a new record.");
  if (ctx.principal === "demo_loader" && !p.isSynthetic)
    throw new NcdError("forbidden", "The demo loader writes synthetic persons only.");
  const [{ approved } = { approved: false }] = await rows<{ approved: boolean }>(
    tx,
    sql`SELECT private.ncd_facility_approved(${ctx.facilityId}) AS approved`,
  );
  if (!approved && !p.isSynthetic)
    throw new NcdError(
      "interlock",
      "Draft standard version 0.1. Not approved for patient data: only synthetic records can be created.",
    );
  if (approved && p.isSynthetic)
    throw new NcdError(
      "interlock",
      "Synthetic records cannot be created once the registry is approved.",
    );

  const id = p.identity;
  if (!id.dateOfBirth && id.ageYears == null)
    throw new NcdError("invalid", "Give a date of birth or an estimated age.");
  const today = ctx.today;
  const birthYear = id.dateOfBirth
    ? yearOf(id.dateOfBirth)
    : yearOf(today) - (id.ageYears as number);
  if (id.dateOfBirth && id.dateOfBirth > today)
    throw new NcdError("invalid", "Date of birth is in the future.");

  const enabled = await enabledConditions(tx, ctx);
  const seen = new Set<string>();
  const backEntry = can(ctx, "legacy_entry", "demo_write");
  for (const r of p.registrations) {
    const m = moduleOf(ctx, r.condition);
    if (!enabled.has(m.code))
      throw new NcdError("invalid", `${m.label} is not enabled at this facility.`);
    if (seen.has(m.code)) throw new NcdError("invalid", `${m.label} is listed twice.`);
    seen.add(m.code);
    validateRegistration(m, r);
    const regDate = backEntry && r.registrationDate ? r.registrationDate : today;
    if (regDate > today) throw new NcdError("invalid", "Registration date is in the future.");
    const ageAtReg = id.dateOfBirth
      ? exactAge(id.dateOfBirth, regDate)
      : yearOf(regDate) - birthYear;
    if (ageAtReg < ADULT_AGE)
      throw new NcdError("invalid", "NCDReg 0.1 registers adults aged 18 and above only.");
  }
  requireConfirmed({ height_cm: p.baseline.heightCm }, p.confirmations);

  // A2: every definite and probable candidate must be linked (not enrolled) or dismissed.
  const candidates = await findCandidates(tx, ctx, {
    givenName: id.givenName,
    familyName: id.familyName,
    sex: id.sex,
    birthYear,
    phones: [id.phone1 ?? null, id.phone2 ?? null],
    hospitalNumber: id.hospitalNumber ?? null,
    nationalId: id.nationalId ?? null,
  });
  const blocking = candidates.filter(
    (c) => c.tier !== "possible" && !p.dismissedCandidates.includes(c.personId),
  );
  if (blocking.length)
    throw new NcdError("duplicates", "Possible existing records need a decision first.", {
      candidates: blocking,
    });

  let registryNumber: string;
  if (p.isSynthetic) {
    registryNumber = p.registryNumber ?? `DEMO-M-${p.personId.slice(0, 8).toUpperCase()}`;
  } else {
    if (p.registryNumber)
      throw new NcdError("invalid", "Registry numbers are issued by the system.");
    const [n] = await rows<{ n: string }>(
      tx,
      sql`SELECT private.ncd_next_registry_number(${yearOf(today)}) AS n`,
    );
    registryNumber = n!.n;
  }

  const firstReg = p.registrations
    .map((r) => (backEntry && r.registrationDate ? r.registrationDate : today))
    .sort()[0]!;
  await tx.insert(ncdPerson).values({
    id: p.personId,
    facilityId: ctx.facilityId,
    registryNumber,
    isSynthetic: p.isSynthetic,
    demoLoadId: ctx.principal === "demo_loader" ? ctx.demoLoadId : null,
    hospitalNumberCiphertext: enc(id.hospitalNumber),
    hospitalNumberHmac: hospitalNumberHmac(id.hospitalNumber),
    nationalIdCiphertext: enc(id.nationalId),
    nationalIdHmac: nationalIdHmac(id.nationalId),
    givenNameCiphertext: enc(id.givenName)!,
    familyNameCiphertext: enc(id.familyName)!,
    sex: id.sex,
    dateOfBirth: id.dateOfBirth ?? null,
    birthYear,
    dobEstimated: !id.dateOfBirth,
    phone1Ciphertext: enc(id.phone1),
    phone1Hmac: phoneHmac(id.phone1),
    phone2Ciphertext: enc(id.phone2),
    phone2Hmac: phoneHmac(id.phone2),
    nokNameCiphertext: enc(id.nokName),
    nokPhoneCiphertext: enc(id.nokPhone),
    districtCode: id.district?.code ?? null,
    districtName: id.district?.name ?? null,
    subcountyCode: id.subcounty?.code ?? null,
    subcountyName: id.subcounty?.name ?? null,
    parishCiphertext: enc(id.parish),
    villageCiphertext: enc(id.village),
    smsAllowed: p.smsAllowed,
    callsAllowed: p.callsAllowed,
    privacyNoticeVersion: p.privacy.version,
    // The notice is acknowledged at the person's earliest registration (catalogue schema_notes).
    privacyNoticeAckAt:
      ctx.principal === "demo_loader" ? new Date(`${firstReg}T08:00:00Z`) : ctx.enteredAt,
    heightCm: p.baseline.heightCm ?? null,
    tobacco: p.baseline.tobacco ?? null,
    alcohol: p.baseline.alcohol ?? null,
    knownCvd: p.baseline.knownCvd,
    knownKidneyDisease: p.baseline.knownKidneyDisease ?? null,
    familyHistoryDiabetes: p.baseline.familyHistoryDiabetes ?? null,
    familyHistoryHypertension: p.baseline.familyHistoryHypertension ?? null,
    enteredByLabel: ctx.actorLabel("registry_officer"),
    updatedAt: ctx.enteredAt,
    ...who(ctx),
  });
  const tokens = nameTokenHmacs(id.givenName, id.familyName);
  if (tokens.length)
    await tx
      .insert(ncdNameIndex)
      .values(
        tokens.map((t) => ({ facilityId: ctx.facilityId, personId: p.personId, tokenHmac: t })),
      );
  for (const r of p.registrations) await insertRegistration(tx, ctx, p.personId, r, backEntry);
  await refreshQueries(tx, ctx, p.personId);
  return { personId: p.personId, registryNumber };
}

function exactAge(dob: string, on: string): number {
  let a = yearOf(on) - yearOf(dob);
  if (on.slice(5) < dob.slice(5)) a--;
  return a;
}

function validateRegistration(
  m: ConditionModule,
  r: { subtype: string; basisOfDiagnosis: string },
) {
  if (!m.subtypes.some((s) => s.code === r.subtype))
    throw new NcdError("invalid", `Subtype ${r.subtype} is not in ${m.label}.`);
  if (!m.basis_of_diagnosis.some((s) => s.code === r.basisOfDiagnosis))
    throw new NcdError("invalid", `Basis ${r.basisOfDiagnosis} is not in ${m.label}.`);
}

async function insertRegistration(
  tx: NcdTx,
  ctx: NcdContext,
  personId: string,
  r: Omit<Payload<"registration.add">, "personId">,
  backEntry: boolean,
) {
  const regDate = backEntry && r.registrationDate ? r.registrationDate : ctx.today;
  await tx.insert(ncdRegistration).values({
    id: r.registrationId,
    facilityId: ctx.facilityId,
    personId,
    conditionCode: r.condition,
    subtype: r.subtype,
    registrationDate: regDate,
    diagnosisYear: r.diagnosisYear,
    diagnosisMonth: r.diagnosisMonth ?? null,
    basisOfDiagnosis: r.basisOfDiagnosis,
    whereFirstDiagnosed: r.whereFirstDiagnosed ?? null,
    referralSource: r.referralSource ?? null,
    isHistorical:
      backEntry &&
      !!r.registrationDate &&
      r.registrationDate < ctx.today &&
      ctx.principal !== "demo_loader",
    enteredByLabel: ctx.actorLabel("registry_officer"),
    updatedAt: ctx.enteredAt,
    ...who(ctx),
  });
}

/** A4: a further registration on a different date; a second of the same condition is refused here. */
export async function addRegistration(
  tx: NcdTx,
  ctx: NcdContext,
  p: Payload<"registration.add">,
): Promise<Result> {
  authorize(ctx, "enrol", "legacy_entry", "demo_write");
  await personRow(tx, p.personId);
  const m = moduleOf(ctx, p.condition);
  if (!(await enabledConditions(tx, ctx)).has(m.code))
    throw new NcdError("invalid", `${m.label} is not enabled at this facility.`);
  validateRegistration(m, p);
  const existing = await registrationsOf(tx, p.personId);
  if (existing.some((r) => r.conditionCode === m.code))
    throw new NcdError("conflict", `Already registered for ${m.label}.`);
  await insertRegistration(tx, ctx, p.personId, p, can(ctx, "legacy_entry", "demo_write"));
  await refreshQueries(tx, ctx, p.personId);
  return { registrationId: p.registrationId };
}

export async function updatePerson(
  tx: NcdTx,
  ctx: NcdContext,
  p: Payload<"person.update">,
): Promise<Result> {
  authorize(ctx, "enrol", "data_quality", "demo_write");
  const row = await personRow(tx, p.personId);
  await snapshotVersion(tx, ctx, "ncd_person", row, p.reason);
  const i = p.identity;
  const b = p.baseline;
  const set: Partial<typeof ncdPerson.$inferInsert> = {
    version: row.version + 1,
    updatedAt: ctx.enteredAt,
  };
  if (i.givenName) set.givenNameCiphertext = enc(i.givenName)!;
  if (i.familyName) set.familyNameCiphertext = enc(i.familyName)!;
  if (i.phone1 !== undefined)
    Object.assign(set, {
      phone1Ciphertext: enc(i.phone1),
      phone1Hmac: phoneHmac(i.phone1),
      phone1Invalid: false,
    });
  if (i.phone2 !== undefined)
    Object.assign(set, {
      phone2Ciphertext: enc(i.phone2),
      phone2Hmac: phoneHmac(i.phone2),
      phone2Invalid: false,
    });
  if (i.nokName !== undefined) set.nokNameCiphertext = enc(i.nokName);
  if (i.nokPhone !== undefined) set.nokPhoneCiphertext = enc(i.nokPhone);
  if (i.hospitalNumber !== undefined)
    Object.assign(set, {
      hospitalNumberCiphertext: enc(i.hospitalNumber),
      hospitalNumberHmac: hospitalNumberHmac(i.hospitalNumber),
    });
  if (i.nationalId !== undefined)
    Object.assign(set, {
      nationalIdCiphertext: enc(i.nationalId),
      nationalIdHmac: nationalIdHmac(i.nationalId),
    });
  if (i.parish !== undefined) set.parishCiphertext = enc(i.parish);
  if (i.village !== undefined) set.villageCiphertext = enc(i.village);
  if (i.district !== undefined)
    Object.assign(set, {
      districtCode: i.district?.code ?? null,
      districtName: i.district?.name ?? null,
    });
  if (i.subcounty !== undefined)
    Object.assign(set, {
      subcountyCode: i.subcounty?.code ?? null,
      subcountyName: i.subcounty?.name ?? null,
    });
  if (b.heightCm !== undefined) set.heightCm = b.heightCm ?? null;
  if (b.tobacco !== undefined) set.tobacco = b.tobacco ?? null;
  if (b.alcohol !== undefined) set.alcohol = b.alcohol ?? null;
  if (b.knownCvd !== undefined) set.knownCvd = b.knownCvd;
  if (b.knownKidneyDisease !== undefined) set.knownKidneyDisease = b.knownKidneyDisease ?? null;
  if (p.smsAllowed != null) set.smsAllowed = p.smsAllowed;
  if (p.callsAllowed != null) set.callsAllowed = p.callsAllowed;
  // E6: opt-out takes effect immediately (and the dispatcher re-checks at send time).
  if (p.optOutSms) Object.assign(set, { smsAllowed: false, smsOptedOutAt: ctx.enteredAt });
  await tx.update(ncdPerson).set(set).where(eq(ncdPerson.id, p.personId));
  if (i.givenName || i.familyName) {
    // Keep the old spellings indexed too: a search by either finds the person.
    const tokens = nameTokenHmacs(i.givenName ?? "", i.familyName ?? "");
    if (tokens.length)
      await tx
        .insert(ncdNameIndex)
        .values(
          tokens.map((t) => ({ facilityId: ctx.facilityId, personId: p.personId, tokenHmac: t })),
        );
  }
  await refreshQueries(tx, ctx, p.personId);
  return { personId: p.personId, version: row.version + 1 };
}

export async function flagPhone(
  tx: NcdTx,
  ctx: NcdContext,
  p: Payload<"person.flag_phone">,
): Promise<Result> {
  authorize(ctx, "recall_work", "demo_write");
  await personRow(tx, p.personId);
  await tx
    .update(ncdPerson)
    .set(
      p.slot === 1
        ? { phone1Invalid: p.invalid, updatedAt: ctx.enteredAt }
        : { phone2Invalid: p.invalid, updatedAt: ctx.enteredAt },
    )
    .where(eq(ncdPerson.id, p.personId));
  return {};
}

/* ─── B. Visit capture ─────────────────────────────────────────────────── */

type VisitRow = typeof ncdVisit.$inferSelect;

export async function arrive(
  tx: NcdTx,
  ctx: NcdContext,
  p: Payload<"visit.arrive">,
  visitDate?: string,
): Promise<Result> {
  authorize(ctx, "nurse_visit_write", "clinician_visit_write", "legacy_entry", "demo_write");
  await personRow(tx, p.personId);
  const date = visitDate ?? ctx.today;
  await assertPersonAlive(tx, p.personId, date);
  const regs = await registrationsOf(tx, p.personId);
  if (!regs.length) throw new NcdError("invalid", "This person holds no registration.");
  await tx.insert(ncdVisit).values({
    id: p.visitId,
    facilityId: ctx.facilityId,
    personId: p.personId,
    appointmentId: p.appointmentId ?? null,
    visitDate: date,
    visitType: p.visitType,
    stage: "waiting",
    arrivedAt: ctx.enteredAt,
    medicines: [],
    updatedAt: ctx.enteredAt,
    ...who(ctx),
  });
  // Two visits for one person on one date: both kept, the pair goes to the query list (§9).
  const [{ n } = { n: 0 }] = await rows<{ n: number }>(
    tx,
    sql`SELECT count(*)::int AS n FROM public.ncd_visit WHERE person_id = ${p.personId} AND visit_date = ${date} AND NOT is_invalid`,
  );
  if (n > 1)
    await tx
      .insert(ncdQuery)
      .values({
        facilityId: ctx.facilityId,
        personId: p.personId,
        ruleId: "same_day_duplicate_visit",
        detail: { date },
        createdAt: ctx.enteredAt,
      })
      .onConflictDoNothing();
  return { visitId: p.visitId };
}

export async function saveNurse(
  tx: NcdTx,
  ctx: NcdContext,
  p: Payload<"visit.save_nurse">,
): Promise<Result> {
  authorize(ctx, "nurse_visit_write", "clinician_visit_write", "legacy_entry", "demo_write");
  const person = await personRow(tx, p.personId);
  let [v] = await tx.select().from(ncdVisit).where(eq(ncdVisit.id, p.visitId));
  // Offline the phone may save measurements for a walk-in it never marked arrived: arrive it now.
  if (!v) {
    await arrive(tx, ctx, {
      visitId: p.visitId,
      personId: p.personId,
      visitType: "unscheduled",
      appointmentId: null,
    });
    [v] = await tx.select().from(ncdVisit).where(eq(ncdVisit.id, p.visitId));
  }
  if (!v || v.personId !== p.personId) throw new NcdError("not_found", "Visit not found.");
  if (v.status === "closed") throw new NcdError("conflict", "This visit is closed.");
  const set = nurseFields(ctx, person.heightCm, p);
  await tx
    .update(ncdVisit)
    .set({
      ...set,
      stage: v.stage === "waiting" ? "measurements_taken" : v.stage,
      nurseSavedBy: ctx.userId,
      nurseSavedAt: ctx.enteredAt,
      nurseSavedLabel: ctx.actorLabel("triage_nurse"),
      version: v.version + 1,
      updatedAt: ctx.enteredAt,
    })
    .where(eq(ncdVisit.id, p.visitId));
  return {
    visitId: p.visitId,
    visitBp: set.visitSystolic != null ? `${set.visitSystolic}/${set.visitDiastolic}` : null,
    bmi: set.bmi,
  };
}

function nurseFields(ctx: NcdContext, heightCm: number | null, p: Payload<"visit.save_nurse">) {
  const flat = p.bp.flatMap(([s, d]) => [s, d]);
  if (flat.some((x) => x <= 0))
    throw new NcdError("invalid", "Blood pressure values must be positive.");
  const vbp = visitBp(p.bp);
  const glucoseMmol = p.glucose
    ? p.glucose.unit === "mgdl"
      ? glucoseMgdlToMmol(p.glucose.value)
      : p.glucose.value
    : null;
  requireConfirmed({ weight_kg: p.weightKg, glucose_mmol: glucoseMmol }, p.confirmations);
  for (const [s, d] of p.bp) requireConfirmed({ systolic: s, diastolic: d }, p.confirmations);
  return {
    weightKg: p.weightKg ?? null,
    bpReadings: p.bp.map(([s, d]) => [s, d] as [number, number]),
    visitSystolic: vbp?.[0] ?? null,
    visitDiastolic: vbp?.[1] ?? null,
    bpFormula: vbp ? FORMULAS.visit_bp.version : null,
    heightCmUsed: heightCm,
    bmi: p.weightKg != null && heightCm ? bmi(p.weightKg, heightCm) : null,
    bmiFormula: p.weightKg != null && heightCm ? FORMULAS.bmi.version : null,
    glucoseMmol,
    glucoseOriginalValue: p.glucose?.value ?? null,
    glucoseOriginalUnit: p.glucose?.unit ?? null,
    glucoseType: p.glucose?.type ?? null,
    glucoseMethod: p.glucose?.method ?? null,
  };
}

export async function startClinician(
  tx: NcdTx,
  ctx: NcdContext,
  p: Payload<"visit.start_clinician">,
): Promise<Result> {
  authorize(ctx, "clinician_visit_write", "nurse_visit_write", "demo_write");
  const v = await visitRow(tx, p.visitId, p.personId);
  if (v.status === "closed") throw new NcdError("conflict", "This visit is closed.");
  await tx
    .update(ncdVisit)
    .set({
      stage: "with_clinician",
      clinicianStartedBy: ctx.userId,
      clinicianStartedAt: ctx.enteredAt,
      updatedAt: ctx.enteredAt,
    })
    .where(eq(ncdVisit.id, p.visitId));
  return {};
}

/** B9: the visit form is assembled from the registrations; the server refuses anything else. */
async function applyClinician(
  tx: NcdTx,
  ctx: NcdContext,
  v: VisitRow,
  p: Payload<"visit.save_clinician">,
) {
  const regs = await registrationsOf(tx, v.personId);
  const modules = regs.map((r) => ({ reg: r, m: moduleOf(ctx, r.conditionCode) }));
  const offers = (code: string) =>
    modules.some(({ m }) => m.visit_fields.some((f) => f.code === code));
  if (p.hypoglycaemia && !offers("hypoglycaemia"))
    throw new NcdError("invalid", "Hypoglycaemia is not recorded for this person's conditions.");
  if (p.hba1c && !offers("hba1c"))
    throw new NcdError("invalid", "HbA1c is not recorded for this person's conditions.");
  if (p.hba1c) requireConfirmed({ hba1c_percent: p.hba1c.percent }, p.confirmations);
  if (p.medicines)
    for (const c of p.medicines.codes)
      if (!medicineByCode.has(c)) throw new NcdError("invalid", `Unknown medicine ${c}.`);
  if (
    p.medicinesObtained &&
    p.medicinesObtained !== "full" &&
    p.medicinesObtained !== "not_applicable" &&
    !p.notObtainedReason
  )
    throw new NcdError("invalid", "Give the reason the medicines were not obtained in full.");
  for (const cf of p.conditionFields) {
    const entry = modules.find(({ reg }) => reg.id === cf.registrationId);
    if (!entry)
      throw new NcdError(
        "invalid",
        "A condition field names a registration this person does not hold.",
      );
    const { reg, m } = entry;
    if (cf.recordedControl && m.outcome_classification.kind !== "clinician_recorded")
      throw new NcdError("invalid", `${m.label} takes no clinician-recorded control.`);
    for (const [code, value] of Object.entries(cf.observations)) {
      const f = m.visit_fields.find((x) => x.code === code && x.storage === "observation");
      if (!f) throw new NcdError("invalid", `${m.label} has no observation ${code}.`);
      if (
        f.type === "integer" &&
        (typeof value !== "number" || !Number.isInteger(value) || value < 0)
      )
        throw new NcdError("invalid", `${f.label} must be a whole number.`);
      if (f.type === "enum" && !f.options?.some((o) => o.code === value))
        throw new NcdError("invalid", `${f.label}: ${String(value)}?`);
      if (f.type === "boolean" && typeof value !== "boolean")
        throw new NcdError("invalid", `${f.label} must be yes or no.`);
      await upsertObservation(tx, ctx, v, reg.id, code, value);
    }
    if (cf.recordedControl)
      await upsertObservation(tx, ctx, v, reg.id, "recorded_control", cf.recordedControl);
  }
  const set: Partial<typeof ncdVisit.$inferInsert> = {
    clinicianSavedBy: ctx.userId,
    clinicianSavedAt: ctx.enteredAt,
    clinicianSavedLabel: ctx.actorLabel("clinician"),
    stage: v.stage === "closed" ? "closed" : "with_clinician",
    clinicianStartedAt: v.clinicianStartedAt ?? ctx.enteredAt,
    clinicianStartedBy: v.clinicianStartedBy ?? ctx.userId,
    updatedAt: ctx.enteredAt,
    version: v.version + 1,
  };
  if (p.medicines) {
    set.medicines = p.medicines.codes;
    set.medicinesOtherCiphertext = enc(p.medicines.otherText);
    set.medicinesConfirmedUnchanged = p.medicines.confirmedUnchanged;
  }
  if (p.missedDoses !== undefined) set.missedDoses = p.missedDoses ?? null;
  if (p.hypoglycaemia !== undefined) set.hypoglycaemia = p.hypoglycaemia ?? null;
  if (p.medicinesObtained !== undefined) set.medicinesObtained = p.medicinesObtained ?? null;
  if (p.notObtainedReason !== undefined) set.notObtainedReason = p.notObtainedReason ?? null;
  if (p.hba1c)
    Object.assign(set, {
      hba1cPercent: p.hba1c.percent,
      hba1cMmolMol: hba1cMmolMol(p.hba1c.percent),
      hba1cResultDate: p.hba1c.resultDate,
    });
  if (p.nextAppointmentDate !== undefined) set.nextAppointmentDate = p.nextAppointmentDate ?? null;
  if (p.disposition !== undefined) set.disposition = p.disposition ?? null;
  await tx.update(ncdVisit).set(set).where(eq(ncdVisit.id, v.id));
  return modules;
}

async function upsertObservation(
  tx: NcdTx,
  ctx: NcdContext,
  v: VisitRow,
  registrationId: string,
  code: string,
  value: string | number | boolean,
) {
  const valueNum = typeof value === "number" ? value : null;
  const valueText = typeof value === "number" ? null : String(value);
  await tx
    .insert(ncdObservation)
    .values({
      facilityId: ctx.facilityId,
      personId: v.personId,
      visitId: v.id,
      registrationId,
      code,
      valueNum,
      valueText,
      enteredAt: ctx.enteredAt,
    })
    .onConflictDoUpdate({
      target: [ncdObservation.visitId, ncdObservation.registrationId, ncdObservation.code],
      set: { valueNum, valueText, enteredAt: ctx.enteredAt },
    });
}

export async function saveClinician(
  tx: NcdTx,
  ctx: NcdContext,
  p: Payload<"visit.save_clinician">,
): Promise<Result> {
  authorize(ctx, "clinician_visit_write", "nurse_visit_write", "legacy_entry", "demo_write");
  const v = await visitRow(tx, p.visitId, p.personId);
  if (v.status === "closed") throw new NcdError("conflict", "This visit is closed.");
  await applyClinician(tx, ctx, v, p);
  return { visitId: p.visitId };
}

export async function closeVisit(
  tx: NcdTx,
  ctx: NcdContext,
  p: Payload<"visit.close">,
): Promise<Result> {
  authorize(ctx, "clinician_visit_write", "nurse_visit_write", "legacy_entry", "demo_write");
  const v0 = await visitRow(tx, p.visitId, p.personId);
  if (v0.status === "closed") throw new NcdError("conflict", "This visit is already closed.");
  const modules = await applyClinician(tx, ctx, v0, p);
  const v = await visitRow(tx, p.visitId, p.personId);
  // B4: a next appointment date, or an explicit disposition.
  if (!v.nextAppointmentDate && !v.disposition)
    throw new NcdError(
      "invalid",
      "Give a next appointment date, or record a transfer or discharge.",
    );
  if (v.nextAppointmentDate && v.nextAppointmentDate <= v.visitDate)
    throw new NcdError("invalid", "The next appointment must be after the visit date.");
  // §5.6: a scheduled or unscheduled visit records control for every core registration.
  if (v.visitType === "scheduled" || v.visitType === "unscheduled") {
    const obs = await tx
      .select({ reg: ncdObservation.registrationId })
      .from(ncdObservation)
      .where(and(eq(ncdObservation.visitId, v.id), eq(ncdObservation.code, "recorded_control")));
    const have = new Set(obs.map((o) => o.reg));
    const missing = modules.filter(
      ({ reg, m }) => m.outcome_classification.kind === "clinician_recorded" && !have.has(reg.id),
    );
    if (missing.length)
      throw new NcdError(
        "invalid",
        `Record control for: ${missing.map(({ m }) => m.label).join(", ")} (Not assessed is allowed).`,
      );
  }
  await tx
    .update(ncdVisit)
    .set({
      status: "closed",
      stage: "closed",
      closedBy: ctx.userId,
      closedAt: ctx.enteredAt,
      updatedAt: ctx.enteredAt,
    })
    .where(eq(ncdVisit.id, v.id));
  await attendAppointments(tx, ctx, v.personId, v.visitDate);
  if (v.nextAppointmentDate)
    await createAppointment(tx, ctx, v.personId, v.nextAppointmentDate, { visitId: v.id });
  if (v.disposition) {
    await recordEventRow(tx, ctx, {
      eventId: crypto.randomUUID(),
      personId: v.personId,
      type: "transfer_out",
      eventDate: v.visitDate,
      dateEstimated: false,
      reportingUnit: "ncd_clinic",
      transferDestination: v.disposition === "discharged_to_primary_care" ? "Primary care" : null,
    });
  }
  await refreshQueries(tx, ctx, v.personId);
  return { visitId: v.id, closed: true };
}

/** A whole visit in one command (legacy back-entry, the demo loader): the same functions in order. */
export async function recordVisit(
  tx: NcdTx,
  ctx: NcdContext,
  p: Payload<"visit.record">,
): Promise<Result> {
  if (p.isHistorical) authorize(ctx, "legacy_entry", "demo_write");
  else authorize(ctx, "clinician_visit_write", "demo_write");
  if (p.visitDate > ctx.today) throw new NcdError("invalid", "The visit date is in the future.");
  const regs = await registrationsOf(tx, p.personId);
  const firstReg = regs.map((r) => r.registrationDate).sort()[0];
  if (!p.isHistorical && firstReg && p.visitDate < firstReg)
    throw new NcdError(
      "invalid",
      "A visit cannot be dated before the registration unless flagged historical.",
    );
  await arrive(
    tx,
    ctx,
    { visitId: p.visitId, personId: p.personId, visitType: p.visitType, appointmentId: null },
    p.visitDate,
  );
  await tx.update(ncdVisit).set({ isHistorical: p.isHistorical }).where(eq(ncdVisit.id, p.visitId));
  await saveNurse(tx, ctx, {
    visitId: p.visitId,
    personId: p.personId,
    weightKg: p.weightKg,
    bp: p.bp,
    glucose: p.glucose,
    confirmations: p.confirmations,
  });
  return closeVisit(tx, ctx, { ...p });
}

/** B7: a late laboratory result on a closed visit, versioned, without reopening the visit. */
export async function addLab(
  tx: NcdTx,
  ctx: NcdContext,
  p: Payload<"visit.add_lab">,
): Promise<Result> {
  authorize(ctx, "late_lab_results", "clinician_visit_write", "demo_write");
  const v = await visitRow(tx, p.visitId, p.personId);
  const regs = await registrationsOf(tx, p.personId);
  if (
    !regs.some((r) => moduleOf(ctx, r.conditionCode).visit_fields.some((f) => f.code === "hba1c"))
  )
    throw new NcdError("invalid", "HbA1c is not recorded for this person's conditions.");
  requireConfirmed({ hba1c_percent: p.hba1c.percent }, p.confirmations);
  await snapshotVersion(tx, ctx, "ncd_visit", v, p.reason);
  await tx
    .update(ncdVisit)
    .set({
      hba1cPercent: p.hba1c.percent,
      hba1cMmolMol: hba1cMmolMol(p.hba1c.percent),
      hba1cResultDate: p.hba1c.resultDate,
      version: v.version + 1,
      updatedAt: ctx.enteredAt,
    })
    .where(eq(ncdVisit.id, v.id));
  return { visitId: v.id, version: v.version + 1 };
}

export async function markVisitInvalid(
  tx: NcdTx,
  ctx: NcdContext,
  p: Payload<"visit.mark_invalid">,
): Promise<Result> {
  authorize(ctx, "data_quality", "demo_write");
  const v = await visitRow(tx, p.visitId, p.personId);
  await snapshotVersion(tx, ctx, "ncd_visit", v, p.reason);
  await tx
    .update(ncdVisit)
    .set({ isInvalid: true, version: v.version + 1, updatedAt: ctx.enteredAt })
    .where(eq(ncdVisit.id, v.id));
  return {};
}

/* ─── C. Annual review ─────────────────────────────────────────────────── */

export async function saveReview(
  tx: NcdTx,
  ctx: NcdContext,
  p: Payload<"review.save">,
): Promise<Result> {
  authorize(ctx, "review_write", "legacy_entry", "demo_write");
  const person = await personRow(tx, p.personId);
  if (p.reviewDate > ctx.today) throw new NcdError("invalid", "The review date is in the future.");
  const regs = await registrationsOf(tx, p.personId);
  const mods = regs.map((r) => moduleOf(ctx, r.conditionCode));
  const comp = p.data.component;
  // C1: a person is offered only the components their condition modules list.
  const offered =
    comp === "other"
      ? mods.some((m) => (OTHER_ANNUAL_ITEMS_MODULES as readonly string[]).includes(m.code))
      : mods.some((m) => m.review_components.some((c) => c.component === comp));
  if (!offered)
    throw new NcdError(
      "invalid",
      "This review component does not apply to the person's conditions.",
    );

  const derived: Record<string, unknown> = {};
  const data = { ...p.data } as Record<string, unknown>;
  if (p.data.component === "kidney") {
    const d = p.data;
    const creat =
      d.creatinine == null
        ? null
        : d.creatinineUnit === "mgdl"
          ? creatinineMgdlToUmol(d.creatinine)
          : d.creatinine;
    requireConfirmed({ creatinine_umol: creat, acr_mg_mmol: d.acrMgMmol }, p.confirmations);
    data.creatinineUmol = creat;
    if (creat != null) {
      const age = yearOf(p.reviewDate) - person.birthYear;
      const e = egfr(creat, age, person.sex as "female" | "male");
      Object.assign(derived, {
        egfr: e,
        kdigoG: kdigoG(e),
        egfrFormula: FORMULAS.egfr.version,
        kdigoGFormula: FORMULAS.kdigo_g.version,
      });
    }
    if (d.urineTest === "acr")
      Object.assign(derived, {
        kdigoA: kdigoA(d.acrMgMmol ?? null),
        kdigoAFormula: FORMULAS.kdigo_a.version,
      });
  }
  if (p.data.component === "lipids")
    requireConfirmed(
      { total_cholesterol: p.data.totalCholesterol, ldl: p.data.ldl },
      p.confirmations,
    );
  if (p.data.component === "feet") {
    const events = await tx
      .select({ type: ncdEvent.eventType })
      .from(ncdEvent)
      .where(and(eq(ncdEvent.personId, p.personId), eq(ncdEvent.isInvalid, false)));
    const [k] = await tx
      .select({ derived: ncdReview.derived })
      .from(ncdReview)
      .where(
        and(
          eq(ncdReview.personId, p.personId),
          eq(ncdReview.component, "kidney"),
          eq(ncdReview.isInvalid, false),
        ),
      )
      .orderBy(desc(ncdReview.reviewDate))
      .limit(1);
    const eskd = events.some((e) => e.type === "dialysis_start") || k?.derived?.kdigoG === "G5";
    const f = p.data;
    Object.assign(derived, {
      footRisk: footRisk({
        loss_of_protective_sensation: f.lossOfProtectiveSensation,
        absent_pulses: f.absentPulses,
        deformity: f.deformity,
        previous_ulcer: f.previousUlcer,
        current_ulcer: f.currentUlcer,
        amputation: f.amputation,
        end_stage_kidney_disease: eskd,
      }),
      footRiskFormula: FORMULAS.foot_risk.version,
    });
  }
  await tx.insert(ncdReview).values({
    id: p.reviewId,
    facilityId: ctx.facilityId,
    personId: p.personId,
    component: comp,
    reviewDate: p.reviewDate,
    data,
    derived,
    isHistorical: p.isHistorical,
    enteredByLabel: ctx.actorLabel("clinician"),
    updatedAt: ctx.enteredAt,
    ...who(ctx),
  });
  if (p.data.component === "other" && (p.data.tobacco || p.data.alcohol)) {
    await tx
      .update(ncdPerson)
      .set({
        ...(p.data.tobacco ? { tobacco: p.data.tobacco } : {}),
        ...(p.data.alcohol ? { alcohol: p.data.alcohol } : {}),
        updatedAt: ctx.enteredAt,
      })
      .where(eq(ncdPerson.id, p.personId));
  }
  return { reviewId: p.reviewId, derived };
}

/* ─── D. Events ────────────────────────────────────────────────────────── */

type EventInput = Omit<Payload<"event.record">, "death" | "admissionReason"> &
  Partial<Pick<Payload<"event.record">, "death" | "admissionReason">>;

async function recordEventRow(tx: NcdTx, ctx: NcdContext, p: EventInput) {
  await tx.insert(ncdEvent).values({
    id: p.eventId,
    facilityId: ctx.facilityId,
    personId: p.personId,
    eventType: p.type,
    eventDate: p.eventDate,
    dateEstimated: p.dateEstimated,
    reportingUnit: p.reportingUnit,
    admissionReason: p.admissionReason ?? null,
    deathPlace: p.death?.place ?? null,
    deathCauseCiphertext: enc(p.death?.cause),
    deathSource: p.death?.source ?? null,
    transferDestinationCiphertext: enc(p.transferDestination),
    enteredByLabel: ctx.actorLabel("clinician"),
    updatedAt: ctx.enteredAt,
    ...who(ctx),
  });
  if (p.type === "death" || p.type === "transfer_out" || p.type === "withdrawal")
    await cancelAllPending(tx, ctx, p.personId, p.type);
}

export async function recordEvent(
  tx: NcdTx,
  ctx: NcdContext,
  p: Payload<"event.record">,
): Promise<Result> {
  authorize(ctx, "event_write", "demo_write");
  await personRow(tx, p.personId);
  if (p.eventDate > ctx.today) throw new NcdError("invalid", "The event date is in the future.");
  const regs = await registrationsOf(tx, p.personId);
  const enabled = await enabledConditions(tx, ctx);
  const mods = ctx.catalogue.filter(
    (m) => enabled.has(m.code) || regs.some((r) => r.conditionCode === m.code),
  );
  const types = new Set([
    ...EVENT_TYPE.codes.map((c) => c.code),
    ...mods.flatMap((m) => m.event_types.map((e) => e.code)),
  ]);
  if (!types.has(p.type)) throw new NcdError("invalid", `Unknown event type ${p.type}.`);
  if (p.type === "admission") {
    const reasons = new Set([
      ...ADMISSION_REASON.codes.map((c) => c.code),
      ...mods.flatMap((m) => m.admission_reasons.map((a) => a.code)),
    ]);
    if (!p.admissionReason || !reasons.has(p.admissionReason))
      throw new NcdError("invalid", "An admission needs its main reason from the list.");
  } else if (p.admissionReason)
    throw new NcdError("invalid", "Only an admission carries a main reason.");
  if (p.type === "death") {
    if (!p.death)
      throw new NcdError("invalid", "Record the place and the source of the information.");
    const [later] = await tx
      .select({ id: ncdVisit.id })
      .from(ncdVisit)
      .where(
        and(
          eq(ncdVisit.personId, p.personId),
          sql`${ncdVisit.visitDate} > ${p.eventDate}`,
          eq(ncdVisit.isInvalid, false),
        ),
      )
      .limit(1);
    if (later)
      throw new NcdError(
        "invalid",
        "A visit is recorded after this date of death. Check the date.",
      );
  }
  await recordEventRow(tx, ctx, p);
  await refreshQueries(tx, ctx, p.personId);
  return { eventId: p.eventId };
}

/* ─── E. Recall ────────────────────────────────────────────────────────── */

export async function logCall(tx: NcdTx, ctx: NcdContext, p: Payload<"call.log">): Promise<Result> {
  authorize(ctx, "recall_work", "demo_write");
  await personRow(tx, p.personId);
  const callDate = ctx.principal === "demo_loader" && p.callDate ? p.callDate : ctx.today;
  if (p.outcome === "will_return" && p.newAppointmentDate && p.newAppointmentDate <= callDate)
    throw new NcdError("invalid", "The new date must be after today.");
  await tx.insert(ncdCall).values({
    id: p.callId,
    facilityId: ctx.facilityId,
    personId: p.personId,
    appointmentId: p.appointmentId ?? null,
    callDate,
    outcome: p.outcome,
    newAppointmentDate: p.newAppointmentDate ?? null,
    phoneSlot: p.phoneSlot ?? null,
    enteredByLabel: ctx.actorLabel("registry_officer"),
    ...who(ctx),
  });
  if (p.outcome === "will_return" && p.newAppointmentDate)
    await createAppointment(tx, ctx, p.personId, p.newAppointmentDate, { callId: p.callId });
  if (p.outcome === "wrong_number")
    await tx
      .update(ncdPerson)
      .set(
        (p.phoneSlot ?? 1) === 1
          ? { phone1Invalid: true, updatedAt: ctx.enteredAt }
          : { phone2Invalid: true, updatedAt: ctx.enteredAt },
      )
      .where(eq(ncdPerson.id, p.personId));
  if (p.outcome === "declined")
    await tx
      .update(ncdPerson)
      .set({ recallRemovedAt: ctx.enteredAt, updatedAt: ctx.enteredAt })
      .where(eq(ncdPerson.id, p.personId));
  // moved_or_transferred and died open the event form on screen; the event itself is its own command.
  return {
    callId: p.callId,
    opensEvent:
      p.outcome === "died" ? "death" : p.outcome === "moved_or_transferred" ? "transfer_out" : null,
  };
}

/* ─── A7. Merge (four-eyes) ────────────────────────────────────────────── */

export async function requestMerge(
  tx: NcdTx,
  ctx: NcdContext,
  p: Payload<"merge.request">,
): Promise<Result> {
  authorize(ctx, "merge_request", "merge_approve");
  if (p.personId === p.loserPersonId)
    throw new NcdError("invalid", "Choose two different records.");
  const [a, b] = [await personRow(tx, p.personId), await personRow(tx, p.loserPersonId)];
  if (a.isSynthetic !== b.isSynthetic)
    throw new NcdError("invalid", "A synthetic and a real record cannot be merged.");
  await tx.insert(ncdMergeRequest).values({
    id: p.mergeId,
    facilityId: ctx.facilityId,
    personId: p.personId,
    loserPersonId: p.loserPersonId,
    reason: p.reason,
    requestedBy: ctx.userId!,
    requestedAt: ctx.enteredAt,
  });
  return { mergeId: p.mergeId };
}

const CHILD_TABLES = [
  ncdNameIndex,
  ncdRegistration,
  ncdVisit,
  ncdObservation,
  ncdReview,
  ncdEvent,
  ncdAppointment,
  ncdReminder,
  ncdCall,
  ncdSmsLog,
  ncdQuery,
  ncdAuditSample,
] as const;

export async function decideMerge(
  tx: NcdTx,
  ctx: NcdContext,
  p: Payload<"merge.decide">,
): Promise<Result> {
  authorize(ctx, "merge_approve");
  const [m] = await tx.select().from(ncdMergeRequest).where(eq(ncdMergeRequest.id, p.mergeId));
  if (!m || m.personId !== p.personId) throw new NcdError("not_found", "Merge request not found.");
  if (m.status !== "requested") throw new NcdError("conflict", "This request was already decided.");
  if (m.requestedBy === ctx.userId)
    throw new NcdError("forbidden", "A merge needs a second person to approve it.");
  await tx
    .update(ncdMergeRequest)
    .set({
      status: p.approve ? "approved" : "refused",
      decidedBy: ctx.userId,
      decidedAt: ctx.enteredAt,
    })
    .where(eq(ncdMergeRequest.id, m.id));
  if (!p.approve) return { merged: false };
  const survivor = await personRow(tx, m.personId);
  const loser = await personRow(tx, m.loserPersonId);
  await snapshotVersion(tx, ctx, "ncd_person", loser, `Merged into ${survivor.registryNumber}`);
  for (const t of CHILD_TABLES)
    await tx
      .update(t)
      .set({ personId: survivor.id } as never)
      .where(eq(t.personId, loser.id));
  // Where both held a registration for one condition, the earlier survives; the pair goes to the query list.
  const regs = await tx
    .select()
    .from(ncdRegistration)
    .where(and(eq(ncdRegistration.personId, survivor.id), isNull(ncdRegistration.supersededById)))
    .orderBy(asc(ncdRegistration.registrationDate), asc(ncdRegistration.enteredAt));
  const keep = new Map<string, string>();
  for (const r of regs) {
    const first = keep.get(r.conditionCode);
    if (!first) {
      keep.set(r.conditionCode, r.id);
      continue;
    }
    await tx
      .update(ncdRegistration)
      .set({ supersededById: first, updatedAt: ctx.enteredAt })
      .where(eq(ncdRegistration.id, r.id));
    await tx
      .insert(ncdQuery)
      .values({
        facilityId: ctx.facilityId,
        personId: survivor.id,
        ruleId: "merge_duplicate_registration",
        detail: { kept: first, superseded: r.id },
        createdAt: ctx.enteredAt,
      })
      .onConflictDoNothing();
  }
  await tx
    .update(ncdPerson)
    .set({
      mergedIntoId: survivor.id,
      mergedAt: ctx.enteredAt,
      version: loser.version + 1,
      updatedAt: ctx.enteredAt,
    })
    .where(eq(ncdPerson.id, loser.id));
  // Keep at most one pending appointment for the survivor: the latest.
  const pend = await tx
    .select({ id: ncdAppointment.id })
    .from(ncdAppointment)
    .where(and(eq(ncdAppointment.personId, survivor.id), eq(ncdAppointment.status, "pending")))
    .orderBy(desc(ncdAppointment.appointmentDate));
  if (pend.length > 1) {
    const ids = pend.slice(1).map((x) => x.id);
    await tx
      .update(ncdAppointment)
      .set({ status: "superseded", statusReason: "merge", updatedAt: ctx.enteredAt })
      .where(inArray(ncdAppointment.id, ids));
    await tx
      .update(ncdReminder)
      .set({ status: "cancelled", statusReason: "merge" })
      .where(and(inArray(ncdReminder.appointmentId, ids), ne(ncdReminder.status, "sent")));
  }
  await refreshQueries(tx, ctx, survivor.id);
  return { merged: true, survivor: survivor.id };
}

/* ─── G3. Queries ──────────────────────────────────────────────────────── */

export async function resolveQuery(
  tx: NcdTx,
  ctx: NcdContext,
  p: Payload<"query.resolve">,
): Promise<Result> {
  authorize(ctx, "data_quality");
  const [q] = await tx.select().from(ncdQuery).where(eq(ncdQuery.id, p.queryId));
  if (!q || q.personId !== p.personId) throw new NcdError("not_found", "Query not found.");
  if (q.status !== "open") throw new NcdError("conflict", "This query is already closed.");
  await tx
    .update(ncdQuery)
    .set({
      status: p.status,
      resolutionNote: p.note,
      resolvedBy: ctx.userId,
      resolvedAt: ctx.enteredAt,
    })
    .where(eq(ncdQuery.id, q.id));
  return {};
}

export { addDays };
